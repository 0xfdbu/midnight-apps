import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';

export function BurnPage() {
  const { burnFromContract, isSubmitting, transactionHash, error, contractAddress } = useWalletStore();
  const [amount, setAmount] = useState('');

  useEffect(() => {
    useWalletStore.getState().setTransactionHash(null);
    useWalletStore.getState().setError(null);
  }, []);

  const [status, setStatus] = useState<string | null>(null);

  const handleBurn = async () => {
    if (!amount) return;
    setStatus('Burning tokens...');
    try {
      await burnFromContract(BigInt(amount));
    } finally {
      setStatus(null);
    }
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        
        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Burn Tokens</h2>
              <p className="text-[12px] text-text-muted mt-0.5">Burn stablecoins from your wallet</p>
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
                <p className="text-[12px] text-amber-400/70">Deploy a contract before you can burn tokens.</p>
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
          <div className="flex gap-3 p-4 bg-rose-500/5 rounded-xl border-l-2 border-rose-500/30">
            <div className="w-5 h-5 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400/80" />
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Burn stablecoins from your wallet. Tokens are sent to the contract and marked as burned.
            </p>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-[13px] text-text-muted mb-2">Amount</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl text-white placeholder-text-muted/40 focus:outline-none focus:border-border-hover"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-text-muted">
                USD
              </span>
            </div>
          </div>

          {/* Burn Button */}
          {isSubmitting && (
            <div className="flex items-center gap-3 p-4 bg-bg-tertiary/40 rounded-xl border border-border/80">
              <div className="w-5 h-5 border-2 border-border border-t-rose-400 rounded-full animate-spin" />
              <div>
                <p className="text-[13px] text-white/60">{status || 'Burning...'}</p>
              </div>
            </div>
          )}

          {!isSubmitting && (
            <button
              onClick={handleBurn}
              disabled={!amount || !contractAddress}
              className="w-full py-3.5 bg-rose-500 hover:bg-rose-400 disabled:bg-bg-tertiary disabled:text-text-muted text-white font-medium rounded-xl transition-all active:scale-[0.98]"
            >
              Burn Tokens
            </button>
          )}

          {/* Success */}
          {transactionHash && !error && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
              </div>
              <p className="text-sm text-emerald-400">Burn successful! Tx: {transactionHash}</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
