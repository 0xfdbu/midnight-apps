import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { buildProviders } from './providers';
import { getContract, createInitialPrivateState } from './contract';
import { INDEXER_HTTP, INDEXER_WS, CONTRACT_PATH, PRIVATE_STATE_ID, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

export interface MemberState {
  memberState: 'INACTIVE' | 'ACTIVE';
  memberCount: bigint;
}

function getStoredContractAddress(): string | null {
  return localStorage.getItem('membership_contract');
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

export async function getContractState(contractAddress?: string): Promise<MemberState> {
  const address = contractAddress || getStoredContractAddress() || '';
  
  try {
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);
    const contractState = await provider.queryContractState(address);
    if (!contractState) return { memberState: 'INACTIVE', memberCount: 0n };

    const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);
    const ledgerState = contractModule.ledger(contractState.data);

    return {
      memberState: ledgerState.memberState === 0 ? 'INACTIVE' : 'ACTIVE',
      memberCount: ledgerState.memberCount,
    };
  } catch (err) {
    console.error('[getContractState] Error:', err);
    return { memberState: 'INACTIVE', memberCount: 0n };
  }
}

export async function callRegister(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  contractAddress?: string
): Promise<string> {
  const address = contractAddress || getStoredContractAddress() || '';
  
  // Ensure private state exists
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  
  const providers = buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  await contract.callTx.register();
  return 'Registered successfully!';
}

export async function callProveEligibility(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  contractAddress?: string
): Promise<boolean> {
  const address = contractAddress || getStoredContractAddress() || '';
  
  // Ensure private state exists
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  
  const providers = buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider);
  const contract = await getContract(providers, address);
  const result = await contract.callTx.proveEligibility();
  return Boolean(result);
}