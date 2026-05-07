# Query and visualize smart contract state

📁 **Full Source Code:** [midnight-apps/unshielded-token](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)

**Target audience:** Developers

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- An existing Midnight DApp with a deployed smart contract
- The smart contract compiled so its JS bindings exist (e.g., `/contracts/managed/<name>/contract/index.js`)
- `INDEXER_HTTP` and `INDEXER_WS` constants pointing to the Preprod indexer
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/package.json) with the needed packages:
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/compact-runtime`

## Summary

This guide shows how to query and visualize deployed smart contract state from a React frontend on the Midnight network. You will learn how to use `indexerPublicDataProvider` for GraphQL queries, how to deserialize raw ledger bytes into typed fields, and how to render everything in the frontend.

You will have a reusable `useContractState` hook that keeps your frontend in sync with on-chain state, whether you prefer polling or push-based subscriptions on the WebSocket. This works with any smart contract that you have previously deployed; the example presented below is an unshielded stablecoin vault, but the patterns apply to any Midnight DApp needing to display on-chain data.

---

## Understanding the smart contract ledger

Before you query anything, you need to know what you are querying.

| Property | What's inside | How you access it |
|---|---|---|
| **`data`** | The raw bytes of the smart contract's primary state, including typed fields declared with `export ledger` in Compact | `contractModule.ledger(contractState.data)` |
| **`balance`** | A `Map<TokenType, bigint>` of tokens held by the smart contract | `contractState.balance` directly |

View the full `ContractState` reference in the [Midnight documentation](https://docs.midnight.network/api-reference/onchain-runtime/classes/ContractState).

The ledger is defined in your `.compact` file. For the example [smart contract](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/contracts/Contract.compact) used in this tutorial (unshielded token vault), the ledger looks like this:

```compact
pragma language_version 0.22;
import CompactStandardLibrary;

export ledger totalSupply: Uint<64>;
export ledger totalBurned: Uint<64>;
export ledger burnedBalance: Uint<64>;
```

When you compile the smart contract, it generates a JavaScript `ledger()` constructor that knows exactly how to deserialize the raw bytes into those three typed fields. The library responsible for the deserialization is `@midnight-ntwrk/compact-runtime`, and the result comes in plain `bigint` values.

```typescript
const ledgerState = contractModule.ledger(contractState.data);

