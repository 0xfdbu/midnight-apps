📁 **Full Source Code:** [midnight-apps/dapp-connect](https://github.com/0xfdbu/midnight-apps/tree/main/dapp-connect)

This guide walks through the complete lifecycle of connecting web apps to the Midnight blockchain. You learn how to detect injected wallets in the browser, make a connection, monitor state changes, and submit transactions through both the browser extension flow and the CLI. You also learn the difference between them.

**Target audience:** Developers

---

## Prerequisites

- Node.js installed (v20+)
- A Midnight wallet (for example, 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/package.json) with the needed packages:
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-utils`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `@midnight-ntwrk/wallet-sdk-address-format`
  - `@midnight-ntwrk/wallet-sdk-facade`
  - `@midnight-ntwrk/wallet-sdk-shielded`
  - `@midnight-ntwrk/wallet-sdk-unshielded-wallet`
  - `@midnight-ntwrk/wallet-sdk-dust-wallet`
  - `@midnight-ntwrk/wallet-sdk-hd`
  - `@scure/bip39`
  - `react`, `react-dom`, `react-router-dom`
  - `zustand`, `rxjs`, `semver`, `ws`
  - `typescript`, `vite`

---

## Architecture: browser vs CLI

Midnight DApps operate in two different security contexts. Understanding the boundary between them is essential before writing any code.

| Context | Custodian | Balancing method | Signature | Use case |
|---------|-----------|------------------|-----------|----------|
| **Browser / DApp** | Injected extension | `balanceUnsealedTransaction` | Wallet handles it | UI / DApps |
| **CLI / backend** | Your script | `transferTransaction` + `signRecipe` | Manual | Agents, automation |

In the **browser flow**, the wallet extension handles the user's private key (typically encrypted on the user's device with a password). All keys are derived internally, and the DApp never sees secret material. The DApp builds a transaction blueprint, serializes it, and hands it to the wallet through the **DApp Connector API**. The wallet selects inputs, adds balancing outputs through `balanceUnsealedTransaction`, creates the signatures, and returns a finalized transaction.

In the **CLI / backend flow**, your script holds the 24-word mnemonic directly. It derives `ZswapSecretKeys`, `DustSecretKey`, and an `UnshieldedKeystore` from the mnemonic. Because there is no wallet extension to handle balancing and signing, the script uses `transferTransaction` to build a recipe, then `signRecipe` with the unshielded keystore, then `finalizeRecipe` and `submitTransaction`. The script acts as the wallet.

Both flows submit the same transaction format to the Midnight network. The only difference is who holds the keys and who performs the balancing.

---

## Detecting wallets via `window.midnight`

Midnight wallets inject a global `window.midnight` object before page load.

**Note:** `COMPATIBLE_CONNECTOR_API_VERSION` is `'4.x'`, not `'^4.0.0'`. The `'4.x'` semver range accepts any `4.x.y` version the wallet reports.

View the full [`wallet.constants.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/hooks/wallet.constants.ts) and [`useWallet.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/hooks/useWallet.ts) files on GitHub.

```typescript
// src/hooks/wallet.constants.ts
export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
export const NETWORK_ID = 'preprod';
```

The detection function enumerates `window.midnight`, validates each entry, and filters by version.

```typescript
// src/hooks/useWallet.ts
export function getCompatibleWallets(): InitialAPI[] {
  if (!window.midnight) return [];

  return Object.values(window.midnight).filter(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
  );
}
```

### Wallet selection modal

When one or more wallets are installed, a modal is shown so the user can pick.

View the full [`WalletSelectModal.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/components/WalletSelectModal.tsx) file on GitHub.

```tsx
// src/components/WalletSelectModal.tsx
function getWalletIcon(rdns: string | undefined): string | null {
  if (!rdns) return null;
  if (rdns.includes('lace')) return laceSvg;
  if (rdns.includes('1am') || rdns.includes('iam')) return iamSvg;
  return null;
}

export function WalletSelectModal({ isOpen, onClose, wallets, onSelect, connecting }: Props) {
  const [pending, setPending] = useState<InitialAPI | null>(null);
  if (!isOpen) return null;

  return (
    <div>
      <h3>Connect Wallet</h3>
      {wallets.map((w) => (
        <button
          key={w.rdns}
          onClick={() => {
            setPending(w);
            onSelect(w);
          }}
          disabled={connecting}
        >
          <img src={getWalletIcon(w.rdns) ?? fallback} />
          <span>{w.name}</span>
        </button>
      ))}
      {connecting && pending && <div>Connecting to {pending.name}...</div>}
      <Button onClick={onClose} disabled={connecting}>Cancel</Button>
    </div>
  );
}
```

