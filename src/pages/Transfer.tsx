import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import nightSvg from '../assets/night.svg?url';

// --- ICONS ---
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

// --- COMPONENT ---
export function TransferPage() {
  const { makeTransfer, isSubmitting, error } = useWalletStore();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);

  const handleTransfer = async () => {
    if (!recipient || !amount) return;
    await makeTransfer(recipient, BigInt(Number(amount) * 1_000_000));
    // Only mark as done if the store didn't throw an error
    if (!useWalletStore.getState().error) {
      setDone(true);
    }
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Send Transaction</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Transfer tokens to another address</p>
          </div>
          <Link 
            to="/" 
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="p-6 space-y-5">
          
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
                <p className="text-sm font-medium text-emerald-400">Transaction submitted!</p>
                <p className="text-[12px] text-emerald-400/70 mt-0.5">It may take a moment to finalize on the network.</p>
              </div>
            </div>
          )}

          {/* Form Inputs */}
          <div className="space-y-4">
            
            {/* Recipient Input - Data Style */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Recipient Address</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => { setRecipient(e.target.value); setDone(false); }}
                placeholder="addr1q..."
                disabled={done}
                className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none font-mono text-sm text-white placeholder:text-text-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Amount Input - Financial Style */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Amount</label>
              <div className="relative">
                <input
                  type="number"
                  step="any" // Allows decimals without weird browser snapping
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setDone(false); }}
                  placeholder="0.00"
                  disabled={done}
                  className="w-full px-4 py-4 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none text-[24px] font-semibold tracking-tight text-white placeholder:text-text-muted/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed pr-16"
                />
                {/* Suffix Label built directly into the input */}
                <div className="absolute right-0 top-0 bottom-0 flex items-center px-4 pointer-events-none">
                  <img src={nightSvg} alt="N" className="w-5 h-5" />
                </div>
              </div>
            </div>

          </div>

          {/* Submit Button */}
          <button
            onClick={handleTransfer}
            disabled={isSubmitting || !recipient || !amount || done}
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
              'Send Transaction'
            )}
          </button>
          
        </div>
      </div>
    </div>
  );
}