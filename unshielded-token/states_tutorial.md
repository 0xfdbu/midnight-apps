📁 **Full Source Code:** [midnight-apps/unshielded-token](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)

**Target audience:** Developers

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- An existing Midnight dApp with a deployed contract
- The contract compiled so its JS bindings exist (e.g., `/contracts/managed/<name>/contract/index.js`)
- `INDEXER_HTTP` and `INDEXER_WS` constants pointing to the Preprod indexer
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/package.json) with the needed packages:
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/compact-runtime`

## Summary

This tutorial shows how to query and display deployed contract state from a React/TypeScript frontend on the Midnight network. You will learn how to use `indexerPublicDataProvider` for one-time GraphQL queries, how to deserialize raw ledger bytes into typed fields, how to subscribe to real-time contract state updates over WebSocket, and how to render everything in a UI component.

By the end, you will have a reusable `useContractState` hook that keeps your UI in sync with on-chain state — whether you prefer polling or push-based subscriptions. This works with any deployed contract; the examples below reference an unshielded stablecoin vault, but the patterns apply to any Midnight dApp that needs to display on-chain data.

---

## 1. The indexer provider

`@midnight-ntwrk/midnight-js-indexer-public-data-provider` exports `indexerPublicDataProvider`, which wraps an Apollo Client around the Indexer's GraphQL endpoint. It implements the `PublicDataProvider` interface and gives you typed methods for querying chain data.

```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

const provider = indexerPublicDataProvider(
  'https://indexer.preprod.midnight.network/api/v4/graphql',
  'wss://indexer.preprod.midnight.network/api/v4/graphql/ws'
);
```

The provider exposes three query methods useful for contract state:

| Method | Returns | Use when |
|---|---|---|
| `queryContractState(address)` | `ContractState \| null` | You only need the contract's public ledger data |
| `queryZSwapAndContractState(address)` | `[ZswapChainState, ContractState, LedgerParameters] \| null` | You also need the global shielded state or params |
| `queryUnshieldedBalances(address)` | `UnshieldedBalances \| null` | You only need the contract's native token balances |

All three accept an optional second argument to query at a specific block height or block hash. If omitted, they return the latest state.

---

## 2. One-time contract state queries

### Querying raw contract state

The simplest entry point is `queryContractState`. It returns `null` immediately if the indexer has never seen the contract, otherwise it resolves to a `ContractState` object carrying the raw serialized ledger bytes.

```typescript
const contractState = await provider.queryContractState(CONTRACT_ADDRESS);

if (!contractState) {
  console.log('Contract not yet indexed');
  return;
}

console.log('Raw state bytes:', contractState.data);
console.log('Balance map:', contractState.balance);
```

`contractState.balance` is a `Map<TokenType, bigint>` of token balances held by the contract. This is useful for vault-style contracts that custody tokens.

### Querying combined zswap + contract state

If your contract interacts with shielded coins, call `queryZSwapAndContractState` to get the global `ZswapChainState`, the contract state, and the ledger parameters in one atomic query. This guarantees consistency between the two states because they come from the same block.

```typescript
const result = await provider.queryZSwapAndContractState(CONTRACT_ADDRESS);

if (!result) {
  console.log('Contract not yet indexed');
  return;
}

const [zswapState, contractState, ledgerParams] = result;

console.log('firstFree:', zswapState.firstFree.toString());
console.log('Contract state:', contractState.data);
console.log('Ledger params:', ledgerParams);
```

You can also query at a historical block to debug past state:

```typescript
const historical = await provider.queryContractState(CONTRACT_ADDRESS, {
  type: 'blockHeight',
  blockHeight: 668900n,
});
```

---

## 3. Reading wallet balances

Before displaying the full dashboard, you also need the user's wallet balance. The DApp Connector API exposes `getUnshieldedBalances()`, which returns a record mapping token color strings to amounts.

```typescript
export async function getUserStablecoinBalance(connectedApi: ConnectedAPI): Promise<bigint> {
  try {
    const balances = await connectedApi.getUnshieldedBalances();
    const stablecoinBalance = balances[STABLECOIN_TOKEN];
    return stablecoinBalance || 0n;
  } catch (err) {
    return 0n;
  }
}
```

This is simpler than querying the contract because the wallet already knows its own balances. You just look up the key matching your token's color. If the user has never held the token, the key is absent and you default to `0n`.

---

## 4. Deserializing ledger fields

The indexer returns raw bytes. To turn them into typed fields like `totalSupply` or `totalBurned`, import the compiled contract module and pass the raw data through its `ledger()` constructor.

```typescript
const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
const ledgerState = contractModule.ledger(contractState.data);

