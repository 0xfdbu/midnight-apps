import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';

export function ReceivePage() {
  const { connectedApi, isSubmitting, transactionHash, error } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (transactionHash && !error) {
      setDone(true);
    }
  }, [transactionHash, error]);

  const handleReceive = async () => {
    if (!amount || !connectedApi) return;
    
    const store = useWalletStore.getState();
    const shieldedAddresses = await connectedApi.getShieldedAddresses();
    const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

    await store.receiveTokens(
      connectedApi,
      coinPublicKey,
      shieldedAddresses,
      BigInt(amount),
      (txId: string) => {
        useWalletStore.getState().setTransactionHash(txId);
        useWalletStore.getState().loadWalletState();
      },
      (errMsg: string) => {
        useWalletStore.getState().setError(errMsg);
      }
    );
  };

  const handleReset = () => {
    setAmount('');
    setDone(false);
    useWalletStore.getState().setTransactionHash(null);
    useWalletStore.getState().setError(null);
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Receive Tokens</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Deposit tokens into contract</p>
          </div>
          <Link 
            to="/" 
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="p-6 space-y-5">
          
          {/* Info Box */}
          <div className="flex gap-3 p-4 bg-cyan-500/5 rounded-xl border-l-2 border-cyan-500/30">
            <div className="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Deposit tokens into the contract. This makes them available for the contract to send on your behalf.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Display */}
          {done && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-400">Transaction submitted!</p>
                <p className="text-[12px] text-emerald-400/70 mt-0.5">Tokens deposited successfully.</p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Amount</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setDone(false); }}
                placeholder="0.00"
                disabled={done}
                className="w-full px-4 py-4 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none text-[24px] font-semibold tracking-tight text-white placeholder:text-text-muted/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed pr-16"
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center px-4 pointer-events-none">
                <span className="text-[14px] font-bold text-text-muted">USD</span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          {done ? (
            <button
              onClick={handleReset}
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 flex items-center justify-center gap-2 mt-2"
            >
              Deposit More
            </button>
          ) : (
            <button
              onClick={handleReceive}
              disabled={isSubmitting || !amount}
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : (
                'Deposit Tokens'
              )}
            </button>
          )}
          
        </div>
      </div>
    </div>
  );
}