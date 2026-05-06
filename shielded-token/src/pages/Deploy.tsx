import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { deployTokenContract } from '../hooks/wallet/services/api';

export function DeployPage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!connectedApi || !addresses?.shieldedCoinPublicKey || !addresses?.shieldedEncryptionPublicKey) {
      setError('Wallet not fully connected');
      return;
    }
    setStatus('pending');
    setError(null);

    try {
      const addr = await deployTokenContract(
        connectedApi,
        addresses.shieldedCoinPublicKey,
        addresses.shieldedEncryptionPublicKey
      );
      setContractAddress(addr);
      setStatus('success');
    } catch (err) {
      console.error('[Deploy] Error:', err);
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setStatus('error');
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-white/30 text-[14px]">Connect your wallet to deploy the shielded token contract</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto pt-4 pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-[13px] text-white/30 hover:text-white/50 transition-colors">← Back</Link>
      </div>

      <div>
        <h1 className="text-[22px] font-semibold text-white tracking-tight">Deploy Contract</h1>
        <p className="text-[14px] text-white/30 mt-1">Deploy the shielded token smart contract to the network</p>
      </div>

      <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-5">
        <p className="text-[13px] text-white/25 leading-relaxed">
          Deploying creates a new instance of the shielded token contract on the Midnight Network. 
          Once deployed, the contract address is stored locally and used for all subsequent operations.
        </p>

        {error && (
          <div className="px-4 py-3 bg-red-500/[0.05] border border-red-500/[0.1] rounded-xl">
            <p className="text-[12px] text-red-400/70">{error}</p>
          </div>
        )}

        <button
          onClick={handleDeploy}
          disabled={status === 'pending'}
          className="w-full py-3 bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
        >
          {status === 'pending' ? 'Deploying...' : 'Deploy Contract'}
        </button>
      </div>

      {status === 'success' && contractAddress && (
        <div className="p-5 bg-emerald-500/[0.03] border border-emerald-500/[0.1] rounded-2xl space-y-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-emerald-400/40 font-medium">Contract Deployed</p>
          <p className="text-[12px] font-mono text-white/40 break-all">{contractAddress}</p>
          <p className="text-[11px] text-white/20">
            The contract address has been saved. You can now mint, send, and burn shielded tokens.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[12px] text-white/60 hover:text-white/80 transition-all"
          >
            Go to Dashboard
          </Link>
        </div>
      )}

      <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <p className="text-[11px] text-white/20 leading-relaxed">
          <strong className="text-white/40">Note:</strong> Deployment requires a small amount of NIGHT tokens for transaction fees. 
          The contract initializes with <code className="text-white/40">totalSupply = 0</code> and <code className="text-white/40">totalBurned = 0</code>. 
          There is no constructor — the contract is ready for use immediately.
        </p>
      </div>
    </div>
  );
}