console.log('Total supply:', ledgerState.totalSupply.toString());
console.log('Total burned:', ledgerState.totalBurned.toString());
```

The `ledger()` function is generated by `compactc` and maps the raw bytes exactly to the `export ledger` declarations in your `.compact` file. For example, a contract with these ledger declarations gives you:

| Compact declaration | Typed field | Type |
|---|---|---|
| `export ledger totalSupply: Uint<64>` | `ledgerState.totalSupply` | `bigint` |
| `export ledger totalBurned: Uint<64>` | `ledgerState.totalBurned` | `bigint` |
| `export ledger burnedBalance: Uint<64>` | `ledgerState.burnedBalance` | `bigint` |

If your contract stores maps or structs, those appear as nested objects with the same field names you defined in Compact.

> **Important:** `ledger()` must be called with the exact contract module that matches the deployed code. If you upgrade the contract and regenerate the JS bindings, make sure the frontend loads the matching module version.

---

## 5. Reading contract balances

Contracts that hold unshielded tokens expose a `balance` map on `ContractState`. Each key is a `TokenType` (a 32-byte hex color string), and each value is a `bigint`.

```typescript
const contractState = await provider.queryContractState(CONTRACT_ADDRESS);

if (contractState?.balance) {
  for (const [tokenType, value] of contractState.balance.entries()) {
    console.log(`Token ${tokenType.raw}: ${value.toString()}`);
  }
}
```

To look up a specific token color, compare against `key.raw`:

```typescript
const STABLECOIN_TOKEN = '88aca75e4dfebf5991aee89918528338809dacb71d62c4b7ed8a713839e46bbb';

for (const [key, value] of contractState.balance.entries()) {
  if (key?.raw === STABLECOIN_TOKEN) {
    console.log('Contract holds:', value.toString());
  }
}
```

---

## 6. Putting it together: `getContractState` and `getContractBalance`

The project already implements the above patterns in `src/hooks/wallet/services/contractCalls.ts`. Here is the actual `getContractState` helper:

```typescript
export interface ContractState {
  totalSupply: bigint;
  totalBurned: bigint;
  burnedBalance: bigint;
}

export async function getContractState(): Promise<ContractState> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;

    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(CONTRACT_ADDRESS);
    if (!contractState) {
      return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
    }

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const ledgerState = contractModule.ledger(contractState.data);

    let burnedBalance = 0n;
    try {
      burnedBalance = ledgerState.burnedBalance ?? 0n;
    } catch {
      burnedBalance = 0n;
    }

    return {
      totalSupply: ledgerState.totalSupply,
      totalBurned: ledgerState.totalBurned,
      burnedBalance,
    };
  } catch (err) {
    return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
  }
}
```

And `getContractBalance` for the raw contract token balance:

```typescript
export async function getContractBalance(): Promise<bigint> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(CONTRACT_ADDRESS);

    if (!contractState?.balance) return 0n;

    for (const [key, value] of contractState.balance.entries()) {
      if (key && typeof key === 'object' && 'raw' in key && key.raw === STABLECOIN_TOKEN) {
        return value;
      }
    }

    return 0n;
  } catch (err) {
    return 0n;
  }
}
```

---

## 7. Displaying contract state in a React UI

The project fetches and displays four stats on the dashboard: `totalSupply`, `totalBurned`, `contractBalance`, and `walletBalance`. Here is the pattern extracted into a reusable component.

```typescript
import { useState, useEffect } from 'react';
import { getContractState, getContractBalance } from '../hooks/wallet/services/contractCalls';

