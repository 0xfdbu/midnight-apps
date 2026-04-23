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

type ProofType = 'age' | 'residency' | 'certification';

const STEPS = [
  'Loading',
  'Getting wallet keys',
  'Setting up providers',
  'Building contract',
  'Finding contract',
  'Generating proof',
] as const;

const PROOF_OPTIONS: { value: ProofType; label: string; desc: string }[] = [
  { value: 'age', label: 'Age', desc: '18+' },
  { value: 'residency', label: 'Residency', desc: 'Verified' },
  { value: 'certification', label: 'Certification', desc: 'Held' },
];

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ProvePage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [proving, setProving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofType, setProofType] = useState<ProofType>('age');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);

  const currentStep = status ? STEPS.findIndex((s) => status.startsWith(s)) : -1;

  const handleProve = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }

    setProving(true);
    setError(null);
    setStatus('Loading...');
    setEligible(null);
    setTxHash(null);

    try {
      const contractAddress = localStorage.getItem('attest_contract');
      if (!contractAddress) {
        setError('Contract not deployed. Deploy the contract first.');
        setProving(false);
        return;
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
        setError('Secret key not found. Re-register or request attestation.');
        setProving(false);
        return;
      }
      const userSk = fromHex(storedSkHex);

      setStatus('Finding contract...');
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
        initialPrivateState: createAttestPrivateState(userSk),
      });

      setStatus('Generating proof...');
      const txInterface = createCircuitCallTxInterface(
        providers as never,
        finalContract as never,
        contractAddress,
        privateStateId
      );

      let result;
      switch (proofType) {
        case 'residency':
          result = await (txInterface as any).proveResidency();
          break;
        case 'certification':
          result = await (txInterface as any).proveCertification();
          break;
        default:
          result = await (txInterface as any).proveAge();
      }

      setTxHash(result.public.txId);
      setEligible(true);
      setStatus(null);
    } catch (err) {
      console.error('Prove error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not attested')) {
        setError('Not attested yet — ask the authority to attest you first.');
      } else if (msg.includes('already used')) {
        setError('Proof already used — each credential can only be proven once.');
      } else {
        setError(msg);
      }
      setStatus(null);
    } finally {
      setProving(false);
    }
  }, [connectedApi, proofType]);

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
          <p className="text-[14px] text-white/25">Connect your wallet to prove eligibility.</p>
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
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-2">Prove Eligibility</h1>
        <p className="text-[15px] text-white/30 leading-relaxed max-w-lg">
          Generate a zero-knowledge proof that you hold a valid credential — without revealing which one.
        </p>
      </div>

      {/* Success state */}
      {eligible && txHash && !proving && !error && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center">
                <ShieldCheckIcon className="w-7 h-7 text-white/60" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[18px] font-semibold text-white/90">Eligible</p>
              <p className="text-[14px] text-white/25">
                Your {proofType} credential has been proven on-chain. No underlying data was revealed.
              </p>
            </div>

            <div className="border-t border-white/[0.04] pt-5 max-w-md mx-auto">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2.5">Transaction ID</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <p className="text-[11px] font-mono text-white/40 break-all leading-relaxed">{txHash}</p>
                </div>
                <button
                  onClick={copyTx}
                  className="px-3.5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl transition-colors text-white/40 hover:text-white/60 shrink-0"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setEligible(null); setTxHash(null); }}
              className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all text-center"
            >
              Prove Another
            </button>
            <Link
              to="/"
              className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all text-center border border-white/[0.06]"
            >
              Back to Home
            </Link>
          </div>
        </div>
      )}

      {/* Proving state — stepper */}
      {proving && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <p className="text-[14px] font-medium text-white/60">Generating Proof</p>
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
      {error && !proving && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-white/60">Proof Failed</p>
          </div>

          <div className="border-t border-white/[0.04] pt-4">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Error</p>
            <p className="text-[13px] text-white/35 leading-relaxed">{error}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleProve}
              className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
            >
              Retry
            </button>
            <Link
              to="/attest"
              className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all text-center border border-white/[0.06]"
            >
              Get Attested
            </Link>
          </div>
        </div>
      )}

      {/* Idle state — type selector + action */}
      {!eligible && !proving && !error && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.04] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-white/40" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/70">Select Credential</p>
              <p className="text-[12px] text-white/20 mt-0.5">Choose which proof to generate</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-3">Proof Type</label>
              <div className="grid grid-cols-3 gap-2">
                {PROOF_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setProofType(opt.value)}
                    className={`group relative flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all ${
                      proofType === opt.value
                        ? 'bg-white/[0.06] border-white/[0.15]'
                        : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.08]'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      proofType === opt.value ? 'bg-white/50' : 'bg-white/[0.08] group-hover:bg-white/15'
                    }`} />
                    <div className="text-center">
                      <p className={`text-[13px] font-medium transition-colors ${
                        proofType === opt.value ? 'text-white/80' : 'text-white/30 group-hover:text-white/45'
                      }`}>
                        {opt.label}
                      </p>
                      <p className={`text-[11px] mt-0.5 transition-colors ${
                        proofType === opt.value ? 'text-white/30' : 'text-white/[0.08] group-hover:text-white/15'
                      }`}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 px-3.5 py-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
              <svg className="w-4 h-4 text-white/15 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <p className="text-[12px] text-white/15 leading-relaxed">
                You must have been attested by the authority for this credential type before generating a proof. Each credential can only be proven once.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/[0.04] bg-white/[0.01]">
            <Button
              onClick={handleProve}
              className="px-6 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
            >
              Generate Proof
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}