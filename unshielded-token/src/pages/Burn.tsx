import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';

export function BurnPage() {
  const { burnFromContract, isSubmitting, transactionHash, error } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (transactionHash && !error) {
      setDone(true);
    }
  }, [transactionHash, error]);

  const handleBurn = async () => {
    if (!amount) return;
    await burnFromContract(BigInt(amount));
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
          <button
            onClick={handleBurn}
            disabled={!amount || isSubmitting}
            className="w-full py-3.5 bg-rose-500 hover:bg-rose-400 disabled:bg-bg-tertiary disabled:text-text-muted text-white font-medium rounded-xl transition-all active:scale-[0.98]"
          >
            {isSubmitting ? 'Burning...' : 'Burn Tokens'}
          </button>

          {/* Success */}
          {done && (
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