export function ContractStats() {
  const [state, setState] = useState({ totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n });
  const [balance, setBalance] = useState(0n);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [s, b] = await Promise.all([
          getContractState(),
          getContractBalance(),
        ]);
        if (!cancelled) {
          setState(s);
          setBalance(b);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p>Loading on-chain data...</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="p-4 rounded-xl border">
        <p className="text-xs uppercase text-gray-400">Total Supply</p>
        <p className="text-xl font-semibold">{state.totalSupply.toString()}</p>
      </div>
      <div className="p-4 rounded-xl border">
        <p className="text-xs uppercase text-gray-400">Total Burned</p>
        <p className="text-xl font-semibold">{state.totalBurned.toString()}</p>
      </div>
      <div className="p-4 rounded-xl border">
        <p className="text-xs uppercase text-gray-400">Vault Balance</p>
        <p className="text-xl font-semibold">{balance.toString()}</p>
      </div>
      <div className="p-4 rounded-xl border">
        <p className="text-xs uppercase text-gray-400">Wallet Balance</p>
        <p className="text-xl font-semibold">{walletBalance.toString()}</p>
      </div>
    </div>
  );
}
```

> **Note:** `contractState.balance` is a `Map`. Use `.entries()` to iterate. Token keys are objects with a `raw` field, not plain strings.

---

## 8. Real-time updates with WebSocket subscriptions

Polling with `useEffect` works, but it is inefficient for dashboards that need to stay current. The Midnight indexer exposes GraphQL subscriptions over WebSocket. The most useful one for contract state is `contractActions`, which emits an event every time your contract is called or deployed.

Because `indexerPublicDataProvider` does not yet surface subscriptions directly, open a raw WebSocket to the indexer and send a GraphQL `start` message:

```typescript
const WS_URL = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

function subscribeToContractActions(
  contractAddress: string,
  onAction: (data: any) => void
) {
  const ws = new WebSocket(WS_URL, 'graphql-ws');

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'connection_init' }));
    ws.send(JSON.stringify({
      id: '1',
      type: 'start',
      payload: {
        query: `
          subscription ContractActions($address: HexEncoded!) {
            contractActions(address: $address) {
              state { data }
              transaction { block { height } }
            }
          }
        `,
        variables: { address: contractAddress },
      },
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'data' && msg.payload?.data?.contractActions) {
      onAction(msg.payload.data.contractActions);
    }
  };

  ws.onerror = (err) => console.error('WebSocket error:', err);

  return () => {
    ws.send(JSON.stringify({ id: '1', type: 'stop' }));
    ws.close();
  };
}
```

Each payload contains the contract's new `state.data` bytes. You deserialize them the same way as before:

```typescript
const unsubscribe = subscribeToContractActions(CONTRACT_ADDRESS, (action) => {
  const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
  const ledgerState = contractModule.ledger(action.state.data);
  console.log('New totalSupply:', ledgerState.totalSupply.toString());
});
```

### A complete `useContractState` hook

The project implements this in `src/hooks/useContractState.ts`. Here is the full hook that combines polling with a WebSocket subscription. It falls back to polling every 15 seconds if the subscription is not enabled or disconnects.

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CONTRACT_ADDRESS,
  INDEXER_WS,
} from './wallet/wallet.constants';
import {
  getContractState,
  getContractBalance,
  getUserStablecoinBalance,
} from './wallet/services/contractCalls';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

export interface ContractStateSnapshot {
  totalSupply: bigint;
  totalBurned: bigint;
  burnedBalance: bigint;
  contractBalance: bigint;
  walletBalance: bigint;
  blockHeight?: number;
}

export function useContractState(
  connectedApi: ConnectedAPI | null,
  opts: { pollInterval?: number } = {}
) {
  const { pollInterval = 15000 } = opts;
  const [state, setState] = useState<ContractStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastBlockRef = useRef<number | undefined>(undefined);

  const fetchState = useCallback(async () => {
    try {
      const [s, cb, wb] = await Promise.all([
        getContractState(),
        getContractBalance(),
        connectedApi ? getUserStablecoinBalance(connectedApi) : Promise.resolve(0n),
      ]);
      const usableContractBalance = cb > s.burnedBalance ? cb - s.burnedBalance : 0n;
      setState({
        totalSupply: s.totalSupply,
        totalBurned: s.totalBurned,
        burnedBalance: s.burnedBalance,
        contractBalance: usableContractBalance,
        walletBalance: wb,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [connectedApi]);

  // Polling fallback
  useEffect(() => {
    if (!connectedApi) {
      setLoading(false);
      return;
    }
    fetchState();
    const id = setInterval(fetchState, pollInterval);
    return () => clearInterval(id);
  }, [fetchState, pollInterval, connectedApi]);

  // WebSocket subscription for push updates
  useEffect(() => {
    if (!connectedApi) return;

    const ws = new WebSocket(INDEXER_WS, 'graphql-ws');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connection_init' }));
      ws.send(JSON.stringify({
        id: 'contract-state-sub',
        type: 'start',
        payload: {
          query: `
            subscription ContractStateUpdates($address: HexEncoded!) {
              contractActions(address: $address) {
                state { data }
                transaction { block { height } }
              }
            }
          `,
          variables: { address: CONTRACT_ADDRESS },
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' && msg.payload?.data?.contractActions) {
          const action = msg.payload.data.contractActions;
          const blockHeight = action.transaction?.block?.height;
          if (blockHeight && blockHeight !== lastBlockRef.current) {
            lastBlockRef.current = blockHeight;
            fetchState();
          }
        }
      } catch (e) {
        console.error('[useContractState] Failed to parse message:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[useContractState] WebSocket error:', err);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.send(JSON.stringify({ id: 'contract-state-sub', type: 'stop' }));
        } catch {}
        ws.close();
      }
    };
  }, [connectedApi, fetchState]);

  return { state, loading, error, refetch: fetchState };
}
```

