import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { Buffer } from 'buffer';

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

(globalThis as any).WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORK = 'preprod';

const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'https://lace-proof-pub.preprod.midnight.network',
};

const CONTRACT_NAME = 'stablecoin';
const CONTRACT_DIR = 'contracts/managed/stablecoin';
const zkConfigPath = path.resolve(__dirname, '..', CONTRACT_DIR);
const privateStateStoreName = 'stablecoin-state';

setNetworkId(NETWORK);

function deriveKeys(seed: Buffer) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

async function createWallet(seed: Buffer) {
  const keys = deriveKeys(seed);
  const networkId = getNetworkId();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig: any = {
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
    configuration: walletConfig,
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

async function createProviders(walletCtx: Awaited<ReturnType<typeof createWallet>>) {
  const state = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s: any) => s.isSynced))
  );

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: walletCtx.shieldedSecretKeys,
          dustSecretKey: walletCtx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId: state.shielded.coinPublicKey.toHexString(),
      privateStoragePasswordProvider: () => 'stablecoin-deploy-password',
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Deploy Stablecoin to Midnight Preprod                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(path.join(zkConfigPath, 'contract', 'index.js'))) {
    console.error('Contract not compiled. Run: compact compile contracts/Contract.compact contracts/managed/stablecoin');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const mnemonic = await rl.question('Enter your 24-word mnemonic: ');
  rl.close();

  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24 || !bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid 24-word mnemonic');
  }
  const seed = await bip39.mnemonicToSeed(words.join(' '));

  console.log('\nInitializing wallet...');
  const walletCtx = await createWallet(Buffer.from(seed));

  console.log('Waiting for wallet sync...');
  await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.tap((s: any) => {
        if (!s.isSynced) {
          process.stdout.write('.');
        }
      }),
      Rx.filter((s: any) => s.isSynced),
      Rx.timeout(300_000)
    )
  );
  console.log(' Done!');

  console.log('Loading contract...');
  const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
  const contractModule = await import(pathToFileURL(contractPath).href);

  const compiledContract = CompiledContract.make(CONTRACT_NAME, contractModule.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath)
  );

  console.log('Creating providers...');
  const providers = await createProviders(walletCtx);

  console.log('Deploying contract...\n');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: `${CONTRACT_NAME}State`,
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log(`\n✅ Contract deployed successfully!`);
  console.log(`   Address: ${contractAddress}\n`);

  const deploymentInfo = {
    contractAddress,
    network: NETWORK,
    deployedAt: new Date().toISOString(),
    contractName: CONTRACT_NAME,
  };

  const deploymentPath = path.resolve(__dirname, '..', 'deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📄 Saved to deployment.json`);

  await walletCtx.wallet.stop();
}

main().catch(console.error);
