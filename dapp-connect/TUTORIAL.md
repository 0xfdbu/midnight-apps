# Building a Midnight dApp: From Wallet Detection to Transaction Submission

This tutorial walks through the complete lifecycle of connecting a web application to the Midnight blockchain. You will learn how to detect installed wallets, establish a connection, monitor state changes, and submit transactions through both the browser extension flow and the CLI backend flow.

By the end, you will understand why Midnight uses two different balancing APIs — `balanceUnsealedTransaction` for browser dApps and `balanceUnboundTransaction` for CLI scripts — and when to use each.

---

## Table of Contents

1. [Architecture: Browser vs CLI](#architecture-browser-vs-cli)
2. [Detecting Wallets via `window.midnight`](#detecting-wallets-via-windowmidnight)
3. [Connecting to Lace or 1AM](#connecting-to-lace-or-1am)
4. [The Browser Transaction Flow](#the-browser-transaction-flow)
5. [Subscribing to Wallet State Changes](#subscribing-to-wallet-state-changes)
6. [The CLI Transaction Flow](#the-cli-transaction-flow)
7. [Side-by-Side Comparison](#side-by-side-comparison)
8. [Running the Reference Implementation](#running-the-reference-implementation)

---

## Architecture: Browser vs CLI

Midnight applications operate in two distinct security contexts. Understanding the boundary between them is essential before writing any connection code.

| Context | Key Custodian | Balancing API | Signing | Typical Use |
|---------|--------------|---------------|---------|-------------|
| **Browser / dApp** | Wallet extension (Lace, 1AM) | `balanceUnsealedTransaction` | Wallet handles it | User-facing UI |
| **CLI / Backend** | Your script / service | `balanceUnboundTransaction` | Manual | Bots, backends, scripts |

In the **browser flow**, the wallet extension stores the user's mnemonic (usually encrypted behind a password) and derives all keys internally. The dApp never sees secret material. It builds a transaction blueprint, serializes it, and hands it to the wallet via the dApp Connector API. The wallet selects inputs, adds balancing outputs, produces signatures, and returns a finalized transaction.

In the **CLI flow**, your Node.js script holds the 24-word mnemonic directly. It derives `ZswapSecretKeys`, `DustSecretKey`, and an `UnshieldedKeystore` from the mnemonic, then calls `balanceUnboundTransaction` with those keys. Because there is no wallet extension, the script must sign intents manually before finalizing.

Both flows submit the same transaction format to the same Midnight Preprod network. The only difference is **who holds the keys and who performs the balancing**.

### Why Two Different Balancing APIs?

You might wonder why Midnight does not use a single API for both contexts. The answer lies in **transaction state machines**.

A Midnight transaction progresses through several type states:

| State | Signatures | Proofs | Binding | Description |
|-------|------------|--------|---------|-------------|
| `PreProof` | `SignatureErased` | `NoProof` | `PreBinding` | Empty blueprint |
| `UnprovenTransaction` | `SignatureEnabled` | `PreProof` | `PreBinding` | Built by dApp, not yet proven |
| `ProvenTransaction` | `SignatureEnabled` | `Proof` | `PreBinding` | Proven by proof server, ready for balancing |
| `FinalizedTransaction` | `SignatureEnabled` | `Proof` | `Binding` | Balanced, signed, ready to submit |

`balanceUnsealedTransaction` expects a **proven** transaction (`Proof` marker) that is not yet bound (`PreBinding`). The wallet binds it by selecting inputs, adding change outputs, and signing. This is the natural state for contract calls: the dApp builds the transaction, the proof server generates ZK proofs, and the wallet binds it.

`balanceUnboundTransaction` expects an **unbound** transaction where the dApp (or CLI script) has already proven and signed the base intents. The wallet SDK then adds balancing inputs/outputs and creates a balancing transaction. This is necessary in CLI because there is no wallet extension to hold the keys — the script must provide them directly.

Understanding this progression is key to debugging serialization errors like `expected header tag '...proof...', got '...proof-preimage...'`. The error simply means you handed a `PreProof` transaction to an API that expects `Proof`.

---

## Detecting Wallets via `window.midnight`

Midnight wallets inject a global `window.midnight` object before the page loads. Each wallet registers itself under a unique key (its `rdns`, or reverse domain name). Lace might use `io.midnight.lace`, while 1AM uses its own identifier.

### The Detection Pattern

Your first task is to enumerate compatible wallets and filter by API version. The dApp Connector API is currently at v4, so we reject any wallet reporting an incompatible version.

```typescript
import semver from 'semver';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

export function getCompatibleWallets(): InitialAPI[] {
  if (!window.midnight) return [];

  return Object.values(window.midnight).filter(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, '^4.0.0')
  );
}
```

This function performs three validations:

1. **Presence**: `window.midnight` exists, confirming at least one extension is installed.
2. **Structure**: Each entry is a valid object with the expected API surface.
3. **Version compatibility**: The wallet's `apiVersion` satisfies `^4.0.0`.

If `window.midnight` is undefined, show a "Wallet Required" screen directing the user to install Lace or 1AM. If it exists but no compatible version is found, show an "Unsupported Wallet" message.

### Handling Multiple Wallets

Users may have both Lace and 1AM installed. Your UI should present a modal when `getCompatibleWallets()` returns more than one entry, letting the user choose which wallet to connect to. Store the chosen wallet's `rdns` in `localStorage` so you can auto-reconnect on subsequent page loads:

```typescript
const lastRdns = localStorage.getItem('midnight_last_wallet');
const wallets = getCompatibleWallets();
const match = wallets.find((w) => w.rdns === lastRdns);
if (match) {
  // Attempt auto-reconnect
}
```

---

## Connecting to Lace or 1AM

Each wallet implements `InitialAPI`, which exposes a `connect(networkId)` method returning a `Promise<ConnectedAPI>`. Calling this triggers the wallet's connection flow: the user may see a popup asking for approval to share their address and balance with your dApp.

### Connection Flow

```typescript
const wallet = getCompatibleWallets()[0];
if (!wallet) {
  throw new Error('No compatible wallet found');
}

const connectedApi = await wallet.connect('preprod');
const status = await connectedApi.getConnectionStatus();

if (status.status === 'connected') {
  const shielded = await connectedApi.getShieldedAddresses();
  const unshielded = await connectedApi.getUnshieldedAddress();
  const dust = await connectedApi.getDustBalance();

  // Populate your UI with addresses and balances
}
```

### What Happens During Connection

1. **Network negotiation**: The wallet switches to (or confirms) the Preprod network. If the user is on a different network, they must approve the switch.
2. **Capability grants**: The wallet returns a `ConnectedAPI` object with methods for addresses, balances, transaction building, and submission.
3. **State hydration**: Your dApp immediately fetches addresses and balances to populate the dashboard.

### Connection Status Monitoring

The dApp connector does not expose a push-based state stream. Instead, poll the connection status at regular intervals to detect disconnections (e.g., when the user locks their wallet):

```typescript
setInterval(() => {
  connectedApi.getConnectionStatus().then((status) => {
    if (status.status !== 'connected') {
      // Clear connection state, return to disconnected view
    }
  });
}, 5000);
```

Poll balances every 15 seconds to keep the dashboard current.

---

## The Browser Transaction Flow

Once connected, the browser dApp can request the wallet to balance and submit transactions. Midnight provides two APIs for this: `makeTransfer` (the simple path) and `balanceUnsealedTransaction` (the explicit path).

### `makeTransfer` — The Simple Path

For pure transfers, `makeTransfer` is the recommended API. It takes an array of `DesiredOutput` objects and handles everything internally:

```typescript
import { nativeToken } from '@midnight-ntwrk/ledger-v8';

const result = await connectedApi.makeTransfer(
  [
    {
      kind: 'unshielded',
      type: nativeToken().raw,
      value: BigInt(Math.round(Number(amount) * 1_000_000)),
      recipient: recipientAddress,
    },
  ],
  { payFees: true }
);

await connectedApi.submitTransaction(result.tx);
```

The `DesiredOutput` shape is strict. The four required fields are:

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'shielded' \| 'unshielded'` | Which ledger section |
| `type` | `TokenType` (hex string) | Token identifier — `nativeToken().raw` for tNIGHT |
| `value` | `bigint` | Amount in the token's smallest unit |
| `recipient` | `string` | Bech32 address (e.g. `mn_addr_preprod1...`) |

### `balanceUnsealedTransaction` — The Explicit Path

For contract calls or when you need full control over the transaction blueprint, construct the transaction manually and pass it to `balanceUnsealedTransaction`. The wallet then binds inputs, adds fees, and signs.

The official pattern from the Midnight docs is:

```typescript
import {
  Transaction,
  UnshieldedOffer,
  Intent,
  nativeToken,
  CostModel,
} from '@midnight-ntwrk/ledger-v8';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

// 1. Decode Bech32 address to raw hex bytes
const parsed = MidnightBech32m.parse(recipient);
const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
const hexRecipient = unshieldedAddr.data.toString('hex');

// 2. Build the unproven transaction blueprint
const unshieldedOffer = UnshieldedOffer.new(
  [], // inputs — wallet will select these
  [{ value, owner: hexRecipient, type: nativeToken().raw }],
  [] // signatures — wallet will add these
);

const intent = Intent.new(new Date(Date.now() + 30 * 60 * 1000));
(intent as any).fallibleUnshieldedOffer = unshieldedOffer;

const unsealedTx = Transaction.fromParts('preprod', undefined, undefined, intent as any);

// 3. Prove the transaction
const zkConfigProvider = new FetchZkConfigProvider(window.location.origin);
const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
const provenTx = await unsealedTx.prove(provingProvider, CostModel.initialCostModel());

// 4. Wallet balances, signs, and pays fees
const result = await connectedApi.balanceUnsealedTransaction(
  toHex(provenTx.serialize()),
  { payFees: true }
);

// 5. Submit
await connectedApi.submitTransaction(result.tx);
```

**Why each step matters:**

- **Bech32 → hex**: The dApp connector returns addresses in Bech32 (`mn_addr_preprod1...`), but `UnshieldedOffer.new` expects raw hex bytes. Passing Bech32 causes `Invalid character 'm' at position 0`.
- **Network ID**: `Transaction.fromParts` must use `'preprod'` (matching the wallet connection). Using `'undeployed'` causes `BALANCE_FAILED: invalid network ID`.
- **`tx.prove()`**: `balanceUnsealedTransaction` expects a transaction with the `Proof` marker. Without `prove()`, the transaction serializes with `proof-preimage` (`PreProof`) and the wallet rejects it.
- **`FetchZkConfigProvider`**: Required by `getProvingProvider`. For transfers with no contract circuits, the provider is never actually invoked — but the wallet's API still requires a valid `KeyMaterialProvider` to construct the `ProvingProvider` wrapper.

### Security Model

In the browser flow, **the dApp never sees secret keys**. The wallet extension derives all keys locally and signs intents internally. The dApp only handles public addresses and serialized transaction bytes. This is the recommended security model for all user-facing applications.

---

## Subscribing to Wallet State Changes

The Midnight Wallet SDK (used in CLI) exposes a push-based state stream via RxJS. The browser dApp connector does not expose this directly, but you can achieve similar functionality with periodic polling.

### Browser: Polling-Based Updates

```typescript
// Poll connection status every 5 seconds
setInterval(() => {
  connectedApi.getConnectionStatus().then((status) => {
    if (status.status !== 'connected') {
      disconnect();
    }
  });
}, 5000);

// Poll balances every 15 seconds
setInterval(() => {
  loadWalletState();
}, 15000);
```

While less elegant than push subscriptions, this is necessary because the browser extension manages its own state internally and only exposes discrete API methods.

### CLI: Native Push Subscriptions

In Node.js scripts using the Wallet SDK, subscribe to state changes directly:

```typescript
import * as Rx from 'rxjs';

const subscription = wallet.state().subscribe((state) => {
  if (!state.isSynced) return;

  console.log('Shielded:', state.shielded?.balances);
  console.log('Unshielded:', state.unshielded?.balances);
  console.log('Dust:', state.dust?.balance(new Date())?.toString());
});

// Later: subscription.unsubscribe();
```

The `wallet.state()` observable emits a new `FacadeState` whenever any sub-wallet (shielded, unshielded, or dust) updates.

### Waiting for Sync

Before submitting any transaction, ensure the wallet is fully synced:

```typescript
await Rx.firstValueFrom(
  wallet.state().pipe(
    Rx.filter((state) => state.isSynced)
  )
);
```

If the wallet is not synced, the transaction may reference already-spent UTXOs, resulting in submission errors like `InvalidTransaction: Custom error: 170`.

---

## The CLI Transaction Flow

The CLI path demonstrates how to perform transactions without a browser wallet. This is essential for backends, automation scripts, and any service that needs to act autonomously.

### Key Derivation

Derive secret keys directly from a 24-word BIP-39 mnemonic:

```typescript
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

const seed = Buffer.from(await bip39.mnemonicToSeed(mnemonic));
const hdWallet = HDWallet.fromSeed(seed);

const derivationResult = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], 'preprod');
```

### Wallet Initialization

Initialize a headless `WalletFacade` with three sub-wallets. Starting with Wallet SDK v3, `provingServerUrl` is required in the configuration:

```typescript
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';

const wallet = await WalletFacade.init({
  configuration: {
    networkId: 'preprod',
    indexerClientConnection: { indexerHttpUrl, indexerWsUrl },
    relayURL: new URL('wss://rpc.preprod.midnight.network'),
    provingServerUrl: new URL('http://localhost:6300'),
  },
  shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(...),
  dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ...),
});
```

### `transferTransaction` + `signRecipe`

For CLI transfers, use `transferTransaction` followed by `signRecipe`:

```typescript
const recipe = await wallet.transferTransaction(
  [
    {
      type: 'unshielded',
      outputs: [
        {
          amount: 1n,
          receiverAddress: unshieldedKeystore.getBech32Address(),
          type: nativeToken().raw,
        },
      ],
    },
  ],
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 30 * 60 * 1000) }
);

const signedRecipe = await wallet.signRecipe(
  recipe,
  (payload: Uint8Array) => unshieldedKeystore.signData(payload)
);

const finalized = await wallet.finalizeRecipe(signedRecipe);
const txId = await wallet.submitTransaction(finalized);
```

`signRecipe` works correctly here because `transferTransaction` returns an `UNPROVEN_TRANSACTION` where all intents are genuinely `pre-proof`.

### The Intent Signing Workaround (for `balanceUnboundTransaction`)

For general transactions (not simple transfers), use `balanceUnboundTransaction`. Due to a known bug in `wallet-sdk-unshielded-wallet` v2.1.0, you must manually sign intents before calling `finalizeRecipe`:

```typescript
const recipe = await wallet.balanceUnboundTransaction(
  tx,
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 30 * 60 * 1000) }
);

const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
if (recipe.balancingTransaction) {
  signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
}

const finalized = await wallet.finalizeRecipe(recipe);
```

The workaround is needed because `signRecipe` hardcodes `'pre-proof'` when cloning intents, but `balanceUnboundTransaction` produces proven base intents that contain `'proof'` data.

### State Persistence

Syncing from genesis every time is impractical. Save the serialized state of all three sub-wallets after each run:

```typescript
const [shieldedState, unshieldedState, dustState] = await Promise.all([
  wallet.shielded.serializeState(),
  wallet.unshielded.serializeState(),
  wallet.dust.serializeState(),
]);

await fs.writeFile('.wallet-state/shielded.json', shieldedState);
await fs.writeFile('.wallet-state/unshielded.json', unshieldedState);
await fs.writeFile('.wallet-state/dust.json', dustState);
```

On the next run, restore these snapshots. The wallet only needs to sync the delta (new blocks since the last save), reducing startup from hours to seconds.

---

## Common Errors and How to Fix Them

### Browser errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot read properties of undefined (reading 'toString')` | Wrong `DesiredOutput` field names passed to `makeTransfer` | Use `kind`, `type`, `value`, `recipient` — not `amount`, `token`, `address` |
| `Invalid character 'm' at position 0` | Bech32 address passed to `UnshieldedOffer.new` | Decode with `MidnightBech32m.parse(addr).decode(UnshieldedAddress, 'preprod').data.toString('hex')` |
| `expected header tag '...proof...', got '...proof-preimage...'` | Missing `tx.prove()` before `balanceUnsealedTransaction` | Call `await tx.prove(provingProvider, CostModel.initialCostModel())` |
| `BALANCE_FAILED: invalid network ID` | Wrong network in `Transaction.fromParts` | Use `'preprod'`, not `'undeployed'` |

### CLI errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing required configuration: 'provingServerUrl'` | WalletFacade.init missing proof server URL | Add `provingServerUrl: new URL('http://localhost:6300')` to config |
| `Custom error: 192` | Missing `signRecipe` step for `transferTransaction` | Add `await wallet.signRecipe(recipe, signFn)` before `finalizeRecipe` |
| `Custom error: 170` | Wallet not fully synced | Wait for `isSynced = true` before submitting |
| Dust sync timeout | First-time sync from genesis is slow | Use `restoreWalletState()`; save on SIGINT; allow 2h timeout |

---

## Side-by-Side Comparison

| Aspect | Browser (dApp) | CLI / Backend |
|--------|---------------|---------------|
| **Key custody** | Wallet extension (Lace / 1AM) | 24-word mnemonic in script |
| **Key derivation** | Wallet handles it | `HDWallet.fromSeed()` + `deriveKeysAt()` |
| **Balancing API** | `balanceUnsealedTransaction` | `balanceUnboundTransaction` |
| **Transfer API** | `makeTransfer` or manual `Intent` + `UnshieldedOffer` | `transferTransaction` + `signRecipe` |
| **Proof step** | `tx.prove()` via wallet's proving provider | Wallet SDK internal proving |
| **Signing** | Wallet extension signs automatically | `signRecipe` for transfers; workaround for general txs |
| **Transaction submission** | `connectedApi.submitTransaction` | `wallet.submitTransaction` |
| **Sync model** | Wallet extension syncs internally | `WalletFacade` + RxJS push streams |
| **State restore** | N/A (extension persists) | `restoreWalletState()` from `.wallet-state/` |
| **Security boundary** | Keys never leave the extension | Keys in script memory (use env vars) |

### When to Use Which

**Use the browser flow when:**
- Building user-facing dApps
- Users should retain custody of their keys
- You want the wallet to handle sync, balancing, and signing complexity

**Use the CLI flow when:**
- Building backend services, bots, or automation
- You need unattended transaction submission
- You want full control over the transaction lifecycle

---

## Running the Reference Implementation

### Prerequisites

- Node.js v22+
- Docker (for proof server)
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- 24-word test mnemonic for CLI scripts

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_INDEXER_HTTP=https://indexer.preprod.midnight.network/api/v4/graphql
VITE_INDEXER_WS=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
VITE_PROOF_SERVER=http://localhost:6300
```

### Start the Proof Server

```bash
docker run -p 6300:6300 midnightnetwork/proof-server:8.0.3
```

### Start the Frontend

```bash
cd dapp-connect
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

### Run the CLI Transfer Script

```bash
MNEMONIC="word1 word2 ... word24" npx tsx scripts/test-v3-sync-and-transfer.ts
```

This restores wallet state from `.wallet-state/` (or syncs from scratch), waits for sync, then submits a 1-unit unshielded self-transfer.

---

*Built with `@midnight-ntwrk/midnight-js` 4.0.4 and Wallet SDK 3.0.0 for the Midnight Preprod network.*
