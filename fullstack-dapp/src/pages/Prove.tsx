import { useState, useCallback, useEffect } from 'react';
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

type ProofType = 'age' | 'residency' | 'certification';

const STEPS = [
  'Loading',
  'Getting wallet keys',
  'Verifying password',
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function ProvePage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [proving, setProving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofType, setProofType] = useState<ProofType>('age');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [storagePassword, setStoragePassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [needsStateReset, setNeedsStateReset] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setStoragePassword('');
      setIsUnlocked(false);
      setNeedsStateReset(false);
    }
  }, [isConnected]);

  const currentStep = status ? STEPS.findIndex((s) => status.startsWith(s)) : -1;

  const clearContractState = useCallback(() => {
    // Clear all contract-related data
    localStorage.removeItem('attest_contract');
    localStorage.removeItem('attest_private_state');
    localStorage.removeItem('attest_session_password');
    
    // Delete IndexedDB databases created by levelPrivateStateProvider
    if (addresses?.shieldedCoinPublicKey) {
      const dbNames = [
        `midnight-private-state-${addresses.shieldedCoinPublicKey}`,
        `midnight-contract-state-${addresses.shieldedCoinPublicKey}`,
      ];
      dbNames.forEach(name => {
        indexedDB.deleteDatabase(name);
      });
    }
    
    setNeedsStateReset(false);
    setError(null);
    setIsUnlocked(false);
    setStoragePassword('');
    setPasswordInput('');
  }, [addresses?.shieldedCoinPublicKey]);

  const handleProve = useCallback(async () => {
    if (!connectedApi || !addresses) {
      setError('Wallet not connected');
      return;
    }

    const effectivePassword = storagePassword;
    if (!effectivePassword) {
      setError('Please unlock your session first.');
      return;
    }

    setProving(true);
    setError(null);
    setStatus('Loading...');
    setEligible(null);
    setTxHash(null);
    setNeedsStateReset(false);

    try {
      const contractAddress = localStorage.getItem('attest_contract');
      if (!contractAddress) {
        setError('Contract not deployed. Deploy the contract first.');
        setProving(false);
        return;
      }

      setStatus('Getting wallet keys...');
      const shieldedAddresses = await connectedApi.getShieldedAddresses();

      const accountId = shieldedAddresses.shieldedCoinPublicKey;

      setStatus('Verifying password...');
      
      const skProvider = levelPrivateStateProvider({
        accountId,
        privateStoragePasswordProvider: () => effectivePassword,
      });
      skProvider.setContractAddress(contractAddress);

      let skData: { hex: string } | undefined;
      try {
        skData = await skProvider.get('attest_sk') as { hex: string } | undefined;
      } catch (e) {
        console.error('Secret key decryption failed:', e);
        setError(
          'Unable to decrypt credential data. This usually means:\n\n' +
          '• Wrong password — make sure you\'re using the same password from the home page\n' +
          '• Corrupted data — try clearing the contract state and starting fresh'
        );
        setNeedsStateReset(true);
        setProving(false);
        return;
      }

      if (!skData) {
        setError('Secret key not found. Go to the home page and unlock with your password first.');
        setProving(false);
        return;
      }

      // NOTE: We verify skData above to ensure the password is correct, 
      // but we do NOT need to use the secret key to override the contract state.

      setStatus('Setting up providers...');
      const zkConfig = new FetchZkConfigProvider(
        window.location.origin + ZK_ARTIFACTS_PATH,
        fetch.bind(window)
      );

      const privateStateProvider = levelPrivateStateProvider({
        accountId,
        privateStoragePasswordProvider: () => effectivePassword,
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

      const privateStateId = 'attestState';

      setStatus('Finding contract...');
      
      // ✅ FIX: Do NOT pass initialPrivateState here. 
      // The state has already been advanced by the Authority's attestation.
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
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
      } else if (msg.includes('Unsupported state') || msg.includes('authenticate')) {
        setError('Unable to decrypt data. Clear contract state and try again.');
        setNeedsStateReset(true);
      } else {
        setError(msg);
      }
      setStatus(null);
    } finally {
      setProving(false);
    }
  }, [connectedApi, addresses, proofType, storagePassword]);

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
            <p className="text-[13px] text-white/35 leading-relaxed whitespace-pre-line">{error}</p>
          </div>

          <div className="flex gap-2">
            {!needsStateReset && (
              <>
                <button
                  onClick={() => { setError(null); setIsUnlocked(false); setStoragePassword(''); }}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all border border-white/[0.06]"
                >
                  Try Different Password
                </button>
                <button
                  onClick={handleProve}
                  className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 text-black text-[13px] font-medium rounded-xl transition-all"
                >
                  Retry
                </button>
              </>
            )}
            <Link
              to="/attest"
              className={!needsStateReset ? 'flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] text-white/50 hover:text-white/70 text-[13px] font-medium rounded-xl transition-all text-center border border-white/[0.06]' : 'flex-1'}
            >
              {!needsStateReset && 'Get Attested'}
            </Link>
          </div>

          {needsStateReset && (
            <div className="border-t border-white/[0.04] pt-4 space-y-3">
              <p className="text-[12px] text-white/25">
                This will clear all contract data. You'll need to redeploy the contract and get attested again.
              </p>
              <button
                onClick={clearContractState}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/[0.08] hover:bg-red-500/[0.12] border border-red-500/[0.1] hover:border-red-500/[0.15] text-red-400/80 hover:text-red-400 text-[13px] font-medium rounded-xl transition-all"
              >
                <TrashIcon className="w-4 h-4" />
                Clear Contract State & Start Fresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Password unlock UI */}
      {!isUnlocked && !proving && !eligible && !error && (
        <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
              <svg className="w-5 h-5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/70">Unlock Your Session</p>
              <p className="text-[12px] text-white/30 mt-0.5">Enter your storage password to access your credential key</p>
            </div>
          </div>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && passwordInput.length >= 16) {
                setStoragePassword(passwordInput);
                setPasswordInput('');
                setIsUnlocked(true);
                setPasswordError(null);
              }
            }}
            placeholder="Storage password (min. 16 characters)"
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15 mb-3"
          />
          {passwordError && (
            <p className="text-[12px] text-red-400/70 mb-3">{passwordError}</p>
          )}
          <button
            onClick={() => {
              if (passwordInput.length < 16) {
                setPasswordError('Password must be at least 16 characters.');
                return;
              }
              setStoragePassword(passwordInput);
              setPasswordInput('');
              setIsUnlocked(true);
              setPasswordError(null);
            }}
            disabled={passwordInput.length < 16}
            className="w-full py-3 bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
          >
            Unlock
          </button>
          <p className="text-[11px] text-white/20 mt-3 text-center">
            Use the same password you used on the home page.
          </p>
        </div>
      )}

      {/* Idle state — type selector + action */}
      {!eligible && !proving && !error && isUnlocked && (
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