// ledgerState.totalSupply  → bigint
// ledgerState.totalBurned  → bigint
// ledgerState.burnedBalance → bigint
```

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

The provider contains three useful methods for querying smart contract state:

| Method | Returns | Use when |
|---|---|---|
| `queryContractState(address)` | `ContractState \| null` | You only need the smart contract's public ledger data |
| `queryZSwapAndContractState(address)` | `[ZswapChainState, ContractState, LedgerParameters] \| null` | You also need the global shielded state or parameters |
| `queryUnshieldedBalances(address)` | `UnshieldedBalances \| null` | You only need the smart contract's native token balances |

All three accept an optional second argument to query at a specific block height or hash. If omitted, the latest state is returned.

---

## 2. One-time smart contract state queries

### Querying raw smart contract state

A simple entry point is `queryContractState`. It returns `null` immediately if the indexer has never seen the smart contract.

```typescript
export async function getContractBalance(): Promise<bigint> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(CONTRACT_ADDRESS);
    console.log('[getContractBalance] Contract state balance:', contractState?.balance);

    if (!contractState?.balance) return 0n;

    for (const [key, value] of contractState.balance.entries()) {
      console.log('[getContractBalance] Key:', key, 'Value:', value.toString());
      if (key && typeof key === 'object' && 'raw' in key && key.raw === STABLECOIN_TOKEN) {
        console.log('[getContractBalance] Found balance:', value.toString());
        return value;
      }
    }

    return 0n;
  } catch (err) {
    console.error('[getContractBalance] Error:', err);
    return 0n;
  }
}
```

![Console output showing contract state balance logs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9u5v6y8fszo4xrjtv925.png)

`contractState.balance` is a `Map<TokenType, bigint>` of token balances held by the smart contract. This is useful for a vault type of smart contract.

### Querying combined ZSwap + smart contract state

If your smart contract interacts with shielded coins, call `queryZSwapAndContractState` to get the global `ZswapChainState`, the smart contract state, and the ledger parameters in one atomic query. This is more consistent between the two states because they come from the same block.

```typescript
export async function getZSwapAndContractState(): Promise<{ firstFree: bigint; totalSupply: bigint; totalBurned: bigint; burnedBalance: bigint; dustParams: any } | null> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const result = await provider.queryZSwapAndContractState(CONTRACT_ADDRESS);
    if (!result) {
      console.log('[ZSwapState] No zswap+contract state found');
      return null;
    }

    const [zswapState, contractState, ledgerParams] = result;
    console.log('[ZSwapState] zswapState.firstFree:', zswapState.firstFree.toString());

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const ledgerState = contractModule.ledger(contractState.data);
    console.log('[ZSwapState] ledgerState.totalSupply:', ledgerState.totalSupply.toString());
    console.log('[ZSwapState] ledgerState.totalBurned:', ledgerState.totalBurned.toString());

    let burnedBalance = 0n;
    try {
      burnedBalance = ledgerState.burnedBalance ?? 0n;
      console.log('[ZSwapState] ledgerState.burnedBalance:', burnedBalance.toString());
    } catch {
      console.log('[ZSwapState] ledgerState.burnedBalance: not available (old contract)');
    }

    console.log('[ZSwapState] ledgerParams.dust:', JSON.stringify(ledgerParams.dust, (_, v) => typeof v === 'bigint' ? v.toString() : v));

    return {
      firstFree: zswapState.firstFree,
      totalSupply: ledgerState.totalSupply,
      totalBurned: ledgerState.totalBurned,
      burnedBalance,
      dustParams: ledgerParams.dust,
    };
  } catch (err) {
    console.error('[ZSwapState] Error:', err);
    return null;
  }
}
```

![Console output showing ZSwap and ledger state logs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qf345p9hv00squdpgp6x.png)

---

## 3. Reading wallet balances

The `@midnight-ntwrk/dapp-connector-api` package exposes `getUnshieldedBalances()` on the `ConnectedAPI`, which returns the user-owned tokens.

```typescript
export async function getUserStablecoinBalance(connectedApi: ConnectedAPI): Promise<bigint> {
  try {
    const balances = await connectedApi.getUnshieldedBalances();
    console.log('[getUserStablecoinBalance] Raw balances:', balances);
    const stablecoinBalance = balances[STABLECOIN_TOKEN];
    console.log('[getUserStablecoinBalance] STABLECOIN_TOKEN:', STABLECOIN_TOKEN, '=>', stablecoinBalance?.toString() ?? '0');
    return stablecoinBalance || 0n;
  } catch (err) {
    console.error('[getUserStablecoinBalance] Error:', err);
    return 0n;
  }
}
```

![Console output showing user wallet token balances](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/o7gnnkibfep6pip8adtq.png)

Your wallet has many tokens. `0000...` means native tNIGHT. This is easier than querying the smart contract state because the wallet already knows its balances. You just look up the key matching your token color.

---

## 4. Deserializing ledger fields

The indexer returns raw bytes of unreadable data. To turn them into typed fields like `totalSupply`, import the compiled smart contract module with the help of `@midnight-ntwrk/compact-runtime` and pass the raw data through its `ledger()` constructor.

```typescript
const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
const ledgerState = contractModule.ledger(contractState.data);

