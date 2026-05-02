# Midnight Transfer Tutorial

A minimal, working reference for connecting a React frontend and Node.js CLI to the **Midnight Preprod network**. This tutorial demonstrates the two fundamental transaction patterns in Midnight: the **browser wallet flow** (`balanceUnsealedTransaction`) and the **CLI/backend flow** (`balanceUnboundTransaction`).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Detecting Available Wallets](#detecting-available-wallets)
3. [Connecting to Lace or 1AM](#connecting-to-lace-or-1am)
4. [The Browser Transaction Flow](#the-browser-transaction-flow)
5. [Subscribing to Wallet State Changes](#subscribing-to-wallet-state-changes)
6. [The CLI Transaction Flow](#the-cli-transaction-flow)
7. [Browser vs CLI: A Side-by-Side Comparison](#browser-vs-cli-a-side-by-side-comparison)
8. [Running the Project](#running-the-project)

---

## Architecture Overview

Midnight applications have two distinct execution contexts:

| Context | Who holds the keys | Balancing API | Signing | Typical use |
|---------|-------------------|---------------|---------|-------------|
| **Browser / dApp** | Wallet extension (Lace, 1AM) | `balanceUnsealedTransaction` | Wallet extension | User-facing UI |
| **CLI / Backend** | Your script/service | `balanceUnboundTransaction` | Manual or automated | Bots, backends, scripts |

In both cases, the underlying transaction format is identical. What changes is **who selects the inputs, adds outputs to balance the transaction, and produces the cryptographic signatures**. In the browser, the wallet extension does this behind the scenes. In a CLI script, you hold the secret keys directly and perform these steps yourself.

This project contains both halves: a React frontend that connects to a browser wallet, and a Node.js CLI that operates directly with secret keys derived from a 24-word mnemonic phrase.

---

## Detecting Available Wallets

Midnight wallets expose themselves through a global `window.midnight` object injected by the browser extension. Each wallet registers itself with a unique `rdns` (reverse domain name) identifier.

### The Detection Pattern

```typescript
// src/hooks/useWallet.ts
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

The `window.midnight` object is a map where keys are wallet identifiers and values conform to the `InitialAPI` interface from `@midnight-ntwrk/dapp-connector-api`. Before any interaction, we validate:

1. **Presence**: `window.midnight` exists (the extension is installed).
2. **Structure**: Each entry is a valid object with the expected API surface.
3. **Version compatibility**: The wallet's `apiVersion` satisfies the dApp Connector API v4 requirement.

### Type Definition

We extend the global `Window` interface to include the `midnight` property:

```typescript
// src/types/wallet.ts
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}
```

This declaration allows TypeScript to recognize `window.midnight` without casting. When a user installs Lace or 1AM, the extension injects its API into this namespace before the page loads.

### Multiple Wallets

It is possible for a user to have both Lace and 1AM installed simultaneously. The `Object.values(window.midnight)` call returns all registered wallets, and the filter ensures only compatible ones are presented. Our UI displays a modal when multiple wallets are detected, letting the user choose which one to connect to.

### Auto-Reconnect

After a successful connection, we store the wallet's `rdns` in `localStorage`. On subsequent page loads, we attempt to reconnect automatically:

```typescript
const lastWalletId = localStorage.getItem('midnight_last_wallet');
const wallets = Object.values(window.midnight) as any[];
const matchingWallet = wallets.find((w) => w.rdns === lastWalletId);
if (matchingWallet) {
  await connect('preprod');
}
```

This provides a seamless experience where returning users do not need to manually reconnect their wallet each time.

---

## Connecting to Lace or 1AM

The connection flow follows the dApp Connector API v4 specification. Each wallet implements `InitialAPI`, which provides a `connect(networkId)` method that returns a `ConnectedAPI`.

### Connection Flow

```typescript
// src/hooks/useWallet.ts
connect: async (networkId) => {
  const wallet = getCompatibleWallets()[0];
  if (!wallet) {
    set({ error: 'No wallet found' });
    return;
  }

  set({ isConnecting: true, error: null });

  try {
    const connectedApi = await wallet.connect(networkId);
    const status = await connectedApi.getConnectionStatus();

    if (status.status === 'connected') {
      const addresses = await connectedApi.getShieldedAddresses();
      const unshieldedAddress = await connectedApi.getUnshieldedAddress();
      const dustBalance = await connectedApi.getDustBalance();

      set({
        connectedApi,
        isConnected: true,
        addresses: { /* ... */ },
        balances: { /* ... */ },
      });
      localStorage.setItem('midnight_last_wallet', wallet.rdns);
    }
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'Connection failed' });
  } finally {
    set({ isConnecting: false });
  }
},
```

### What Happens During Connection

1. **Wallet Selection**: The dApp selects a compatible wallet from `window.midnight`.
2. **Network Negotiation**: `wallet.connect('preprod')` asks the wallet to switch to (or confirm) the Preprod network. The wallet may prompt the user for approval.
3. **Capability Grants**: If the user approves, the wallet returns a `ConnectedAPI` object containing methods for addresses, balances, transaction building, and submission.
4. **State Hydration**: The dApp immediately fetches the user's shielded addresses, unshielded address, and dust balance to populate the UI.

### Connection Status Monitoring

We set up a recurring subscription to detect disconnections:

```typescript
// src/hooks/useWalletSubscription.ts
useWalletSubscription({ balanceInterval: 15000, connectionInterval: 5000 });
```

Every 5 seconds, we poll `connectedApi.getConnectionStatus()`. If the wallet disconnects (e.g., the user locks it), we clear the connection state and return to the disconnected view. Every 15 seconds, we refresh balances to keep the dashboard current.

### Graceful Degradation

If `window.midnight` is undefined, we show a "Wallet Required" screen directing the user to install Lace. If the wallet is present but no compatible version is found, we show an "Unsupported Wallet" message. This ensures the user always understands why they cannot proceed.

---

## The Browser Transaction Flow

Once connected, the browser dApp can request the wallet to balance and submit transactions. Midnight provides two browser APIs for this:

| API | Use case | Complexity |
|-----|----------|------------|
| `makeTransfer` | Simple shielded or unshielded transfers | Low — one call |
| `balanceUnsealedTransaction` | Contract interactions, custom transactions | Medium — manual construction |

### `makeTransfer` (The Simple Path)

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

Passing the wrong field names (e.g. `amount` instead of `value`) causes the wallet to throw `Cannot read properties of undefined (reading 'toString')` because it reads `output.value.toString()` internally.

### `balanceUnsealedTransaction` (The Low-Level Path)

For contract calls or when you need explicit control over the transaction blueprint, you construct the transaction manually and pass it to `balanceUnsealedTransaction`. The wallet then binds inputs, adds fees, and signs.

The official pattern from the [Delegate proving](https://docs.midnight.network/api-reference/dapp-connector#delegate-proving) docs is:

```typescript
import { Transaction, UnshieldedOffer, Intent, nativeToken, CostModel } from '@midnight-ntwrk/ledger-v8';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

// 1. Decode Bech32 address to raw hex bytes
//    UnshieldedOffer.new expects a hex UserAddress, not Bech32
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
//    For contract calls this invokes the proof server.
//    For plain transfers (no circuits) it simply advances PreProof → Proof.
const zkConfigProvider = new FetchZkConfigProvider(window.location.origin);
const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
const provenTx = await unsealedTx.prove(provingProvider, CostModel.initialCostModel());

// 4. Wallet balances, signs, and pays fees
const result = await connectedApi.balanceUnsealedTransaction(toHex(provenTx.serialize()), {
  payFees: true,
});

// 5. Submit
await connectedApi.submitTransaction(result.tx);
```

**Why each step matters:**

- **Bech32 → hex**: The dApp connector returns addresses in Bech32 (`mn_addr_preprod1...`), but `UnshieldedOffer.new` expects raw hex bytes. Passing Bech32 causes `Invalid character 'm' at position 0`.
- **Network ID**: `Transaction.fromParts` must use `'preprod'` (matching the wallet connection). Using `'undeployed'` causes `BALANCE_FAILED: invalid network ID`.
- **`tx.prove()`**: `balanceUnsealedTransaction` expects `Transaction<SignatureEnabled, Proof, PreBinding>`. Without `prove()`, the transaction serializes with `proof-preimage` (`PreProof`) and the wallet rejects it with `expected header tag '...proof...', got '...proof-preimage...'`.
- **`FetchZkConfigProvider`**: Required by `getProvingProvider`. For transfers with no contract circuits, the provider is never actually invoked — but the wallet's API still requires a valid `KeyMaterialProvider` to construct the `ProvingProvider` wrapper.

### Security Model

In the browser flow, **the dApp never sees the secret keys**. The wallet extension stores the mnemonic (often encrypted with a user password) and derives all keys locally. When `balanceUnsealedTransaction` is called, the wallet uses its internal keystore to sign intents. The dApp only sees public addresses and serialized transaction bytes. This is the recommended security model for user-facing applications.

---

## Subscribing to Wallet State Changes

Unlike traditional blockchain wallets that require polling, the Midnight Wallet SDK (used in CLI) exposes a push-based state stream via RxJS. The browser dApp connector does not expose this directly, but we can achieve similar functionality with periodic polling.

### CLI: Native Push Subscriptions

In Node.js scripts using the Wallet SDK, you subscribe to state changes directly:

```typescript
// src/lib/transaction-cli.ts
export function subscribeToWalletSdkState(
  ctx: CliWalletContext,
  listener: (state: any) => void
): () => void {
  const sub = ctx.wallet.state().subscribe(listener);
  return () => sub.unsubscribe();
}
```

The `wallet.state()` observable emits a new `FacadeState` whenever any sub-wallet (shielded, unshielded, or dust) updates. This includes:

- **Sync progress**: `shielded.progress.appliedIndex`, `unshielded.progress.appliedId`, `dust.progress.appliedIndex`
- **Balances**: `shielded.balances`, `unshielded.balances`, `dust.balance(timestamp)`
- **Connection status**: `isSynced` — true only when all three sub-wallets have caught up

### Waiting for Sync

Before submitting any transaction, it is critical to ensure the wallet is fully synced. We provide a helper that blocks until `isSynced` becomes true:

```typescript
export async function waitForWalletSync(ctx: CliWalletContext): Promise<any> {
  return Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.filter((s: any) => s.isSynced)
    )
  );
}
```

If the wallet is not synced, the transaction may reference already-spent UTXOs or use an incorrect nonce, resulting in submission errors like `InvalidTransaction: Custom error: 170`.

### Resuming Partial Sync

On Preprod, dust sync from genesis can take ~1–2 hours. Rather than requiring a single uninterrupted run, we added a dual filter and state persistence:

```typescript
Rx.filter((s: any) => {
  if (s.isSynced) return true;
  // Fallback: allow proceeding if shielded/unshielded are strict
  // and dust is within 1,000 blocks of the tip
  const sp = s.shielded?.progress;
  const up = s.unshielded?.progress;
  const shieldedDone = sp && BigInt(sp.highestRelevantWalletIndex - sp.appliedIndex) === 0n;
  const unshieldedDone = up && BigInt(up.highestTransactionId - up.appliedId) === 0n;
  const dustGap = BigInt(Math.abs(Number(s.dust?.progress?.highestRelevantWalletIndex - s.dust?.progress?.appliedIndex)));
  return shieldedDone && unshieldedDone && dustGap <= 1000n;
})
```

This lets the script proceed once dust is "close enough" (within 1,000 blocks) rather than waiting for the absolute tip — useful for testing while the wallet finishes catching up in the background.

### Browser: Polling-Based Updates

The dApp connector API does not expose a state stream. Instead, we poll balances and connection status at regular intervals:

```typescript
// src/hooks/useWalletSubscription.ts
setInterval(() => {
  connectedApi.getConnectionStatus().then(status => {
    if (status.status !== 'connected') {
      disconnect();
    }
  });
}, connectionInterval);

setInterval(() => {
  loadWalletState(); // fetches balances
}, balanceInterval);
```

While less elegant than push subscriptions, this approach is necessary because the browser extension manages its own state internally and only exposes discrete API methods.

---

## The CLI Transaction Flow

The CLI path demonstrates how to perform transactions without a browser wallet. This is essential for backends, automation scripts, and any service that needs to act autonomously on the Midnight network.

### Key Derivation

Instead of connecting to a wallet extension, the CLI derives secret keys directly from a 24-word BIP-39 mnemonic:

```typescript
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

This produces the same keys that Lace would derive from the same mnemonic, ensuring compatibility between browser and CLI contexts.

### Wallet Initialization

We initialize a headless `WalletFacade` with three sub-wallets. **Note:** `provingServerUrl` is required in the configuration starting with Wallet SDK v3:

```typescript
const baseConfig: any = {
  networkId: 'preprod',
  indexerClientConnection: { indexerHttpUrl, indexerWsUrl },
  relayURL: new URL('wss://rpc.preprod.midnight.network'),
  provingServerUrl: new URL('http://localhost:6300'),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  batchUpdates: { size: 500, timeout: 50, spacing: 0 },
};

const wallet: any = await (WalletFacade as any).init({
  configuration: baseConfig,
  shielded: (cfg: any) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg: any) =>
    UnshieldedWallet({ ...cfg, txHistoryStorage: new InMemoryTransactionHistoryStorage() })
      .startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (cfg: any) =>
    DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
});

await wallet.start(shieldedSecretKeys, dustSecretKey);
```

The facade automatically starts sync processes for all three sub-wallets. We then wait for `isSynced` before performing any operations.

### `transferTransaction` vs `balanceUnboundTransaction`

The Wallet SDK exposes two balancing APIs:

| Method | Recipe type | Use case | Signing |
|--------|-------------|----------|---------|
| `transferTransaction(outputs, keys, options)` | `UNPROVEN_TRANSACTION` | Simple transfers | `signRecipe` |
| `balanceUnboundTransaction(tx, keys, options)` | `UNBOUND_TRANSACTION` | General/custom txs | `signTransactionIntents` workaround |

**For transfers**, use `transferTransaction` + `signRecipe`:

```typescript
const recipe = await wallet.transferTransaction(
  [
    {
      type: 'unshielded',
      outputs: [
        {
          amount: 1n,
          receiverAddress: unshieldedKeystore.getBech32Address(),
          type: unshieldedToken().raw,
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

`signRecipe` works correctly here because `transferTransaction` returns `UNPROVEN_TRANSACTION` where all intents are genuinely `pre-proof`.

**For general transactions** (not simple transfers), use `balanceUnboundTransaction` + the intent signing workaround:

```typescript
const recipe = await wallet.balanceUnboundTransaction(
  tx,
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 30 * 60 * 1000) }
);

