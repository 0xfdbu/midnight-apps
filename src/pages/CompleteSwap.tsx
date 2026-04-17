import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CompleteSwapPage() {
  const { completeSwap, isSubmitting, error } = useWalletStore();
  const [sealedTx, setSealedTx] = useState('');
  const [done, setDone] = useState(false);

  const handleCompleteSwap = async () => {
    if (!sealedTx) return;
    await completeSwap(sealedTx);
    if (!useWalletStore.getState().error) {
      setDone(true);
    }
  };

  const handleClear = () => {
    setSealedTx('');
    setDone(false);
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Complete Swap</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Submit a sealed transaction to finalize a swap</p>
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
          <div className="flex gap-3 p-4 bg-bg-tertiary/50 rounded-xl border-l-2 border-border-hover">
            <InfoIcon className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-text-secondary mb-1">Complete a Swap</p>
              <p className="text-[13px] text-text-muted leading-relaxed">
                Paste the sealed transaction hex from the other party to balance and submit the swap.
              </p>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {done && !error && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Swap completed!</p>
                <p className="text-[12px] text-emerald-400/70 mt-0.5">The transaction has been submitted to the network.</p>
              </div>
            </div>
          )}

          {/* Input Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-secondary">Sealed Transaction</label>
              {sealedTx && (
                <button 
                  onClick={handleClear}
                  className="flex items-center gap-1 text-[12px] text-text-muted hover:text-white transition-colors"
                >
                  <XIcon className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            
            <div className="relative group">
              <textarea
                value={sealedTx}
                onChange={(e) => { setDone(false); setSealedTx(e.target.value); }}
                placeholder="Paste sealed transaction hex from the other party..."
                rows={5}
                disabled={done}
                className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none resize-none font-mono text-sm text-white placeholder:text-text-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleCompleteSwap}
            disabled={isSubmitting || !sealedTx || done}
            className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Processing...
              </>
            ) : done ? (
              'Done'
            ) : (
              'Complete Swap'
            )}
          </button>
          
        </div>
      </div>
    </div>
  );
}