Usage in the dashboard:

```typescript
export function HomePage() {
  const { isConnected, connectedApi } = useWalletStore();
  const { state } = useContractState(connectedApi, { pollInterval: 15000 });

  const totalSupply = state?.totalSupply ?? 0n;
  const totalBurned = state?.totalBurned ?? 0n;
  const burnedBalance = state?.burnedBalance ?? 0n;
  const contractBalance = state?.contractBalance ?? 0n;
  const walletBalance = state?.walletBalance ?? 0n;

  // render stats...
}
```

> **Note:** The `graphql-ws` protocol expects `connection_init` before `start`. If you use `subscriptions-transport-ws` (the older protocol), the handshake is slightly different. Preprod indexer supports `graphql-ws`.

### Handling contract upgrades gracefully

If you add a new ledger field and redeploy, the frontend may load a new contract module while users are still looking at the old deployed contract. When the new module's `ledger()` deserializes state from the old contract, accessing a missing field throws an index-out-of-bounds error.

The `getContractState` helper handles this by wrapping the new field access in a `try/catch`:

```typescript
let burnedBalance = 0n;
try {
  burnedBalance = ledgerState.burnedBalance ?? 0n;
} catch {
  burnedBalance = 0n;
}
```

This pattern lets the frontend degrade gracefully until the contract address is updated to the newly deployed one.

---

## 9. When to poll vs when to subscribe

| Approach | Pros | Cons | Best for |
|---|---|---|---|
| **Polling** | Simple, works behind firewalls, easy to retry | Higher latency, more bandwidth | Admin panels, low-traffic UIs |
| **WebSocket subscription** | Near real-time, efficient for frequent updates | Requires persistent connection, harder to debug | Dashboards, live counters, event feeds |
| **`watchForContractState`** | Built-in, no extra code | Blocks until next change, no streaming | One-shot "wait for deployment" flows |

In practice, the hybrid approach shown in `useContractState` is the most robust: run a background poll as a safety net, and layer a WebSocket subscription on top for low-latency updates. The polling interval can be relaxed to 30 or 60 seconds when the subscription is healthy, since the WebSocket handles the fast path.

---

## Conclusion

Querying contract state on Midnight follows a three-step pattern:

1. **Query** — Use `indexerPublicDataProvider` to fetch raw state from the indexer.
2. **Deserialize** — Pass `contractState.data` through the compiled contract's `ledger()` function to get typed fields.
3. **Display** — Render the fields in React, optionally backed by a WebSocket subscription for live updates.

The example project implements all three steps in `contractCalls.ts` and `useContractState.ts`. Add a subscription to the mix and you have a dashboard that stays in sync with the chain in real time.

## Troubleshooting

**`queryContractState` returns `null`**
This means the indexer has not yet indexed the contract. It can happen immediately after deployment. Use `watchForContractState` if you need to block until the state appears, or retry with a backoff.

**`ledger()` throws `RangeError` or returns garbage**
You are probably passing the wrong contract module. Make sure your `CONTRACT_PATH + '/contract/index.js'` was regenerated after your last `.compact` change and matches the deployed bytecode. If you see `invalid operation for type: index out of bounds`, the deployed contract was compiled from an older source that is missing a ledger field the frontend expects.

**Subscription receives no data**
Check that the WebSocket URL uses `wss://` and that you sent `connection_init` before `start`. Also confirm the contract address is lower-case hex without `0x`.

**Balance map iteration is empty**
`contractState.balance` is a `Map`. Use `.entries()` to iterate. Token keys are objects with a `raw` field, not plain strings.

**Burned tokens still appear in contract balance**
In Midnight's unshielded token model, there is no `destroy` operation. `burnStablecoin` moves tokens to the contract and decrements `totalSupply`. The contract tracks `burnedBalance` separately so the frontend can compute usable balance as `rawBalance - burnedBalance`. This is a presentation-layer fix — at the ledger level, the tokens still exist in the contract's custody.
