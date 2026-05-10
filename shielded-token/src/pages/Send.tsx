import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getStoredCoins } from '../lib/coinStore';

interface TokenOption {
  color: string;
  balance: bigint;
  source: 'balance' | 'stored';
}

export function SendPage() {
  const { isConnected, connectedApi, balances } = useWalletStore();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build list of available token types from wallet balances + stored coins
  const tokenOptions: TokenOption[] = useMemo(() => {
    const map = new Map<string, TokenOption>();

    if (balances?.shielded) {
      for (const [color, balance] of Object.entries(balances.shielded)) {
        map.set(color, { color, balance: balance as bigint, source: 'balance' });
      }
    }

    const stored = getStoredCoins();
    for (const coin of stored) {
      if (!map.has(coin.color)) {
        map.set(coin.color, { color: coin.color, balance: BigInt(coin.value), source: 'stored' });
      }
    }

    return Array.from(map.values());
  }, [balances]);

  // Auto-select first token if none selected and options exist
  useEffect(() => {
    if (!selectedToken && tokenOptions.length > 0) {
      setSelectedToken(tokenOptions[0].color);
    }
  }, [tokenOptions, selectedToken]);

  const selectedTokenBalance = useMemo(() => {
    return tokenOptions.find((t) => t.color === selectedToken)?.balance ?? 0n;
  }, [tokenOptions, selectedToken]);

  const handleSend = async () => {
    if (!recipient.trim()) {
      setError('Enter a recipient shielded address');
      return;
    }
    if (!amount || parseInt(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }
    if (!selectedToken) {
      setError('Select a token type to send');
      return;
    }

    setStatus('pending');
    setError(null);

    try {
      const value = BigInt(amount);
      const recipientClean = recipient.trim();

      const desiredOutput = { kind: 'shielded' as const, type: selectedToken, value, recipient: recipientClean };
      console.log('[Send] desiredOutput:', JSON.stringify(desiredOutput, (_, v) => typeof v === 'bigint' ? v.toString() : v));

      const result: any = await connectedApi.makeTransfer([desiredOutput]);
      console.log('[Send] makeTransfer result:', result);

      // Shielded makeTransfer auto-submits and returns { tx_id }. Unshielded returns { tx }.
      const txId = result?.tx_id;
      if (txId) {
        setTxHash(txId);
        setStatus('success');
        return;
      }

      const txToSubmit = result?.tx;
      if (txToSubmit) {
        await connectedApi.submitTransaction(txToSubmit);
        setTxHash('transfer-success');
        setStatus('success');
        return;
      }

      throw new Error('makeTransfer returned no transaction identifier');
    } catch (err) {
      console.error('[Send] Error:', err);
      setError(err instanceof Error ? err.message : 'Send failed');
      setStatus('error');
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-white/30 text-[14px]">Connect your wallet to send shielded tokens</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto pt-4 pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-[13px] text-white/30 hover:text-white/50 transition-colors">← Back</Link>
      </div>

      <div>
        <h1 className="text-[22px] font-semibold text-white tracking-tight">Send Shielded Tokens</h1>
        <p className="text-[14px] text-white/30 mt-1">Transfer tokens privately to another shielded address</p>
      </div>

      <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-5">
        {/* Token Selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Token</label>
          {tokenOptions.length === 0 ? (
            <p className="text-[13px] text-white/20">No tokens found. Mint tokens first or wait for balance sync.</p>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedToken}
                onChange={(e) => { setSelectedToken(e.target.value); setError(null); }}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
              >
                {tokenOptions.map((token) => (
                  <option key={token.color} value={token.color} className="bg-[#0a0a0a] text-white">
                    {token.color.slice(0, 16)}…{token.color.slice(-16)} — {token.balance.toString()} ({token.source})
                  </option>
                ))}
              </select>
              {selectedToken && (
                <p className="text-[11px] text-white/20 font-mono">
                  Balance: <span className="text-white/40">{selectedTokenBalance.toString()}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Recipient Shielded Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => { setRecipient(e.target.value); setError(null); }}
            placeholder="Paste recipient shielded address (Bech32m)"
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
          />
          <p className="text-[11px] text-white/15 mt-1.5">The recipient's shielded address, not the raw coin public key.</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Amount</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(null); }}
            placeholder={selectedToken ? `Max: ${selectedTokenBalance.toString()}` : 'Enter amount to send'}
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
          />
        </div>

        {error && (
          <p className="text-[12px] text-red-400/70">{error}</p>
        )}

        <button
          onClick={handleSend}
          disabled={status === 'pending' || tokenOptions.length === 0}
          className="w-full py-3 bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
        >
          {status === 'pending' ? 'Sending...' : 'Send Tokens'}
        </button>
      </div>

      {status === 'success' && txHash && (
        <div className="p-5 bg-emerald-500/[0.03] border border-emerald-500/[0.1] rounded-2xl space-y-2">
          <p className="text-[10px] uppercase tracking-[0.1em] text-emerald-400/40 font-medium">Transaction Submitted</p>
          <p className="text-[12px] font-mono text-white/40 break-all">{txHash}</p>
          <p className="text-[11px] text-white/20">The wallet selected input coins, created change, and balanced the transaction automatically.</p>
        </div>
      )}

      <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <p className="text-[11px] text-white/20 leading-relaxed">
          <strong className="text-white/40">How it works:</strong> The wallet handles all coin selection and change management internally. 
          It selects shielded coins of the correct token type, computes change if the input exceeds the send amount, and creates the zero-knowledge proofs needed to spend them. 
          Unlike <code className="text-white/40">transferShielded</code>, this uses the wallet's native transfer path — no manual Merkle index required.
        </p>
      </div>
    </div>
  );
}
