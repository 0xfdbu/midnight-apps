import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  CONTRACT_PATH,
  CONTRACT_ADDRESS,
  INDEXER_HTTP,
  INDEXER_WS,
  PROOF_SERVER,
  STABLECOIN_TOKEN,
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

const STORE_NAME = 'stablecoin-state-v2';
const STORAGE_PASSWORD = 'TokenTransfer-2026!#MidnightApp';

export interface ContractState {
  totalSupply: bigint;
  totalBurned: bigint;
  burnedBalance: bigint;
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
      return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
    }

    const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
    const ledgerState = contractModule.ledger(contractState.data);

    console.log('[ContractState] Ledger totalSupply:', ledgerState.totalSupply.toString());
    console.log('[ContractState] Ledger totalBurned:', ledgerState.totalBurned.toString());

    let burnedBalance = 0n;
    try {
      burnedBalance = ledgerState.burnedBalance ?? 0n;
      console.log('[ContractState] Ledger burnedBalance:', burnedBalance.toString());
    } catch {
      console.log('[ContractState] Ledger burnedBalance: not available (old contract)');
    }

    return {
      totalSupply: ledgerState.totalSupply,
      totalBurned: ledgerState.totalBurned,
      burnedBalance,
    };
  } catch (err) {
    console.error('[ContractState] Error:', err);
    console.error('[ContractState] Error message:', err instanceof Error ? err.message : String(err));
    console.error('[ContractState] Error stack:', err instanceof Error ? err.stack : '');
    return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
  }
}

export async function mintToContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    console.log('[Mint] === Starting mintToContract ===');
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
        midnightDbName: 'midnight-stablecoin-db',
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
    const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
    );

    const contract: any = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: 'stablecoinState',
      initialPrivateState: {},
    });

    const currentState = contract?.state?.();
    console.log('[Mint] Current contract state ledger:', JSON.stringify(currentState?.ledger, null, 2));

    console.log('[Mint] Calling contract.callTx.mintToContract...');
    const txData = await contract.callTx.mintToContract(amount);
    console.log('[Mint] SUCCESS, txId:', txData.public.txId);
    console.log('[Mint] Color returned:', txData.private.result);
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
        midnightDbName: 'midnight-stablecoin-db',
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
    const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
    );

    const contract: any = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: 'stablecoinState',
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

export async function encodeUserAddress(bech32Address: string): Promise<Uint8Array> {
  const mods = await getModules();
  const { addressModule } = mods;
  const { MidnightBech32m, UnshieldedAddress } = addressModule;
  
  try {
    const parsed = MidnightBech32m.parse(bech32Address);
    const decoded: any = parsed.decode(UnshieldedAddress, 'preprod');
    return decoded.data;
  } catch (e) {
    console.error('[encodeUserAddress] Error:', e);
    throw new Error('Invalid address format');
  }
}

async function buildContractProviders(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string }
) {
  const mods = await getModules();
  const { indexerModule, FetchZkConfigProvider, levelModule, ledger, proofModule } = mods;

  const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
  const levelPrivateStateProvider = levelModule.levelPrivateStateProvider;
  const zkConfigProvider = new FetchZkConfigProvider(window.location.origin + CONTRACT_PATH, fetch.bind(window));
  const proofProvider = proofModule.httpClientProofProvider(PROOF_SERVER, zkConfigProvider);

  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: 'midnight-stablecoin-db',
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
        await connectedApi.submitTransaction(serialized);
        return tx.identifiers()[0];
      },
    },
  };
}

async function getContract(connectedApi: ConnectedAPI, coinPublicKey: string, shieldedAddresses: { shieldedEncryptionPublicKey: string }) {
  const [{ findDeployedContract }, contractModule, mods] = await Promise.all([
    import('@midnight-ntwrk/midnight-js-contracts'),
    import(CONTRACT_PATH + '/contract/index.js'),
    getModules(),
  ]);
  const { CompiledContract } = mods;
  const providers = await buildContractProviders(connectedApi, coinPublicKey, shieldedAddresses);

  const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
  );

  return findDeployedContract(providers, {
    contractAddress: CONTRACT_ADDRESS,
    compiledContract,
    privateStateId: 'stablecoinState',
    initialPrivateState: {},
  });
}

export async function receiveTokens(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    console.log('[Receive] === Starting receiveTokens ===');
    console.log('[Receive] Amount:', amount.toString());

    const contract: any = await getContract(connectedApi, coinPublicKey, shieldedAddresses);

    console.log('[Receive] Calling contract.callTx.receiveTokens...');
    const txData = await contract.callTx.receiveTokens(amount);
    console.log('[Receive] SUCCESS, txId:', txData.public.txId);
    onSuccess(txData.public.txId);
  } catch (err) {
    console.error('[Receive] Error:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}

export async function sendToUser(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  recipientAddress: Uint8Array,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    console.log('[ContractSend] === Starting sendToUser ===');
    console.log('[ContractSend] Amount:', amount.toString());

    const contract: any = await getContract(connectedApi, coinPublicKey, shieldedAddresses);

    console.log('[ContractSend] Calling contract.callTx.sendToUser...');
    const recipient = { bytes: recipientAddress };
    const txData = await contract.callTx.sendToUser(amount, recipient);
    console.log('[ContractSend] SUCCESS, txId:', txData.public.txId);
    onSuccess(txData.public.txId);
  } catch (err) {
    console.error('[ContractSend] Error:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}

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