Installed wallets are discovered using `InitialAPI[]`. Each object is injected by a browser-installed wallet extension.

![Wallet selection modal showing Lace and 1AM options](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sgyn1lccxmea8ubwizb4.png)

---

## Connecting to Lace or 1AM

`ConnectButton` ties detection, selection, and connection together. If a single wallet is detected, it directly prompts for wallet connection approval. If multiple wallets are detected, a modal is shown.

View the full [`ConnectButton.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/components/ConnectButton.tsx) file on GitHub.

```tsx
// src/components/ConnectButton.tsx
export function ConnectButton() {
  const { isConnected, connect, setWallet, setShowAccountModal } = useWalletStore();
  const [wallets] = useState(() => getCompatibleWallets());
  const [showModal, setShowModal] = useState(false);

  const handleConnect = async (selectedWallet: InitialAPI) => {
    setWallet(selectedWallet);
    setShowModal(false);
    await connect('preprod');
  };

  const handleClick = () => {
    if (isConnected) {
      setShowAccountModal(true);
    } else if (wallets.length === 1) {
      handleConnect(wallets[0]);
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <Button onClick={handleClick}>Connect Wallet</Button>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <WalletSelectModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          wallets={wallets}
          onSelect={handleConnect}
          connecting={isConnecting}
        />
      </Modal>
    </>
  );
}
```

![Connect button showing connected wallet address](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4en7fenw9zvy1gp0wobk.png)

### The connection flow

When `wallet.connect(networkId)` is called, it triggers the wallet extension connection flow.

View the full [`useWallet.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/hooks/useWallet.ts) file on GitHub.

```typescript
// src/hooks/useWallet.ts
connect: async (networkId = NETWORK_ID) => {
  const { wallet } = get();
  if (!wallet) {
    set({ error: 'No wallet selected' });
    return;
  }

  set({ isConnecting: true, error: null });

  try {
    const connectedApi = await wallet.connect(networkId);
    const status = await connectedApi.getConnectionStatus();

    if (status.status !== 'connected') {
      throw new Error(`Wallet status: ${status.status}`);
    }

    const config = await connectedApi.getConfiguration();
    const shielded = await connectedApi.getShieldedAddresses();
    const unshielded = await connectedApi.getUnshieldedAddress();
    const dustAddr = await connectedApi.getDustAddress();

    set({
      connectedApi,
      isConnected: true,
      config,
      addresses: {
        shieldedAddress: shielded.shieldedAddress,
        shieldedCoinPublicKey: shielded.shieldedCoinPublicKey,
        shieldedEncryptionPublicKey: shielded.shieldedEncryptionPublicKey,
        unshieldedAddress: unshielded.unshieldedAddress,
        dustAddress: dustAddr.dustAddress,
      },
      balances: {
        shielded: {},
        unshielded: {},
        dust: { balance: 0n, cap: 0n },
      },
    });

    localStorage.setItem('midnight_last_wallet', wallet.rdns);
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : 'Connection failed',
      isConnected: false,
      connectedApi: null,
    });
  } finally {
    set({ isConnecting: false });
  }
},
```

**Note:** `connect()` fetches addresses, not balances. The `dustAddress` is fetched here, but balances are loaded separately in `loadWalletState()`.

### Auto-reconnect

Store the last connected wallet's `rdns` in `localStorage` and attempt to reconnect on page reload.

```typescript
// src/hooks/useWallet.ts
export async function tryAutoConnect(): Promise<void> {
  const lastRdns = localStorage.getItem('midnight_last_wallet');
  if (!lastRdns || !window.midnight) return;

  const wallets = getCompatibleWallets();
  const match = wallets.find((w) => w.rdns === lastRdns);
  if (!match) return;

  const store = useWalletStore.getState();
  store.setWallet(match);
  await store.connect();
}
```

### Account modal

Clicking the connected button opens a popup showing balances, addresses, copy buttons, refresh, and disconnect.

View the full [`AccountModal.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/components/AccountModal.tsx) file on GitHub.

```tsx
// src/components/AccountModal.tsx
export function AccountModal() {
  const {
    showAccountModal, setShowAccountModal,
    addresses, balances, config,
    isLoadingState, loadWalletState,
    disconnect, wallet, error,
  } = useWalletStore();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, address: string | undefined) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Renders shielded/unshielded/dust balances,
  // copyable addresses, refresh button, disconnect
}
```

![Account modal showing balances and addresses](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vdcftgx3upsmc4oukz5i.png)

---

## Subscribing to wallet state changes

The DApp Connector v4 API does not expose a native push/subscription API. Reactive updates are built on top of polling.

View the full [`useWalletSubscription.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/hooks/useWalletSubscription.ts) file on GitHub.

