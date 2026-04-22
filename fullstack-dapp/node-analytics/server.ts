/**
 * Node Analytics API - Offchain Indexer
 */

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import express from 'express';
import cors from 'cors';
import postgres from 'postgres';
import WebSocket from 'ws';

const app = express();
const PORT = process.env.PORT || 3001;
const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_PkV4bSulxJs5@ep-holy-feather-an0zodck-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

app.use(cors());
app.use(express.json());

setNetworkId('preprod');
const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  retry_on_error: true,
});

// ============== Database ==============

async function initDb() {
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      await sql`SELECT 1`;
      connected = true;
      break;
    } catch (e) {
      console.error(`[DB] Connection attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!connected) throw new Error('Could not connect to database');

  await sql`DROP TABLE IF EXISTS contract_states CASCADE`;
  await sql`DROP TABLE IF EXISTS contracts CASCADE`;

  await sql`
    CREATE TABLE contracts (
      address TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'synced'
    )
  `;

  await sql`
    CREATE TABLE contract_states (
      id SERIAL PRIMARY KEY,
      contract_address TEXT REFERENCES contracts(address) ON DELETE CASCADE,
      total_registrations BIGINT NOT NULL DEFAULT 0,
      total_proofs BIGINT NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX idx_states ON contract_states(contract_address)`;
  console.log('[DB] Ready');
}

// ============== Helpers ==============

async function indexerQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(INDEXER_HTTP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) throw new Error(`Indexer: ${response.status}`);
  const result = await response.json();
  if (result.errors) throw new Error(result.errors.map((e: any) => e.message).join(', '));
  return result.data;
}

async function fetchContractState(address: string): Promise<any> {
  try {
    return await provider.queryContractState(address);
  } catch {
    return null;
  }
}

async function parseContractState(address: string, state: any) {
  try {
    if (!state) return { totalRegistrations: 0, totalProofs: 0 };

    const { ledger } = await import('./contract/index.js');
    const ls = ledger(state.data);
    return {
      totalRegistrations: Number(ls.totalRegistrations) || 0,
      totalProofs: Number(ls.totalProofs) || 0,
    };
  } catch (e) {
    console.error(`[Parse] ${address.slice(12)}:`, e);
    return { totalRegistrations: 0, totalProofs: 0 };
  }
}

// ============== Insert ==============

async function insertState(address: string, state: any) {
  const parsed = await parseContractState(address, state);
  await sql`
    INSERT INTO contract_states (contract_address, total_registrations, total_proofs)
    VALUES (${address}, ${parsed.totalRegistrations}, ${parsed.totalProofs})
  `;
  await sql`UPDATE contracts SET updated_at = NOW() WHERE address = ${address}`;
  console.log(`[${address.slice(12)}] reg=${parsed.totalRegistrations} proofs=${parsed.totalProofs}`);
}

// ============== Polling ==============

const pollingIntervals = new Map<string, NodeJS.Timeout>();
const wsConnections = new Map<string, WebSocket>();

function startPolling(address: string) {
  if (pollingIntervals.has(address)) return;

  const poll = async () => {
    try {
      const state = await fetchContractState(address);
      if (state) await insertState(address, state);
    } catch (e) {
      console.error(`[Poll] ${address.slice(12)}:`, e);
    }
  };

  poll();
  const interval = setInterval(poll, 15_000);
  pollingIntervals.set(address, interval);
}

function stopPolling(address: string) {
  const interval = pollingIntervals.get(address);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(address);
  }
}

function startSubscription(address: string) {
  if (wsConnections.has(address)) return;
  
  const ws = new WebSocket(INDEXER_WS, 'graphql-transport-ws');
  wsConnections.set(address, ws);

  ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init' })));

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connection_ack') {
        ws.send(JSON.stringify({
          id: '1',
          type: 'start',
          payload: {
            query: `subscription { contractActions(address: "${address}") { ... on ContractCall { entryPoint } } } }`
          }
        }));
      }
    } catch {}
  });

  ws.on('close', () => {
    wsConnections.delete(address);
    setTimeout(() => startSubscription(address), 5000);
  });
}

// ============== Routes ==============

app.get('/status', async (req, res) => {
  try {
    await indexerQuery('{ __typename }');
    const count = await sql`SELECT COUNT(*) as c FROM contracts`;
    res.json({ status: 'ok', contracts: Number(count[0].c) });
  } catch (e) { res.status(503).json({ error: String(e) }); }
});

app.post('/track/:address', async (req, res) => {
  const { address } = req.params;
  try {
    console.log(`[Track] Request for ${address.slice(12)}`);
    const state = await fetchContractState(address);
    console.log(`[Track] State fetched: ${state ? 'yes' : 'no'}`);
    if (!state) return res.status(404).json({ error: 'No contract found' });

    const existing = await sql`SELECT address FROM contracts`;
    for (const row of existing) {
      stopPolling(row.address);
      const ws = wsConnections.get(row.address);
      if (ws) { ws.close(); wsConnections.delete(row.address); }
    }
    await sql`DELETE FROM contracts`;

    await sql`INSERT INTO contracts (address, status) VALUES (${address}, 'synced')`;
    await insertState(address, state);
    startPolling(address);
    startSubscription(address);
    console.log(`[Track] Done for ${address.slice(12)}`);

    res.json({ address, tracked: true });
  } catch (e) { 
    console.error(`[Track] Error:`, e);
    res.status(500).json({ error: String(e) }); 
  }
});

app.get('/contract/:address', async (req, res) => {
  const { address } = req.params;
  const c = await sql`SELECT * FROM contracts WHERE address = ${address}`;
  if (!c.length) return res.status(404).json({ error: 'Not tracked' });

  const latest = await sql`
    SELECT total_registrations, total_proofs, recorded_at
    FROM contract_states
    WHERE contract_address = ${address}
    ORDER BY recorded_at DESC
    LIMIT 1
  `;

  res.json({
    address,
    totalRegistrations: latest[0]?.total_registrations ?? 0,
    totalProofs: latest[0]?.total_proofs ?? 0,
    updatedAt: c[0].updated_at
  });
});

app.delete('/contract/:address', async (req, res) => {
  stopPolling(req.params.address);
  const ws = wsConnections.get(req.params.address);
  if (ws) { ws.close(); wsConnections.delete(req.params.address); }
  await sql`DELETE FROM contracts WHERE address = ${req.params.address}`;
  res.json({ removed: true });
});

// ============== Start ==============

initDb().then(async () => {
  const existing = await sql`SELECT address FROM contracts`;
  for (const row of existing) {
    startPolling(row.address);
    startSubscription(row.address);
  }

  app.listen(PORT, () => console.log(`API running on port ${PORT}`));

  const shutdown = () => {
    pollingIntervals.forEach((_, addr) => stopPolling(addr));
    wsConnections.forEach(ws => ws.close());
    sql.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch((e) => {
  console.error('[DB] Init failed:', e);
  process.exit(1);
});