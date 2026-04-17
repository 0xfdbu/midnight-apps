import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  CONTRACT_PATH,
  CONTRACT_ADDRESS,
  INDEXER_HTTP,
  INDEXER_WS,
  PROOF_SERVER,
} from '../wallet.constants';
import { uint8ArrayToHex, hexToUint8Array } from '../../../lib/utils';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

let cachedModules: any = null;

async function getModules() {
  if (cachedModules) return cachedModules;

  const [indexerModule, { FetchZkConfigProvider }, levelModule, { CompiledContract }, ledger, proofModule, addressModule] = await Promise.all([
    import('@midnight-ntwrk/midnight-js-indexer-public-data-provider'),
    import('@midnight-ntwrk/midnight-js-fetch-zk-config-provider'),
    import('@midnight-ntwrk/midnight-js-level-private-state-provider'),
    import('@midnight-ntwrk/compact-js'),
    import('@midnight-ntwrk/ledger-v8'),
    import('@midnight-ntwrk/midnight-js-http-client-proof-provider'),
    import('@midnight-ntwrk/wallet-sdk-address-format'),
  ]);

  cachedModules = { indexerModule, FetchZkConfigProvider, levelModule, CompiledContract, ledger, proofModule, addressModule };
  return cachedModules;
}

const STORE_NAME = 'token-transfer-state-v2';
const STORAGE_PASSWORD = 'TokenTransfer-2026!#MidnightApp';

export interface ContractState {
  totalSupply: bigint;
  totalBurned: bigint;
}

export async function getContractState(): Promise<ContractState> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;

    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(CONTRACT_ADDRESS);
    if (!contractState) {
      console.log('[ContractState] No contract state found');
      return { totalSupply: 0n, totalBurned: 0n };
    }

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const ledgerState = contractModule.ledger(contractState.data);
    
    console.log('[ContractState] Ledger totalSupply:', ledgerState.totalSupply.toString());
    console.log('[ContractState] Ledger totalBurned:', ledgerState.totalBurned.toString());
    
    return {
      totalSupply: ledgerState.totalSupply,
      totalBurned: ledgerState.totalBurned,
    };
  } catch (err) {
    console.error('[ContractState] Error:', err);
    console.error('[ContractState] Error message:', err instanceof Error ? err.message : String(err));
    console.error('[ContractState] Error stack:', err instanceof Error ? err.stack : '');
    return { totalSupply: 0n, totalBurned: 0n };
  }
}

