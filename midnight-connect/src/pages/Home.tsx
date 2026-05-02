import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';

function TransferIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17l9.2-9.2M17 17V7H7" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function HomePage() {
  const { isConnected, addresses, balances, isLoadingState } = useWalletStore();

  const formatBalance = (val: bigint | undefined): string => {
    if (val === undefined) return '0.00';
    return (Number(val) / 1_000_000).toFixed(4);
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
              <TransferIcon className="w-8 h-8 text-white/70" />
            </div>

            <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-semibold tracking-tight text-white leading-[1.05] mb-5">
              Midnight Transfer
            </h1>

            <p className="text-[15px] text-white/35 leading-relaxed max-w-md mb-12">
              A minimal transfer demo on Midnight. Connect your wallet and send unshielded tokens on Preprod.
            </p>

            <Link
              to="/transfer"
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
              <h1 className="text-[22px] font-semibold text-white tracking-tight">Dashboard</h1>
              <p className="text-[14px] text-white/30 mt-1">Your wallet overview</p>
            </div>
          </div>

          {/* Balance cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Shielded</p>
              <p className="text-[20px] font-semibold text-white">
                {formatBalance(balances?.shielded?.['0000000000000000000000000000000000000000000000000000000000000000'])}
              </p>
            </div>
            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Unshielded</p>
              <p className="text-[20px] font-semibold text-white">
                {formatBalance(balances?.unshielded?.['0000000000000000000000000000000000000000000000000000000000000000'])}
              </p>
            </div>
            <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Dust</p>
              <p className="text-[20px] font-semibold text-white">
                {balances?.dust ? (Number(balances.dust.balance) / 1e15).toFixed(4) : '0.00'}
              </p>
            </div>
          </div>

          {/* Addresses */}
          <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-3">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Addresses</p>
            <div className="space-y-2 font-mono text-[12px] text-white/40">
              <p>Shielded: {addresses?.shieldedAddress}</p>
              <p>Unshielded: {addresses?.unshieldedAddress}</p>
              <p>Dust: {addresses?.dustAddress}</p>
            </div>
          </div>

          {isLoadingState && (
            <p className="text-sm text-white/20">Refreshing balances...</p>
          )}

          {/* Action card */}
          <Link
            to="/transfer"
            className="group flex items-center justify-between p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] group-hover:bg-white/[0.06] flex items-center justify-center transition-colors">
                <TransferIcon className="w-5 h-5 text-white/60" />
              </div>
              <div>
                <h3 className="text-[14px] font-medium text-white/80 group-hover:text-white mb-0.5 transition-colors">Send Transfer</h3>
                <p className="text-[13px] text-white/25 group-hover:text-white/35 transition-colors">Send an unshielded transfer through your wallet</p>
              </div>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
          </Link>
        </div>
      )}
    </div>
  );
}
