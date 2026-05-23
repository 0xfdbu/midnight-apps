import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import {
  CONTRACT_PATH,
  INDEXER_HTTP,
  INDEXER_WS,
} from '../hooks/wallet/wallet.constants';
import { uint8ArrayToHex, hexToUint8Array } from '../lib/utils';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Transaction, CostModel } from '@midnight-ntwrk/ledger-v8';

setNetworkId('preprod');

const STORE_NAME = 'stablecoin-state-v2';
const STORAGE_PASSWORD = 'TokenTransfer-2026!#MidnightApp';

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DeployPage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleDeploy = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }

    setDeploying(true);
    setError(null);
    setStatus('Getting wallet keys...');

    try {
      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

      setStatus('Setting up providers...');
      const zkConfigProvider = new FetchZkConfigProvider(
        window.location.origin + CONTRACT_PATH,
        fetch.bind(window)
      );
      const proofProvider = await dappConnectorProofProvider(connectedApi, zkConfigProvider, CostModel.initialCostModel());

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
            return (Transaction as any).deserialize('signature', 'proof', 'binding', bytes);
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

      setStatus('Loading contract module...');
      const contractModule = await import(CONTRACT_PATH + '/contract/index.js');

      setStatus('Building compiled contract...');
      const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
      );

      setStatus('Deploying contract...');
      const deployed = await deployContract(providers as any, {
        compiledContract: compiledContract as any,
        privateStateId: 'stablecoinState',
        initialPrivateState: {},
      } as any);

      const address = deployed.deployTxData.public.contractAddress;
      const txId = deployed.deployTxData.public.txId;
      useWalletStore.getState().setContractAddress(address);
      setContractAddress(address);
      setTxHash(txId);
      setStatus(null);
    } catch (err) {
      console.error('Deploy error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setDeploying(false);
    }
  }, [connectedApi]);

  const copyAddress = () => {
    if (!contractAddress) return;
    navigator.clipboard.writeText(contractAddress);
  };

  if (!isConnected) {
    return (
      <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
        <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-tertiary/40 border border-border/80 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Wallet Required</h2>
          <p className="text-[13px] text-text-muted">Connect your wallet to deploy a contract.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Deploy Contract</h2>
              <p className="text-[12px] text-text-muted mt-0.5">Deploy a new stablecoin vault</p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
            >
              ← Back
            </Link>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Info Box */}
          <div className="flex gap-3 p-4 bg-indigo-500/5 rounded-xl border-l-2 border-indigo-500/30">
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/80" />
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              This deploys a fresh unshielded stablecoin contract. The address is saved automatically and the dashboard switches to it.
            </p>
          </div>

          {/* Deployed success state */}
          {contractAddress && !deploying && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-emerald-400 font-medium">Contract Deployed</p>
                  <p className="text-[12px] text-emerald-400/60 font-mono break-all">{contractAddress}</p>
                </div>
              </div>

              {txHash && (
                <p className="text-[12px] text-text-muted">Tx: {txHash}</p>
              )}

              <button
                onClick={copyAddress}
                className="w-full py-3 bg-bg-tertiary hover:bg-bg-tertiary/80 border border-border text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <CopyIcon className="w-4 h-4" />
                Copy Address
              </button>

              <Link
                to="/"
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-center"
              >
                Go to Dashboard
              </Link>

              <button
                onClick={() => {
                  setContractAddress(null);
                  setTxHash(null);
                  setError(null);
                }}
                className="w-full py-2.5 text-[12px] text-text-muted hover:text-white transition-colors"
              >
                Deploy Another
              </button>
            </div>
          )}

          {/* Deploying state */}
          {deploying && (
            <div className="flex items-center gap-3 p-4 bg-bg-tertiary/40 rounded-xl border border-border/80">
              <div className="w-5 h-5 border-2 border-border border-t-indigo-400 rounded-full animate-spin" />
              <div>
                <p className="text-[13px] text-white/60">{status}</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !deploying && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-red-400 font-medium">Deployment Failed</p>
                <p className="text-[12px] text-red-400/60 break-all">{error}</p>
              </div>
            </div>
          )}

          {/* Idle deploy button */}
          {!contractAddress && !deploying && (
            <button
              onClick={handleDeploy}
              className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-400 text-white font-medium rounded-xl transition-all active:scale-[0.98]"
            >
              Deploy Stablecoin Contract
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
