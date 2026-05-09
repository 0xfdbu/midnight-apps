import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { callCreateShieldedToken, callMintAndSend } from '../hooks/wallet/services/api';
import { parseKeyBytes, parseShieldedAddress, ZERO_BYTES32 } from '../lib/utils';
import { addStoredCoin, coinFromShieldedCoinInfo, getStoredCoins } from '../lib/coinStore';

export function MintPage() {
  const { isConnected, connectedApi, addresses } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'mint' | 'mintAndSend'>('mint');
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [mintedCoin, setMintedCoin] = useState<{ nonce: string; color: string; value: string } | null>(null);
  const [changeCoin, setChangeCoin] = useState<{ nonce: string; color: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    if (!amount || parseInt(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!connectedApi || !addresses?.shieldedCoinPublicKey) {
      setError('Wallet not connected');
      return;
    }

    setStatus('pending');
    setError(null);
    setMintedCoin(null);
    setChangeCoin(null);

    try {
      const value = BigInt(amount);
      const selfRecipient = {
        is_left: true,
        left: { bytes: parseKeyBytes(addresses.shieldedCoinPublicKey) },
        right: { bytes: ZERO_BYTES32 },
      };

      let result: any;
      if (mode === 'mintAndSend' && recipient.trim()) {
        const recipientBytes = parseShieldedAddress(recipient);
        const recipientEither = {
          is_left: true,
          left: { bytes: recipientBytes },
          right: { bytes: ZERO_BYTES32 },
        };
        result = await callMintAndSend(
          connectedApi,
          addresses.shieldedCoinPublicKey,
          addresses.shieldedEncryptionPublicKey,
          value,
          recipientEither
        );

        const txId = result?.public?.txId || 'submitted';
        setTxHash(txId);

        // Store the sent coin
        if (result?.private?.result?.sent) {
          const sent = result.private.result.sent;
          const coin = coinFromShieldedCoinInfo(sent, 'mintAndSend', txId);
          addStoredCoin(coin);
          setMintedCoin({ nonce: coin.nonce.slice(0, 16) + '…', color: coin.color.slice(0, 16) + '…', value: coin.value });
        }
        // Store change if present
        if (result?.private?.result?.change?.is_some && result?.private?.result?.change?.value) {
          const ch = result.private.result.change.value;
          const coin = coinFromShieldedCoinInfo(ch, 'change', txId);
          addStoredCoin(coin);
          setChangeCoin({ nonce: coin.nonce.slice(0, 16) + '…', color: coin.color.slice(0, 16) + '…', value: coin.value });
        }
      } else {
        result = await callCreateShieldedToken(
          connectedApi,
          addresses.shieldedCoinPublicKey,
          addresses.shieldedEncryptionPublicKey,
          value,
          selfRecipient
        );

        const txId = result?.public?.txId || 'submitted';
        setTxHash(txId);

        // Store the minted coin
        if (result?.private?.result) {
          const coin = coinFromShieldedCoinInfo(result.private.result, 'mint', txId);
          addStoredCoin(coin);
          setMintedCoin({ nonce: coin.nonce.slice(0, 16) + '…', color: coin.color.slice(0, 16) + '…', value: coin.value });
        }
      }

      setStatus('success');
    } catch (err) {
      console.error('[Mint] Error:', err);
      setError(err instanceof Error ? err.message : 'Mint failed');
      setStatus('error');
    }
  };

  const storedCount = getStoredCoins().length;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-white/30 text-[14px]">Connect your wallet to mint shielded tokens</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto pt-4 pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-[13px] text-white/30 hover:text-white/50 transition-colors">← Back</Link>
      </div>

      <div>
        <h1 className="text-[22px] font-semibold text-white tracking-tight">Mint Shielded Tokens</h1>
        <p className="text-[14px] text-white/30 mt-1">Create new shielded tokens with zero-knowledge proofs</p>
      </div>

      <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-5">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('mint')}
              className={`flex-1 py-2.5 text-[12px] font-medium rounded-xl transition-all border ${mode === 'mint' ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:border-white/15'}`}
            >
              Mint to Self
            </button>
            <button
              onClick={() => setMode('mintAndSend')}
              className={`flex-1 py-2.5 text-[12px] font-medium rounded-xl transition-all border ${mode === 'mintAndSend' ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:border-white/15'}`}
            >
              Mint & Send
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Amount</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(null); }}
            placeholder="Enter amount to mint"
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
          />
        </div>

        {mode === 'mintAndSend' && (
          <div>
            <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Recipient Shielded Address</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setError(null); }}
              placeholder="Paste recipient shielded address (e.g. m1q...)"
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
            />
            <p className="text-[11px] text-white/15 mt-1.5">The recipient's shielded address from their wallet (Bech32m format)</p>
          </div>
        )}

        {error && (
          <p className="text-[12px] text-red-400/70">{error}</p>
        )}

        <button
          onClick={handleMint}
          disabled={status === 'pending'}
          className="w-full py-3 bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
        >
          {status === 'pending' ? (mode === 'mintAndSend' ? 'Minting & Sending...' : 'Minting...') : (mode === 'mintAndSend' ? 'Mint & Send' : 'Mint Tokens')}
        </button>
      </div>

      {status === 'success' && txHash && (
        <div className="p-5 bg-emerald-500/[0.03] border border-emerald-500/[0.1] rounded-2xl space-y-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-emerald-400/40 font-medium">Transaction Submitted</p>
          <p className="text-[12px] font-mono text-white/40 break-all">{txHash}</p>

          {mintedCoin && (
            <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-1">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">
                {mode === 'mintAndSend' ? 'Sent Coin' : 'Minted Coin'}
              </p>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div><span className="text-white/20">Nonce</span> <span className="text-white/50">{mintedCoin.nonce}</span></div>
                <div><span className="text-white/20">Color</span> <span className="text-white/50">{mintedCoin.color}</span></div>
                <div><span className="text-white/20">Value</span> <span className="text-white/50">{mintedCoin.value}</span></div>
              </div>
            </div>
          )}

          {changeCoin && (
            <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-1">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Change Returned</p>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div><span className="text-white/20">Nonce</span> <span className="text-white/50">{changeCoin.nonce}</span></div>
                <div><span className="text-white/20">Color</span> <span className="text-white/50">{changeCoin.color}</span></div>
                <div><span className="text-white/20">Value</span> <span className="text-white/50">{changeCoin.value}</span></div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-white/20">
            {mode === 'mintAndSend'
              ? 'Tokens minted and sent atomically in a single transaction. Coin details saved locally for future burns.'
              : 'Your shielded tokens will be available once the transaction is confirmed. Coin details saved locally for future burns.'}
          </p>
        </div>
      )}

      {storedCount > 0 && (
        <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl flex items-center justify-between">
          <p className="text-[12px] text-white/30">
            <span className="text-white/50 font-medium">{storedCount}</span> coin{storedCount !== 1 ? 's' : ''} stored locally
          </p>
          <Link to="/burn" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">Burn →</Link>
        </div>
      )}

      <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <p className="text-[11px] text-white/20 leading-relaxed">
          <strong className="text-white/40">How it works:</strong> The mint circuit creates a new shielded coin with a unique nonce derived via <code className="text-white/40">evolveNonce</code>. 
          The coin commitment is added to the ledger Merkle tree. Freshly minted coins must be committed on-chain before they can be independently spent via <code className="text-white/40">transferShielded</code>.
          The <strong className="text-white/40">mint & send</strong> mode uses <code className="text-white/40">sendImmediateShielded</code> to forward the freshly minted coin atomically — no Merkle qualification needed.
        </p>
      </div>
    </div>
  );
}
