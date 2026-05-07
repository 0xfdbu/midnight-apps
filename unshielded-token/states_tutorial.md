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
  - `@midnight-ntwrk/midnight-js-http-client-proof-provider`
  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `react`, `react-dom`, `react-router-dom`
  - `zustand`

## Summary

This guide shows how to query and visualize deployed smart contract state from a React frontend on the Midnight network. You will learn how to use `indexerPublicDataProvider` for GraphQL queries, how to deserialize raw ledger bytes into typed fields, and how to render everything in the frontend.

You have a reusable `useContractState` hook that keeps your frontend in sync with on-chain state, whether you prefer polling or push-based subscriptions over WebSocket. This works with any smart contract that you have previously deployed; the example presented below is an unshielded stablecoin vault, but the patterns apply to any Midnight DApp needing to display on-chain data.

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

When you compile the smart contract, it generates a JavaScript `ledger()` constructor that knows exactly how to deserialize the raw bytes into those three typed fields. The library responsible for the deserialization is `@midnight-ntwrk/compact-runtime`, and the results are plain `bigint` values.

```typescript
const ledgerState = contractModule.ledger(contractState.data);

// ledgerState.totalSupply  → bigint
// ledgerState.totalBurned  → bigint
// ledgerState.burnedBalance → bigint
```

---

## 1. The indexer provider

`@midnight-ntwrk/midnight-js-indexer-public-data-provider` has an export `indexerPublicDataProvider` it wraps an Apollo Client around the indexer's GraphQL V4 endpoint. It implements `PublicDataProvider` interface and gives you typed methods for querying chain data.

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

All three `queryContractState(address)` `queryZSwapAndContractState(address)` `queryUnshieldedBalances(address)` accept an optional second argument to query at a specific block height or hash. If omitted, the latest state is returned.

---

## 2. One-time smart contract state queries

### Querying raw smart contract state

A simple entry point is `queryContractState`. It returns `null` immediately if the indexer has never seen the smart contract.

`queryContractState` works well if you need the smart contract's public ledger data.

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

`contractState.balance` is a `Map<TokenType, bigint>` of token balances held by the smart contract. This is useful for a vault-type smart contract.

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

Your wallet holds many tokens. `0000...` represents native tNIGHT. Looking up wallet balances is easier than querying the smart contract state because the wallet already tracks its own balances. You simply look up the key matching your token color.

### Where do token colors come from?

Every token on Midnight has a unique color: a 32-byte hex string that identifies the token type on the ledger. You can see this color in the `[getUserStablecoinBalance] Raw balances:` log. The color is generated when the token is first minted, and it is not hardcoded in the smart contract source code.

If you do not know the color yet, inspect the vault's `ContractState` balance map after at least one mint transaction has occurred. Store the color in a constant, and reuse it for balance lookups:

```typescript
export const STABLECOIN_TOKEN =
  '88aca75e4dfebf5991aee89918528338809dacb71d62c4b7ed8a713839e46bbb';
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

## 5. Displaying contract state in a UI

Now that you have all the data you need, all that remains is to render it in the frontend as `totalSupply`, `totalBurned`, `contractBalance`, and `walletBalance`.


The actual `Home.tsx` uses the `useContractState` hook and renders them inline:

```typescript
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { ConnectButton } from '../components/ui/ConnectButton';
import { useContractState } from '../hooks/useContractState';

// .. other utilities

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

The hook returns `null` while loading, so the frontend does not crash and uses `?? 0n` as a fallback. The grid uses `grid-cols-2` on mobile and `grid-cols-4` on larger screens. The vault balance shows held burned tokens, so users know the raw balance includes burned tokens. 

You can use this pattern with any other smart contract; all that changes are the ledger fields you deserialize and the token you look up by color in the balance map.


![Dashboard showing four stat cards: Total Supply, Total Burned, Vault Balance, and Wallet Balance](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ddhtg8c5d28fyn4j7m06.png)

---

## 6. Real-time updates with WebSocket subscriptions

Using `useEffect` for polling technically works, but it is inefficient for dashboards that need to stay up to date. The Midnight indexer exposes GraphQL subscriptions over WebSocket. `contractActions` emits an event every time your smart contract is called / deployed.

`indexerPublicDataProvider` does not surface subscriptions directly, so open a raw WebSocket to the indexer and send a GraphQL `start` message to `wss://indexer.preprod.midnight.network/api/v4/graphql/ws`:

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

Each payload contains the smart contract's latest `state.data` bytes. Deserialize them with `ledger()`.

```typescript
const unsubscribe = subscribeToContractActions(CONTRACT_ADDRESS, (action) => {
  const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
  const ledgerState = contractModule.ledger(action.state.data);
  console.log('New totalSupply:', ledgerState.totalSupply.toString());
  console.log('New totalBurned:', ledgerState.totalBurned.toString());
});
```

### The `useContractState` hook

This project implements the full pattern in `src/hooks/useContractState.ts`. It combines polling with a WebSocket subscription, falling back to polling every 15 seconds if the WebSocket drops.

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
  }, [connectedApi]);

  // Initial fetch + polling fallback
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
          // Refetch on new block to avoid duplicate processing
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

> **Note:** `graphql-ws` expects a `connection_init` before `start`, so if you use `subscriptions-transport-ws` (older protocol), the handshake is slightly different. The Preprod indexer supports `graphql-ws`.

---

## 7. When to poll vs when to subscribe

| Approach | Pros | Cons | Best for |
|---|---|---|---|
| **Polling** | Quick entry, works behind firewalls.. | Higher latency, more resources used. | low-traffic UIs (Admin panel) |
| **WebSocket subscription** | Efficient for real-time updates | Requires stable connection, harder to debug| Apps requiring real-time updates |

The hybrid approach used in `useContractState` is robust: it uses a background poll as a safety net in case the WebSocket is unresponsive, while keeping the WebSocket as the primary layer because of its lower latency.

---

## Conclusion

You now have a complete pipeline for querying smart contract state from a React/TypeScript frontend on the Midnight network. The pattern is always the same: build an `indexerPublicDataProvider`, call the query method that works for your needs, deserialize the raw bytes with your compiled smart contract's `ledger()` constructor, and render the fields in your UI.

This is not limited to stablecoin vaults. Any smart contract that exposes `export ledger` fields can be queried the same way. You only need to change the ledger fields you choose to deserialize, for example `totalSupply` or `totalEmployees`, and the token colors you look up in the balance map.

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
- **WebSocket connectivity issues** → Make sure that your network is stable 