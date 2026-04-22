import { useState, useCallback } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { callProveEligibility } from '../hooks/wallet/services/api';

export function ProveEligibilityPage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);

  const handleProve = useCallback(async () => {
    if (!connectedApi || !addresses?.shieldedCoinPublicKey) {
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
    setStatus('Preparing transaction...');
    setResult(null);

    try {
      setStatus('Executing circuit + generating ZK proof...');
      
      const eligible = await callProveEligibility(
        connectedApi,
        addresses.shieldedCoinPublicKey,
        addresses.shieldedEncryptionPublicKey,
        contractAddress
      );

      setResult(eligible);
      setStatus(eligible ? 'Proof generated and verified!' : 'Not eligible');
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectedApi, addresses]);

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
      <h2 className="text-2xl font-semibold text-white mb-2">Prove Eligibility</h2>
      <p className="text-text-muted text-sm mb-6">
        Generate a ZK proof of membership on-chain.
      </p>

      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white mb-2">How it works</h3>
          <ul className="text-sm text-text-muted space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">1.</span>
              <span>Execute circuit locally - verify membership without revealing identity</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">2.</span>
              <span>Generate ZK proof - proof is verified by the blockchain</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">3.</span>
              <span>Submit transaction - nullifier inserted to prevent double-proving</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">4.</span>
              <span>Returns boolean result - eligible or not</span>
            </li>
          </ul>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Privacy</span>
            <span className="text-sm text-emerald-400">Zero Knowledge</span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Your identity is never revealed. Only a nullifier is inserted on-chain.
          </p>
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

      {result !== null && (
        <div className={`mb-4 px-4 py-3 border rounded-xl ${
          result 
            ? 'bg-emerald-500/10 border-emerald-500/25' 
            : 'bg-red-500/10 border-red-500/25'
        }`}>
          <p className={`text-lg font-semibold ${
            result ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {result ? '✓ Eligible' : '✗ Not Eligible'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {result 
              ? 'You have proven membership without revealing your identity.' 
              : 'You are not a registered member.'}
          </p>
        </div>
      )}

      <Button onClick={handleProve} disabled={loading}>
        {loading ? 'Generating Proof...' : 'Generate ZK Proof'}
      </Button>
    </div>
  );
}