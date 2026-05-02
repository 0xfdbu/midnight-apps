import { useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useWalletStore, getCompatibleWallets } from '../hooks/useWallet';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import laceSvg from '../assets/lace.svg?url';
import iamSvg from '../assets/1am.svg?url';

function formatAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function getWalletIcon(rdns: string | undefined): string | null {
  if (!rdns) return null;
  if (rdns.includes('lace')) return laceSvg;
  if (rdns.includes('1am') || rdns.includes('iam')) return iamSvg;
  return null;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
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

export function ConnectButton() {
  const { isConnected, isConnecting, connect, setWallet, addresses, wallet, setShowAccountModal } = useWalletStore();
  const [wallets] = useState<InitialAPI[]>(() => getCompatibleWallets());
  const [showModal, setShowModal] = useState(false);

  const handleConnect = async (selectedWallet: InitialAPI) => {
    setWallet(selectedWallet);
    setShowModal(false);
    await connect('preprod');
  };

  const handleClick = () => {
    if (isConnected) {
      setShowAccountModal(true);
    } else if (wallets.length === 1) {
      handleConnect(wallets[0]);
    } else {
      setShowModal(true);
    }
  };

  const iconUrl = getWalletIcon(wallet?.rdns);

  let buttonContent;

  if (isConnecting) {
    buttonContent = (
      <>
        <Spinner className="w-4 h-4 animate-spin" />
        <span>Connecting...</span>
      </>
    );
  } else if (isConnected && addresses?.unshieldedAddress) {
    buttonContent = (
      <>
        {iconUrl && (
          <img src={iconUrl} alt="" className="w-4 h-4 object-contain rounded-sm" />
        )}
        <span className="font-mono text-sm tracking-wider">
          {formatAddress(addresses.unshieldedAddress)}
        </span>
        <ChevronDownIcon className="w-3.5 h-3.5 opacity-50" />
      </>
    );
  } else if (wallets.length === 0) {
    buttonContent = "No Wallet Found";
  } else {
    buttonContent = (
      <>
        <WalletIcon className="w-4 h-4" />
        <span>Connect Wallet</span>
      </>
    );
  }

  return (
    <>
      <Button
        variant={isConnected ? 'secondary' : 'primary'}
        onClick={handleClick}
        disabled={isConnecting || (wallets.length === 0 && !isConnected)}
        className="inline-flex items-center gap-2"
      >
        {buttonContent}
      </Button>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
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
                    onClick={() => handleConnect(w)}
                    disabled={isConnecting}
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

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-border/50">
              <Button
                variant="ghost"
                className="w-full text-text-muted hover:text-text-secondary text-[13px]"
                onClick={() => setShowModal(false)}
                disabled={isConnecting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
