import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { ConnectButton } from '../components/ui/ConnectButton';
import { useContractState } from '../hooks/useContractState';
import { getContractFirstTokenBalance } from '../hooks/wallet/services/contractCalls';

// --- Icons ---
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function ArrowUpRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7" />
      <path d="M7 7H17V17" />
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

function formatTokenId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

export function HomePage() {
  const { isConnected, connectedApi, contractAddress, setContractAddress, selectedTokenId, setSelectedTokenId } = useWalletStore();
  const { state } = useContractState(connectedApi, contractAddress, selectedTokenId, { pollInterval: 15000 });
  const [showContractSettings, setShowContractSettings] = useState(false);
  const [newContractAddress, setNewContractAddress] = useState('');
  const [contractTokenId, setContractTokenId] = useState<string | null>(null);

  const totalSupply = state?.totalSupply ?? 0n;
  const totalBurned = state?.totalBurned ?? 0n;
  const burnedBalance = state?.burnedBalance ?? 0n;
  const contractBalance = state?.contractBalance ?? 0n;
  const walletBalance = state?.walletBalance ?? 0n;

  useEffect(() => {
    if (!contractAddress) {
      setContractTokenId(null);
      return;
    }
    getContractFirstTokenBalance(contractAddress).then((result) => {
      if (result) {
        setContractTokenId(result.tokenId);
        setSelectedTokenId(result.tokenId);
      } else {
        setContractTokenId(null);
      }
    });
  }, [contractAddress, setSelectedTokenId]);

  const handleSaveContract = () => {
    if (newContractAddress.trim()) {
      setContractAddress(newContractAddress.trim());
      setNewContractAddress('');
      setShowContractSettings(false);
    }
  };

  const handleClearContract = () => {
    setContractAddress(null);
    setNewContractAddress('');
    setShowContractSettings(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      
      {/* --- Disconnected State (The Hero) --- */}
      {!isConnected && (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center relative overflow-hidden">
          {/* Ambient Background Effects */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 blur-[150px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/5 blur-[100px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center max-w-lg">
            
            {/* Context Badge */}
            <div className="mb-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/80 bg-bg-tertiary/40 text-[12px] font-medium text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Powered by Midnight Network
            </div>

            {/* Hero Icon */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center mb-8 shadow-xl shadow-indigo-500/10">
              <svg className="w-10 h-10 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            
            {/* Headline & Subheadline */}
            <div className="space-y-4 mb-10">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                Midnight <span className="text-text-muted">App</span>
              </h1>
              <p className="text-text-muted text-[16px] leading-relaxed max-w-md">
                A secure interface for managing an unshielded stablecoin vault.
                Connect your wallet to get started.
              </p>
            </div>

            {/* Dual CTA Group */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-auto">
                <ConnectButton />
              </div>
              
              <a
                href="https://github.com/0xfdbu/midnight-apps/unshielded-token"
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

      {/* --- Connected State (The "Command Center") --- */}
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
            <h2 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h2>
            <p className="text-text-muted text-[14px] mt-1">What would you like to do?</p>
          </div>

          {/* Active Contract */}
          <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-text-muted/60">Active Contract</span>
              <button
                onClick={() => setShowContractSettings((s) => !s)}
                className="text-[12px] text-text-muted hover:text-white transition-colors"
              >
                {showContractSettings ? 'Close' : contractAddress ? 'Change' : 'Set'}
              </button>
            </div>
            {contractAddress ? (
              <p className="text-[12px] font-mono text-text-secondary break-all">{contractAddress}</p>
            ) : (
              <p className="text-[12px] text-text-muted">No contract configured. Deploy one or paste an address below.</p>
            )}

            {showContractSettings && (
              <div className="pt-3 border-t border-border/50 space-y-3">
                <input
                  type="text"
                  value={newContractAddress}
                  onChange={(e) => setNewContractAddress(e.target.value)}
                  placeholder="Paste contract address..."
                  className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-xl text-[12px] text-white placeholder-text-muted/40 focus:outline-none focus:border-border-hover font-mono"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveContract}
                    disabled={!newContractAddress.trim()}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-bg-tertiary disabled:text-text-muted text-white text-[12px] font-medium rounded-xl transition-all"
                  >
                    Save
                  </button>
                  {contractAddress && (
                    <button
                      onClick={handleClearContract}
                      className="px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border text-text-secondary text-[12px] font-medium rounded-xl transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Token Selector */}
          <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-text-muted/60">Selected Token</span>
            </div>
            {!contractAddress && (
              <div className="space-y-1">
                <p className="text-[12px] text-text-muted">No contract configured.</p>
                <Link
                  to="/deploy"
                  className="inline-block text-[12px] text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Deploy a contract first →
                </Link>
              </div>
            )}
            {contractAddress && !contractTokenId && (
              <div className="space-y-1">
                <p className="text-[12px] text-text-muted">No tokens in contract.</p>
                <Link
                  to="/mint"
                  className="inline-block text-[12px] text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Mint tokens first →
                </Link>
              </div>
            )}
            {contractAddress && contractTokenId && (
              <div className="space-y-1">
                <p className="text-[12px] font-mono text-white">{formatTokenId(contractTokenId)}</p>
                <p className="text-[11px] font-mono text-text-muted break-all">{contractTokenId}</p>
              </div>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Supply</p>
              <p className="text-xl font-semibold text-white">{totalSupply.toString()}</p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Burned</p>
              <p className="text-xl font-semibold text-white">{totalBurned.toString()}</p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Vault Balance</p>
              <p className="text-xl font-semibold text-white">{contractBalance.toString()}</p>
              {burnedBalance > 0n && (
                <p className="text-[10px] text-text-muted/40 mt-1">{burnedBalance.toString()} burned held</p>
              )}
            </div>
            <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">
                Wallet Balance
                {selectedTokenId && (
                  <span className="block normal-case tracking-normal text-[9px] text-text-muted/40 mt-0.5 font-mono">
                    {formatTokenId(selectedTokenId)}
                  </span>
                )}
              </p>
              <p className="text-xl font-semibold text-white">{walletBalance.toString()}</p>
            </div>
          </div>

          {/* Usage Guidance */}
          <div className="flex gap-3 p-4 bg-indigo-500/5 rounded-xl border-l-2 border-indigo-500/30">
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/80" />
            </div>
            <div className="space-y-2">
              <p className="text-[13px] text-text-secondary leading-relaxed">
                <strong className="text-white">How it works:</strong> This DApp manages an unshielded token vault. The contract can mint new tokens, send from its balance to users, and accept deposits. The dashboard automatically detects the token held by your configured contract and selects it for all operations.
              </p>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                <strong className="text-white">Typical flow:</strong> Deploy a contract (or paste an existing address) → Mint tokens into the vault → The dashboard detects the token once it exists in the contract&apos;s balance → Use Contract Send to distribute to user wallets → Or deposit tokens back into the vault with Receive Tokens.
              </p>
            </div>
          </div>

          {/* Action Grid */}
          <div className="space-y-6">

            {/* User Wallet Section */}
            <div>
              <h3 className="text-[12px] font-medium uppercase tracking-widest text-text-muted/60 mb-3">User Wallet</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Send Tokens (Direct) */}
                <Link
                  to="/send"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                      <ArrowUpRightIcon className="w-5 h-5" />
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Send Tokens
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Send stablecoins directly from your wallet.
                    </p>
                  </div>
                </Link>

                {/* Wallet Info */}
                <Link
                  to="/wallet-info"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M2 10h20" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Wallet Info
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      View your balance and copy address.
                    </p>
                  </div>
                </Link>

              </div>
            </div>

            {/* Contract Operations Section */}
            <div>
              <h3 className="text-[12px] font-medium uppercase tracking-widest text-text-muted/60 mb-3">Contract Operations</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Deploy Contract */}
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
                      Deploy Contract
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Deploy a new stablecoin vault contract.
                    </p>
                  </div>
                </Link>

                {/* ZSwap State */}
                <Link
                  to="/zswap-state"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:bg-violet-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      ZSwap State
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Query combined ZSwap + contract state atomically.
                    </p>
                  </div>
                </Link>
                
                {/* Mint Tokens */}
                <Link
                  to="/mint"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Mint Tokens
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Mint new stablecoins from the contract.
                    </p>
                  </div>
                </Link>

                {/* Burn Tokens */}
                <Link
                  to="/burn"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Burn Tokens
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Burn stablecoins from your wallet balance.
                    </p>
                  </div>
                </Link>

                {/* Contract Send Tokens */}
                <Link
                  to="/contract-send"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                      <ArrowUpRightIcon className="w-5 h-5" />
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Contract Send
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Send tokens from contract to an address.
                    </p>
                  </div>
                </Link>

                {/* Receive Tokens (Deposit into Contract) */}
                <Link
                  to="/receive"
                  className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                      Receive Tokens
                    </h3>
                    <p className="text-[13px] text-text-muted leading-snug">
                      Deposit tokens into the contract.
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