export async function mintToContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  recipientAddress: Uint8Array,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    console.log('[Mint] === Starting mintStablecoin ===');
    console.log('[Mint] Amount:', amount.toString());
    console.log('[Mint] Contract:', CONTRACT_ADDRESS);

    const mods = await getModules();
    const { indexerModule, FetchZkConfigProvider, levelModule, CompiledContract, ledger, proofModule } = mods;

    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const levelPrivateStateProvider = levelModule.levelPrivateStateProvider;
    const zkConfigProvider = new FetchZkConfigProvider(window.location.origin + CONTRACT_PATH, fetch.bind(window));
    const proofProvider = proofModule.httpClientProofProvider(PROOF_SERVER, zkConfigProvider);

    const providers: any = {
      privateStateProvider: levelPrivateStateProvider({
        midnightDbName: 'midnight-token-transfer-db',
        privateStateStoreName: STORE_NAME,
        accountId: coinPublicKey,
        privateStoragePasswordProvider: () => STORAGE_PASSWORD,
      }),
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      zkConfigProvider,
      proofProvider,
      walletProvider: {
        getCoinPublicKey: () => coinPublicKey,
        getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
        async balanceTx(tx: any) {
          const serialized = uint8ArrayToHex(tx.serialize());
          const result = await connectedApi.balanceUnsealedTransaction(serialized);
          const bytes = hexToUint8Array(result.tx);
          return ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
        },
      },
      midnightProvider: {
        submitTx: async (tx: any): Promise<string> => {
          const serialized = uint8ArrayToHex(tx.serialize());
          console.log('[Mint] Calling submitTransaction, hex length:', serialized.length);
          await connectedApi.submitTransaction(serialized);
          return tx.identifiers()[0];
        },
      },
    };

    const [{ findDeployedContract }] = await Promise.all([
      import('@midnight-ntwrk/midnight-js-contracts'),
    ]);

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const compiledContract = CompiledContract.make('token-transfer', contractModule.Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
    );

    const contract: any = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: 'tokenTransferState',
      initialPrivateState: {},
    });

    const currentState = contract?.state?.();
    console.log('[Mint] Current contract state ledger:', JSON.stringify(currentState?.ledger, null, 2));

    console.log('[Mint] Calling contract.callTx.mintStablecoin...');
    const recipient = { bytes: recipientAddress };
    const txData = await contract.callTx.mintStablecoin(amount, recipient);
    console.log('[Mint] SUCCESS, txId:', txData.public.txId);
    onSuccess(txData.public.txId);
  } catch (err) {
    console.error('[Mint] Error:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}

export async function burnFromContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    console.log('[Burn] === Starting burnStablecoin ===');
    console.log('[Burn] Amount:', amount.toString());
    console.log('[Burn] Contract:', CONTRACT_ADDRESS);

    const mods = await getModules();
    const { indexerModule, FetchZkConfigProvider, levelModule, CompiledContract, ledger, proofModule } = mods;

    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const levelPrivateStateProvider = levelModule.levelPrivateStateProvider;
    const zkConfigProvider = new FetchZkConfigProvider(window.location.origin + CONTRACT_PATH, fetch.bind(window));
    const proofProvider = proofModule.httpClientProofProvider(PROOF_SERVER, zkConfigProvider);

    const providers: any = {
      privateStateProvider: levelPrivateStateProvider({
        midnightDbName: 'midnight-token-transfer-db',
        privateStateStoreName: STORE_NAME,
        accountId: coinPublicKey,
        privateStoragePasswordProvider: () => STORAGE_PASSWORD,
      }),
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      zkConfigProvider,
      proofProvider,
      walletProvider: {
        getCoinPublicKey: () => coinPublicKey,
        getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
        async balanceTx(tx: any) {
          const serialized = uint8ArrayToHex(tx.serialize());
          const result = await connectedApi.balanceUnsealedTransaction(serialized);
          const bytes = hexToUint8Array(result.tx);
          return ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
        },
      },
      midnightProvider: {
        submitTx: async (tx: any): Promise<string> => {
          const serialized = uint8ArrayToHex(tx.serialize());
          console.log('[Burn] Calling submitTransaction, hex length:', serialized.length);
          await connectedApi.submitTransaction(serialized);
          return tx.identifiers()[0];
        },
      },
    };

    const [{ findDeployedContract }] = await Promise.all([
      import('@midnight-ntwrk/midnight-js-contracts'),
    ]);

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const compiledContract = CompiledContract.make('token-transfer', contractModule.Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
    );

    const contract: any = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: 'tokenTransferState',
      initialPrivateState: {},
    });

    console.log('[Burn] Calling contract.callTx.burnStablecoin...');
    const txData = await contract.callTx.burnStablecoin(amount);
    console.log('[Burn] SUCCESS, txId:', txData.public.txId);
    onSuccess(txData.public.txId);
  } catch (err) {
    console.error('[Burn] Error:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}

export async function decodeUserAddress(
  unshieldedAddress: string,
  networkId: string
): Promise<Uint8Array> {
  const mods = await getModules();
  const { addressModule } = mods;
  if (!addressModule) {
    return new Uint8Array();
  }
  const { MidnightBech32m, UnshieldedAddress } = addressModule;
  const parsed = MidnightBech32m.parse(unshieldedAddress);
  const decoded: any = parsed.decode(UnshieldedAddress, networkId);
  return decoded.data;
}
