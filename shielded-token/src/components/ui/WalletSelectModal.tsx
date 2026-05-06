import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import laceSvgUrl from '../../assets/lace.svg?url';
import iamSvgUrl from '../../assets/1am.svg?url';

interface WalletSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}

function getWalletIcon(rdns: string): string {
  if (rdns.includes('lace')) return laceSvgUrl;
  if (rdns.includes('1am') || rdns.includes('iam')) return iamSvgUrl;
  return '';
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function WalletSelectModal({ isOpen, onClose, wallets, onSelect, connecting }: WalletSelectModalProps) {
  // Track which wallet was clicked to show its icon in the overlay
  const [pendingWallet, setPendingWallet] = useState<InitialAPI | null>(null);

  const handleSelect = (wallet: InitialAPI) => {
    setPendingWallet(wallet);
    onSelect(wallet);
  };

  const pendingIconUrl = pendingWallet ? getWalletIcon(pendingWallet.rdns) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="relative w-[380px] bg-bg-secondary border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-hover to-transparent" />

        <div className="px-6 pt-7 pb-6">
          {/* Header - Simplified. No redundant icon needed. */}
          <div className="mb-6">
            <h3 className="text-[17px] font-semibold tracking-tight text-white">Connect Wallet</h3>
            <p className="text-text-muted text-[13px] mt-1">
              Choose a wallet to get started
            </p>
          </div>

          {/* Wallet List */}
          <div className="flex flex-col gap-1.5">
            {wallets.map((wallet) => {
              const iconUrl = getWalletIcon(wallet.rdns);

              return (
                <button
                  key={wallet.rdns}
                  onClick={() => handleSelect(wallet)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 group outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  {/* Soft Icon Container */}
                  <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center shrink-0 group-hover:border-border-hover transition-colors">
                    {iconUrl ? (
                      <img src={iconUrl} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <WalletIcon className="w-5 h-5 text-text-muted" />
                    )}
                  </div>

                  {/* Name - Fixed sizing */}
                  <span className="flex-1 text-left text-[15px] font-medium text-white/80 group-hover:text-white transition-colors">
                    {wallet.name}
                  </span>

                  {/* Chevron - Only visible on hover for a cleaner resting state */}
                  <ChevronRightIcon className="w-4 h-4 text-text-muted/0 group-hover:text-text-muted/80 group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <Button 
              variant="ghost" 
              className="w-full text-text-muted hover:text-text-secondary text-[13px]" 
              onClick={onClose} 
              disabled={connecting}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Contextual Connecting Overlay */}
        {connecting && pendingWallet && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary/85 backdrop-blur-md z-10 rounded-2xl">
            <div className="flex flex-col items-center gap-4">
              {/* Shows the specific wallet logo clicked */}
              <div className="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center shadow-lg">
                {pendingIconUrl ? (
                  <img src={pendingIconUrl} alt="" className="w-8 h-8 object-contain" />
                ) : (
                  <WalletIcon className="w-7 h-7 text-text-muted" />
                )}
              </div>
              
              <div className="flex flex-col items-center gap-1.5 mt-2">
                <p className="text-sm font-medium text-white">
                  Connecting to {pendingWallet.name}...
                </p>
                <p className="text-[12px] text-text-muted">Approve in extension</p>
              </div>

              {/* Subtle Spinner */}
              <div className="mt-2 w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}