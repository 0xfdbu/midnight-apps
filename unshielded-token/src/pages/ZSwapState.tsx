import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getZSwapAndContractState } from '../hooks/wallet/services/contractCalls';

export function ZSwapStatePage() {
  const { isConnected, contractAddress } = useWalletStore();
  const [state, setState] = useState<{
    firstFree: bigint;
    totalSupply: bigint;
    totalBurned: bigint;
    burnedBalance: bigint;
    dustParams: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!contractAddress) {
        setLoading(false);
        return;
      }
      try {
        const result = await getZSwapAndContractState(contractAddress);
        if (!cancelled) {
          if (result) {
            setState(result);
            setError(null);
          } else {
            setError('Contract not yet indexed');
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [contractAddress]);

  if (!isConnected) {
    return (
      <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
        <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl p-8 text-center">
          <p className="text-[13px] text-text-muted">Connect your wallet to view ZSwap state.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">ZSwap + Contract State</h2>
              <p className="text-[12px] text-text-muted mt-0.5">Atomic query via queryZSwapAndContractState</p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
            >
              ← Back
            </Link>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* No Contract Warning */}
          {!contractAddress && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-amber-400 font-medium">No contract configured</p>
                <p className="text-[12px] text-amber-400/70">Deploy a contract to view its ZSwap state.</p>
                <Link
                  to="/deploy"
                  className="inline-block mt-1 text-[12px] text-amber-400 underline underline-offset-2 hover:text-amber-300"
                >
                  Go to Deploy →
                </Link>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="flex gap-3 p-4 bg-indigo-500/5 rounded-xl border-l-2 border-indigo-500/30">
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/80" />
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              This page calls <code className="text-indigo-300">queryZSwapAndContractState</code> to fetch the global Zswap chain state, contract ledger state, and ledger parameters in one atomic query.
            </p>
          </div>

          {loading && (
            <div className="flex items-center gap-3 p-4 bg-bg-tertiary/40 rounded-xl border border-border/80">
              <div className="w-5 h-5 border-2 border-border border-t-indigo-400 rounded-full animate-spin" />
              <p className="text-[13px] text-white/60">Loading on-chain data...</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {state && !loading && (
            <div className="space-y-3">
              <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">ZSwap firstFree</p>
                <p className="text-xl font-semibold text-white">{state.firstFree.toString()}</p>
                <p className="text-[11px] text-text-muted/40 mt-1">Next free index in the coin commitment tree</p>
              </div>

              <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Supply</p>
                <p className="text-xl font-semibold text-white">{state.totalSupply.toString()}</p>
              </div>

              <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Total Burned</p>
                <p className="text-xl font-semibold text-white">{state.totalBurned.toString()}</p>
              </div>

              <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Burned Balance</p>
                <p className="text-xl font-semibold text-white">{state.burnedBalance.toString()}</p>
              </div>

              <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">DUST Params</p>
                <p className="text-sm font-mono text-white/60">{JSON.stringify(state.dustParams, (_, v) => typeof v === 'bigint' ? v.toString() : v)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
