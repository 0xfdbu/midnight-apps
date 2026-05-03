import { useState } from 'react';
import { Button } from './ui/Button';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import laceSvg from '../assets/lace.svg?url';
import iamSvg from '../assets/1am.svg?url';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}

function getWalletIcon(rdns: string | undefined): string | null {
  if (!rdns) return null;
  if (rdns.includes('lace')) return laceSvg;
  if (rdns.includes('1am') || rdns.includes('iam')) return iamSvg;
  return null;
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
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

export function WalletSelectModal({ isOpen, onClose, wallets, onSelect, connecting }: Props) {
  const [pending, setPending] = useState<InitialAPI | null>(null);

  if (!isOpen) return null;

  return (
    <div className="relative w-[380px] bg-bg-secondary border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-hover to-transparent" />

        <div className="px-6 pt-7 pb-6">
          {/* Header */}
          <div className="mb-6">
            <h3 className="text-[17px] font-semibold tracking-tight text-white">Connect Wallet</h3>
            <p className="text-text-muted text-[13px] mt-1">
              Choose a wallet to get started
            </p>
          </div>

          {/* Wallet List */}
          <div className="flex flex-col gap-1.5">
            {wallets.map((w) => {
              const icon = getWalletIcon(w.rdns);
              return (
                <button
                  key={w.rdns}
                  onClick={() => {
                    setPending(w);
                    onSelect(w);
                  }}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 group outline-none focus-visible:ring-2 focus-visible:ring-border-hover"
                >
                  <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center shrink-0 group-hover:border-border-hover transition-colors">
                    {icon ? (
                      <img src={icon} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <WalletIcon className="w-5 h-5 text-text-muted" />
                    )}
                  </div>

                  <span className="flex-1 text-left text-[15px] font-medium text-white/80 group-hover:text-white transition-colors">
                    {w.name}
                  </span>

                  <ChevronRightIcon className="w-4 h-4 text-text-muted/0 group-hover:text-text-muted/80 group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
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
      </div>
  );
}