console.log('[ContractState] Ledger totalSupply:', ledgerState.totalSupply.toString());
console.log('[ContractState] Ledger totalBurned:', ledgerState.totalBurned.toString());
```

![Console output showing deserialized ledger field values](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4hmdjhmr23g9tvrdlsio.png)

---

## 5. Displaying contract state in a UI

Now that you have the data, render it. The example project displays four stats on the dashboard: `totalSupply`, `totalBurned`, `contractBalance`, and `walletBalance`.

The actual `Home.tsx` consumes the `useContractState` hook and renders them inline:

```tsx
export function HomePage() {
  const { isConnected, connectedApi } = useWalletStore();
  const { state } = useContractState(connectedApi, { pollInterval: 15000 });

  const totalSupply = state?.totalSupply ?? 0n;
  const totalBurned = state?.totalBurned ?? 0n;
  const burnedBalance = state?.burnedBalance ?? 0n;
  const contractBalance = state?.contractBalance ?? 0n;
  const walletBalance = state?.walletBalance ?? 0n;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {isConnected && (
        <div className="py-12 space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Supply</p>
              <p className="text-xl font-semibold text-white">{totalSupply.toString()}</p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Burned</p>
              <p className="text-xl font-semibold text-white">{totalBurned.toString()}</p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Vault Balance</p>
              <p className="text-xl font-semibold text-white">{contractBalance.toString()}</p>
              {burnedBalance > 0n && (
                <p className="text-[10px] text-text-muted/40 mt-1">{burnedBalance.toString()} burned held</p>
              )}
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Wallet Balance</p>
              <p className="text-xl font-semibold text-white">{walletBalance.toString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

The hook returns `null` while loading, so the `?? 0n` fallback keeps the UI from crashing. The grid uses `grid-cols-2` on mobile and `grid-cols-4` on larger screens. The vault balance shows a subtext when burned tokens are held, so users know the raw balance includes surrendered tokens.

You can extend this pattern to any smart contract. The only things that change are the ledger fields you deserialize and the token color you look up in the balance map.

---

## 6. Real-time updates with WebSocket subscriptions

Polling with `useEffect` works, but it is inefficient for dashboards that need to stay current. The Midnight indexer exposes GraphQL subscriptions over WebSocket. The most useful one for smart contract state is `contractActions`, which emits an event every time your smart contract is called or deployed.

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

Each payload contains the smart contract's new `state.data` bytes. You deserialize them the same way as before:

```typescript
const unsubscribe = subscribeToContractActions(CONTRACT_ADDRESS, (action) => {
  const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
  const ledgerState = contractModule.ledger(action.state.data);
  console.log('New totalSupply:', ledgerState.totalSupply.toString());
  console.log('New totalBurned:', ledgerState.totalBurned.toString());
});
```

### Handling smart contract upgrades gracefully

If you add a new ledger field and redeploy, the frontend may load a new smart contract module while users are still looking at the old deployed smart contract. When the new module's `ledger()` deserializes state from the old smart contract, accessing a missing field throws an index-out-of-bounds error.

The `getContractState` helper handles this by wrapping the new field access in a `try/catch`:

```typescript
let burnedBalance = 0n;
try {
  burnedBalance = ledgerState.burnedBalance ?? 0n;
} catch {
  burnedBalance = 0n;
}
```

This pattern lets the frontend degrade gracefully until the smart contract address is updated to the newly deployed one.

### The `useContractState` hook

The project implements the full pattern in `src/hooks/useContractState.ts`. It combines polling with a WebSocket subscription, falling back to polling every 15 seconds if the WebSocket drops.

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
        if (msg.type === 'ka') {
          // Keep-alive, ignore
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

> **Note:** The `graphql-ws` protocol expects `connection_init` before `start`. If you use `subscriptions-transport-ws` (the older protocol), the handshake is slightly different. Preprod indexer supports `graphql-ws`.

---

## 7. When to poll vs when to subscribe

| Approach | Pros | Cons | Best for |
|---|---|---|---|
| **Polling** | Simple, works behind firewalls, easy to retry | Higher latency, more bandwidth | Admin panels, low-traffic UIs |
| **WebSocket subscription** | Near real-time, efficient for frequent updates | Requires persistent connection, harder to debug | Dashboards, live counters, event feeds |
| **`watchForContractState`** | Built-in, no extra code | Blocks until next change, no streaming | One-shot "wait for deployment" flows |

In practice, the hybrid approach shown in `useContractState` is the most robust: run a background poll as a safety net, and layer a WebSocket subscription on top for low-latency updates.

---

## Conclusion

Querying smart contract state on Midnight follows a three-step pattern:

1. **Query** — Use `indexerPublicDataProvider` to fetch raw state from the indexer.
2. **Deserialize** — Pass `contractState.data` through the compiled smart contract's `ledger()` function to get typed fields.
3. **Display** — Render the fields in React, optionally backed by a WebSocket subscription for live updates.

The example project implements all three steps in `contractCalls.ts` and `useContractState.ts`. Add a subscription to the mix and you have a dashboard that stays in sync with the chain in real time.

---

## Troubleshooting

**`queryContractState` returns `null`**
This means the indexer has not yet indexed the smart contract. It can happen immediately after deployment. Use `watchForContractState` if you need to block until the state appears, or retry with a backoff.

**`ledger()` throws `RangeError` or returns garbage**
You are probably passing the wrong smart contract module. Make sure your `CONTRACT_PATH + '/contract/index.js'` was regenerated after your last `.compact` change and matches the deployed bytecode. If you see `invalid operation for type: index out of bounds`, the deployed smart contract was compiled from an older source that is missing a ledger field the frontend expects.

**Subscription receives no data**
Check that the WebSocket URL uses `wss://` and that you sent `connection_init` before `start`. Also confirm the smart contract address is lower-case hex without `0x`.

**Balance map iteration is empty**
`contractState.balance` is a `Map`. Use `.entries()` to iterate. Token keys are objects with a `raw` field, not plain strings.

**Burned tokens still appear in smart contract balance**
In Midnight's unshielded token model, there is no `destroy` operation. `burnStablecoin` moves tokens to the smart contract and decrements `totalSupply`. The smart contract tracks `burnedBalance` separately so the frontend can compute usable balance as `rawBalance - burnedBalance`. This is a presentation-layer fix — at the ledger level, the tokens still exist in the smart contract's custody.
