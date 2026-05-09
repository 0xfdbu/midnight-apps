import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { callDepositAndBurn } from '../hooks/wallet/services/api';
import { hexToUint8Array } from '../lib/utils';
import { getStoredCoins, saveStoredCoins, type StoredCoin } from '../lib/coinStore';

function formatCoinLabel(coin: StoredCoin): string {
  const shortNonce = coin.nonce.slice(0, 8) + '…' + coin.nonce.slice(-8);
  return `Coin ${shortNonce} — Value: ${coin.value}`;
}

export function BurnPage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [selectedCoinId, setSelectedCoinId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storedCoins, setStoredCoins] = useState<StoredCoin[]>(() => getStoredCoins());
  const selectedCoin = useMemo(() => storedCoins.find((c) => c.id === selectedCoinId) || null, [storedCoins, selectedCoinId]);

  // Auto-fill amount to full coin value when selection changes
  useEffect(() => {
    if (selectedCoin) {
      setAmount(selectedCoin.value);
    } else {
      setAmount('');
    }
  }, [selectedCoin]);

  const handleBurn = async () => {
    if (!selectedCoin) {
      setError('Select a coin to burn');
      return;
    }
    if (!amount || parseInt(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (BigInt(amount) > BigInt(selectedCoin.value)) {
      setError(`Amount exceeds coin value (${selectedCoin.value})`);
      return;
    }
    if (!connectedApi || !addresses?.shieldedCoinPublicKey) {
      setError('Wallet not connected');
      return;
    }

    setStatus('pending');
    setError(null);

    try {
      const coin = {
        nonce: hexToUint8Array(selectedCoin.nonce),
        color: hexToUint8Array(selectedCoin.color),
        value: BigInt(selectedCoin.value),
      };

      const result = await callDepositAndBurn(
        connectedApi,
        addresses.shieldedCoinPublicKey,
        addresses.shieldedEncryptionPublicKey,
        coin,
        BigInt(amount)
      );

      const txId = result?.public?.txId || 'submitted';
      setTxHash(txId);

      // Remove the burned coin from storage. Any change stays in the
      // contract and is not returned to the wallet.
      let updatedCoins = getStoredCoins().filter((c) => c.id !== selectedCoin.id);
      saveStoredCoins(updatedCoins);
      setStoredCoins(updatedCoins);

      setStatus('success');
    } catch (err) {
      console.error('[Burn] Error:', err);
      setError(err instanceof Error ? err.message : 'Burn failed');
      setStatus('error');
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-white/30 text-[14px]">Connect your wallet to burn shielded tokens</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto pt-4 pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-[13px] text-white/30 hover:text-white/50 transition-colors">← Back</Link>
      </div>

      <div>
        <h1 className="text-[22px] font-semibold text-white tracking-tight">Burn Shielded Tokens</h1>
        <p className="text-[14px] text-white/30 mt-1">Permanently destroy shielded tokens</p>
      </div>

      <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-5">
        {storedCoins.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-[13px] text-white/30 mb-2">No stored coins found</p>
            <p className="text-[11px] text-white/20">Mint tokens first. Coin details are saved automatically after minting.</p>
            <Link to="/mint" className="inline-block mt-3 text-[12px] text-white/40 hover:text-white/60 transition-colors">Go to Mint →</Link>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Select Coin</label>
              <select
                value={selectedCoinId}
                onChange={(e) => { setSelectedCoinId(e.target.value); setError(null); setAmount(''); }}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
              >
                <option value="" className="bg-[#0a0a0a] text-white/50">Choose a coin...</option>
                {storedCoins.map((coin) => (
                  <option key={coin.id} value={coin.id} className="bg-[#0a0a0a] text-white">
                    {formatCoinLabel(coin)}
                  </option>
                ))}
              </select>
            </div>

            {selectedCoin && (
              <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Coin Details</p>
                <div className="grid grid-cols-1 gap-1 text-[11px] font-mono">
                  <div className="flex justify-between"><span className="text-white/20">Nonce</span> <span className="text-white/50">{selectedCoin.nonce}</span></div>
                  <div className="flex justify-between"><span className="text-white/20">Color</span> <span className="text-white/50">{selectedCoin.color}</span></div>
                  <div className="flex justify-between"><span className="text-white/20">Value</span> <span className="text-white/50">{selectedCoin.value}</span></div>
                  <div className="flex justify-between"><span className="text-white/20">Source</span> <span className="text-white/50 capitalize">{selectedCoin.source}</span></div>

                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Amount to Burn</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                placeholder={selectedCoin ? `Max: ${selectedCoin.value}` : 'Enter amount'}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
              />
              {selectedCoin && amount === selectedCoin.value && (
                <p className="mt-1.5 text-[10px] text-emerald-400/40">Full burn — entire coin will be destroyed</p>
              )}
              {selectedCoin && amount !== selectedCoin.value && amount !== '' && (
                <p className="mt-1.5 text-[10px] text-amber-400/40">Partial burn — change stays in the contract</p>
              )}
            </div>

            {error && (
              <p className="text-[12px] text-red-400/70">{error}</p>
            )}

            <button
              onClick={handleBurn}
              disabled={status === 'pending'}
              className="w-full py-3 bg-white/[0.04] hover:bg-red-500/[0.08] border border-white/[0.08] hover:border-red-500/[0.15] text-white/60 hover:text-red-400/80 disabled:opacity-30 disabled:cursor-not-allowed text-[13px] font-medium rounded-xl transition-all"
            >
              {status === 'pending' ? 'Burning...' : 'Burn Tokens'}
            </button>
          </>
        )}
      </div>

      {status === 'success' && txHash && (
        <div className="p-5 bg-emerald-500/[0.03] border border-emerald-500/[0.1] rounded-2xl space-y-2">
          <p className="text-[10px] uppercase tracking-[0.1em] text-emerald-400/40 font-medium">Transaction Submitted</p>
          <p className="text-[12px] font-mono text-white/40 break-all">{txHash}</p>
          <p className="text-[11px] text-white/20">Tokens burned. Any change remains in the contract. Use Send page to burn from wallet balance.</p>
        </div>
      )}

      <div className="p-5 bg-red-500/[0.03] border border-red-500/[0.08] rounded-2xl space-y-2">
        <p className="text-[10px] uppercase tracking-[0.1em] text-red-400/40 font-medium">Warning</p>
        <p className="text-[12px] text-red-400/60 leading-relaxed">
          Burning tokens is irreversible. Once sent to the shielded burn address, tokens cannot be recovered.
          The contract increments the public <code className="text-red-400/80">totalBurned</code> counter.
        </p>
      </div>

      <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <p className="text-[11px] text-white/20 leading-relaxed">
          <strong className="text-white/40">How it works:</strong> The contract receives your coin via <code className="text-white/40">receiveShielded</code> and burns it with <code className="text-white/40">sendImmediateShielded</code>. No <code className="text-white/40">mt_index</code> is required. Note: change from partial burns stays in the contract. To burn from wallet balance, use the Send page.
        </p>
      </div>
    </div>
  );
}
