import { useState, useEffect } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { getContractState } from '../hooks/wallet/services/api';

export function DashboardPage() {
  const { isConnected } = useWalletStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractState, setContractState] = useState<{ memberState: string; memberCount: bigint } | null>(null);

  useEffect(() => {
    if (!isConnected) return;

    const loadState = async () => {
      setLoading(true);
      try {
        const contractAddress = localStorage.getItem('membership_contract') || undefined;
        const state = await getContractState(contractAddress);
        setContractState(state);
      } catch (err) {
        console.error('Dashboard error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load state');
      } finally {
        setLoading(false);
      }
    };

    loadState();
  }, [isConnected]);

  if (!isConnected) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Connect Wallet</h2>
          <p className="text-text-muted text-sm">Connect your wallet first.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-2">Dashboard</h2>
      <p className="text-text-muted text-sm mb-6">Contract state overview.</p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {contractState && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-6">
            <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Member State</p>
            <p className={`text-xl font-semibold ${
              contractState.memberState === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {contractState.memberState}
            </p>
          </div>
          <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-6">
            <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">Member Count</p>
            <p className="text-xl font-semibold text-white">
              {contractState.memberCount.toString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}