import { useState } from 'react';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}

function getWalletIcon(rdns: string): string | null {
  if (rdns.includes('lace')) return 'https://lace.io/favicon.ico';
  if (rdns.includes('1am') || rdns.includes('iam')) return 'https://1am.io/favicon.ico';
  return null;
}

export function WalletSelectModal({ isOpen, onClose, wallets, onSelect, connecting }: Props) {
  const [pending, setPending] = useState<InitialAPI | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-1">Connect Wallet</h3>
        <p className="text-sm text-neutral-400 mb-4">Choose a wallet to get started</p>

        <div className="flex flex-col gap-2">
          {wallets.map((wallet) => {
            const icon = getWalletIcon(wallet.rdns);
            return (
              <button
                key={wallet.rdns}
                onClick={() => {
                  setPending(wallet);
                  onSelect(wallet);
                }}
                disabled={connecting}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-50 text-left"
              >
                {icon ? (
                  <img src={icon} alt="" className="w-6 h-6 rounded" />
                ) : (
                  <div className="w-6 h-6 rounded bg-neutral-600" />
                )}
                <span className="text-white font-medium">{wallet.name}</span>
              </button>
            );
          })}
        </div>

        {connecting && pending && (
          <div className="mt-4 text-center text-sm text-neutral-300">
            Connecting to {pending.name}...
            <div className="mt-2 w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
