import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import * as contractModule from '../contracts/managed/attest/contract/index.js';

function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHexString(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function domainToBytes(domain: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const encoded = new TextEncoder().encode(domain);
  bytes.set(encoded.slice(0, 32));
  return bytes;
}

type Domain = 'age' | 'residency' | 'certification';

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

function SessionCard({
  contractAddress,
  secretKey,
}: {
  contractAddress: string;
  secretKey: Uint8Array;
}) {
  const [domain, setDomain] = useState<Domain>('age');
  const [commitHex, setCommitHex] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copiedCommit, setCopiedCommit] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const commitment = contractModule.pureCircuits.getCommitment(
        secretKey,
        domainToBytes(domain)
      );
      setCommitHex(toHexString(commitment));
      setError(null);
    } catch (e) {
      setError('Commitment circuit not exported — add `export` to the circuit in Contract.compact');
      setCommitHex('');
    }
  }, [secretKey, domain]);

  const copy = (text: string, type: 'commit' | 'addr') => {
    navigator.clipboard.writeText(text);
    if (type === 'commit') {
      setCopiedCommit(true);
      setTimeout(() => setCopiedCommit(false), 1500);
    }
  };

  const shortAddr = `${contractAddress.slice(0, 8)}...${contractAddress.slice(-6)}`;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header — always visible, compact */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] shrink-0 flex items-center justify-center">
            <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="text-left min-w-0">
            <p className="text-[14px] font-medium text-white/80">Your Session</p>
            <p className="text-[12px] font-mono text-white/25 truncate">{shortAddr}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); copy(contractAddress, 'addr'); }}
            className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-white/20 hover:text-white/50"
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
          <svg
            className={`w-4 h-4 text-white/20 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded panel */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="border-t border-white/[0.05] px-5 py-5 space-y-5">
          {/* Full address */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Contract Address</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[12px] font-mono text-white/40 break-all leading-relaxed px-3 py-2 bg-white/[0.02] rounded-lg">
                {contractAddress}
              </p>
              <button
                onClick={() => copy(contractAddress, 'addr')}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors text-white/25 hover:text-white/50 shrink-0"
              >
                <CopyIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.04]" />

          {/* Commitment builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Commitment</p>
              <p className="text-[11px] text-white/15">Share with authority</p>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value as Domain)}
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/15 transition-colors appearance-none cursor-pointer mb-2.5"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23444' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
                >
                  <option value="age" className="bg-[#0a0a0a] text-white">Age</option>
                  <option value="residency" className="bg-[#0a0a0a] text-white">Residency</option>
                  <option value="certification" className="bg-[#0a0a0a] text-white">Certification</option>
                </select>

                {error ? (
                  <div className="px-3.5 py-2.5 bg-red-500/[0.05] border border-red-500/[0.08] rounded-xl">
                    <p className="text-[12px] text-red-400/70 leading-relaxed">{error}</p>
                  </div>
                ) : (
                  <div className="px-3.5 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <p className="text-[11px] font-mono text-white/30 break-all leading-[1.7]">
                      {commitHex || '...'}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => copy(commitHex, 'commit')}
                disabled={!commitHex}
                className="px-4 py-2.5 bg-white hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed text-black text-[12px] font-medium rounded-xl transition-all whitespace-nowrap h-fit"
              >
                {copiedCommit ? 'Done' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { isConnected } = useWalletStore();
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newContractAddress, setNewContractAddress] = useState('');
  const [stats, setStats] = useState<{totalAgeProofs: number; totalResidencyProofs: number; totalCertProofs: number} | null>(null);

  useEffect(() => {
    const addr = localStorage.getItem('attest_contract');
    const sk = localStorage.getItem('attest_secret_key');
    setContractAddress(addr);
    if (sk) {
      setSecretKey(fromHexString(sk));
    }
    if (addr) {
      fetch('http://localhost:3001/contract')
        .then(r => r.json())
        .then(d => setStats(d))
        .catch(() => setStats(null));
    }
  }, []);

  const saveContract = async () => {
    if (newContractAddress) {
      localStorage.setItem('attest_contract', newContractAddress);
      setContractAddress(newContractAddress);
      setNewContractAddress('');
      setShowSettings(false);

      try {
        const d = await fetch('http://localhost:3001/contract').then(r => r.json());
        setStats(d);
      } catch {}
    }
  };

  const clearContract = () => {
    localStorage.removeItem('attest_contract');
    localStorage.removeItem('attest_private_state');
    localStorage.removeItem('attest_secret_key');
    setContractAddress(null);
    setSecretKey(null);
    setShowSettings(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {!isConnected ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center relative">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />

          <div className="relative z-10 flex flex-col items-center max-w-xl px-6">
            <div className="mb-10 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] text-[11px] font-medium text-white/40 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
              Midnight Network
            </div>

            <div className="w-[72px] h-[72px] rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-10">
              <ShieldIcon className="w-8 h-8 text-white/70" />
            </div>

            <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-semibold tracking-tight text-white leading-[1.05] mb-5">
              Credentials without exposure
            </h1>

            <p className="text-[15px] text-white/35 leading-relaxed max-w-md mb-12">
              Privacy-preserving credentials on Midnight. Authorities attest your eligibility — you prove it without revealing which credential.
            </p>

            <Link
              to="/deploy"
              className="px-7 py-3 bg-white hover:bg-white/90 text-black text-[14px] font-medium rounded-xl transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8 pt-4 pb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-white tracking-tight">Credentials</h1>
              <p className="text-[14px] text-white/30 mt-1">Selective disclosure proofs</p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-white/[0.06] text-white/70' : 'hover:bg-white/[0.04] text-white/30 hover:text-white/50'}`}
            >
              <SettingsIcon className="w-[18px] h-[18px]" />
            </button>
          </div>

          {showSettings && (
            <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Contract Settings</p>
              <input
                type="text"
                value={newContractAddress}
                onChange={(e) => setNewContractAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveContract}
                  disabled={!newContractAddress}
                  className="flex-1 px-4 py-2.5 bg-white hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
                >
                  Save
                </button>
                <button
                  onClick={clearContract}
                  className="px-4 py-2.5 bg-white/[0.04] hover:bg-red-500/[0.08] text-white/40 hover:text-red-400/80 text-[13px] font-medium rounded-xl transition-all border border-white/[0.06] hover:border-red-500/[0.1]"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Stats box */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Age Proofs</p>
                <p className="text-[20px] font-semibold text-white">{stats.totalAgeProofs}</p>
              </div>
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Residency</p>
                <p className="text-[20px] font-semibold text-white">{stats.totalResidencyProofs}</p>
              </div>
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Certification</p>
                <p className="text-[20px] font-semibold text-white">{stats.totalCertProofs}</p>
              </div>
            </div>
          )}

          {/* Unified session card — collapsible */}
          {contractAddress && secretKey && (
            <SessionCard contractAddress={contractAddress} secretKey={secretKey} />
          )}

          {/* If contract exists but no key — just show address inline */}
          {contractAddress && !secretKey && (
            <div className="px-5 py-3.5 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Contract</p>
                <p className="text-[13px] font-mono text-white/40 truncate">{contractAddress}</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(contractAddress)}
                className="shrink-0 p-2 hover:bg-white/[0.06] rounded-lg transition-colors text-white/20 hover:text-white/50"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                to: '/deploy',
                icon: <ShieldIcon className="w-5 h-5 text-white/60" />,
                title: 'Deploy',
                desc: 'Deploy the credentials contract',
              },
              {
                to: '/attest',
                icon: <KeyIcon className="w-5 h-5 text-white/60" />,
                title: 'Attest',
                desc: 'Attest user credentials',
              },
              {
                to: '/prove',
                icon: <UserIcon className="w-5 h-5 text-white/60" />,
                title: 'Prove',
                desc: 'Prove your eligibility',
              },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex flex-col p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] group-hover:bg-white/[0.06] flex items-center justify-center mb-5 transition-colors">
                  {item.icon}
                </div>
                <h3 className="text-[14px] font-medium text-white/80 group-hover:text-white mb-1.5 transition-colors">{item.title}</h3>
                <p className="text-[13px] text-white/25 group-hover:text-white/35 transition-colors">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}