`useWalletSubscription` hook calls `loadWalletState()` every 15 seconds

```typescript
// src/hooks/useWalletSubscription.ts
export function useWalletSubscription(options = {}) {
  const { balanceInterval = 15000, connectionInterval = 5000 } = options;
  const { connectedApi, isConnected, loadWalletState, disconnect } = useWalletStore();
  const lastStatusRef = useRef<'connected' | 'disconnected'>('disconnected');

  // 1. Balance polling
  useEffect(() => {
    if (!isConnected || !connectedApi) return;
    loadWalletState();
    const id = setInterval(() => loadWalletState(), balanceInterval);
    return () => clearInterval(id);
  }, [isConnected, connectedApi, loadWalletState, balanceInterval]);

  // 2. Connection-status polling
  useEffect(() => {
    if (!isConnected || !connectedApi) return;

    const check = async () => {
      try {
        const status = await connectedApi.getConnectionStatus();
        lastStatusRef.current = status.status;
        if (status.status === 'disconnected') disconnect();
      } catch {
        if (lastStatusRef.current === 'connected') disconnect();
      }
    };

    const id = setInterval(check, connectionInterval);
    return () => clearInterval(id);
  }, [isConnected, connectedApi, disconnect, connectionInterval]);
}
```

`loadWalletState` fetches all balance types at the same time.

```typescript
// src/hooks/useWallet.ts
loadWalletState: async () => {
  const { connectedApi } = get();
  if (!connectedApi) return;

  set({ isLoadingState: true, error: null });

  try {
    const [shieldedBalances, unshieldedBalances, dustBalance] = await Promise.all([
      connectedApi.getShieldedBalances(),
      connectedApi.getUnshieldedBalances(),
      connectedApi.getDustBalance(),
    ]);

    set({
      balances: {
        shielded: shieldedBalances,
        unshielded: unshieldedBalances,
        dust: dustBalance,
      },
    });
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'Failed to load wallet state' });
  } finally {
    set({ isLoadingState: false });
  }
},
```

### CLI: native push subscriptions

Using the Wallet SDK, you get true push-based state through RxJS.

Build a small helper function. View the full [`transaction-cli.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/lib/transaction-cli.ts) file on GitHub.

```typescript
// src/lib/transaction-cli.ts
import * as Rx from 'rxjs';

export function subscribeToWalletSdkState(
  ctx: CliWalletContext,
  listener: (state: any) => void
): () => void {
  const sub = (ctx.wallet as any).state().subscribe(listener);
  return () => sub.unsubscribe();
}

export async function waitForWalletSync(ctx: CliWalletContext): Promise<any> {
  return Rx.firstValueFrom(
    (ctx.wallet as any)
      .state()
      .pipe(Rx.filter((s: any) => s.isSynced))
  );
}
```

Build the flow. View [`test-subscription.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/scripts/test-subscription.ts) for the complete script.

```typescript
// scripts/test-subscription.ts
const ctx = await restoreWalletState(MNEMONIC);

// 1. Block until fully synced
await waitForWalletSync(ctx);

// 2. Subscribe to push updates
const unsubscribe = subscribeToWalletSdkState(ctx, (state: any) => {
  if (!state.isSynced) return;

  const shielded = state.shielded?.balances ?? {};
  const unshielded = state.unshielded?.balances ?? {};
  const dust = state.dust?.balance(new Date()) ?? 0n;

  console.log('Shielded:', Object.entries(shielded)
    .map(([k, v]) => `${k.slice(0, 8)}..=${v?.toString()}`).join(', ') || '(empty)');
  console.log('Unshielded:', Object.entries(unshielded)
    .map(([k, v]) => `${k.slice(0, 8)}..=${v?.toString()}`).join(', ') || '(empty)');
  console.log('Dust:', dust.toString());
});
```

![CLI push subscription output showing balance updates](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/rwrhbm247kt9ue72espp.png)

---

## The browser transaction flow (`balanceUnsealedTransaction`)

Once connected, the browser DApp requests the wallet to balance and submit the transaction. The app uses **manual construction**: building an `Intent` with an `UnshieldedOffer`, proving it, then calling `balanceUnsealedTransaction`.

