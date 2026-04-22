import { useState, useCallback } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { callRegister } from '../hooks/wallet/services/api';

export function RegisterPage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }

    const contractAddress = localStorage.getItem('membership_contract');
    if (!contractAddress) {
      setError('No contract. Join first.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('Registering...');
    setResult(null);

    try {
      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      await callRegister(
        connectedApi,
        shieldedAddresses.shieldedCoinPublicKey,
        shieldedAddresses.shieldedEncryptionPublicKey,
        contractAddress
      );
      setResult('Registered successfully!');
      setStatus(null);
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectedApi]);

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
      <h2 className="text-2xl font-semibold text-white mb-2">Register</h2>
      <p className="text-text-muted text-sm mb-6">Join the membership club.</p>

      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white mb-2">How it works</h3>
          <ul className="text-sm text-text-muted space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">1.</span>
              <span>Pay a one-time registration fee of <span className="text-white font-medium">1 NIGHT</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">2.</span>
              <span>Your identity stays private (only a hash is stored on-chain)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">3.</span>
              <span>Generate ZK proofs to prove membership without revealing who you are</span>
            </li>
          </ul>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Registration Fee</span>
            <span className="text-lg font-semibold text-white">1 NIGHT</span>
          </div>
        </div>
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

      {result ? (
        <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <p className="text-sm text-emerald-400">{result}</p>
          <p className="text-xs text-text-muted mt-1">You can now prove your eligibility.</p>
        </div>
      ) : (
        <Button onClick={handleRegister} disabled={loading}>
          {loading ? 'Processing...' : 'Pay 1 NIGHT to Register'}
        </Button>
      )}
    </div>
  );
}