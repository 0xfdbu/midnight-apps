/**
 * CLI / Backend Transaction Flow
 *
 * When running outside a browser (e.g., Node scripts), you do not have a
 * wallet extension to balance transactions. Instead, you hold the secret keys
 * directly and use `balanceUnboundTransaction`.
 *
 * | Context | API | Who holds keys |
 * |---------|-----|----------------|
 * | Browser / dApp | `balanceUnsealedTransaction` | Wallet extension (Lace / 1AM) |
 * | CLI / Node / Backend | `balanceUnboundTransaction` | Your script / service |
 */

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import * as Rx from 'rxjs';
import * as fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const NETWORK = 'preprod';

/* ------------------------------------------------------------------ */
/* 1. Wallet init from mnemonic (CLI holds keys)                       */
/* ------------------------------------------------------------------ */

interface CliWalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
}

export async function initializeCliWallet(mnemonic: string): Promise<CliWalletContext> {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24 || !bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid 24-word mnemonic phrase');
  }

  const seed = Buffer.from(await bip39.mnemonicToSeed(words.join(' ')));
  const hdWallet = HDWallet.fromSeed(seed);

  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet');

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], NETWORK);

  const baseConfig: any = {
    networkId: NETWORK,
    indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
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

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/* ------------------------------------------------------------------ */
/* 1b. Wallet state persistence (save / restore)                       */
/* ------------------------------------------------------------------ */

const STATE_DIR = path.resolve(process.cwd(), '.wallet-state');

export async function saveWalletState(ctx: CliWalletContext, directory = STATE_DIR): Promise<void> {
  await fs.mkdir(directory, { recursive: true });

  const [shieldedState, unshieldedState, dustState] = await Promise.all([
    (ctx.wallet as any).shielded.serializeState(),
    (ctx.wallet as any).unshielded.serializeState(),
    (ctx.wallet as any).dust.serializeState(),
  ]);

  await Promise.all([
    fs.writeFile(path.join(directory, 'shielded.json'), shieldedState, 'utf-8'),
    fs.writeFile(path.join(directory, 'unshielded.json'), unshieldedState, 'utf-8'),
    fs.writeFile(path.join(directory, 'dust.json'), dustState, 'utf-8'),
  ]);

  console.log(`[State] Wallet state saved to ${directory}`);
}

export async function restoreWalletState(
  mnemonic: string,
  directory = STATE_DIR
): Promise<CliWalletContext> {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24 || !bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid 24-word mnemonic phrase');
  }

  const seed = Buffer.from(await bip39.mnemonicToSeed(words.join(' ')));
  const hdWallet = HDWallet.fromSeed(seed);

  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet');

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], NETWORK);

  const baseConfig: any = {
    networkId: NETWORK,
    indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
    relayURL: new URL('wss://rpc.preprod.midnight.network'),
    provingServerUrl: new URL('http://localhost:6300'),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

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
        (UnshieldedWallet as any)({ ...baseConfig, txHistoryStorage: new InMemoryTransactionHistoryStorage() }).restore(
          unshieldedSerialized
        ),
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

/* ------------------------------------------------------------------ */
/* 2. Wallet SDK State Subscriptions (true push-based)                */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to wallet state changes via the Wallet SDK's RxJS observable.
 */
export function subscribeToWalletSdkState(
  ctx: CliWalletContext,
  listener: (state: any) => void
): () => void {
  const sub = (ctx.wallet as any).state().subscribe(listener);
  return () => sub.unsubscribe();
}

/**
 * Wait for the wallet to reach a synced state.
 */
export async function waitForWalletSync(ctx: CliWalletContext): Promise<any> {
  return Rx.firstValueFrom(
    (ctx.wallet as any)
      .state()
      .pipe(Rx.filter((s: any) => s.isSynced))
  );
}

/**
 * Example: log balance updates every time the wallet state changes.
 */
export function logBalanceUpdates(ctx: CliWalletContext): () => void {
  return subscribeToWalletSdkState(ctx, (state: any) => {
    if (!state.isSynced) return;

    const shielded = state.shielded?.balances ?? {};
    const unshielded = state.unshielded?.balances ?? {};
    const dust = state.dust?.balance(new Date()) ?? 0n;

    console.log('[WalletSDK] Shielded:', shielded);
    console.log('[WalletSDK] Unshielded:', unshielded);
    console.log('[WalletSDK] Dust:', dust.toString());
  });
}
