import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { Transaction, UnshieldedOffer, Intent, nativeToken, CostModel } from '@midnight-ntwrk/ledger-v8';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function TransferPage() {
  const { isConnected, connectedApi, addresses, balances, loadWalletState, isSubmitting } = useWalletStore();
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) {
      loadWalletState();
      if (addresses?.unshieldedAddress && !recipient) {
        setRecipient(addresses.unshieldedAddress);
      }
    }
  }, [isConnected, addresses?.unshieldedAddress]);

  const handleTransfer = useCallback(async () => {
    if (!connectedApi) {
      setError('Wallet not connected');
      return;
    }
    if (!recipient || !amount) {
      setError('Enter recipient and amount');
      return;
    }

    setStatus('Building transfer...');
    setError(null);
    setTxId(null);

    try {
      const value = BigInt(Math.round(Number(amount) * 1_000_000));

      // 1. Decode Bech32 address to raw hex bytes
      setStatus('Building transaction...');
      const parsed = MidnightBech32m.parse(recipient);
      const unshieldedAddr = parsed.decode(UnshieldedAddress, 'preprod');
      const hexRecipient = unshieldedAddr.data.toString('hex');

      // 2. Build an unproven transaction blueprint manually
      const unshieldedOffer = UnshieldedOffer.new(
        [], // inputs — wallet will select these
        [{ value, owner: hexRecipient, type: nativeToken().raw }],
        [] // signatures — wallet will add these
      );

      const intent = Intent.new(new Date(Date.now() + 30 * 60 * 1000));
      (intent as any).fallibleUnshieldedOffer = unshieldedOffer;

      const unsealedTx = Transaction.fromParts('preprod', undefined, undefined, intent as any);

      // Real pattern from docs: prove → balanceUnsealedTransaction
      // For transfers with no contract calls, prove() simply advances PreProof → Proof
      // because there are no ZK circuits to execute.
      setStatus('Proving transaction...');
      const zkConfigProvider = new FetchZkConfigProvider(window.location.origin);
      const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
      const provenTx = await unsealedTx.prove(provingProvider, CostModel.initialCostModel());

      const serializedTx = toHex(provenTx.serialize());

      // 2. Wallet balances, signs, and pays fees
      setStatus('Balancing via wallet...');
      const result = await connectedApi.balanceUnsealedTransaction(serializedTx, { payFees: true });

      // 3. Submit
      setStatus('Submitting...');
      await connectedApi.submitTransaction(result.tx);

      setTxId(result.tx.slice(0, 64));
      setStatus(null);
      loadWalletState();
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    }
  }, [connectedApi, recipient, amount, loadWalletState]);

  if (!isConnected) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="text-[18px] font-medium text-white/80 mb-2">Wallet Required</h2>
          <p className="text-[14px] text-white/25">Connect your wallet to send a transfer.</p>
        </div>
      </div>
    );
  }

  const formatBalance = (val: bigint | undefined): string => {
    if (val === undefined) return '0.00';
    return (Number(val) / 1_000_000).toFixed(4);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-white/25 hover:text-white/50 transition-colors mb-10"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back
      </Link>

      <div className="mb-10">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-2">Transfer</h1>
        <p className="text-[15px] text-white/30 leading-relaxed max-w-lg">
          Send an unshielded transfer through your browser wallet. The wallet handles balancing, signing, and submission automatically.
        </p>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Shielded</p>
          <p className="text-[18px] font-semibold text-white">{formatBalance(balances?.shielded?.['0000000000000000000000000000000000000000000000000000000000000000'])} N</p>
        </div>
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Unshielded</p>
          <p className="text-[18px] font-semibold text-white">{formatBalance(balances?.unshielded?.['0000000000000000000000000000000000000000000000000000000000000000'])} N</p>
        </div>
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-1">Dust</p>
          <p className="text-[18px] font-semibold text-white">{balances?.dust ? (Number(balances.dust.balance) / 1e15).toFixed(4) : '0.00'} tDUST</p>
        </div>
      </div>

      {/* Transfer form */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5 mb-8">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Recipient (Unshielded Address)</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="mn_addr..."
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
          />
          {addresses?.unshieldedAddress && (
            <button
              onClick={() => setRecipient(addresses.unshieldedAddress!)}
              className="mt-2 text-[11px] text-white/20 hover:text-white/40 transition-colors"
            >
              Use my address (self-transfer)
            </button>
          )}
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium mb-2">Amount (N)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.000001"
            step="0.000001"
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[13px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/15"
          />
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-500/[0.05] border border-red-500/[0.1] rounded-xl">
            <p className="text-[12px] text-red-400/70 font-mono break-all">{error}</p>
          </div>
        )}

        {txId && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/[0.05] border border-emerald-500/[0.1] rounded-xl">
            <div className="w-6 h-6 rounded-full bg-emerald-500/[0.1] flex items-center justify-center shrink-0">
              <CheckIcon className="w-3 h-3 text-emerald-400/70" />
            </div>
            <div>
              <p className="text-[12px] text-emerald-400/70">Transfer submitted</p>
              <p className="text-[11px] font-mono text-emerald-400/40 break-all">{txId}</p>
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button
            onClick={handleTransfer}
            disabled={isSubmitting || !recipient || !amount}
            className="px-6 py-2.5 bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-medium rounded-xl transition-all"
          >
            {isSubmitting ? (status || 'Processing...') : 'Send Transfer'}
          </Button>
        </div>
      </div>

      {/* Comparison callout */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 space-y-4">
        <p className="text-[10px] uppercase tracking-[0.1em] text-white/20 font-medium">Browser vs CLI</p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-[10px] text-white/40 font-medium">1</div>
            <p className="text-[13px] text-white/40 leading-relaxed">
              <span className="text-white/60 font-medium">Browser:</span> Wallet extension holds keys.
              We build an unproven transaction with <code className="text-white/50 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">Intent</code> + <code className="text-white/50 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">UnshieldedOffer</code>,
              then call <code className="text-white/50 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">balanceUnsealedTransaction</code> so the wallet balances, signs, and pays fees.
              You never touch secret keys.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-[10px] text-white/40 font-medium">2</div>
            <p className="text-[13px] text-white/40 leading-relaxed">
              <span className="text-white/60 font-medium">CLI:</span> Script holds the 24-word mnemonic and derives keys directly.
              We call <code className="text-white/50 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">balanceUnboundTransaction</code> → manually sign intents →
              <code className="text-white/50 font-mono text-[11px] bg-white/[0.04] px-1 py-0.5 rounded">submitTransaction</code>.
              The script acts as the wallet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
