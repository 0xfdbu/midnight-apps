import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { encodeUserAddress, getContractFirstTokenBalance } from '../hooks/wallet/services/contractCalls';

function formatTokenId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

export function ContractSendPage() {
  const { connectedApi, isSubmitting, transactionHash, error, contractAddress } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  const [contractBalance, setContractBalance] = useState<bigint>(0n);
  const [contractTokenId, setContractTokenId] = useState<string | null>(null);

  useEffect(() => {
    useWalletStore.getState().setTransactionHash(null);
    useWalletStore.getState().setError(null);

  }, []);

  const handleRefreshBalance = async () => {
    if (!connectedApi || !contractAddress) return;
    try {
      const result = await getContractFirstTokenBalance(contractAddress);
      if (result) {
        setContractBalance(result.balance);
        setContractTokenId(result.tokenId);
      } else {
        setContractBalance(0n);
        setContractTokenId(null);
      }
    } catch (err) {
      console.error('Failed to get contract balance:', err);
    }
  };

  useEffect(() => {
    if (connectedApi) {
      handleRefreshBalance();
    }
  }, [connectedApi, transactionHash, contractAddress]);



  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async () => {
    if (!amount || !recipient || !connectedApi) return;

    setSubmitting(true);
    setStatus('Preparing transaction...');
    useWalletStore.getState().setTransactionHash(null);
    useWalletStore.getState().setError(null);

    try {
      const recipientBytes = await encodeUserAddress(recipient);
      const store = useWalletStore.getState();
      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

      setStatus('Sending from contract...');
      await store.contractSend(
        connectedApi,
        coinPublicKey,
        shieldedAddresses,
        BigInt(amount),
        recipientBytes,
        (txId: string) => {
          useWalletStore.getState().setTransactionHash(txId);
          useWalletStore.getState().loadWalletState();
        },
        (errMsg: string) => {
          useWalletStore.getState().setError(errMsg);
        }
      );
    } catch (err) {
      useWalletStore.getState().setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setStatus(null);
    }
  };

  return (
    <div className="flex items-start justify-center min-h-[80vh] p-4 pt-16">
      <div className="w-full max-w-[440px] bg-bg-secondary border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Contract Send</h2>
            <p className="text-[13px] text-text-muted mt-0.5">Send tokens from contract to address</p>
          </div>
          <Link 
            to="/" 
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="p-6 space-y-5">
          {/* No Contract Warning */}
          {!contractAddress && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-amber-400 font-medium">No contract configured</p>
                <p className="text-[12px] text-amber-400/70">Deploy a contract before you can send tokens from it.</p>
                <Link
                  to="/deploy"
                  className="inline-block mt-1 text-[12px] text-amber-400 underline underline-offset-2 hover:text-amber-300"
                >
                  Go to Deploy →
                </Link>
              </div>
            </div>
          )}

          {/* Contract Balance */}
          <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
            <div>
              <span className="text-sm text-text-secondary">Contract Balance</span>
              {contractTokenId && (
                <p className="text-[10px] font-mono text-text-muted/60 mt-0.5">{formatTokenId(contractTokenId)}</p>
              )}
            </div>
            <span className="text-lg font-semibold text-white">{contractBalance.toString()} USD</span>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
              </div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Display */}
          {transactionHash && !error && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-400">Transaction submitted!</p>
                <p className="text-[12px] text-emerald-400/70 mt-0.5">Tokens sent from contract.</p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Amount</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-4 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none text-[24px] font-semibold tracking-tight text-white placeholder:text-text-muted/30 transition-all pr-16"
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center px-4 pointer-events-none">
                <span className="text-[14px] font-bold text-text-muted">USD</span>
              </div>
            </div>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Recipient Address</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="addr1q..."
              className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl focus:border-border-hover focus:ring-1 focus:ring-border-hover outline-none font-mono text-sm text-white placeholder:text-text-muted/50 transition-all"
            />
          </div>

          {/* Submit Button */}
          {submitting && (
            <div className="flex items-center gap-3 p-4 bg-bg-tertiary/40 rounded-xl border border-border/80">
              <div className="w-5 h-5 border-2 border-border border-t-indigo-400 rounded-full animate-spin" />
              <div>
                <p className="text-[13px] text-white/60">{status}</p>
              </div>
            </div>
          )}

          {!submitting && (
            <button
              onClick={handleSend}
              disabled={!amount || !recipient || !contractAddress}
              className="w-full py-3.5 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-gray-100 active:scale-[0.985] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
            >
              Send from Contract
            </button>
          )}
          
        </div>
      </div>
    </div>
  );
}