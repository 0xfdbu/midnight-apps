import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { deriveKey, deriveKeyFromPassword } from '../lib/utils';
import { witnesses, createAttestPrivateState } from './witnesses';
import * as contractModule from '../contracts/managed/attest/contract/index.js';

setNetworkId('preprod');

const ZK_ARTIFACTS_PATH = '/contracts/managed/attest';

const STEPS = [
  'Loading contract',
  'Getting wallet keys',
  'Setting up providers',
  'Getting proof provider',
  'Building compiled contract',
  'Deploying contract',
] as const;

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function DeployPage() {
  const { isConnected, connectedApi, userPassword } = useWalletStore();
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);

  useEffect(() => {
    const addr = localStorage.getItem('attest_contract');
    if (addr) {
      setContractAddress(addr);
    }
  }, []);

  const currentStep = status ? STEPS.findIndex((s) => status.startsWith(s)) : -1;

  const handleDeploy = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }
    if (!userPassword) {
      setError('Please unlock on the home page first.');
      return;
    }

    setDeploying(true);
    setError(null);
    setStatus('Loading contract...');

    try {
      setStatus('Getting wallet keys...');
      const shieldedAddresses = await connectedApi.getShieldedAddresses();

      setStatus('Deriving authority key...');
      const masterKey = await deriveKeyFromPassword(userPassword, shieldedAddresses.shieldedCoinPublicKey);
      const authoritySk = await deriveKey(masterKey, 'attest:authority');
      const initialPrivateState = createAttestPrivateState(authoritySk);

      setStatus('Setting up providers...');
      const zkConfig = new FetchZkConfigProvider(
        window.location.origin + ZK_ARTIFACTS_PATH,
        fetch.bind(window)
      );
      const privateState = levelPrivateStateProvider({
        accountId: shieldedAddresses.shieldedCoinPublicKey,
        privateStoragePasswordProvider: () => userPassword,
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
        publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
        zkConfigProvider: zkConfig,
        proofProvider,
        walletProvider,
        midnightProvider,
      };

      setStatus('Building compiled contract...');
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const compiledContract = CompiledContract.withCompiledFileAssets(ccWithWitnesses, ZK_ARTIFACTS_PATH);

      setStatus('Deploying contract...');
      const deployed = await deployContract(providers as any, {
        compiledContract,
        privateStateId: 'attestState',
        initialPrivateState,
        args: [authoritySk],
      } as any);

      const address = deployed.deployTxData.public.contractAddress;
      localStorage.setItem('attest_contract', address);
      localStorage.setItem('attest_private_state', 'attestState');

      setContractAddress(address);
      setStatus(null);
    } catch (err) {
      console.error('Deploy error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setDeploying(false);
    }
  }, [connectedApi, userPassword]);

  const copyAddress = () => {
    if (!contractAddress) return;
    navigator.clipboard.writeText(contractAddress);
  };

  if (!isConnected) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="text-[18px] font-medium text-white/80 mb-2">Wallet Required</h2>
          <p className="text-[14px] text-white/25">Connect your wallet to deploy a contract.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Back nav */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-white/25 hover:text-white/50 transition-colors mb-10"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back
      </Link>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-2">Deploy Contract</h1>
        <p className="text-[15px] text-white/30 leading-relaxed max-w-lg">
          Deploy a new credentials contract. This generates an authority secret key stored locally on your device.
        </p>
      </div>

      {/* Deployed success state */}
      {contractAddress && !deploying && !error && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center">
              <CheckIcon className="w-4 h-4 text-white/70" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/80">Contract Deployed</p>
              <p className="text-[12px] text-white/25 mt-0.5">Authority key saved locally</p>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2.5">Contract Address</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                <p className="text-[12px] font-mono text-white/45 break-all leading-relaxed">{contractAddress}</p>
              </div>
              <button
                onClick={copyAddress}
                className="px-4 py-3 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl transition-colors text-white/40 hover:text-white/60 shrink-0"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Link
              to="/attest"
              className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all text-center"
            >
              Go to Attest
            </Link>
            <Link
              to="/prove"
              className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all text-center border border-white/[0.06]"
            >
              Go to Prove
            </Link>
          </div>
          <button
            onClick={handleDeploy}
            className="w-full py-2.5 text-[12px] text-white/20 hover:text-white/40 transition-colors"
          >
            Redeploy New Contract
          </button>
        </div>
      )}

      {/* Deploying state — step indicator */}
      {deploying && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <p className="text-[14px] font-medium text-white/60">Deploying</p>
          </div>

          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const isCompleted = currentStep > i;
              const isCurrent = currentStep === i;
              return (
                <div key={step} className="flex items-start gap-3.5">
                  <div className="flex flex-col items-center pt-[5px]">
                    {isCompleted ? (
                      <div className="w-4 h-4 rounded-full bg-white/[0.1] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-white/[0.06]" />
                    )}
                    {i < STEPS.length - 1 && (
                      <div className={`w-px h-8 ${isCompleted ? 'bg-white/[0.06]' : 'bg-white/[0.03]'}`} />
                    )}
                  </div>
                  <div className="pb-7">
                    <p className={`text-[13px] ${isCompleted ? 'text-white/30' : isCurrent ? 'text-white/60' : 'text-white/12'}`}>
                      {step}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !deploying && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-white/60">Deployment Failed</p>
          </div>

          <div className="border-t border-white/[0.04] pt-4">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Error</p>
            <p className="text-[13px] text-white/35 leading-relaxed font-mono break-all">{error}</p>
          </div>

          <button
            onClick={handleDeploy}
            className="px-5 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Idle state — locked or ready to deploy */}
      {!contractAddress && !deploying && !error && (
        <>
          {!userPassword ? (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white/70">Session Locked</p>
                  <p className="text-[12px] text-white/30 mt-0.5">
                    Go to the <Link to="/" className="text-white/50 hover:text-white/70 underline">Home page</Link> to unlock before deploying.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-[14px] font-medium text-white/70">Ready to deploy</p>
                  <p className="text-[13px] text-white/25 leading-relaxed">
                    This will create a new credentials contract and store the authority secret key in your browser's local storage.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/[0.04] pt-4">
                <Button
                  onClick={handleDeploy}
                  className="px-6 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
                >
                  Deploy Contract
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}