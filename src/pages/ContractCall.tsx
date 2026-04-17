import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getContractState, decodeUserAddress } from '../hooks/wallet/services/contractCalls';
import { CONTRACT_ADDRESS } from '../hooks/wallet/wallet.constants';
import nightSvg from '../assets/night.svg?url';

function formatAddress(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

function formatAmount(value: bigint): string {
  return value.toLocaleString();
}

export function ContractCallPage() {
  const { connectedApi, mintToContract, isSubmitting, transactionHash, error, addresses } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const [totalBurned, setTotalBurned] = useState<bigint | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!connectedApi) return;

    const fetchState = async () => {
      setLoadingBalance(true);
      const state = await getContractState();
      setTotalSupply(state.totalSupply);
      setTotalBurned(state.totalBurned);
      setLoadingBalance(false);
    };

    fetchState();
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, [connectedApi]);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleMint = async () => {
    if (!amount || !addresses) return;
    
    const recipientBytes = await decodeUserAddress(addresses.unshieldedAddress, 'preprod');
    console.log('[ContractCall] Decoded recipient address, length:', recipientBytes.length);
    
    await mintToContract(
      BigInt(amount),
      recipientBytes
    );
  };

  const handleRefresh = async () => {
    setLoadingBalance(true);
    const state = await getContractState();
    setTotalSupply(state.totalSupply);
    setTotalBurned(state.totalBurned);
    setLoadingBalance(false);
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">

        {/* Accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border/60 flex items-center justify-center">
                <img src={nightSvg} alt="N" className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-white leading-tight">Stablecoin</h2>
                <p className="text-[12px] text-text-muted mt-0.5">Mint tokens to your wallet</p>
              </div>
            </div>
            <Link
              to="/"
              className="w-8 h-8 rounded-lg bg-bg-tertiary/60 border border-border/40 flex items-center justify-center text-text-muted hover:text-white hover:border-border-hover transition-all duration-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="h-px bg-border/40" />

        <div className="p-6 space-y-4">

          {/* Contract Address - Compact chip style */}
          <div className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary/40 rounded-lg border border-border/30 group cursor-pointer"
            onClick={() => handleCopy(CONTRACT_ADDRESS, 'contract')}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-text-muted/40 group-hover:bg-green-400/80 transition-colors" />
            <span className="text-[11px] text-text-muted font-mono tracking-wide">
              {formatAddress(CONTRACT_ADDRESS)}
            </span>
            <span className="ml-auto text-[10px] text-text-muted/40 group-hover:text-text-muted transition-colors">
              {copiedField === 'contract' ? '✓' : '⎘'}
            </span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Supply */}
            <div className="p-4 bg-bg-tertiary/50 rounded-xl border border-border/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-white/[0.02] to-transparent rounded-bl-full" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Supply</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                    disabled={loadingBalance || !connectedApi}
                    className="w-5 h-5 rounded flex items-center justify-center text-text-muted/50 hover:text-white disabled:opacity-30 transition-all hover:bg-white/5"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={loadingBalance ? 'animate-spin' : ''}
                    >
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-bold text-white tracking-tight leading-none">
                    {totalSupply !== null ? formatAmount(totalSupply).split(',')[0] : '—'}
                  </span>
                </div>
                {totalSupply !== null && formatAmount(totalSupply).includes(',') && (
                  <span className="text-[13px] text-text-muted font-medium">
                    ,{formatAmount(totalSupply).split(',').slice(1).join(',')}
                  </span>
                )}
              </div>
            </div>

            {/* Total Burned */}
            <div className="p-4 bg-bg-tertiary/50 rounded-xl border border-border/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-red-500/[0.015] to-transparent rounded-bl-full" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Burned</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/20" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-bold text-text-secondary tracking-tight leading-none">
                    {totalBurned !== null ? formatAmount(totalBurned).split(',')[0] : '—'}
                  </span>
                </div>
                {totalBurned !== null && formatAmount(totalBurned).includes(',') && (
                  <span className="text-[13px] text-text-muted/60 font-medium">
                    ,{formatAmount(totalBurned).split(',').slice(1).join(',')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Divider with label */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border/30" />
            <span className="text-[10px] text-text-muted/50 font-medium uppercase tracking-[0.15em]">Mint</span>
            <div className="flex-1 h-px bg-border/30" />
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-text-secondary">Amount</label>
              <span className="text-[11px] text-text-muted/40">6 decimals</span>
            </div>
            <div className="relative group">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-5 py-4 bg-bg-tertiary/70 border border-border/50 rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover/50 focus:bg-bg-tertiary outline-none text-[26px] font-semibold tracking-tight text-white placeholder:text-text-muted/20 transition-all duration-200 pr-20 tabular-nums"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <img src={nightSvg} alt="N" className="w-4.5 h-4.5 opacity-60" />
              </div>
            </div>
          </div>

          {/* Recipient - inline minimal style */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-tertiary/30 rounded-lg border border-border/20">
            <span className="text-[11px] text-text-muted/60">To</span>
            <span className="text-[11px] font-mono text-text-muted">
              {addresses?.unshieldedAddress 
                ? formatAddress(addresses.unshieldedAddress) 
                : 'Not connected'}
            </span>
            {addresses?.unshieldedAddress && (
              <button 
                onClick={() => handleCopy(addresses.unshieldedAddress, 'recipient')}
                className="ml-auto text-[10px] text-text-muted/30 hover:text-text-muted transition-colors"
              >
                {copiedField === 'recipient' ? '✓' : '⎘'}
              </button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-500/[0.06] border border-red-500/20 rounded-xl">
              <div className="w-4 h-4 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <span className="text-[13px] text-red-400/90 leading-relaxed">{error}</span>
            </div>
          )}

          {/* Success Display */}
          {transactionHash && (
            <div className="flex items-start gap-2.5 p-3.5 bg-green-500/[0.06] border border-green-500/20 rounded-xl">
              <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-text-muted/60 mb-0.5">Transaction submitted</div>
                <div
                  className="text-[13px] font-mono text-green-400/90 truncate cursor-pointer hover:text-green-300 transition-colors"
                  onClick={() => handleCopy(transactionHash, 'tx')}
                >
                  {formatAddress(transactionHash)}
                  <span className="ml-1.5 text-[10px] text-green-400/40">{copiedField === 'tx' ? '✓' : '⎘'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-1">
            <button
              onClick={handleMint}
              disabled={isSubmitting || !amount || !connectedApi || !addresses}
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 relative overflow-hidden group"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing…
                  </>
                ) : (
                  'Mint Stablecoin'
                )}
              </span>
            </button>
          </div>

          {/* Footer hint */}
          <p className="text-center text-[11px] text-text-muted/30 pt-0.5 pb-1">
            Tokens are minted on-chain to your address
          </p>

        </div>
      </div>
    </div>
  );
}