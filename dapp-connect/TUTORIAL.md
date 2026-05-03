This guide walks through the complete lifecycle of connecting web apps to the Midnight blockchain. You will learn how to detect injected wallets in the browser, make a connection, monitor state changes, and submit transactions through both the browser extension flow and the CLI. You will also understand the difference between `balanceUnsealedTransaction` (browser via dApp connector) and the CLI backend path.

**Target audience:** Developers

---

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A `package.json` with the needed Midnight packages:
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-utils`
  - `@midnight-ntwrk/wallet-sdk-address-format`
  - `@midnight-ntwrk/wallet-sdk-facade`
  - `@midnight-ntwrk/wallet-sdk-shielded`
  - `@midnight-ntwrk/wallet-sdk-unshielded-wallet`
  - `@midnight-ntwrk/wallet-sdk-dust-wallet`
  - `@midnight-ntwrk/wallet-sdk-hd`
  - `zustand`, `rxjs`, `semver`

---

## Architecture: Browser vs CLI

Midnight dApps operate in two different security contexts. Understanding the boundary between them is essential before writing any code.

| Context | Custodian | Balancing method | Signature | Use case |
|---------|-----------|------------------|-----------|----------|
| **Browser / dApp** | Wallet extension (Lace, 1AM) | `balanceUnsealedTransaction` | Wallet handles it | UI / dApps |
| **CLI / Backend** | Your script | `transferTransaction` + `signRecipe` | Manual via keystore | Agents, Automation |

In the **browser flow**, the wallet extension holds the user's private key (typically encrypted on the user's device with a password). All keys are derived internally and the dApp never sees secret material. The dApp builds a transaction blueprint, serializes it, and hands it to the wallet via the **dApp Connector API**. The wallet selects inputs, adds balancing outputs via `balanceUnsealedTransaction`, creates signatures, and returns a finalized transaction.

In the **CLI / backend flow**, your script holds the 24-word mnemonic directly. It derives `ZswapSecretKeys`, `DustSecretKey`, and an `UnshieldedKeystore` from the mnemonic. Because there is no wallet extension to handle balancing and signing, the script uses `transferTransaction` to build a recipe, then `signRecipe` with the unshielded keystore, then `finalizeRecipe` and `submitTransaction`. The script acts as the wallet.

Both flows submit the same transaction format to the Midnight Preprod network. The only difference is who holds the keys and who performs the balancing.

---

## Detecting Wallets via `window.midnight`

Midnight wallet extensions inject a global `window.midnight` object before the page loads. Each wallet registers itself under a unique key — its `rdns` (reverse domain name).

We keep the detection logic in a Zustand store. Here is the actual hook we use:

```typescript
// src/hooks/useWallet.ts
import { create } from 'zustand';
import semver from 'semver';
import type {
  InitialAPI,
  ConnectedAPI,
  Configuration as WalletConfiguration,
} from '@midnight-ntwrk/dapp-connector-api';
import { COMPATIBLE_CONNECTOR_API_VERSION, NETWORK_ID } from './wallet.constants';
import type { WalletAddresses, WalletBalances } from '../types/wallet';

export interface WalletState {
  wallet: InitialAPI | null;
  connectedApi: ConnectedAPI | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  config: WalletConfiguration | null;
  addresses: WalletAddresses | null;
  balances: WalletBalances | null;
  isLoadingState: boolean;
  showAccountModal: boolean;
  setShowAccountModal: (show: boolean) => void;
  setWallet: (wallet: InitialAPI | null) => void;
  connect: (networkId?: string) => Promise<void>;
  disconnect: () => void;
  loadWalletState: () => Promise<void>;
  resetError: () => void;
}
```

And the constants we filter by:

```typescript
// src/hooks/wallet.constants.ts
export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
export const NETWORK_ID = 'preprod';
```

Notice we use `'4.x'` — not `'^4.0.0'`. The `4.x` semver range accepts any `4.x.y` version the wallet reports.

The detection function enumerates `window.midnight`, validates each entry, and filters by version:

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

If `window.midnight` is undefined, no extension is installed. If it exists but no compatible version is found, the user has an old extension.

### Wallet Selection Modal

When multiple wallets are installed, we show a modal letting the user pick:

```tsx
// src/components/WalletSelectModal.tsx
import { useState } from 'react';
import { Button } from './ui/Button';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import laceSvg from '../assets/lace.svg?url';
import iamSvg from '../assets/1am.svg?url';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}

