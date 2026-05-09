import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { buildProviders } from './providers';
import { getContract, createInitialPrivateState } from './contract';
import { INDEXER_HTTP, INDEXER_WS, CONTRACT_PATH, PRIVATE_STATE_ID, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { coinCommitment } from '@midnight-ntwrk/ledger-v8';
import { parseCoinPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export interface TokenState {
  totalSupply: bigint;
  totalBurned: bigint;
}

function getStoredContractAddress(): string | null {
  return localStorage.getItem('shielded_token_contract');
}

/** Debug helper: wraps providers to log transaction internals */
function wrapProvidersForDebug(providers: any): any {
  const origBalanceTx = providers.walletProvider.balanceTx.bind(providers.walletProvider);
  providers.walletProvider.balanceTx = async (tx: any, ttl?: Date) => {
    try {
      const imbalances = (tx as any).imbalances ? (tx as any).imbalances() : null;
      console.group('[DEBUG] Unbalanced Transaction');
      if (imbalances && imbalances.size > 0) {
        console.log('Imbalances (positive = more outputs than inputs):');
        for (const [tokenType, value] of imbalances) {
          console.log(`  ${tokenType}: ${value}`);
        }
      } else {
        console.log('No imbalances detected (transaction is balanced before wallet)');
      }
      console.log('Transaction hash:', (tx as any).transactionHash?.());
      console.log('Identifiers:', (tx as any).identifiers?.());
      console.groupEnd();
    } catch (e) {
      console.log('[DEBUG] Could not inspect unbalanced tx:', e);
    }
    let balanced;
    try {
      balanced = await origBalanceTx(tx, ttl);
    } catch (err) {
      try {
        const imbalances = (tx as any).imbalances ? (tx as any).imbalances() : null;
        console.group('[DEBUG] BalanceTx FAILED');
        if (imbalances && imbalances.size > 0) {
          console.log('Imbalances at time of failure:');
          for (const [tokenType, value] of imbalances) {
            console.log(`  ${tokenType}: ${value}`);
          }
        }
        console.groupEnd();
      } catch {}
      throw err;
    }
    try {
      const imbalances = (balanced as any).imbalances ? (balanced as any).imbalances() : null;
      console.group('[DEBUG] Balanced Transaction');
      if (imbalances && imbalances.size > 0) {
        console.log('Still imbalanced after wallet balancing:');
        for (const [tokenType, value] of imbalances) {
          console.log(`  ${tokenType}: ${value}`);
        }
      } else {
        console.log('Transaction is now balanced');
      }
      console.groupEnd();
    } catch (e) {
      console.log('[DEBUG] Could not inspect balanced tx:', e);
    }
    return balanced;
  };
  return providers;
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

export async function callBurnShieldedToken(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint; mt_index: bigint },
  amount: bigint,
  contractAddress?: string
): Promise<any> {
  const address = contractAddress || getStoredContractAddress() || '';
  const privateStateProvider = await ensurePrivateState(coinPublicKey, address);
  const providers = wrapProvidersForDebug(await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, address, privateStateProvider));
  const contract = await getContract(providers, address);
  return contract.callTx.burnShieldedToken(coin, amount);
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHexField(value: Uint8Array | string): string {
  if (typeof value === 'string') return value;
  return uint8ArrayToHex(value);
}

function getLedgerCoinInfo(coinInfo: any): { type: string; nonce: string; value: bigint } {
  return {
    type: toHexField(coinInfo.color ?? coinInfo.type),
    nonce: toHexField(coinInfo.nonce),
    value: coinInfo.value,
  };
}

/**
 * Resolve mt_index values for new coins created by a finalized transaction.
 *
 * Instead of replaying against queried chain state (which is post-tx and crashes
 * with RuntimeError: unreachable), we:
 * 1. Build an output-only ZswapOffer from the finalized transaction
 * 2. Apply it to a fresh ZswapChainState to get relative commitment→index map
 * 3. Query the indexer for the transaction's startIndex (Merkle tree base)
 * 4. actual_mt_index = startIndex + relativeIndex
 *
 * @param result The CallResult returned by midnight-js-contracts
 * @param coinPublicKeyBech32 The wallet's shielded coin public key in Bech32m format
 * @param contractAddress The contract address (unused, kept for API compat)
 * @returns A Map from coin nonce (hex) to its resolved mt_index (bigint)
 */
export async function resolveMtIndices(
  result: any,
  coinPublicKeyBech32: string,
  _contractAddress: string
): Promise<Map<string, bigint>> {
  const tx = result?.public?.tx;
  const txHash = result?.public?.txHash;
  const blockHeight = result?.public?.blockHeight;

  if (!tx || !txHash || typeof blockHeight !== 'number') {
    console.warn('[resolveMtIndices] Missing tx, txHash, or blockHeight in result');
    return new Map();
  }

  // Collect all output commitments in order (guaranteed first, then fallible).
  // Outputs are assigned mt_index sequentially in this exact order.
  const orderedCommitments: string[] = [];
  if (tx.guaranteedOffer?.outputs) {
    for (const output of tx.guaranteedOffer.outputs) {
      if (output?.commitment) {
        orderedCommitments.push(output.commitment);
      }
    }
  }
  if (tx.fallibleOffer) {
    for (const [, fo] of tx.fallibleOffer) {
      if (fo?.outputs) {
        for (const output of fo.outputs) {
          if (output?.commitment) {
            orderedCommitments.push(output.commitment);
          }
        }
      }
    }
  }

  if (orderedCommitments.length === 0) {
    console.warn('[resolveMtIndices] No zswap outputs in transaction');
    return new Map();
  }

  // Query indexer for the transaction's startIndex
  let startIndex: bigint;
  try {
    const response = await fetch(INDEXER_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetTransactionStartIndex($hash: HexEncoded!) {
            transactions(offset: { hash: $hash }) {
              hash
              ... on RegularTransaction {
                startIndex
              }
            }
          }
        `,
        variables: { hash: txHash },
      }),
    });
    const data = await response.json();
    if (data?.errors) {
      console.warn('[resolveMtIndices] Indexer GraphQL errors:', data.errors);
    }
    const txData = data?.data?.transactions?.[0];
    if (txData?.startIndex === undefined || txData?.startIndex === null) {
      console.warn('[resolveMtIndices] startIndex not found in indexer response');
      return new Map();
    }
    startIndex = BigInt(txData.startIndex);
  } catch (err: any) {
    console.error('[resolveMtIndices] Failed to query indexer for startIndex:', err);
    return new Map();
  }

  // Compute expected commitments from circuit outputs and match by position
  const coinPublicKeyHex = parseCoinPublicKeyToHex(coinPublicKeyBech32, getNetworkId());
  const outputs = result?.private?.nextZswapLocalState?.outputs ?? [];

  const mtIndices = new Map<string, bigint>();
  for (const output of outputs) {
    const coinInfo = output?.coinInfo;
    if (!coinInfo) continue;

    const ledgerCoin = getLedgerCoinInfo(coinInfo);
    const commitment = coinCommitment(ledgerCoin, coinPublicKeyHex);
    const position = orderedCommitments.indexOf(commitment);
    if (position >= 0) {
      const absoluteIndex = startIndex + BigInt(position);
      mtIndices.set(ledgerCoin.nonce, absoluteIndex);
    } else {
      console.warn('[resolveMtIndices] Commitment not found in transaction outputs, nonce:', ledgerCoin.nonce);
    }
  }

  console.log('[resolveMtIndices] Resolved', mtIndices.size, 'mt_index values (startIndex:', startIndex.toString(), ', outputs:', orderedCommitments.length, ')');
  return mtIndices;
}
