import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as contractRuntime from '@midnight-ntwrk/compact-runtime';
import express from 'express';
import cors from 'cors';
import postgres from 'postgres';

const app = express();
const PORT = 3001;
const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const DATABASE_URL = ''; // Replace by your postgress db url
const TRACKED_CONTRACT = ''; // replace by your deployed contract

app.use(cors());
app.use(express.json());

setNetworkId('preprod');
const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

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
      total_age_proofs BIGINT NOT NULL DEFAULT 0,
      total_residency_proofs BIGINT NOT NULL DEFAULT 0,
      total_cert_proofs BIGINT NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX idx_states ON contract_states(contract_address)`;
  console.log('[DB] Ready');
}

// Import contract's ledger AND its runtime
const { ledger } = await import('../src/contracts/managed/attest/contract/index.js');
import { StateValue, ChargedState, ContractState } from '@midnight-ntwrk/compact-runtime';
console.log('[Ledger] Loaded');

async function parseContractState(address: string, state: any) {
  try {
    if (!state) return { totalAgeProofs: 0, totalResidencyProofs: 0, totalCertProofs: 0 };

    const serialized = state.serialize();
    const freshState = contractRuntime.ContractState.deserialize(serialized);
    const ls = ledger(freshState.data);

    // Log raw values before conversion
    console.log('[Parse] raw totalAgeProofs:', ls.totalAgeProofs, typeof ls.totalAgeProofs);
    console.log('[Parse] raw totalResidencyProofs:', ls.totalResidencyProofs, typeof ls.totalResidencyProofs);
    console.log('[Parse] raw totalCertProofs:', ls.totalCertProofs, typeof ls.totalCertProofs);

    return {
      totalAgeProofs: Number(ls.totalAgeProofs) || 0,
      totalResidencyProofs: Number(ls.totalResidencyProofs) || 0,
      totalCertProofs: Number(ls.totalCertProofs) || 0,
    };
  } catch (e: any) {
    console.error(`[Parse] ${address.slice(0, 12)}:`, e.message);
    return { totalAgeProofs: 0, totalResidencyProofs: 0, totalCertProofs: 0 };
  }
}

async function insertState(address: string, state: any) {
  const parsed = await parseContractState(address, state);
  await sql`
    INSERT INTO contract_states (contract_address, total_age_proofs, total_residency_proofs, total_cert_proofs)
    VALUES (${address}, ${parsed.totalAgeProofs}, ${parsed.totalResidencyProofs}, ${parsed.totalCertProofs})
  `;
  await sql`UPDATE contracts SET updated_at = NOW() WHERE address = ${address}`;
  console.log(`[${address.slice(0, 12)}] age=${parsed.totalAgeProofs} residency=${parsed.totalResidencyProofs} cert=${parsed.totalCertProofs}`);
}

const pollingIntervals = new Map<string, NodeJS.Timeout>();

function startPolling(address: string) {
  if (pollingIntervals.has(address)) return;

  const poll = async () => {
    try {
      const state = await provider.queryContractState(address);
      if (state) await insertState(address, state);
    } catch (e) {
      console.error(`[Poll] ${address.slice(0, 12)}:`, e);
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

app.get('/status', async (req, res) => {
  try {
    const count = await sql`SELECT COUNT(*) as c FROM contracts`;
    res.json({ status: 'ok', contracts: Number(count[0].c) });
  } catch (e) { res.status(503).json({ error: String(e) }); }
});

app.post('/track/:address', async (req, res) => {
  const { address } = req.params;
  try {
    console.log(`[Track] Request for ${address.slice(0, 12)}`);
    const state = await provider.queryContractState(address);
    if (!state) return res.status(404).json({ error: 'No contract found' });

    const existing = await sql`SELECT address FROM contracts`;
    for (const row of existing) {
      stopPolling(row.address);
    }
    await sql`DELETE FROM contracts`;

    await sql`INSERT INTO contracts (address, status) VALUES (${address}, 'synced')`;
    await insertState(address, state);
    startPolling(address);
    console.log(`[Track] Done for ${address.slice(0, 12)}`);

    res.json({ address, tracked: true });
  } catch (e) { 
    console.error(`[Track] Error:`, e);
    res.status(500).json({ error: String(e) }); 
  }
});

app.get('/contract', async (req, res) => {
  const c = await sql`SELECT * FROM contracts WHERE address = ${TRACKED_CONTRACT}`;
  if (!c.length) return res.status(404).json({ error: 'Not tracked' });

  const latest = await sql`
    SELECT total_age_proofs, total_residency_proofs, total_cert_proofs, recorded_at
    FROM contract_states
    WHERE contract_address = ${TRACKED_CONTRACT}
    ORDER BY recorded_at DESC
    LIMIT 1
  `;

  res.json({
    address: TRACKED_CONTRACT,
    totalAgeProofs: Number(latest[0]?.total_age_proofs ?? 0),
    totalResidencyProofs: Number(latest[0]?.total_residency_proofs ?? 0),
    totalCertProofs: Number(latest[0]?.total_cert_proofs ?? 0),
  });
});

app.delete('/contract/:address', async (req, res) => {
  stopPolling(req.params.address);
  await sql`DELETE FROM contracts WHERE address = ${req.params.address}`;
  res.json({ removed: true });
});

initDb().then(async () => {
  await sql`INSERT INTO contracts (address, status) VALUES (${TRACKED_CONTRACT}, 'synced') ON CONFLICT (address) DO NOTHING`;
  startPolling(TRACKED_CONTRACT);

  app.listen(PORT, () => console.log(`API running on port ${PORT}`));

  const shutdown = () => {
    pollingIntervals.forEach((_, addr) => stopPolling(addr));
    sql.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch((e) => {
  console.error('[DB] Init failed:', e);
  process.exit(1);
});
