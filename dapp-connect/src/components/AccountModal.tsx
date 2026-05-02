import { useState } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import laceSvg from '../assets/lace.svg?url';
import iamSvg from '../assets/1am.svg?url';
import nightSvg from '../assets/night.svg?url';
import { nativeToken } from '@midnight-ntwrk/ledger-v8';

const NIGHT = nativeToken().raw;

function formatAddress(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

function formatBalance(amount: bigint | undefined): string {
  if (amount === undefined) return '0.0000';
  const value = Number(amount) / 1_000_000;
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K';
  return value.toFixed(2);
}

const DOT: Record<string, string> = {
  shielded: 'bg-indigo-400',
  unshielded: 'bg-emerald-300',
  dust: 'bg-amber-300',
};

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 7C2 5.89543 2.89543 5 4 5H20C21.1046 5 22 5.89543 22 7V9H2V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 9H22V17C22 18.1046 21.1046 19 20 19H4C2.89543 19 2 18.1046 2 17V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 3H21V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 3L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12C4 7.58172 7.58172 4 12 4C14.7614 4 17.2603 5.05714 19.0085 6.70862M20 12C20 16.4183 16.4183 20 12 20C9.23858 20 6.73975 18.9429 5 17.2914" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.0085 6.70862V10.2914C18.2611 9.53352 17.2094 9 16 9V5.29138C17.3265 5.78734 18.4104 6.45052 19.0085 7.29138" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 17.2914V13.7086C5.73894 14.4665 6.79064 15 8 15V18.7086C6.67352 18.2127 5.58962 17.5495 5 16.7086" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function AccountModal() {
  const {
    showAccountModal, setShowAccountModal,
    addresses, balances, config,
    isLoadingState, loadWalletState,
    disconnect, wallet, error,
  } = useWalletStore();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, address: string | undefined) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!showAccountModal) return null;

  const iconUrl = wallet?.rdns?.includes('lace')
    ? laceSvg
    : wallet?.rdns?.includes('1am') || wallet?.rdns?.includes('iam')
    ? iamSvg
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setShowAccountModal(false)}
      />

      <div className="relative z-10 w-full max-w-[420px] bg-bg-secondary border border-border rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-hover to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center overflow-hidden">
              {iconUrl
                ? <img src={iconUrl} alt="" className="w-6 h-6 object-contain" />
                : <WalletIcon className="w-5 h-5 text-text-muted" />
              }
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-tight">{wallet?.name || 'Wallet'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                <span className="text-[11px] text-text-muted capitalize">{config?.networkId || 'Connected'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowAccountModal(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-bg-tertiary transition-all cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mb-4 px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Hero Section: Primary Balance */}
        <div className="mx-6 p-5 bg-bg-tertiary/50 rounded-2xl border border-border/50 mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-2 text-xs text-text-muted font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${DOT.shielded}`} />
              Shielded Balance
            </span>
            <button
              onClick={loadWalletState}
              disabled={isLoadingState}
              className="flex items-center gap-1 text-text-muted hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${isLoadingState ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-semibold tracking-tight text-white leading-none">
              {balances?.shielded ? formatBalance(balances.shielded[NIGHT]) : '0.0000'}
            </span>
            <img src={nightSvg} alt="N" className="w-5 h-5" />
          </div>
        </div>

        {/* Secondary Balances */}
        <div className="grid grid-cols-2 gap-3 px-6 mb-6">
          <div className="p-4 bg-bg-tertiary/30 rounded-xl">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${DOT.unshielded}`} />
              Unshielded
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-medium text-white/80">
                {balances?.unshielded ? formatBalance(balances.unshielded[NIGHT]) : '0.00'}
              </span>
              <img src={nightSvg} alt="N" className="w-4 h-4" />
            </div>
          </div>

          <div className="p-4 bg-bg-tertiary/30 rounded-xl">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${DOT.dust}`} />
              Dust
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-medium text-white/80">
                {balances?.dust ? (Number(balances.dust.balance) / 1000000000000000).toFixed(2) : '0.00'}
              </span>
              {balances?.dust && <img src={nightSvg} alt="N" className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Addresses Section */}
        <div className="px-6 mb-6">
          <p className="text-[11px] uppercase tracking-widest text-text-muted font-medium mb-3">Addresses</p>
          <div className="flex flex-col gap-1">
            {[
              { key: 'shielded', label: 'Shielded', val: addresses?.shieldedAddress },
              { key: 'unshielded', label: 'Unshielded', val: addresses?.unshieldedAddress },
              { key: 'dust', label: 'Dust', val: addresses?.dustAddress },
            ].map(({ key, label, val }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2.5 px-1 group rounded-lg hover:bg-bg-tertiary/40 transition-colors cursor-pointer"
                onClick={() => handleCopy(key, val)}
              >
                <span className="flex items-center gap-2.5 text-sm text-text-muted">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[key]}`} />
                  {label}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-text-secondary">
                    {val ? formatAddress(val) : '—'}
                  </span>

                  {val && (
                    <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedKey === key ? (
                        <span className="text-[10px] text-emerald-400 font-medium">Copied!</span>
                      ) : (
                        <CopyIcon className="w-3.5 h-3.5" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer / Disconnect */}
        <div className="px-6 pb-6 pt-2 border-t border-border/50">
          <button
            onClick={disconnect}
            className="w-full py-3 rounded-xl text-sm font-medium text-text-muted hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 cursor-pointer"
          >
            Disconnect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
