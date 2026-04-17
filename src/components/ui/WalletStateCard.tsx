import { useWalletStore } from '../../hooks/useWallet';
import { Button } from './Button';

function formatAddress(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr;
}

function formatBalance(amount: bigint | undefined): string {
  if (amount === undefined) return '-';
  return (Number(amount) / 1_000_000).toFixed(2);
}

export function WalletStateCard() {
  const { addresses, balances, config, isLoadingState, isConnected, loadWalletState, isSubmitting, makeTransfer } = useWalletStore();

  if (!isConnected) return null;

  const handleTransfer = async () => {
    if (!addresses?.unshieldedAddress) return;
    await makeTransfer(addresses.unshieldedAddress, 1_000_000n);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Wallet State</h3>
        <Button variant="ghost" size="sm" onClick={loadWalletState} disabled={isLoadingState}>
          {isLoadingState ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h4 className="text-sm text-text-secondary mb-3">Addresses</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Shielded</span>
              <span className="font-mono">{addresses?.shieldedAddress ? formatAddress(addresses.shieldedAddress) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Unshielded</span>
              <span className="font-mono">{addresses?.unshieldedAddress ? formatAddress(addresses.unshieldedAddress) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Dust</span>
              <span className="font-mono">{addresses?.dustAddress ? formatAddress(addresses.dustAddress) : '-'}</span>
            </div>
          </div>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h4 className="text-sm text-text-secondary mb-3">Balances</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Shielded</span>
              <span className="font-mono">{balances?.shielded ? formatBalance(balances.shielded['00'] || 0n) : '-'} N</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Unshielded</span>
              <span className="font-mono">{balances?.unshielded ? formatBalance(balances.unshielded['00'] || 0n) : '-'} N</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Dust</span>
              <span className="font-mono">{balances?.dust ? formatBalance(balances.dust.balance) : '-'} / {balances?.dust ? formatBalance(balances.dust.cap) : '-'}</span>
            </div>
          </div>
        </div>
      </div>

      {config && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h4 className="text-sm text-text-secondary mb-3">Configuration</h4>
          <div className="space-y-1 text-xs font-mono text-text-muted">
            <div>Network: {config.networkId}</div>
            <div className="truncate">Indexer: {config.indexerUri}</div>
            <div className="truncate">Substrate: {config.substrateNodeUri}</div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button onClick={handleTransfer} disabled={isSubmitting}>
          {isSubmitting ? 'Processing...' : 'Send Test Transaction (1 N)'}
        </Button>
      </div>
    </div>
  );
}