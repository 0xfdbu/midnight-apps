import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getUserStablecoinBalance } from '../hooks/wallet/services/contractCalls';

export function WalletInfoPage() {
  const { connectedApi, addresses } = useWalletStore();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!connectedApi) return;
    
    const fetchBalance = async () => {
      const bal = await getUserStablecoinBalance(connectedApi);
      setBalance(bal);
    };
    
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [connectedApi]);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatBalance = (bal: bigint | null): string => {
    if (bal === null) return '—';
    return bal.toLocaleString();
  };

  const formatAddress = (addr: string): string => {
    if (!addr) return '—';
    return addr.length > 24 ? `${addr.slice(0, 12)}...${addr.slice(-12)}` : addr;
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Wallet Info</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Your stablecoin balance and address</p>
          </div>
          <Link 
            to="/" 
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="p-6 space-y-4">
          
          {/* Balance Display */}
          <div className="flex items-center justify-between p-4 bg-bg-tertiary/50 rounded-xl border border-border/40">
            <div>
              <span className="text-[12px] text-text-muted uppercase tracking-wider">Stablecoin Balance</span>
              <div className="text-[28px] font-bold text-white mt-1">{formatBalance(balance)}</div>
            </div>
            <div className="text-[16px] font-medium text-text-muted">USD</div>
          </div>

          {/* Unshielded Address */}
          <div className="space-y-2">
            <label className="text-[12px] text-text-muted uppercase tracking-wider">Unshielded Address</label>
            <div 
              className="flex items-center justify-between p-3 bg-bg-tertiary/50 rounded-xl border border-border/40 cursor-pointer hover:border-border-hover transition-colors group"
              onClick={() => addresses?.unshieldedAddress && handleCopy(addresses.unshieldedAddress, 'unshielded')}
            >
              <span className="text-[13px] font-mono text-white truncate flex-1">
                {addresses?.unshieldedAddress ? formatAddress(addresses.unshieldedAddress) : '—'}
              </span>
              <span className="ml-2 text-[12px] text-text-muted group-hover:text-white transition-colors">
                {copied === 'unshielded' ? '✓' : '⎘'}
              </span>
            </div>
          </div>

          {/* Shielded Address */}
          <div className="space-y-2">
            <label className="text-[12px] text-text-muted uppercase tracking-wider">Shielded Address</label>
            <div 
              className="flex items-center justify-between p-3 bg-bg-tertiary/50 rounded-xl border border-border/40 cursor-pointer hover:border-border-hover transition-colors group"
              onClick={() => addresses?.shieldedAddress && handleCopy(addresses.shieldedAddress, 'shielded')}
            >
              <span className="text-[13px] font-mono text-white truncate flex-1">
                {addresses?.shieldedAddress ? formatAddress(addresses.shieldedAddress) : '—'}
              </span>
              <span className="ml-2 text-[12px] text-text-muted group-hover:text-white transition-colors">
                {copied === 'shielded' ? '✓' : '⎘'}
              </span>
            </div>
          </div>

          {/* Contract Address */}
          <div className="space-y-2">
            <label className="text-[12px] text-text-muted uppercase tracking-wider">Contract Address</label>
            <div 
              className="flex items-center justify-between p-3 bg-bg-tertiary/50 rounded-xl border border-border/40 cursor-pointer hover:border-border-hover transition-colors group"
              onClick={() => handleCopy('db5d7cb3ed5ab23217abedb86831f6f5b23a9179e91e48dab88d819ef41b8e6d', 'contract')}
            >
              <span className="text-[13px] font-mono text-white truncate flex-1">
                db5d7cb3...6d
              </span>
              <span className="ml-2 text-[12px] text-text-muted group-hover:text-white transition-colors">
                {copied === 'contract' ? '✓' : '⎘'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}