import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { INDEXER_HTTP, INDEXER_WS, PROOF_SERVER, CONTRACT_PATH, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { Transaction } from '@midnight-ntwrk/ledger-v8';

export function buildProviders(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  contractAddress?: string,
  existingPrivateStateProvider?: any
): MidnightProviders {
  const zkConfigProvider = new FetchZkConfigProvider(
    `${window.location.origin}${CONTRACT_PATH}`,
    fetch.bind(window)
  );

  const privateStateProvider = existingPrivateStateProvider || levelPrivateStateProvider({
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
  });

  if (contractAddress) {
    privateStateProvider.setContractAddress(contractAddress);
  }

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => encryptionPublicKey,
      async balanceTx(tx: any, _ttl?: Date): Promise<any> {
        const serializedTx = toHex(tx.serialize());
        const received = await connectedApi.balanceUnsealedTransaction(serializedTx);
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      async submitTx(tx: any): Promise<string> {
        await connectedApi.submitTransaction(toHex(tx.serialize()));
        const txIdentifiers = (tx as any).identifiers();
        return txIdentifiers?.[0] ?? '';
      },
    },
  };
}