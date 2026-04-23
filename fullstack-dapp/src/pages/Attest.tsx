import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { INDEXER_HTTP, INDEXER_WS, PROOF_SERVER } from '../hooks/wallet/wallet.constants';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { findDeployedContract, createCircuitCallTxInterface } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { witnesses, createAttestPrivateState } from './witnesses';
import * as contractModule from '../contracts/managed/attest/contract/index.js';

const ZK_ARTIFACTS_PATH = '/contracts/managed/attest';
const PRIVATE_STATE_PASSWORD = 'AttestApp2026!Pass';

interface AttestForm {
  userCommit: string;
  type: 'age' | 'residency' | 'certification';
}

const STEPS = [
  'Checking contract',
  'Getting wallet keys',
  'Setting up providers',
  'Building contract',
  'Finding deployment',
  'Submitting attestation',
] as const;

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
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

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function AttestPage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [attesting, setAttesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AttestForm>({ userCommit: '', type: 'age' });
  const [txHash, setTxHash] = useState<string | null>(null);

  const currentStep = status ? STEPS.findIndex((s) => status.startsWith(s)) : -1;

  const handleAttest = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }
    if (!form.userCommit) {
      setError('User commitment is required');
      return;
    }

    setAttesting(true);
    setError(null);
    setTxHash(null);
    setStatus('Checking contract...');

    try {
      const contractAddress = localStorage.getItem('attest_contract');
      if (!contractAddress) {
        setError('Contract not deployed. Deploy the contract first.');
        setAttesting(false);
        return;
      }

      const commitBytes = new Uint8Array(32);
      const commitHex = form.userCommit.replace(/^0x/, '');
      for (let i = 0; i < 32; i++) {
        commitBytes[i] = parseInt(commitHex.slice(i * 2, i * 2 + 2), 16) || 0;
      }

      setStatus('Getting wallet keys...');
      const shieldedAddresses = await connectedApi.getShieldedAddresses();

      setStatus('Setting up providers...');
      const zkConfig = new FetchZkConfigProvider(
        window.location.origin + ZK_ARTIFACTS_PATH,
        fetch.bind(window)
      );

      const privateStateProvider = levelPrivateStateProvider({
        accountId: shieldedAddresses.shieldedCoinPublicKey,
        privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
      });

      const providers = {
        privateStateProvider,
        publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
        zkConfigProvider: zkConfig,
        proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfig),
        walletProvider: {
          getCoinPublicKey(): string {
            return shieldedAddresses.shieldedCoinPublicKey;
          },
          getEncryptionPublicKey(): string {
            return shieldedAddresses.shieldedEncryptionPublicKey;
          },
          async balanceTx(tx: unknown, _ttl?: Date): Promise<unknown> {
            const serializedTx = toHex((tx as { serialize: () => Uint8Array }).serialize());
            const received = await connectedApi.balanceUnsealedTransaction(serializedTx);
            return Transaction.deserialize(
              'signature', 'proof', 'binding', fromHex(received.tx)
            );
          },
        },
        midnightProvider: {
          async submitTx(tx: unknown): Promise<string> {
            const txData = tx as { serialize: () => Uint8Array; identifiers: () => string[] };
            await connectedApi.submitTransaction(toHex(txData.serialize()));
            return txData.identifiers()?.[0] ?? '';
          },
        },
      };

      setStatus('Building contract...');
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const finalContract = CompiledContract.withCompiledFileAssets(
        ccWithWitnesses,
        ZK_ARTIFACTS_PATH
      );

      const privateStateId = localStorage.getItem('attest_private_state') || 'attestState';

      const storedSkHex = localStorage.getItem('attest_secret_key');
      if (!storedSkHex) {
        setError('Authority secret key not found. Re-deploy the contract.');
        setAttesting(false);
        return;
      }
      const authoritySk = fromHex(storedSkHex);

      setStatus('Finding deployment...');
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
        initialPrivateState: createAttestPrivateState(authoritySk),
      });

      setStatus('Submitting attestation...');
      const txInterface = createCircuitCallTxInterface(
        providers as never,
        finalContract as never,
        contractAddress,
        privateStateId
      );

      let result;
      switch (form.type) {
        case 'residency':
          result = await (txInterface as any).attestResidency(commitBytes);
          break;
        case 'certification':
          result = await (txInterface as any).attestCertification(commitBytes);
          break;
        default:
          result = await (txInterface as any).attestAge(commitBytes);
      }

      setTxHash(result.public.txId);
      setStatus(null);
    } catch (err) {
      console.error('Attest error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setAttesting(false);
    }
  }, [connectedApi, form]);

  const copyTx = () => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
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
          <p className="text-[14px] text-white/25">Connect your wallet to attest credentials.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-white/25 hover:text-white/50 transition-colors mb-10"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back
      </Link>

      <div className="mb-10">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-2">Attest Credential</h1>
        <p className="text-[15px] text-white/30 leading-relaxed max-w-lg">
          As the authority, attest a user's credential by providing the commitment they shared with you.
        </p>
      </div>

      {/* Success state */}
      {txHash && !attesting && !error && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center">
              <CheckIcon className="w-4 h-4 text-white/70" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/80">Attestation Confirmed</p>
              <p className="text-[12px] text-white/25 mt-0.5">
                {form.type.charAt(0).toUpperCase() + form.type.slice(1)} credential attested
              </p>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2.5">Transaction ID</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                <p className="text-[12px] font-mono text-white/45 break-all leading-relaxed">{txHash}</p>
              </div>
              <button
                onClick={copyTx}
                className="px-4 py-3 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl transition-colors text-white/40 hover:text-white/60 shrink-0"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setTxHash(null); setForm({ ...form, userCommit: '' }); }}
              className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all text-center"
            >
              Attest Another
            </button>
            <Link
              to="/prove"
              className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all text-center border border-white/[0.06]"
            >
              Go to Prove
            </Link>
          </div>
        </div>
      )}

      {/* Deploying state — stepper */}
      {attesting && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <p className="text-[14px] font-medium text-white/60">Attesting</p>
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
                    <p className={`text-[13px] ${isCompleted ? 'text-white/30' : isCurrent ? 'text-white/60' : 'text-white/[0.08]'}`}>
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
      {error && !attesting && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-white/60">Attestation Failed</p>
          </div>

          <div className="border-t border-white/[0.04] pt-4">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Error</p>
            <p className="text-[13px] text-white/35 leading-relaxed font-mono break-all">{error}</p>
          </div>

          <button
            onClick={handleAttest}
            className="px-5 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Idle state — form */}
      {!txHash && !attesting && !error && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.04] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <KeyIcon className="w-4 h-4 text-white/40" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/70">New Attestation</p>
              <p className="text-[12px] text-white/20 mt-0.5">Paste the commitment from the user</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2.5">Credential Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AttestForm['type'] })}
                className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[14px] focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23444' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              >
                <option value="age" className="bg-[#0a0a0a] text-white">Age</option>
                <option value="residency" className="bg-[#0a0a0a] text-white">Residency</option>
                <option value="certification" className="bg-[#0a0a0a] text-white">Certification</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">User Commitment</label>
                <span className="text-[11px] text-white/10 font-mono">{form.userCommit.replace(/^0x/, '').length}/64 hex</span>
              </div>
              <input
                type="text"
                value={form.userCommit}
                onChange={(e) => setForm({ ...form, userCommit: e.target.value })}
                placeholder="0x..."
                spellCheck={false}
                className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/[0.08]"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/[0.04] bg-white/[0.01]">
            <Button
              onClick={handleAttest}
              disabled={!form.userCommit}
              className="px-6 py-2.5 bg-white hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
            >
              Attest User
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}