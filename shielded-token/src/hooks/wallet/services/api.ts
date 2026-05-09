import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { buildProviders } from './providers';
import { getContract, createInitialPrivateState } from './contract';
import { INDEXER_HTTP, INDEXER_WS, CONTRACT_PATH, PRIVATE_STATE_ID, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/compact-js';


export interface TokenState {
  totalSupply: bigint;
  totalBurned: bigint;
}

function getStoredContractAddress(): string | null {
  return localStorage.getItem('shielded_token_contract');
}

export async function ensurePrivateState(coinPublicKey: string, contractAddress: string) {
  const privateState = levelPrivateStateProvider({
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
  });
  privateState.setContractAddress(contractAddress);
  
  const existing = await privateState.get(PRIVATE_STATE_ID);
  if (!existing) {
    const initialState = createInitialPrivateState();
    await privateState.set(PRIVATE_STATE_ID, initialState);
    console.log('[PrivateState] Created for', contractAddress.slice(12));
  }
  return privateState;
}

export async function getContractState(contractAddress?: string): Promise<TokenState> {
  const address = contractAddress || getStoredContractAddress() || '';
  
  try {
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);
    const contractState = await provider.queryContractState(address);
    if (!contractState) return { totalSupply: 0n, totalBurned: 0n };

    const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);
    const ledgerState = contractModule.ledger(contractState.data);

    return {
      totalSupply: ledgerState.totalSupply ?? 0n,
      totalBurned: ledgerState.totalBurned ?? 0n,
    };
  } catch (err) {
    console.error('[getContractState] Error:', err);
    return { totalSupply: 0n, totalBurned: 0n };
  }
}

export async function deployTokenContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string
): Promise<string> {
  const { deployContract } = await import('@midnight-ntwrk/midnight-js-contracts');
  const privateStateProvider = await ensurePrivateState(coinPublicKey, 'tmp-deploy');
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, undefined, privateStateProvider);

  const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);
  const cc: any = CompiledContract.make('shielded-token', contractModule.Contract);
  const withWitnesses = (CompiledContract as any).withWitnesses({
    localNonce: ({ privateState }: any): [any, Uint8Array] => {
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      return [privateState, nonce];
    },
  });
  const withAssets = (CompiledContract as any).withCompiledFileAssets(CONTRACT_PATH);
  const compiledContract = withWitnesses(withAssets(cc));

  const deployed = await deployContract(providers as any, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: createInitialPrivateState(),
    args: [],
  } as any);

  const address = deployed.deployTxData.public.contractAddress;
  localStorage.setItem('shielded_token_contract', address);
  return address;
}

export async function callCreateShieldedToken(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  amount: bigint,
  recipient: { is_left: boolean; left: { bytes: Uint8Array }; right: { bytes: Uint8Array } },
  contractAddress?: string
): Promise<any> {
  const address = contractAddress || getStoredContractAddress() || '';
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  return contract.callTx.createShieldedToken(amount, recipient);
}

export async function callMintAndSend(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  amount: bigint,
  recipient: { is_left: boolean; left: { bytes: Uint8Array }; right: { bytes: Uint8Array } },
  contractAddress?: string
): Promise<any> {
  const address = contractAddress || getStoredContractAddress() || '';
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  return contract.callTx.mintAndSend(amount, recipient);
}

export async function callTransferShielded(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint },
  recipient: { is_left: boolean; left: { bytes: Uint8Array }; right: { bytes: Uint8Array } },
  amount: bigint,
  contractAddress?: string
): Promise<any> {
  const address = contractAddress || getStoredContractAddress() || '';
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  return contract.callTx.transferShielded(coin, recipient, amount);
}

export async function callDepositAndBurn(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
  amount: bigint,
  contractAddress?: string
): Promise<any> {
  const address = contractAddress || getStoredContractAddress() || '';
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  return contract.callTx.depositAndBurn(coin, amount);
}
