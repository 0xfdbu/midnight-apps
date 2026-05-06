import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CONTRACT_PATH, PRIVATE_STATE_ID } from '../wallet.constants';

function getStoredContractAddress(): string | null {
  return localStorage.getItem('shielded_token_contract');
}

export function getContractAddress(): string {
  return getStoredContractAddress() || '';
}

export function createInitialPrivateState() {
  return {
    nonce: crypto.getRandomValues(new Uint8Array(32)),
  };
}

let cachedContract: any = null;
let cachedAddress: string = '';

const witnesses: any = {
  localNonce: ({ privateState }: any): [any, Uint8Array] => {
    // Generate a fresh random nonce for each mint
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    return [privateState, nonce];
  },
};

export async function getContract(providers: MidnightProviders, contractAddress?: string) {
  const address = contractAddress || getStoredContractAddress() || '';
  
  // Return cached if same address
  if (cachedContract && cachedAddress === address) {
    return cachedContract;
  }

  const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);

  const cc: any = CompiledContract.make('shielded-token', contractModule.Contract);
  const withWitnesses = (CompiledContract as any).withWitnesses(witnesses);
  const withAssets = (CompiledContract as any).withCompiledFileAssets(CONTRACT_PATH);
  const ccWithWitnesses = withWitnesses(withAssets(cc));

  // Set contract address on private state provider
  providers.privateStateProvider.setContractAddress(address);

  cachedContract = await findDeployedContract(providers as any, {
    compiledContract: ccWithWitnesses,
    contractAddress: address,
    privateStateId: PRIVATE_STATE_ID,
  });

  cachedAddress = address;
  return cachedContract;
}
