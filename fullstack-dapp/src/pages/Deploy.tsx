import { useState, useCallback } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { INDEXER_HTTP, INDEXER_WS, PROOF_SERVER } from '../hooks/wallet/wallet.constants';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { witnesses, createMembershipPrivateState } from './witnesses';

setNetworkId('preprod');

const CONTRACT_PATH_MEMBERSHIP = '/src/contracts';
const PRIVATE_STATE_PASSWORD = 'MembershipApp2026!';

export function DeployPage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);

  const handleDeploy = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }

    setDeploying(true);
    setError(null);
    setStatus('Loading contract...');

    try {
      const contractModule = await import(CONTRACT_PATH_MEMBERSHIP + '/contract/index.js');
      
      const secretKey = crypto.getRandomValues(new Uint8Array(32));
      const tokenColor = new Uint8Array(32); // All zeros = NIGHT
      const initialPrivateState = createMembershipPrivateState(secretKey, 100n, tokenColor);

      const cc: any = CompiledContract.make('membership', contractModule.Contract);
      const withWitnesses = (CompiledContract as any).withWitnesses(witnesses);
      const withAssets = (CompiledContract as any).withCompiledFileAssets(CONTRACT_PATH_MEMBERSHIP);
      const compiledContract = withWitnesses(withAssets(cc));

      setStatus('Getting wallet keys...');
      const shieldedAddresses = await connectedApi.getShieldedAddresses();

      setStatus('Setting up providers...');
      const indexer = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);
      const zkConfig = new FetchZkConfigProvider(
        window.location.origin + '/src/contracts',
        fetch.bind(window)
      );
      const privateState = levelPrivateStateProvider({
        accountId: shieldedAddresses.shieldedCoinPublicKey,
        privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
      });

      setStatus('Getting proof provider...');
      const proofProvider = httpClientProofProvider(PROOF_SERVER, zkConfig);

      const walletProvider = {
        getCoinPublicKey(): string {
          return shieldedAddresses.shieldedCoinPublicKey;
        },
        getEncryptionPublicKey(): string {
          return shieldedAddresses.shieldedEncryptionPublicKey;
        },
        async balanceTx(tx: any, _ttl?: Date): Promise<any> {
          const serializedTx = toHex(tx.serialize());
          const received = await connectedApi.balanceUnsealedTransaction(serializedTx);
          return Transaction.deserialize('signature', 'proof', 'binding', fromHex(received.tx));
        },
      };

      const midnightProvider = {
        async submitTx(tx: any): Promise<string> {
          await connectedApi.submitTransaction(toHex(tx.serialize()));
          const txIdentifiers = (tx as any).identifiers();
          return txIdentifiers?.[0] ?? '';
        },
      };

      const providers = {
        privateStateProvider: privateState,
        publicDataProvider: indexer,
        zkConfigProvider: zkConfig,
        proofProvider,
        walletProvider,
        midnightProvider,
      };

      setStatus('Deploying contract...');
      const deployed = await deployContract(providers as any, {
        compiledContract,
        privateStateId: 'membershipState',
        initialPrivateState,
      } as any);

      const address = deployed.deployTxData.public.contractAddress;
      setContractAddress(address);
      setStatus(`Deployed at: ${address}`);
    } catch (err) {
      console.error('Deploy error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  }, [connectedApi]);

  if (!isConnected) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Connect Wallet</h2>
          <p className="text-text-muted text-sm">Connect your wallet to deploy.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-2">Deploy Contract</h2>
      <p className="text-text-muted text-sm mb-6">Deploy {CONTRACT_PATH_MEMBERSHIP} contract.</p>

      {status && (
        <div className="mb-4 px-4 py-3 bg-blue-500/10 border border-blue-500/25 rounded-xl">
          <p className="text-sm text-blue-400">{status}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {contractAddress ? (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <p className="text-sm text-emerald-400">Contract deployed at:</p>
          <p className="text-sm font-mono text-white mt-1 break-all">{contractAddress}</p>
        </div>
      ) : (
        <Button
          onClick={handleDeploy}
          disabled={deploying}
          className="flex items-center gap-2"
        >
          {deploying ? (
            <>
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Deploying...
            </>
          ) : (
            'Deploy Contract'
          )}
        </Button>
      )}
    </div>
  );
}