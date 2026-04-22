import { useState, useCallback } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';

const ANALYTICS_API = 'http://localhost:3001';

export function JoinPage() {
  const { isConnected } = useWalletStore();
  const [contractAddress, setContractAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const handleJoin = useCallback(async () => {
    const address = contractAddress.trim();
    if (!address) {
      setError('Please enter a contract address');
      return;
    }

    if (!isConnected) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setStatus('Setting up tracking...');

      const trackRes = await fetch(`${ANALYTICS_API}/track/${address}`, { method: 'POST' });
      const data = await trackRes.json();
      if (!trackRes.ok) {
        throw new Error(data.error || 'Failed to track contract');
      }

      localStorage.setItem('membership_contract', address);
      setJoined(true);
      setStatus('Connected to contract!');
    } catch (err) {
      console.error('Join error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to contract');
    } finally {
      setLoading(false);
    }
  }, [contractAddress, isConnected]);

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

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-2">Join / Connect</h2>
      <p className="text-text-muted text-sm mb-6">Connect to an existing membership contract.</p>

      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-6 mb-6">
        <label className="block text-sm text-text-muted mb-2">
          Contract Address
        </label>
        <input
          type="text"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          placeholder="Enter contract address..."
          className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl text-white font-mono text-sm"
        />
      </div>

      {status && (
        <div className="mb-4 px-4 py-3 bg-blue-500/10 border border-blue-500/25 rounded-xl">
          <p className="text-sm text-blue-400">{status}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {joined ? (
        <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <p className="text-sm text-emerald-400">Connected successfully!</p>
        </div>
      ) : (
        <Button onClick={handleJoin} disabled={loading}>
          {loading ? 'Connecting...' : 'Connect'}
        </Button>
      )}
    </div>
  );
}