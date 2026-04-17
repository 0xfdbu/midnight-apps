import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import nightSvg from '../assets/night.svg?url';

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

const NIGHT_TOKEN = '0000000000000000000000000000000000000000000000000000000000000000';
const STABLECOIN_TOKEN = '737461626c65636f696e3a7573640000000000000000000000000000000000';

export function SwapPage() {
  const { connectedApi, isSubmitting, error } = useWalletStore();
  const [offerAmount, setOfferAmount] = useState('');
  const [wantAmount, setWantAmount] = useState('');
  const [sealedTx, setSealedTx] = useState('');
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleCreateIntent = async () => {
    if (!connectedApi || !offerAmount || !wantAmount) return;

    setLocalError('');

    try {
      const status = await connectedApi.getConnectionStatus();
      if (status.status === 'disconnected') {
        throw new Error('Wallet disconnected. Please reconnect.');
      }

      const offerValue = BigInt(Math.floor(Number(offerAmount) * 1_000_000));
      const wantValue = BigInt(Math.floor(Number(wantAmount) * 1_000_000));

      const { shieldedAddress } = await connectedApi.getShieldedAddresses();

      const result = await connectedApi.makeIntent(
        [{ kind: 'unshielded', type: NIGHT_TOKEN, value: offerValue }],
        [{ kind: 'shielded', type: STABLECOIN_TOKEN, value: wantValue, recipient: shieldedAddress }],
        { intentId: 'random', payFees: true }
      );

      setSealedTx(result.tx);
      setDone(true);
    } catch (err: any) {
      console.error('Make intent error:', err);
      setLocalError(err.message ?? 'Failed to create intent');
    }
  };

  const handleCopyTx = () => {
    navigator.clipboard.writeText(sealedTx);
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Create Swap</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Create an atomic swap intent</p>
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
              <p className="text-sm font-medium text-text-secondary mb-1">Atomic Swap</p>
              <p className="text-[13px] text-text-muted leading-relaxed">
                Create a swap intent. Share the sealed transaction with another party to complete the trade.
              </p>
            </div>
          </div>

          {/* Status Messages */}
          {(error || localError) && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{localError || error}</p>
            </div>
          )}

          {done && !error && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Intent created!</p>
                <p className="text-[12px] text-emerald-400/70 mt-0.5">Copy the sealed transaction below to share with the other party.</p>
              </div>
            </div>
          )}

          {/* Result: Sealed Transaction */}
          {sealedTx && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">Sealed Transaction (send to other party)</label>
                <button 
                  onClick={handleCopyTx}
                  className="text-[12px] text-text-muted hover:text-white transition-colors"
                >
                  Copy
                </button>
              </div>
              <textarea
                value={sealedTx}
                readOnly
                rows={4}
                className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl font-mono text-xs text-text-secondary resize-none"
              />
            </div>
          )}

          {/* Form Inputs (only show if not done) */}
          {!done && (
            <div className="space-y-4">
              
              {/* Offer Amount */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">You Offer (NIGHT)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-4 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none text-[24px] font-semibold tracking-tight text-white placeholder:text-text-muted/30 transition-all pr-16"
                  />
                  <div className="absolute right-0 top-0 bottom-0 flex items-center px-4 pointer-events-none">
                    <img src={nightSvg} alt="N" className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Want Amount */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">You Want (STABLECOIN)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={wantAmount}
                    onChange={(e) => setWantAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-4 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none text-[24px] font-semibold tracking-tight text-white placeholder:text-text-muted/30 transition-all pr-16"
                  />
                  <div className="absolute right-0 top-0 bottom-0 flex items-center px-4 pointer-events-none">
                    <span className="text-[12px] font-bold text-text-muted">USD</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Submit Button */}
          {!done ? (
            <button
              onClick={handleCreateIntent}
              disabled={isSubmitting || !offerAmount || !wantAmount}
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Swap Intent'
              )}
            </button>
          ) : (
            <Link
              to="/complete-swap"
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 flex items-center justify-center gap-2 mt-2"
            >
              Go to Complete Swap →
            </Link>
          )}
          
        </div>
      </div>
    </div>
  );
}