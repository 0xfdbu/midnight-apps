import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getContractState } from '../hooks/wallet/services/api';
import { getStoredCoins, clearStoredCoins, type StoredCoin } from '../lib/coinStore';

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c0 0-7 4-7 11v3l-2 2h18l-2-2v-3c0-7-7-11-7-11z" />
    </svg>
  );
}

export function HomePage() {
  const { isConnected, balances, loadWalletState } = useWalletStore();
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [newContractAddress, setNewContractAddress] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState<{ totalSupply: bigint; totalBurned: bigint } | null>(null);
  const [storedCoins, setStoredCoins] = useState<StoredCoin[]>([]);

  useEffect(() => {
    const addr = localStorage.getItem('shielded_token_contract');
    setContractAddress(addr);
    if (addr) {
      getContractState(addr).then(setStats).catch(() => setStats(null));
    }
    setStoredCoins(getStoredCoins());
  }, []);

  // Auto-refresh wallet state every 15s so shielded balance syncs without manual refresh
  useEffect(() => {
    if (!isConnected) return;
    loadWalletState();
    const id = setInterval(() => loadWalletState(), 15_000);
    return () => clearInterval(id);
  }, [isConnected, loadWalletState]);

  const saveContract = () => {
    if (newContractAddress) {
      localStorage.setItem('shielded_token_contract', newContractAddress);
      setContractAddress(newContractAddress);
      setNewContractAddress('');
      setShowSettings(false);
      getContractState(newContractAddress).then(setStats).catch(() => setStats(null));
    }
  };

  const clearContract = () => {
    localStorage.removeItem('shielded_token_contract');
    setContractAddress(null);
    setStats(null);
    setShowSettings(false);
  };

  // Sum all shielded token balances and format cleanly
  const shieldedBalanceTotal = (() => {
    if (!balances?.shielded) return null;
    const entries = Object.entries(balances.shielded);
    if (entries.length === 0) return 0n;
    return entries.reduce((sum, [, v]) => sum + (v ?? 0n), 0n);
  })();

  const shieldedBalanceTokens = balances?.shielded
    ? Object.entries(balances.shielded).map(([id, value]) => ({
        id: id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id,
        rawId: id,
        value: value ?? 0n,
      }))
    : [];

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
              Tokens without trace
            </h1>

            <p className="text-[15px] text-white/35 leading-relaxed max-w-md mb-12">
              Privacy-preserving shielded tokens on Midnight. Mint, send, and burn tokens while keeping all amounts and balances hidden from on-chain observers.
            </p>

            <p className="text-[13px] text-white/20 mb-8">
              Connect your wallet to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8 pt-4 pb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-white tracking-tight">Shielded Token</h1>
              <p className="text-[14px] text-white/30 mt-1">Private balance and token operations</p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-white/[0.06] text-white/70' : 'hover:bg-white/[0.04] text-white/30 hover:text-white/50'}`}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Balance card */}
          <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Shielded Balance</p>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.12]">
                <svg className="w-3 h-3 text-emerald-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-[10px] font-medium text-emerald-400/70">Private</span>
              </div>
            </div>
            <p className="text-[28px] font-semibold text-white font-mono tracking-tight">
              {shieldedBalanceTotal !== null ? shieldedBalanceTotal.toString() : '—'}
            </p>
            {shieldedBalanceTokens.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {shieldedBalanceTokens.map((t) => (
                  <span
                    key={t.rawId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/30 font-mono"
                    title={t.rawId}
                  >
                    <span className="text-white/15">{t.id}</span>
                    <span className="text-white/50">{t.value.toString()}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
              <p className="text-[11px] text-white/25">Decrypted locally — not visible on-chain</p>
            </div>
          </div>

          {/* Stored coins inventory */}
          {storedCoins.length > 0 && (
            <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Stored Coins</p>
                <button
                  onClick={() => { clearStoredCoins(); setStoredCoins([]); }}
                  className="text-[10px] text-white/15 hover:text-red-400/50 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {storedCoins.map((coin) => (
                  <div key={coin.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-mono text-white/40">
                        <span className="text-white/20">Nonce</span> {coin.nonce.slice(0, 12)}…{coin.nonce.slice(-12)}
                      </p>
                      <p className="text-[11px] font-mono text-white/30">
                        <span className="text-white/15">Color</span> {coin.color.slice(0, 12)}…{coin.color.slice(-12)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold text-white font-mono">{coin.value}</p>
                      <p className="text-[9px] uppercase tracking-wider text-white/15">{coin.source}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/15">
                These coins were saved locally after minting. Use them on the <Link to="/burn" className="text-white/30 hover:text-white/50 underline">Burn</Link> page.
              </p>
            </div>
          )}

          {/* Contract settings */}
          {showSettings && (
            <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Contract Settings</p>
              <p className="text-[11px] text-red-400/40">
                Clear will remove your contract address. This action cannot be undone.
              </p>
              <input
                type="text"
                value={newContractAddress}
                onChange={(e) => setNewContractAddress(e.target.value)}
                placeholder="Enter contract address..."
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

          {/* Contract address */}
          {contractAddress && (
            <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Contract</p>
              <p className="text-[12px] font-mono text-white/40 break-all">{contractAddress}</p>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Total Supply</p>
                <p className="text-[20px] font-semibold text-white">{stats.totalSupply.toString()}</p>
              </div>
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Total Burned</p>
                <p className="text-[20px] font-semibold text-white">{stats.totalBurned.toString()}</p>
              </div>
            </div>
          )}

          {/* Action grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ...(!contractAddress
                ? [
                    {
                      to: '/deploy',
                      icon: (
                        <svg className="w-5 h-5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      ),
                      title: 'Deploy',
                      desc: 'Deploy the smart contract',
                    },
                  ]
                : []),
              {
                to: '/mint',
                icon: <ShieldIcon className="w-5 h-5 text-white/60" />,
                title: 'Mint',
                desc: 'Create new shielded tokens',
              },
              {
                to: '/send',
                icon: <SendIcon className="w-5 h-5 text-white/60" />,
                title: 'Send',
                desc: 'Transfer shielded tokens privately',
              },
              {
                to: '/burn',
                icon: <FlameIcon className="w-5 h-5 text-white/60" />,
                title: 'Burn',
                desc: 'Permanently destroy tokens',
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
