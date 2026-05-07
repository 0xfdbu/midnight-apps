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

## Next steps

- Read the full repository [source code on GitHub](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)
- Check the Midnight Compact language docs
- Add WebSocket subscriptions for real-time state updates using `contractActions`
