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
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`

  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `react`, `react-dom`, `react-router-dom`
  - `zustand`

## Summary

This guide shows how to query and visualize deployed smart contract state from a React frontend on the Midnight network. You will learn how to use `indexerPublicDataProvider` for GraphQL queries, how to deserialize ledger state into typed fields, and how to render everything in the frontend.

You have a reusable `useContractState` hook that keeps your frontend in sync with on-chain state, whether you prefer polling or push-based subscriptions over WebSocket. This works with any smart contract that you have previously deployed; the example presented below is an unshielded stablecoin vault, but the patterns apply to any Midnight DApp needing to display on-chain data.

---

## Understanding the smart contract ledger

Before you query anything, you need to know what you are querying.

| Property | What's inside | How you access it |
|---|---|---|
| **`data`** | The contract's ledger state as a `ChargedState` object, including typed fields declared with `export ledger` in Compact | `contractModule.ledger(contractState.data)` |
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

When you compile the smart contract, it generates a JavaScript `ledger()` constructor that knows exactly how to read the ledger state through `ledger()` to access those three typed fields. The library responsible for the deserialization is `@midnight-ntwrk/compact-runtime`, and the results are plain `bigint` values.

```typescript
const ledgerState = contractModule.ledger(contractState.data);

// ledgerState.totalSupply  → bigint
// ledgerState.totalBurned  → bigint
// ledgerState.burnedBalance → bigint
```

---

## 1. The indexer provider

`@midnight-ntwrk/midnight-js-indexer-public-data-provider` exports `indexerPublicDataProvider`. It wraps an Apollo Client around the indexer's GraphQL V4 endpoint. It implements `PublicDataProvider` interface and gives you typed methods for querying chain data.

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
| `queryContractState(address)` | `ContractState` | You only need the smart contract's public ledger data |
| `queryZSwapAndContractState(address)` | `[ZswapChainState, ContractState, LedgerParameters]` | You also need the global shielded state or parameters |
| `queryUnshieldedBalances(address)` | `UnshieldedBalances` | You only need the smart contract's native token balances |

All three — `queryContractState(address)`, `queryZSwapAndContractState(address)`, and `queryUnshieldedBalances(address)` — accept an optional second argument to query at a specific block height or hash. If omitted, the latest state is returned.

---

## 2. One-time smart contract state queries

### Querying raw smart contract state

A simple entry point is `queryContractState`. It returns `null` immediately if the indexer has never seen the smart contract.

`queryContractState` works well if you need the smart contract's public ledger data.

```typescript
export async function getContractBalance(contractAddress: string, tokenId: string): Promise<bigint> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(contractAddress);
    console.log('[getContractBalance] Contract state balance:', contractState?.balance);

    if (!contractState?.balance) return 0n;

    for (const [key, value] of contractState.balance.entries()) {
      console.log('[getContractBalance] Key:', key, 'Value:', value.toString());
      if (key && typeof key === 'object' && 'raw' in key && key.raw === tokenId) {
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

`contractState.balance` is a `Map<TokenType, bigint>` of token balances held by the smart contract. This is useful for a vault-type smart contract.

### Querying combined ZSwap + smart contract state

If your smart contract interacts with shielded coins, call `queryZSwapAndContractState` to get the global `ZswapChainState`, the smart contract state, and the ledger parameters in one atomic query. This is more consistent between the two states because they come from the same block.

```typescript
export async function getZSwapAndContractState(contractAddress: string): Promise<{ firstFree: bigint; totalSupply: bigint; totalBurned: bigint; burnedBalance: bigint; dustParams: any } | null> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const result = await provider.queryZSwapAndContractState(contractAddress);
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

    const burnedBalance = ledgerState.burnedBalance ?? 0n;
    console.log('[ZSwapState] ledgerState.burnedBalance:', burnedBalance.toString());

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
export async function getUserTokenBalance(connectedApi: ConnectedAPI, tokenId: string): Promise<bigint> {
  try {
    const balances = await connectedApi.getUnshieldedBalances();
    console.log('[getUserTokenBalance] Raw balances:', balances);
    const tokenBalance = balances[tokenId];
    console.log('[getUserTokenBalance] tokenId:', tokenId, '=>', tokenBalance?.toString() ?? '0');
    return tokenBalance || 0n;
  } catch (err) {
    console.error('[getUserTokenBalance] Error:', err);
    return 0n;
  }
}
```

![Console output showing user wallet token balances](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/o7gnnkibfep6pip8adtq.png)

Your wallet holds many tokens. `0000...` represents native tNIGHT. Looking up wallet balances is easier than querying the smart contract state because the wallet already tracks its own balances. You simply look up the key matching your token color.

### Where do token colors come from?

Every token on Midnight has a unique color: a 32-byte hex string that identifies the token type on the ledger. You can see this color in the `[getUserTokenBalance] Raw balances:` log. The color is generated when the token is first minted, and it is not hardcoded in the smart contract source code.

If you do not know the color yet, call `getContractFirstTokenBalance(contractAddress)`. It reads the contract's balance map and returns the first token held by the contract, without the need for hardcoding:

```typescript
export async function getContractFirstTokenBalance(contractAddress: string): Promise<{ tokenId: string; balance: bigint } | null> {
  const { indexerModule } = await getModules();
  const provider = indexerModule.indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);
  const contractState = await provider.queryContractState(contractAddress);
  if (!contractState?.balance) return null;
  for (const [key, value] of contractState.balance.entries()) {
    if (key && typeof key === 'object' && 'raw' in key) {
      return { tokenId: (key as any).raw, balance: value };
    }
  }
  return null;
}
```

---

## 4. Deserializing ledger fields

The indexer returns raw bytes that are unreadable without deserialization. To turn them into typed fields like `totalSupply`, import the compiled smart contract module with the help of `@midnight-ntwrk/compact-runtime` and pass the raw data through its `ledger()` constructor.

```typescript
const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
const ledgerState = contractModule.ledger(contractState.data);

console.log('[ContractState] Ledger totalSupply:', ledgerState.totalSupply.toString());
console.log('[ContractState] Ledger totalBurned:', ledgerState.totalBurned.toString());
```

![Console output showing deserialized ledger field values](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4hmdjhmr23g9tvrdlsio.png)

---

## 5. Displaying smart contract state in a UI

Now that you have all the data you need, all that remains is to render it in the frontend as `totalSupply`, `totalBurned`, `contractBalance`, and `walletBalance`.


The actual `Home.tsx` uses the `useContractState` hook and renders them inline:

```typescript
import { useWalletStore } from '../hooks/useWallet';
import { ConnectButton } from '../components/ui/ConnectButton';
import { useContractState } from '../hooks/useContractState';

// .. other utilities

export function HomePage() {
  const { isConnected, connectedApi, contractAddress, selectedTokenId } = useWalletStore();
  const { state } = useContractState(connectedApi, contractAddress, selectedTokenId, { pollInterval: 15000 });

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

The hook returns `null` while loading, so the frontend does not crash and uses `?? 0n` as a fallback. The grid uses `grid-cols-2` on mobile and `grid-cols-4` on larger screens. The vault balance shows held burned tokens, so users know the raw balance includes burned tokens. 

You can use this pattern with any other smart contract; all that changes are the ledger fields you deserialize and the token auto-detected from the contract's balance map.


![Dashboard showing four stat cards: Total Supply, Total Burned, Vault Balance, and Wallet Balance](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ddhtg8c5d28fyn4j7m06.png)

---

## 6. Real-time updates with WebSocket subscriptions

Using `useEffect` for polling technically works, but it is inefficient for dashboards that need to stay up to date. The Midnight indexer exposes GraphQL subscriptions over WebSocket. `contractActions` emits an event every time your smart contract is called / deployed.

`indexerPublicDataProvider` does not surface subscriptions directly, so open a raw WebSocket to the indexer and send a GraphQL `start` message to `wss://indexer.preprod.midnight.network/api/v4/graphql/ws`:

```typescript
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

      ws = new WebSocket(INDEXER_WS, 'graphql-ws');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useContractState] Socket: connected');
        reconnectDelay = 1000; // Reset backoff on successful connection
        ws!.send(JSON.stringify({ type: 'connection_init' }));
        ws!.send(JSON.stringify({
          id: 'contract-state-sub',
          type: 'start',
          payload: {
            query: `
              subscription ContractStateUpdates($address: HexEncoded!) {
                contractActions(address: $address) {
                  state
                  transaction { block { height } }
                }
              }
            `,
            variables: { address: contractAddress },
          },
        }));
      };
```

The WebSocket acts as a notification system. Whenever the indexer emits a message, call `fetchState()`, which in turn queries `getContractState(contractAddress)`, `getContractBalance(contractAddress, selectedTokenId)`, and `getUserTokenBalance(connectedApi, selectedTokenId)`.

```typescript
  const fetchState = useCallback(async () => {
    if (!contractAddress) {
      setState(null);
      setLoading(false);
      return;
    }
    try {
      const [s, cb, wb] = await Promise.all([
        getContractState(contractAddress),
        selectedTokenId ? getContractBalance(contractAddress, selectedTokenId) : Promise.resolve(0n),
        connectedApi && selectedTokenId ? getUserTokenBalance(connectedApi, selectedTokenId) : Promise.resolve(0n),
      ]);
      // Usable contract balance = raw balance minus tokens that were burned into the contract
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
  }, [connectedApi, contractAddress, selectedTokenId]);
```

### The `useContractState` hook

This project implements the full pattern in `src/hooks/useContractState.ts`. It combines polling with a WebSocket subscription, falling back to polling every 15 seconds if the WebSocket drops.

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  INDEXER_WS,
} from './wallet/wallet.constants';
import {
  getContractState,
  getContractBalance,
  getUserTokenBalance,
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
  contractAddress: string | null,
  selectedTokenId: string | null,
  opts: { pollInterval?: number } = {}
) {
  const { pollInterval = 15000 } = opts;
  const [state, setState] = useState<ContractStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlockRef = useRef<number | undefined>(undefined);
  const intentionalCloseRef = useRef(new WeakSet<WebSocket>());

  const fetchState = useCallback(async () => {
    if (!contractAddress) {
      setState(null);
      setLoading(false);
      return;
    }
    try {
      const [s, cb, wb] = await Promise.all([
        getContractState(contractAddress),
        selectedTokenId ? getContractBalance(contractAddress, selectedTokenId) : Promise.resolve(0n),
        connectedApi && selectedTokenId ? getUserTokenBalance(connectedApi, selectedTokenId) : Promise.resolve(0n),
      ]);
      // Usable contract balance = raw balance minus tokens that were burned into the contract
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
  }, [connectedApi, contractAddress, selectedTokenId]);

  // Initial fetch + polling fallback
  useEffect(() => {
    if (!connectedApi || !contractAddress) {
      setLoading(false);
      return;
    }
    console.log('[useContractState] Polling: fetching state...');
    fetchState();
    const id = setInterval(() => {
      console.log('[useContractState] Polling: interval tick');
      fetchState();
    }, pollInterval);
    return () => clearInterval(id);
  }, [fetchState, pollInterval, connectedApi, contractAddress, selectedTokenId]);

  // WebSocket subscription for push updates
  useEffect(() => {
    if (!connectedApi || !contractAddress) return;

    let ws: WebSocket | null = null;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 500;

    function connect() {
      ws = new WebSocket(INDEXER_WS, 'graphql-ws');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useContractState] Socket: connected');
        reconnectDelay = 1000; // Reset backoff on successful connection
        ws!.send(JSON.stringify({ type: 'connection_init' }));
        ws!.send(JSON.stringify({
          id: 'contract-state-sub',
          type: 'start',
          payload: {
            query: `
              subscription ContractStateUpdates($address: HexEncoded!) {
                contractActions(address: $address) {
                  state
                  transaction { block { height } }
                }
              }
            `,
            variables: { address: contractAddress },
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
              // Debounce: the indexer sends a backlog of historical actions on connect.
              // Wait for the flood to stop before fetching, so 150 messages become 1 fetch.
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                console.log('[useContractState] Socket: debounced fetch for block', blockHeight);
                fetchState();
                debounceTimer = null;
              }, DEBOUNCE_MS);
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
        // Suppress errors from intentional closes (React Strict Mode cleanup)
        if (ws && intentionalCloseRef.current.has(ws)) return;
        console.error('[useContractState] WebSocket error:', err);
      };

      ws.onclose = () => {
        if (ws && intentionalCloseRef.current.has(ws)) {
          console.log('[useContractState] Socket: closed intentionally');
          return;
        }
        console.log(`[useContractState] Socket: disconnected, reconnecting in ${reconnectDelay}ms...`);
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
          connect();
        }, reconnectDelay);
      };
    }

    connect();

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (ws) {
        intentionalCloseRef.current.add(ws);
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ id: 'contract-state-sub', type: 'stop' })); } catch {}
          ws.close();
        }
        // If the socket is still CONNECTING (common in React Strict Mode),
        // do not call close(). The browser will clean it up, and calling
        // close() on a CONNECTING socket produces a console warning.
      }
    };
  }, [connectedApi, fetchState, contractAddress, selectedTokenId]);

  return { state, loading, error, refetch: fetchState };
}