// Workaround: signRecipe hardcodes 'pre-proof' but proven base intents need 'proof'
const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
if (recipe.balancingTransaction) {
  signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
}

const finalized = await wallet.finalizeRecipe(recipe);
const txId = await wallet.submitTransaction(finalized);
```

The workaround is needed because `wallet-sdk-unshielded-wallet` v2.1.0's `signRecipe` hardcodes `'pre-proof'` when cloning intents, but `balanceUnboundTransaction` produces proven base intents that contain `'proof'` data. Without manual signing, `finalizeRecipe` throws a clone error.

### Submission

`submitTransaction` uses the configured `relayURL` (the Midnight Preprod RPC node) to broadcast the transaction. It returns the transaction identifier, which can be used to track inclusion via the indexer.

### State Persistence

A critical optimization for CLI scripts is wallet state persistence. Syncing from genesis every time is impractical. We save the serialized state of all three sub-wallets after each run:

```typescript
await saveWalletState(ctx, '.wallet-state');
```

On the next run, `restoreWalletState` reloads these snapshots, reducing startup time from hours to seconds. The restored wallet only needs to sync the delta (new blocks since the last save).

**Important:** The test script now uses `restoreWalletState` by default, saves partial progress on `SIGINT`/`SIGTERM`, and saves on timeout. This prevents losing hours of dust sync progress if the process is interrupted.

---

## Browser vs CLI: A Side-by-Side Comparison

| Aspect | Browser (dApp) | CLI / Backend |
|--------|---------------|---------------|
| **Key storage** | Wallet extension (Lace / 1AM) | Script holds mnemonic |
| **Key derivation** | Wallet handles it | `HDWallet.fromSeed()` + `deriveKeysAt()` |
| **Balancing API** | `balanceUnsealedTransaction` | `balanceUnboundTransaction` |
| **Transfer API** | `makeTransfer` or manual `balanceUnsealedTransaction` | `transferTransaction` |
| **Signing** | Wallet extension signs automatically | `signRecipe` for transfers; workaround for general txs |
| **Proof generation** | Wallet's proof server (via `getProvingProvider`) | Local or remote proof server |
| **Transaction submission** | `connectedApi.submitTransaction` | `wallet.submitTransaction` |
| **Sync model** | Wallet extension syncs internally | `WalletFacade` with push-based RxJS streams |
| **State persistence** | Wallet extension handles it | Manual `saveWalletState` / `restoreWalletState` |
| **User interaction** | Connect + approve prompts | Unattended, fully automated |
| **Security boundary** | Keys never leave the extension | Keys in script memory (use environment variables) |

### When to Use Which

**Use the browser flow when:**
- Building user-facing dApps
- Users should retain custody of their keys
- You want the wallet to handle sync, balancing, and signing complexity
- You need integration with existing wallet infrastructure (address books, transaction history)

**Use the CLI flow when:**
- Building backend services, bots, or automation
- You need unattended transaction submission
- You want full control over the transaction lifecycle
- You are running integration tests or deploying contracts programmatically

### The Common Substrate

Despite the differences in key management and API entry points, both flows converge on the same underlying primitives:

- **Ledger v8**: The core transaction format and cryptographic types
- **Midnight.js providers**: `indexerPublicDataProvider`, `httpClientProofProvider`, `levelPrivateStateProvider`
- **Network endpoints**: The same Preprod indexer and RPC node
- **Transaction serialization**: Identical byte formats for submission

This means a transaction built and submitted via CLI is indistinguishable from one built and submitted via Lace. The only difference is **who performed the construction and signing**.

---

## Running the Project

### Prerequisites

- Node.js >= 22
- A Midnight wallet extension (Lace or 1AM) installed in your browser
- A 24-word test mnemonic with Preprod tNIGHT tokens
- Local proof server running on port 6300:
  ```bash
  docker run -p 6300:6300 midnightnetwork/proof-server:8.0.3
  ```

### Frontend

```bash
cd midnight-connect
npm install
npm run dev
```

Open `http://localhost:5173`, connect your wallet, and navigate to **Transfer** to send an unshielded self-transfer.

