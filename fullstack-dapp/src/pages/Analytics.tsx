import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';

const ANALYTICS_API = 'http://localhost:3001';

interface ContractState {
  memberState: number;
  memberCount: bigint;
  hashedMembers: string[];
  usedNullifiers: string[];
}

function decodeState(hexState: string | null): ContractState | null {
  if (!hexState) return null;
  try {
    const hex = hexState.replace(/^0x/, '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    const data = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(data);
    return {
      memberState: parsed.memberState ?? 0,
      memberCount: BigInt(parsed.memberCount ?? 0),
      hashedMembers: parsed.hashedMembers ?? [],
      usedNullifiers: parsed.usedNullifiers ?? [],
    };
  } catch {
    return null;
  }
}

interface ApiStatus {
  status: string;
  version: string;
  indexer: string;
  storedContracts: number;
  polling: boolean;
}

interface ContractInfo {
  address: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  actionCount: number;
  currentBalances: { tokenType: string; amount: string }[];
  latest: {
    type: string;
    entryPoint: string | null;
    stateHex: string | null;
    unshieldedBalances: { tokenType: string; amount: string }[];
    txHash: string;
    blockHeight: number;
    timestamp: string;
  } | null;
}

interface TrackedContract {
  address: string;
  status: string;
  actionCount: number;
  latestBlock: number | null;
  updatedAt: string;
  currentBalances: { tokenType: string; amount: string }[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-tertiary/60 border border-border/60 rounded-xl p-4 text-center">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-xs text-text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

export function AnalyticsPage() {
  useWalletStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [trackedContracts, setTrackedContracts] = useState<TrackedContract[]>([]);
  const [showInput, setShowInput] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${ANALYTICS_API}/status`);
      if (res.ok) setApiStatus(await res.json());
    } catch {}
  }, []);

  const fetchTracked = useCallback(async () => {
    try {
      const res = await fetch(`${ANALYTICS_API}/contracts`);
      if (res.ok) {
        const data = await res.json();
        setTrackedContracts(data.contracts || []);
      }
    } catch {}
  }, []);

  const trackContract = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ANALYTICS_API}/track/${address}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setContract(data);
        setShowInput(false);
      } else {
        setError(data.error || 'Failed to track');
      }
    } catch (err) {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  }, []);

  const untrackContract = useCallback(async (address: string) => {
    try {
      await fetch(`${ANALYTICS_API}/contract/${address}`, { method: 'DELETE' });
      setTrackedContracts(prev => prev.filter(c => c.address !== address));
      if (contractAddress === address) {
        setContract(null);
      }
    } catch {}
  }, [contractAddress]);

  const loadContractData = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ANALYTICS_API}/contract/${address}`);
      const info = await res.json();

      if (res.ok) {
        setContract(info);
      } else {
        setError(info.error || 'Failed to load');
      }
    } catch (err) {
      setError('Failed to load contract');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchTracked();
    const interval = setInterval(fetchTracked, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchTracked]);

  useEffect(() => {
    const addr = localStorage.getItem('membership_contract');
    if (addr) {
      setContractAddress(addr);
      fetch(`${ANALYTICS_API}/track/${addr}`, { method: 'POST' })
        .then(() => loadContractData(addr))
        .catch(() => {});
    }
  }, [loadContractData]);

  const state = contract?.latest?.stateHex ? decodeState(contract.latest.stateHex) : null;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Analytics</h2>
          <p className="text-sm text-text-muted">Index and track membership data</p>
        </div>
        {apiStatus && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Live</span>
            <span className="text-text-muted text-xs">|</span>
            <span className="text-xs text-text-muted">{apiStatus.storedContracts} tracked</span>
          </div>
        )}
      </div>

      {showInput && (
        <div className="mb-6 p-6 bg-gradient-to-br from-bg-tertiary to-bg-secondary border border-border/60 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium">Track Contract</h3>
              <p className="text-xs text-text-muted">Enter a contract address to start indexing</p>
            </div>
          </div>
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="midnight1..."
            className="w-full px-4 py-3 bg-bg-primary border border-border rounded-xl text-white font-mono text-sm mb-4"
          />
          <div className="flex gap-2">
            <Button onClick={() => contractAddress && trackContract(contractAddress)} disabled={loading || !contractAddress}>
              {loading ? 'Tracking...' : 'Track'}
            </Button>
            <Button variant="secondary" onClick={() => setShowInput(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showInput && trackedContracts.length === 0 && (
        <button
          onClick={() => setShowInput(true)}
          className="w-full mb-6 p-8 border-2 border-dashed border-border/60 rounded-2xl hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-bg-tertiary group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
              <svg className="w-7 h-7 text-text-muted group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Track a contract</p>
              <p className="text-sm text-text-muted">Click to enter a contract address</p>
            </div>
          </div>
        </button>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {contract && state && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${contract.status === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-sm text-white font-mono truncate max-w-[200px]">
                {contract.address.slice(0, 20)}...
              </span>
            </div>
            <button onClick={() => untrackContract(contract.address)} className="text-xs text-red-400 hover:text-red-300">
              Untrack
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Members" value={String(state.memberCount)} />
            <StatCard label="Registered" value={state.hashedMembers.length} />
            <StatCard label="Proofs" value={state.usedNullifiers.length} />
            <StatCard label="Block" value={`#${contract.latest?.blockHeight || '-'}`} />
          </div>
        </div>
      )}

      {contract && (
        <div className="space-y-4 mb-6">
          {contract.currentBalances && contract.currentBalances.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v8m-8-8h8m-8 0H4" />
                </svg>
                <span className="text-sm font-medium text-amber-400">Current Balance</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {(Number(contract.currentBalances[0]?.amount) / 1000000).toFixed(2)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-bg-tertiary/60 border border-border/60 rounded-xl">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Latest Action</p>
              <p className="text-white font-medium">{contract.latest?.type || '-'}</p>
              <p className="text-sm text-blue-400">{contract.latest?.entryPoint || '-'}</p>
            </div>
            <div className="p-4 bg-bg-tertiary/60 border border-border/60 rounded-xl">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Last Updated</p>
              <p className="text-white font-medium">{new Date(contract.updatedAt).toLocaleString()}</p>
              <p className="text-sm text-text-muted">{contract.actionCount} actions indexed</p>
            </div>
          </div>

          {contract.latest && contract.latest.txHash && (
            <div className="p-4 bg-bg-tertiary/60 border border-border/60 rounded-xl">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Transaction</p>
              <p className="font-mono text-sm text-white truncate">{contract.latest.txHash}</p>
            </div>
          )}

          {state && state.hashedMembers.length > 0 && (
            <div className="p-4 bg-bg-tertiary/60 border border-border/60 rounded-xl">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
                Members ({state.hashedMembers.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {state.hashedMembers.map((hash, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400">
                      {i + 1}
                    </div>
                    <span className="font-mono text-xs text-text-muted truncate flex-1">{hash}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state && state.usedNullifiers.length > 0 && (
            <div className="p-4 bg-bg-tertiary/60 border border-border/60 rounded-xl">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
                Eligibility Proofs ({state.usedNullifiers.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {state.usedNullifiers.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="font-mono text-xs text-text-muted truncate flex-1">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!showInput && trackedContracts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">Tracked Contracts</p>
            <button onClick={() => setShowInput(true)} className="text-xs text-blue-400 hover:text-blue-300">
              + Add
            </button>
          </div>
          {trackedContracts.map((c) => (
            <button
              key={c.address}
              onClick={() => {
                setContractAddress(c.address);
                loadContractData(c.address);
              }}
              className={`w-full p-4 bg-bg-tertiary/60 border rounded-xl text-left hover:border-blue-500/40 transition-colors ${
                contractAddress === c.address ? 'border-blue-500/40' : 'border-border/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${c.status === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div>
                    <p className="font-mono text-sm text-white truncate max-w-[200px]">{c.address}</p>
                    <p className="text-xs text-text-muted">{c.actionCount} actions | block #{c.latestBlock || '-'}</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {!contract && !loading && !error && !showInput && trackedContracts.length === 0 && (
        <div className="text-center py-12 text-text-muted text-sm">
          No contracts tracked. Click above to start.
        </div>
      )}
    </div>
  );
}