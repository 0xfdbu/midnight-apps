import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { ConnectButton } from '../components/ui/ConnectButton';

const ANALYTICS_API = 'http://localhost:3001';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-tertiary/60 border border-border/60 rounded-xl p-4 text-center">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-xs text-text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

export function HomePage() {
  const { isConnected } = useWalletStore();
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [contractData, setContractData] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<any>(null);

  const loadContractData = useCallback(async () => {
    const addr = contractAddress || localStorage.getItem('membership_contract');
    if (!addr) return;
    
    try {
      const [statusRes, contractRes] = await Promise.all([
        fetch(`${ANALYTICS_API}/status`),
        fetch(`${ANALYTICS_API}/contract/${addr}`),
      ]);
      
      const status = await statusRes.json();
      const contract = await contractRes.json();
      
      setApiStatus(status);
      if (contractRes.ok) {
        setContractData(contract);
      }
    } catch {}
  }, [contractAddress]);

  useEffect(() => {
    const addr = localStorage.getItem('membership_contract');
    if (addr) {
      setContractAddress(addr);
    }
  }, []);

  useEffect(() => {
    loadContractData();
    const interval = setInterval(loadContractData, 10000);
    return () => clearInterval(interval);
  }, [loadContractData]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      
      {!isConnected && (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center relative overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[150px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/5 blur-[100px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center max-w-lg">
            
            <div className="mb-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/80 bg-bg-tertiary/40 text-[12px] font-medium text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Zero-Knowledge Membership
            </div>

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center mb-8 shadow-xl shadow-indigo-500/10">
              <svg className="w-10 h-10 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                <path d="M9 12L11 14L15 10" strokeWidth="2" />
              </svg>
            </div>
            
            <div className="space-y-4 mb-10">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                Membership <span className="text-text-muted">Club</span>
              </h1>
              <p className="text-text-muted text-[16px] leading-relaxed max-w-md">
                Private membership with ZK proofs.
                Pay to join, prove eligibility without revealing identity.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-auto">
                <ConnectButton />
              </div>
              
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-bg-tertiary/40 border border-border/80 rounded-xl text-sm font-medium text-text-muted hover:text-white hover:bg-bg-tertiary hover:border-border-hover transition-all duration-200 active:scale-[0.98]"
              >
                <GithubIcon className="w-4 h-4" />
                View Source
              </a>
            </div>

          </div>
        </div>
      )}

      {isConnected && (
        <div className="py-12 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium uppercase tracking-widest text-emerald-400/80">Session Active</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Membership Club</h2>
            <p className="text-text-muted text-[14px] mt-1">Choose an action:</p>
          </div>

          {contractData && (
            <div className="p-6 bg-gradient-to-br from-bg-tertiary/60 to-bg-secondary border border-border/60 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${contractData.status === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-sm text-white font-mono truncate max-w-[200px]">
                    {contractData.address?.slice(0, 20)}...
                  </span>
                </div>
                {apiStatus && (
                  <span className="text-xs text-text-muted">{apiStatus.storedContracts} tracked</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard label="Registrations" value={contractData.totalRegistrations || 0} />
                <StatCard label="Proofs" value={contractData.totalProofs || 0} />
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h3 className="text-[12px] font-medium uppercase tracking-widest text-text-muted/60 mb-3">Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Deploy */}
                <Link
                  to="/deploy"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Deploy Club
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Deploy new membership contract.
                    </p>
                  </div>
                </Link>

                {/* Join */}
                <Link
                  to="/join"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Join Club
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Connect to existing contract.
                    </p>
                  </div>
                </Link>

                {/* Register */}
                <Link
                  to="/register"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Register
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Pay fee to join as member.
                    </p>
                  </div>
                </Link>

                {/* Prove */}
                <Link
                  to="/prove-eligibility"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Prove Eligibility
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Generate ZK proof.
                    </p>
                  </div>
                </Link>

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