```

If you want to enable/disable polling fallback, simply comment or uncomment the polling part.

> **Note:** `graphql-ws` expects a `connection_init` before `start`, so if you use `subscriptions-transport-ws` (older protocol), the handshake is slightly different. The Preprod indexer supports `graphql-ws`.

---

## 7. When to poll vs when to subscribe

| Approach | Pros | Cons | Best for |
|---|---|---|---|
| **Polling** | Quick entry, works behind firewalls. | Higher latency, more resources used. | Low-traffic UIs (admin panel) |
| **WebSocket subscription** | Efficient for real-time updates. | Requires stable connection, harder to debug. | Apps requiring real-time updates |

The hybrid approach used in `useContractState` is robust: it uses a background poll as a safety net in case the WebSocket is unresponsive, while keeping the WebSocket as the primary layer because of its lower latency.

---

## Conclusion

You now have a complete pipeline for querying smart contract state from a React/TypeScript frontend on the Midnight network. The pattern is always the same: build an `indexerPublicDataProvider`, call the query method that works for your needs, deserialize the ledger state with your compiled smart contract's `ledger()` constructor, and render the fields in your UI.

This is not limited to stablecoin vaults. Any smart contract that exposes `export ledger` fields can be queried the same way. You only need to change the ledger fields you choose to deserialize, for example `totalSupply` or `totalEmployees`, and the tokens auto-detected from the contract's balance map.

---

## Next steps

Now that you've finished this tutorial, here are a few things you can do next:

- Check the full repository [source code](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)
- Deploy a hello-world contract and display ledger fields on a frontend
- Read the Midnight Compact language docs
- Understand `ContractState` from the [Midnight documentation](https://docs.midnight.network/api-reference/onchain-runtime/classes/ContractState)

## Troubleshooting

- **"Wallet not detected"** → Make sure 1AM or Lace browser extensions are installed
- **Transactions failing** → Make sure you have tDUST and that the wallet is fully synced
- **0 Values** → Make sure that the wallet is fully synced. Sometimes you need to open the wallet popup to force a sync (you could also manage this systematically)
- **Spurious WebSocket errors in development** → React Strict Mode mounts components twice. Use a `WeakSet` to suppress errors from intentional socket closes
- **`Invalid payload: requires tx (hex string)`** → `makeTransfer` already returns a balanced transaction. Do not pass it through `balanceUnsealedTransaction`
- **WebSocket connectivity issues** → Make sure that your network is stable 