import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { ConnectButton } from '../components/ui/ConnectButton';

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

function ArrowSwitchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
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

export function HomePage() {
  const { isConnected } = useWalletStore();

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
                Midnight <span className="text-text-muted">Connect</span>
              </h1>
              <p className="text-text-muted text-[16px] leading-relaxed max-w-md">
                A secure interface for shielded transfers and atomic swaps. 
                Connect your wallet to get started.
              </p>
            </div>

            {/* Dual CTA Group */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-auto">
                <ConnectButton />
              </div>
              
              <a
                href="https://github.com/0xfdbu/midnight-connect"
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

          {/* Action Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Transfer Card */}
            <Link
              to="/transfer"
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
                  Transfer
                </h3>
                <p className="text-[13px] text-text-muted leading-snug">
                  Send NIGHT tokens to any address.
                </p>
              </div>
            </Link>

            {/* Contract Call Card */}
            <Link
              to="/contract-call"
              className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                  <CodeIcon className="w-5 h-5" />
                </div>
                <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                  Contract Call
                </h3>
                <p className="text-[13px] text-text-muted leading-snug">
                  Interact with the deployed token contract.
                </p>
              </div>
            </Link>

            {/* Swap Card */}
            <Link
              to="/swap"
              className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                  <ArrowSwitchIcon className="w-5 h-5" />
                </div>
                <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                  Create Swap
                </h3>
                <p className="text-[13px] text-text-muted leading-snug">
                  Create an atomic swap intent to trade tokens.
                </p>
              </div>
            </Link>

            {/* Complete Swap Card */}
            <Link
              to="/complete-swap"
              className="group flex flex-col p-5 bg-bg-tertiary/40 border border-border/80 rounded-2xl hover:bg-bg-tertiary hover:border-border-hover active:scale-[0.98] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <ArrowSwitchIcon className="w-5 h-5" />
                </div>
                <ChevronRightIcon className="w-5 h-5 text-text-muted/0 group-hover:text-text-muted/60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-[15px] font-medium text-white group-hover:text-white transition-colors">
                  Complete Swap
                </h3>
                <p className="text-[13px] text-text-muted leading-snug">
                  Submit a sealed transaction to finalize a swap.
                </p>
              </div>
            </Link>

          </div>
        </div>
      )}
    </div>
  );
}