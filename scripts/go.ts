import * as path from 'path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type WalletProvider, type MidnightProvider } from '@midnight-ntwrk/midnight-js-types';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as Rx from 'rxjs';

(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NETWORK = 'preprod';

const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
  privateStateStoreName: 'stablecoin',
};

setNetworkId(NETWORK);

// ─── Mnemonic → Seed ──────────────────────────────────────────────────────────

async function mnemonicToSeed(mnemonic: string): Promise<Buffer> {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24 || !bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid 24-word mnemonic phrase');
  }
  const seed = await bip39.mnemonicToSeed(words.join(' '));
  return Buffer.from(seed);
}

// ─── Wallet Init ──────────────────────────────────────────────────────────────

interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
}

async function initWallet(seed: Buffer): Promise<WalletContext> {
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
  const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], getNetworkId());

  const networkId = getNetworkId();
  const baseConfig: any = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: CONFIG.indexer,
      indexerWsUrl: CONFIG.indexerWS,
    },
    provingServerUrl: new URL(CONFIG.proofServer),
    relayURL: new URL(CONFIG.node.replace(/^http/, 'ws')),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const wallet: any = await (WalletFacade as any).init({
    configuration: baseConfig,
    shielded: (cfg: any) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg: any) => UnshieldedWallet({
      ...cfg,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg: any) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ─── Providers ────────────────────────────────────────────────────────────────

function createWalletAndMidnightProvider(ctx: WalletContext): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey() {
      return ctx.shieldedSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey() {
      return ctx.shieldedSecretKeys.encryptionPublicKey;
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
}

// ─── DUST Registration ────────────────────────────────────────────────────────

async function ensureDust(ctx: WalletContext): Promise<void> {
  const state = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(Rx.filter((s: any) => s.isSynced))
  );

  const dustBalance = state.dust?.balance(new Date()) ?? 0n;
  console.log(`  DUST balance: ${dustBalance}`);
  if (dustBalance > 0n) {
    console.log('  ✅ DUST available');
    return;
  }

  const unregistered = (state.unshielded?.availableCoins ?? []).filter(
    (c: any) => c.meta?.registeredForDustGeneration !== true,
  );

  if (unregistered.length > 0) {
    console.log(`  Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation...`);
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      ctx.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
    );
    const finalized = await ctx.wallet.finalizeRecipe(recipe);
    await ctx.wallet.submitTransaction(finalized);
    console.log('  Registration submitted. Waiting for DUST...');
  } else {
    console.log('  All NIGHT already registered. Waiting for DUST...');
  }

  await Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s: any) => s.isSynced),
      Rx.filter((s: any) => (s.dust?.balance(new Date()) ?? 0n) > 0n),
      Rx.timeout(7_200_000),
    ),
  );
  console.log('  ✅ DUST ready');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const contractPath = path.resolve(projectRoot, 'contracts/managed/stablecoin');

  if (!fs.existsSync(contractPath + '/contract/index.js')) {
    console.error('Contract not compiled. Run: compact compile contracts/Contract.compact contracts/managed/stablecoin');
    process.exit(1);
  }

  const mnemonic = process.env.MNEMONIC ?? process.argv[2];
  if (!mnemonic) {
    console.error('Usage: MNEMONIC="word1 ... word24" npx tsx scripts/deploy.ts');
    process.exit(1);
  }

  console.log('Converting mnemonic to seed...');
  const seed = await mnemonicToSeed(mnemonic);

  console.log('Initializing wallet...');
  const walletCtx = await initWallet(seed);
  console.log('  Unshielded address:', walletCtx.unshieldedKeystore.getBech32Address());

  console.log('Syncing with network...');
  try {
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.tap((s: any) => console.log(`  isSynced: ${s.isSynced}`)),
        Rx.filter((s: any) => s.isSynced),
        Rx.timeout(7_200_000),
      ),
    );
    console.log('✅ Wallet synced');
  } catch {
    console.error('ERROR: Wallet failed to sync within 20 minutes.');
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  console.log('Checking DUST...');
  await ensureDust(walletCtx);

  console.log('Loading contract...');
  const contractModule = await import(
    path.resolve(projectRoot, 'contracts/managed/stablecoin/contract/index.js')
  );

  const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(contractPath)
  );

  console.log('Creating providers...');
  const walletAndMidnightProvider = createWalletAndMidnightProvider(walletCtx);
  const zkConfigProvider = new NodeZkConfigProvider(contractPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: CONFIG.privateStateStoreName,
      accountId: walletAndMidnightProvider.getCoinPublicKey(),
      privateStoragePasswordProvider: () => 'StablecoinDeploy2026!',
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };

  console.log('Deploying contract...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'stablecoinState',
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log(`\n✅ Contract deployed: ${contractAddress}`);

  fs.writeFileSync(
    path.resolve(projectRoot, 'deployment.json'),
    JSON.stringify({ contractAddress, network: NETWORK, deployedAt: new Date().toISOString() }, null, 2)
  );
  console.log('Saved to deployment.json');

  await walletCtx.wallet.stop();
}

main().catch(console.error);