### CLI

```bash
cd midnight-connect
MNEMONIC="word1 word2 ... word24" npx tsx scripts/test-v3-sync-and-transfer.ts
```

This will:
1. Initialize or restore the wallet state from `.wallet-state/`
2. Wait for full sync (`isSynced = true`) — or close enough (dust within 1,000 blocks)
3. Wait for dust generation
4. Submit a 1-unit unshielded self-transfer
5. Save the updated wallet state to `.wallet-state/`

### Project Structure

```
midnight-connect/
├── src/
│   ├── pages/
│   │   ├── Home.tsx          # Wallet dashboard with balances
│   │   └── Transfer.tsx      # Transfer form (browser flow)
│   ├── hooks/
│   │   ├── useWallet.ts      # Wallet connection + Zustand store
│   │   └── useWalletSubscription.ts  # Balance/connection polling
│   ├── lib/
│   │   └── transaction-cli.ts # CLI wallet init, sync, transfer
│   └── App.tsx               # Routing
├── scripts/
│   └── test-v3-sync-and-transfer.ts  # CLI test script
└── README.md                 # This file
```

---

## Troubleshooting

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
| Dust sync takes hours / times out | First-time sync from genesis is slow | Use `restoreWalletState`, save on SIGINT, allow 2-hour timeout |
| `Wallet.Sync` retry loop on dust | Indexer returns `raw: null` for some dust events | Apply null-raw patch to `wallet-sdk-dust-wallet` v3 SyncEventsUpdateSchema |

---

*Built with `@midnight-ntwrk/midnight-js` 4.0.4 and Wallet SDK 3.0.0 for the Midnight Preprod network.*
