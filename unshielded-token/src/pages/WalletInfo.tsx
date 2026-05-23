import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getUserTokenBalance, getContractFirstTokenBalance } from '../hooks/wallet/services/contractCalls';

function formatTokenId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

export function WalletInfoPage() {
  const { connectedApi, addresses, selectedTokenId, contractAddress } = useWalletStore();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [contractTokenId, setContractTokenId] = useState<string | null>(null);

  useEffect(() => {
    if (!contractAddress) {
      setContractTokenId(null);
      return;
    }
    getContractFirstTokenBalance(contractAddress).then((result) => {
      setContractTokenId(result?.tokenId ?? null);
    });
  }, [contractAddress]);

  useEffect(() => {
    if (!connectedApi) return;
    
    const fetchBalance = async () => {
      if (!selectedTokenId) {
        setBalance(null);
        return;
      }
      const bal = await getUserTokenBalance(connectedApi, selectedTokenId);
      setBalance(bal);
    };
    
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [connectedApi, selectedTokenId]);

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
          <div className="p-4 bg-bg-tertiary/50 rounded-xl border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-text-muted uppercase tracking-wider">Token Balance</span>
              <span className="text-[16px] font-medium text-text-muted">USD</span>
            </div>

            {!contractAddress && (
              <div className="space-y-1">
                <p className="text-[13px] text-text-muted">No contract configured.</p>
                <Link
                  to="/deploy"
                  className="inline-block text-[12px] text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Deploy a contract first →
                </Link>
              </div>
            )}

            {contractAddress && !contractTokenId && (
              <div className="space-y-1">
                <p className="text-[13px] text-text-muted">No tokens in contract.</p>
                <Link
                  to="/mint"
                  className="inline-block text-[12px] text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Mint tokens first →
                </Link>
              </div>
            )}

            {contractAddress && contractTokenId && (
              <>
                <div className="text-[28px] font-bold text-white">{formatBalance(balance)}</div>
                <p className="text-[10px] font-mono text-text-muted/60">{formatTokenId(contractTokenId)}</p>
              </>
            )}
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


        </div>
      </div>
    </div>
  );
}