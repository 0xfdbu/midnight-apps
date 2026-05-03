import { useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { WalletSelectModal } from './WalletSelectModal';
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
        <WalletSelectModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          wallets={wallets}
          onSelect={handleConnect}
          connecting={isConnecting}
        />
      </Modal>
    </>
  );
}