The DApp Connector API also exposes `makeTransfer`, a convenience method for simple transfers. This app does not use it because the manual path gives full control over the transaction blueprint and works for both pure transfers and **contract calls**.

Here is the full lifecycle of the transfer page. View the full [`Transfer.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/pages/Transfer.tsx) file on GitHub.

```tsx
// src/pages/Transfer.tsx
const handleTransfer = useCallback(async () => {
  if (!connectedApi) {
    setError('Wallet not connected');
    return;
  }

  try {
    const value = BigInt(Math.round(Number(amount) * 1_000_000));

    // 1. Decode Bech32 address to raw hex bytes
    const parsed = MidnightBech32m.parse(recipient);
    const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
    const hexRecipient = unshieldedAddr.data.toString('hex');

    // 2. Build an unproven transaction blueprint manually
    const unshieldedOffer = UnshieldedOffer.new(
      [], // inputs — wallet selects these
      [{ value, owner: hexRecipient, type: nativeToken().raw }],
      [] // signatures — wallet adds these
    );

    const intent = Intent.new(new Date(Date.now() + 30 * 60 * 1000));
    (intent as any).fallibleUnshieldedOffer = unshieldedOffer;

    const unsealedTx = Transaction.fromParts('preprod', undefined, undefined, intent as any);

    // 3. Prove the transaction (PreProof → Proof)
    const zkConfigProvider = new FetchZkConfigProvider(window.location.origin);
    const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
    const provenTx = await unsealedTx.prove(provingProvider, CostModel.initialCostModel());

    const serializedTx = toHex(provenTx.serialize());

    // 4. Wallet balances, signs, and pays fees
    const result = await connectedApi.balanceUnsealedTransaction(serializedTx, { payFees: true });

    // 5. Submit
    await connectedApi.submitTransaction(result.tx);

    setTxId(result.tx.slice(0, 64));
    loadWalletState();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  }
}, [connectedApi, recipient, amount, loadWalletState]);
```

### Why each step matters

**Bech32 → hex:** The DApp Connector returns addresses in Bech32 (`mn_addr_preprod1...`), but `UnshieldedOffer.new` expects raw hex bytes for the `owner` field.

The correct flow is:

```typescript
const parsed = MidnightBech32m.parse(recipient);
const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
const hexRecipient = unshieldedAddr.data.toString('hex');
```

**Network ID:** `Transaction.fromParts` must use `'preprod'` (matching the wallet connection). Using `'undeployed'` causes:

```plaintext
BALANCE_FAILED: invalid network ID - expect 'preprod' found 'undeployed'
```

**`tx.prove()`:** `balanceUnsealedTransaction` expects a transaction with the `Proof` marker. Without `prove()`, the transaction serializes with `proof-preimage` (`PreProof` state) and the wallet rejects it with:

```plaintext
expected header tag '...proof...', got '...proof-preimage...'
```

**Security model:** In the browser flow, **the DApp never sees secret keys**. The wallet extension derives all keys locally and signs intents internally. The DApp only handles public addresses and serialized transaction bytes.

---

## The CLI transaction flow

The CLI performs transactions without a browser wallet, which is essential for agents and other systems to act autonomously.

### Key derivation

Derive secret keys directly from a 24-word BIP-39 mnemonic. Call `hdWallet.hdWallet.clear()` after derivation to clear the seed from memory.

View the full [`transaction-cli.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/src/lib/transaction-cli.ts) file on GitHub.

```typescript
// src/lib/transaction-cli.ts
const seed = Buffer.from(await bip39.mnemonicToSeed(mnemonic));
const hdWallet = HDWallet.fromSeed(seed);

const derivationResult = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

hdWallet.hdWallet.clear(); // Security: wipe seed from memory

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], 'preprod');
```

### Wallet initialization

Initialize a headless `WalletFacade` with three sub-wallets. Wallet SDK v3 requires several config fields that were optional in previous versions.

```typescript
// src/lib/transaction-cli.ts
const baseConfig: any = {
  networkId: 'preprod',
  indexerClientConnection: {
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
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

Required v3 fields:
- `provingServerUrl`: The local proof server URL
- `costParameters`: Fee overhead and block margin
- `txHistoryStorage`: Unshielded transaction history storage
- `batchUpdates`: Tuning for dust sync performance (`{ size: 500, timeout: 50, spacing: 0 }`)
- `PublicKey.fromKeyStore()`: Wraps the unshielded keystore for the wallet
- `LedgerParameters.initialParameters().dust`: Dust ledger parameters

### CLI transfer: `transferTransaction` + `signRecipe`

For CLI transfers, use `transferTransaction` followed by `signRecipe`:

View the full [`test-v3-sync-and-transfer.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/dapp-connect/scripts/test-v3-sync-and-transfer.ts) file on GitHub.

