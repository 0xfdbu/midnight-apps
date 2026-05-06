import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { callBurnShieldedToken } from '../hooks/wallet/services/api';
import { hexToUint8Array, uint8ArrayToHex } from '../lib/utils';
import { getStoredCoins, removeStoredCoin, type StoredCoin } from '../lib/coinStore';

function formatCoinLabel(coin: StoredCoin): string {
  const shortNonce = coin.nonce.slice(0, 8) + '…' + coin.nonce.slice(-8);
  const mtHint = coin.mt_index ? ` (mt=${coin.mt_index})` : '';
  return `Coin ${shortNonce} — Value: ${coin.value}${mtHint}`;
}

export function BurnPage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [selectedCoinId, setSelectedCoinId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [mtIndex, setMtIndex] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [changeCoin, setChangeCoin] = useState<StoredCoin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coins = useMemo(() => getStoredCoins(), []);
  const selectedCoin = useMemo(() => coins.find((c) => c.id === selectedCoinId) || null, [coins, selectedCoinId]);

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
    if (!mtIndex || parseInt(mtIndex) < 0) {
      setError('Enter the coin\'s Merkle tree index (required for spending committed coins)');
      return;
    }
    if (!connectedApi || !addresses?.shieldedCoinPublicKey) {
      setError('Wallet not connected');
      return;
    }

    setStatus('pending');
    setError(null);
    setChangeCoin(null);

    try {
      const coin = {
        nonce: hexToUint8Array(selectedCoin.nonce),
        color: hexToUint8Array(selectedCoin.color),
        value: BigInt(selectedCoin.value),
        mt_index: BigInt(mtIndex),
      };

      const result = await callBurnShieldedToken(
        connectedApi,
        addresses.shieldedCoinPublicKey,
        addresses.shieldedEncryptionPublicKey,
        coin,
        BigInt(amount)
      );

      const txId = result?.public?.txId || 'submitted';
      setTxHash(txId);

      // If the full coin was burned, remove it from storage
      if (BigInt(amount) >= BigInt(selectedCoin.value)) {
        removeStoredCoin(selectedCoin.id);
      }

      // Capture change if returned
      if (result?.private?.result?.change?.is_some && result?.private?.result?.change?.value) {
        const ch = result.private.result.change.value;
        const change: StoredCoin = {
          id: uint8ArrayToHex(ch.nonce),
          nonce: uint8ArrayToHex(ch.nonce),
          color: uint8ArrayToHex(ch.color),
          value: ch.value.toString(),
          source: 'change',
          txId,
          createdAt: new Date().toISOString(),
        };
        const stored = getStoredCoins().filter((c) => c.id !== change.id);
        stored.push(change);
        import('../lib/coinStore').then(({ saveStoredCoins }) => saveStoredCoins(stored));
        setChangeCoin(change);
      }

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
        {coins.length === 0 ? (
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
                onChange={(e) => { setSelectedCoinId(e.target.value); setError(null); }}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
              >
                <option value="" className="bg-[#0a0a0a] text-white/50">Choose a coin...</option>
                {coins.map((coin) => (
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
                  {selectedCoin.mt_index && (
                    <div className="flex justify-between"><span className="text-white/20">Merkle Index</span> <span className="text-white/50">{selectedCoin.mt_index}</span></div>
                  )}
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
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Merkle Index</label>
                {selectedCoin?.mt_index && (
                  <button
                    onClick={() => setMtIndex(selectedCoin.mt_index!)}
                    className="text-[10px] text-emerald-400/60 hover:text-emerald-400/90 transition-colors"
                  >
                    Auto-fill from stored coin
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                value={mtIndex}
                onChange={(e) => { setMtIndex(e.target.value); setError(null); }}
                placeholder="Enter Merkle tree index (e.g. 1, 2, 3...)"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
              />
              <p className="text-[11px] text-white/15 mt-1.5">
                Every committed shielded coin has a Merkle tree index. Required because <code className="text-white/30">sendShielded</code> needs to prove the coin exists on-chain. Index 0 is invalid.
              </p>
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
          {changeCoin && (
            <p className="text-[11px] text-white/20">
              Change of <span className="text-white/40">{changeCoin.value}</span> returned as a new shielded coin.
            </p>
          )}
          {!changeCoin && (
            <p className="text-[11px] text-white/20">Tokens have been sent to the burn address and are permanently removed from circulation.</p>
          )}
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
          <strong className="text-white/40">How it works:</strong> The <code className="text-white/40">burnShieldedToken</code> circuit calls <code className="text-white/40">sendShielded</code> with the burn address as recipient. 
          Because the coin is already committed on-chain, the circuit needs <code className="text-white/40">QualifiedShieldedCoinInfo</code> (including <code className="text-white/40">mt_index</code>) to prove Merkle tree inclusion. 
          Change, if any, is returned via <code className="text-white/40">ShieldedSendResult.change</code>.
        </p>
      </div>
    </div>
  );
}