function getWalletIcon(rdns: string | undefined): string | null {
  if (!rdns) return null;
  if (rdns.includes('lace')) return laceSvg;
  if (rdns.includes('1am') || rdns.includes('iam')) return iamSvg;
  return null;
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function WalletSelectModal({ isOpen, onClose, wallets, onSelect, connecting }: Props) {
  const [pending, setPending] = useState<InitialAPI | null>(null);

  if (!isOpen) return null;

  return (
    <div className="relative w-[380px] bg-bg-secondary border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-hover to-transparent" />

      <div className="px-6 pt-7 pb-6">
        <div className="mb-6">
          <h3 className="text-[17px] font-semibold tracking-tight text-white">Connect Wallet</h3>
          <p className="text-text-muted text-[13px] mt-1">Choose a wallet to get started</p>
        </div>

        <div className="flex flex-col gap-1.5">
          {wallets.map((w) => {
            const icon = getWalletIcon(w.rdns);
            return (
              <button
                key={w.rdns}
                onClick={() => {
                  setPending(w);
                  onSelect(w);
                }}
                disabled={connecting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 group outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
              >
                <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center shrink-0 group-hover:border-border-hover transition-colors">
                  {icon ? (
                    <img src={icon} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <WalletIcon className="w-5 h-5 text-text-muted" />
                  )}
                </div>

                <span className="flex-1 text-left text-[15px] font-medium text-white/80 group-hover:text-white transition-colors">
                  {w.name}
                </span>

                <ChevronRightIcon className="w-4 h-4 text-text-muted/0 group-hover:text-text-muted/80 group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
              </button>
            );
          })}
        </div>

        {connecting && pending && (
          <div className="mt-4 text-center text-sm text-neutral-300">
            Connecting to {pending.name}...
            <div className="mt-2 w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-border/50">
          <Button
            variant="ghost"
            className="w-full text-text-muted hover:text-text-secondary text-[13px]"
            onClick={onClose}
            disabled={connecting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
```

You discover installed wallets using `InitialAPI[]`. Each object is injected by a browser-installed wallet extension. In this example, multiple wallets may be installed (1AM, Lace, others).

---

## Connecting to Lace or 1AM

The `ConnectButton` ties detection, selection, and connection together. If one wallet is detected, it connects immediately. If multiple are detected, it opens the modal. Once connected, clicking the button opens an account modal instead of disconnecting.

```tsx
// src/components/ConnectButton.tsx
import { useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { WalletSelectModal } from './WalletSelectModal';
import { useWalletStore, getCompatibleWallets } from '../hooks/useWallet';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export function ConnectButton() {
  const { isConnected, isConnecting, connect, setWallet, addresses, wallet, setShowAccountModal } = useWalletStore();
  const [wallets] = useState<InitialAPI[]>(() => getCompatibleWallets());
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

  // ...button render logic

  return (
    <>
      <Button onClick={handleClick}>
        {/* connected address or "Connect Wallet" */}
      </Button>

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

### The Connection Flow

When `connect()` is called on the store, it triggers the wallet extension's connection flow. The user may see a popup asking for approval.

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

    // Persist for auto-reconnect
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

Key detail: `connect()` fetches **addresses**, not balances. The `dustAddress` is fetched here; balances are loaded separately in `loadWalletState()`.

### Auto-Reconnect

We store the last connected wallet's `rdns` in `localStorage` and attempt to reconnect on page load:

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

### Account Modal

Clicking the connected button opens a popup showing balances, addresses, copy buttons, refresh, and disconnect — instead of immediately disconnecting:

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

---

## Subscribing to Wallet State Changes

The dApp Connector API v4 does **not** expose a native push/subscription API. Reactive updates are built on top of polling.

### Browser: Polling-Based Updates

We use a hook that polls balances and connection status:

```typescript
// src/hooks/useWalletSubscription.ts
import { useEffect, useRef } from 'react';
import { useWalletStore } from './useWallet';

export function useWalletSubscription(options: { balanceInterval?: number; connectionInterval?: number } = {}) {
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
        if (status.status === 'disconnected') {
          disconnect();
        }
      } catch {
        if (lastStatusRef.current === 'connected') {
          disconnect();
        }
      }
    };

    const id = setInterval(check, connectionInterval);
    return () => clearInterval(id);
  }, [isConnected, connectedApi, disconnect, connectionInterval]);
}
```

The `loadWalletState` action fetches all three balance types in parallel:

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

### CLI: Native Push Subscriptions

In Node.js scripts using the Wallet SDK, you get true push-based state via RxJS:

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

The `wallet.state()` observable emits a new `FacadeState` whenever any sub-wallet (shielded, unshielded, or dust) updates. No polling needed.

---

## The Browser Transaction Flow (`balanceUnsealedTransaction`)

Once connected, the browser dApp can request the wallet to balance and submit transactions. Our app uses the **manual construction path** — building an `Intent` with an `UnshieldedOffer`, proving it, then calling `balanceUnsealedTransaction`.

### Why Manual Construction?

The dApp Connector API also exposes `makeTransfer`, a convenience method for simple transfers. We do not use it in this app because the manual path gives full control over the transaction blueprint and works identically for both pure transfers and contract calls.

Here is the actual transfer page:

```tsx
// src/pages/Transfer.tsx
import { useState, useCallback, useEffect } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import {
  Transaction, UnshieldedOffer, Intent, nativeToken, CostModel
} from '@midnight-ntwrk/ledger-v8';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

export function TransferPage() {
  const { isConnected, connectedApi, addresses, balances, loadWalletState } = useWalletStore();
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) {
      loadWalletState();
      if (addresses?.unshieldedAddress && !recipient) {
        setRecipient(addresses.unshieldedAddress);
      }
    }
  }, [isConnected, addresses?.unshieldedAddress]);

  const handleTransfer = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }
    if (!recipient || !amount) {
      setError('Enter recipient and amount');
      return;
    }

    setStatus('Building transfer...');
    setError(null);
    setTxId(null);

    try {
      const value = BigInt(Math.round(Number(amount) * 1_000_000));

      // 1. Decode Bech32 address to raw hex bytes
      setStatus('Building transaction...');
      const parsed = MidnightBech32m.parse(recipient);
      const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
      const hexRecipient = unshieldedAddr.data.toString('hex');

      // 2. Build an unproven transaction blueprint manually
      const unshieldedOffer = UnshieldedOffer.new(
        [], // inputs — wallet will select these
        [{ value, owner: hexRecipient, type: nativeToken().raw }],
        [] // signatures — wallet will add these
      );

      const intent = Intent.new(new Date(Date.now() + 30 * 60 * 1000));
      (intent as any).fallibleUnshieldedOffer = unshieldedOffer;

      const unsealedTx = Transaction.fromParts('preprod', undefined, undefined, intent as any);

      // 3. Prove the transaction (PreProof → Proof)
      setStatus('Proving transaction...');
      const zkConfigProvider = new FetchZkConfigProvider(window.location.origin);
      const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
      const provenTx = await unsealedTx.prove(provingProvider, CostModel.initialCostModel());

      const serializedTx = toHex(provenTx.serialize());

      // 4. Wallet balances, signs, and pays fees
      setStatus('Balancing via wallet...');
      const result = await connectedApi.balanceUnsealedTransaction(serializedTx, { payFees: true });

      // 5. Submit
      setStatus('Submitting...');
      await connectedApi.submitTransaction(result.tx);

      setTxId(result.tx.slice(0, 64));
      setStatus(null);
      loadWalletState();
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    }
  }, [connectedApi, recipient, amount, loadWalletState]);

  // ...render form
}
```

### Why Each Step Matters

**Bech32 → hex:** The dApp connector returns addresses in Bech32 (`mn_addr_preprod1...`), but `UnshieldedOffer.new` expects raw hex bytes for the `owner` field. Passing Bech32 directly causes:

```
Invalid character 'm' at position 0
```

The correct decode path is:

```typescript
const parsed = MidnightBech32m.parse(recipient);
const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
const hexRecipient = unshieldedAddr.data.toString('hex');
```

**Network ID:** `Transaction.fromParts` must use `'preprod'` (matching the wallet connection). Using `'undeployed'` causes:

```
BALANCE_FAILED: invalid network ID - expect 'preprod' found 'undeployed'
```

**`tx.prove()`:** `balanceUnsealedTransaction` expects a transaction with the `Proof` marker. Without `prove()`, the transaction serializes with `proof-preimage` (`PreProof` state) and the wallet rejects it with:

```
expected header tag '...proof...', got '...proof-preimage...'
```

**Security model:** In the browser flow, **the dApp never sees secret keys**. The wallet extension derives all keys locally and signs intents internally. The dApp only handles public addresses and serialized transaction bytes.

---

## The CLI Transaction Flow

The CLI path performs transactions without a browser wallet. This is essential for backends, automation scripts, and any service that needs to act autonomously.

### Key Derivation

Derive secret keys directly from a 24-word BIP-39 mnemonic. **Important:** Call `hdWallet.hdWallet.clear()` after derivation to wipe the seed from memory.

```typescript
// src/lib/transaction-cli.ts
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';

const seed = Buffer.from(await bip39.mnemonicToSeed(mnemonic));
const hdWallet = HDWallet.fromSeed(seed);

if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet');

const derivationResult = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

if (derivationResult.type !== 'keysDerived') throw new Error('Key derivation failed');
hdWallet.hdWallet.clear(); // Security: wipe seed from memory

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], 'preprod');
```

### Wallet Initialization

Initialize a headless `WalletFacade` with three sub-wallets. Wallet SDK v3 requires several config fields that were optional in earlier versions:

```typescript
// src/lib/transaction-cli.ts
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { UnshieldedWallet, PublicKey, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

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

### CLI Transfer: `transferTransaction` + `signRecipe`

For CLI transfers, we use `transferTransaction` (a convenience method on `WalletFacade`) followed by `signRecipe`:

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

Note: CLI uses `unshieldedToken().raw` (not `nativeToken().raw`) for the token type in `transferTransaction`.

### State Persistence

Syncing from genesis every time is impractical. Save the serialized state of all three sub-wallets after each run:

```typescript
// src/lib/transaction-cli.ts
const STATE_DIR = path.resolve(process.cwd(), '.wallet-state');

export async function saveWalletState(ctx: CliWalletContext, directory = STATE_DIR): Promise<void> {
  await fs.mkdir(directory, { recursive: true });

  const [shieldedState, unshieldedState, dustState] = await Promise.all([
    ctx.wallet.shielded.serializeState(),
    ctx.wallet.unshielded.serializeState(),
    ctx.wallet.dust.serializeState(),
  ]);

  await Promise.all([
    fs.writeFile(path.join(directory, 'shielded.json'), shieldedState, 'utf-8'),
    fs.writeFile(path.join(directory, 'unshielded.json'), unshieldedState, 'utf-8'),
    fs.writeFile(path.join(directory, 'dust.json'), dustState, 'utf-8'),
  ]);

  console.log(`[State] Wallet state saved to ${directory}`);
}
```

Restore on startup:

```typescript
// src/lib/transaction-cli.ts
export async function restoreWalletState(mnemonic: string, directory = STATE_DIR): Promise<CliWalletContext> {
  // ...derive keys same as initializeCliWallet...

  try {
    const [shieldedSerialized, unshieldedSerialized, dustSerialized] = await Promise.all([
      fs.readFile(path.join(directory, 'shielded.json'), 'utf-8'),
      fs.readFile(path.join(directory, 'unshielded.json'), 'utf-8'),
      fs.readFile(path.join(directory, 'dust.json'), 'utf-8'),
    ]);

    const wallet: any = await (WalletFacade as any).init({
      configuration: baseConfig,
      shielded: () => (ShieldedWallet as any)(baseConfig).restore(shieldedSerialized),
      unshielded: () =>
        (UnshieldedWallet as any)({ ...baseConfig, txHistoryStorage: new InMemoryTransactionHistoryStorage() })
          .restore(unshieldedSerialized),
      dust: () => (DustWallet as any)(baseConfig).restore(dustSerialized),
    });

    await wallet.start(shieldedSecretKeys, dustSecretKey);
    console.log('[State] Wallet restored from saved state');
    return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
  } catch (err) {
    console.log('[State] No saved state found or restore failed. Building from scratch...');
    return initializeCliWallet(mnemonic);
  }
}
```

On the next run, the wallet only syncs the delta (new blocks since the last save), reducing startup from hours to seconds.

### Dust Sync Handling

First-time dust sync from genesis can take hours. We use a 2-hour timeout and a fallback that allows proceeding if dust is "close enough" to the tip:

```typescript
// scripts/test-v3-sync-and-transfer.ts
const isDustCloseEnough = (s: any, maxGap: bigint = 1000n): boolean => {
  const dp = s.dust?.progress;
  if (!dp) return false;
  const gap = BigInt(Math.abs(Number(dp.highestRelevantWalletIndex - dp.appliedIndex)));
  return dp.isConnected && gap <= maxGap;
};

const syncedState = await Rx.firstValueFrom(
  ctx.wallet.state().pipe(
    Rx.throttleTime(5_000),
    Rx.tap((s: any) => {
      // ...log progress...
    }),
    Rx.filter((s: any) => {
      if (s.isSynced) return true;
      const sp = s.shielded?.progress;
      const up = s.unshielded?.progress;
      const shieldedDone = sp && BigInt(sp.highestRelevantWalletIndex - sp.appliedIndex) === 0n;
      const unshieldedDone = up && BigInt(up.highestTransactionId - up.appliedId) === 0n;
      return shieldedDone && unshieldedDone && isDustCloseEnough(s, 1000n);
    }),
    Rx.timeout(120 * 60 * 1000), // 2 hours for first-time dust sync
  )
);
```

We also save state on `SIGINT`/`SIGTERM` so progress is not lost if the user interrupts:

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

---

## `balanceUnsealedTransaction` vs CLI Methods

| Aspect | Browser (dApp Connector) | CLI / Backend |
|--------|-------------------------|---------------|
| **Key custody** | Wallet extension (Lace / 1AM) | 24-word mnemonic in script |
| **Key derivation** | Wallet handles it | `HDWallet.fromSeed()` + `deriveKeysAt()` |
| **Balancing API** | `balanceUnsealedTransaction` | `transferTransaction` (convenience) |
| **Manual signing** | Not needed — wallet signs internally | `signRecipe` with `unshieldedKeystore.signData()` |
| **Proof step** | `tx.prove()` via `getProvingProvider` | Handled inside `transferTransaction` |
| **Transaction submission** | `connectedApi.submitTransaction(result.tx)` | `wallet.submitTransaction(finalized)` |
| **Sync model** | Wallet extension syncs internally | `WalletFacade` + RxJS push streams |
| **State restore** | N/A (extension persists) | `restoreWalletState()` from `.wallet-state/` |
| **Security boundary** | Keys never leave the extension | Keys in script memory (use env vars) |

### Why Not `balanceUnboundTransaction`?

The `WalletFacade` also exposes a lower-level `balanceUnboundTransaction` method for custom transactions that `transferTransaction` cannot express. In this app, we use `transferTransaction` for CLI transfers because it handles the full pipeline (build → prove → balance) in one call. If you need fine-grained control over intent construction in a headless environment, `balanceUnboundTransaction` is available, but you must manually sign intents and handle the proof step yourself — similar to the browser's manual flow, but with your script holding the keys.

---

## Common Errors and How to Fix Them

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
| `Custom error: 170` | Wallet not fully synced | Wait for `isSynced = true` (or dust within 1k blocks) before submitting |
| Dust sync timeout | First-time sync from genesis is slow | Use `restoreWalletState()`; save on SIGINT; allow 2h timeout |

---

## Running the Reference Implementation

### Prerequisites

- Node.js v22+
- Docker (for proof server)
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- 24-word test mnemonic for CLI scripts

### Environment

The app uses these constants:

```typescript
// src/hooks/wallet.constants.ts
export const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
export const PROOF_SERVER = 'http://localhost:6300';
export const NETWORK_ID = 'preprod';
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