```typescript
// scripts/test-v3-sync-and-transfer.ts
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';

const recipe = await ctx.wallet.transferTransaction(
  [
    {
      type: 'unshielded',
      outputs: [
        {
          amount: 1n,
          receiverAddress: ctx.unshieldedKeystore.getBech32Address(),
          type: unshieldedToken().raw,
        },
      ],
    },
  ],
  { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
  { ttl: new Date(Date.now() + 30 * 60 * 1000) }
);

const signedRecipe = await ctx.wallet.signRecipe(
  recipe,
  (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload)
);

const finalized = await ctx.wallet.finalizeRecipe(signedRecipe);
const txId = await ctx.wallet.submitTransaction(finalized);
```

**Note:** The CLI uses `unshieldedToken().raw` for the token type in `transferTransaction`.

### Dust sync handling

First-time dust syncing can take some time (approximately 70 minutes in testing). A 2-hour timeout is used.

```typescript
// scripts/test-v3-sync-and-transfer.ts
const syncedState = await Rx.firstValueFrom(
  ctx.wallet.state().pipe(
    Rx.throttleTime(5_000),
    Rx.tap((s: any) => {
      // ...log progress...
    }),
    Rx.filter((s: any) => s.isSynced === true),
    Rx.timeout(120 * 60 * 1000), // 2 hours for first-time dust sync
  )
);
```

Most importantly, save state on `SIGINT`/`SIGTERM` so progress is not lost if the user interrupts.

```typescript
const saveBeforeExit = async () => {
  console.log('\n[Test] Interrupted — saving partial state...');
  await saveWalletState(ctx, '.wallet-state');
  await ctx.wallet.stop();
  process.exit(0);
};
process.on('SIGINT', saveBeforeExit);
process.on('SIGTERM', saveBeforeExit);
```

### Run the CLI transfer script

```bash
MNEMONIC="word1 word2 ... word24" npx tsx scripts/test-v3-sync-and-transfer.ts
```

![CLI transfer output showing success](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/epn4x1nka0n5txkd7s5k.png)

**Note:** Sometimes the transfer fails. This is often caused by network issues.

## Conclusion

`dapp-connect` is a reference implementation for connecting to the Midnight blockchain from both the browser and the CLI. It demonstrates the complete wallet lifecycle, from detection to connection, state monitoring, and transaction construction, proving, balancing, signing, and submitting, across two different security contexts.

## Next steps

- Clone the project at [`https://github.com/0xfdbu/midnight-apps/tree/main/dapp-connect`](https://github.com/0xfdbu/midnight-apps/tree/main/dapp-connect)
- Deploy a compact smart contract and integrate it into the DApp
- Build an AI agent around the CLI

## Troubleshooting

### Browser errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid character 'm' at position 0` | Bech32 address passed to `UnshieldedOffer.new` | Decode with `MidnightBech32m.parse(addr).decode(UnshieldedAddress, 'preprod').data.toString('hex')` |
| `expected header tag '...proof...', got '...proof-preimage...'` | Missing `tx.prove()` before `balanceUnsealedTransaction` | Call `await tx.prove(provingProvider, CostModel.initialCostModel())` |
| `BALANCE_FAILED: invalid network ID` | Wrong network in `Transaction.fromParts` | Use `'preprod'`, not `'undeployed'` |
| `No compatible wallet found` | Extension reports API version outside `'4.x'` | Update the wallet extension |

### CLI errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing required configuration: 'provingServerUrl'` | `WalletFacade.init` missing proof server URL | Add `provingServerUrl: new URL('http://localhost:6300')` to config |
| `Custom error: 192` | Missing `signRecipe` step before `finalizeRecipe` | Add `await wallet.signRecipe(recipe, signFn)` before `finalizeRecipe` |
| `Custom error: 170` | Wallet not fully synced | Wait for `isSynced = true` before submitting |
| Dust sync timeout | First-time sync from genesis is slow | Use `restoreWalletState()`; save on SIGINT; allow 2h timeout |

*Built with `@midnight-ntwrk/midnight-js` 4.0.4 and Wallet SDK 3.0.0 for the Midnight Preprod network.*
