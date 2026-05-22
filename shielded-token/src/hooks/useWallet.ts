import { create } from 'zustand';
import semver from 'semver';
import type { InitialAPI, ConnectedAPI, Configuration as WalletConfiguration } from '@midnight-ntwrk/dapp-connector-api';

import {
  COMPATIBLE_CONNECTOR_API_VERSION,
} from './wallet/wallet.constants';
import type { WalletAddresses, WalletBalances } from './wallet/wallet.types';

export interface WalletState {
  wallet: InitialAPI | null;
  connectedApi: ConnectedAPI | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  addresses: WalletAddresses | null;
  balances: WalletBalances | null;
  config: WalletConfiguration | null;
  showAccountModal: boolean;
  isLoadingState: boolean;
  loadWalletState: () => Promise<void>;
  isSubmitting: boolean;
  setWallet: (wallet: InitialAPI | null) => void;
  setConnectedApi: (api: ConnectedAPI | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setAddresses: (addresses: WalletAddresses) => void;
  setBalances: (balances: WalletBalances) => void;
  setConfig: (config: WalletConfiguration) => void;
  setShowAccountModal: (show: boolean) => void;
  connect: (networkId: string) => Promise<void>;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  connectedApi: null,
  isConnecting: false,
  isConnected: false,
  error: null,
  addresses: null,
  balances: null,
  config: null,
  showAccountModal: false,
  isLoadingState: false,
  isSubmitting: false,

  setWallet: (wallet) => set({ wallet }),
  setConnectedApi: (connectedApi) => set({ connectedApi, isConnected: !!connectedApi }),
  setIsConnecting: (isConnecting) => set({ isLoadingState: isConnecting }),
  setError: (error) => set({ error }),
  setAddresses: (addresses) => set({ addresses }),
  setBalances: (balances) => set({ balances }),
  setConfig: (config) => set({ config }),
  setShowAccountModal: (showAccountModal) => set({ showAccountModal }),

  loadWalletState: async () => {
    const { connectedApi } = get();
    if (!connectedApi) return;

    set({ isLoadingState: true, error: null });

    try {
      const shieldedBalances = await connectedApi.getShieldedBalances();
      const unshieldedBalances = await connectedApi.getUnshieldedBalances();
      const dustBalance = await connectedApi.getDustBalance();
      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      const unshieldedAddress = await connectedApi.getUnshieldedAddress();
      const dustAddress = await connectedApi.getDustAddress();

      set({
        balances: {
          shielded: shieldedBalances,
          unshielded: unshieldedBalances,
          dust: dustBalance,
        },
        addresses: {
          shieldedAddress: shieldedAddresses.shieldedAddress,
          shieldedCoinPublicKey: shieldedAddresses.shieldedCoinPublicKey,
          shieldedEncryptionPublicKey: shieldedAddresses.shieldedEncryptionPublicKey,
          unshieldedAddress: unshieldedAddress.unshieldedAddress,
          dustAddress: dustAddress.dustAddress,
        },
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load wallet state' });
    } finally {
      set({ isLoadingState: false });
    }
  },

  connect: async (networkId) => {
    const wallet = get().wallet;
    if (!wallet) {
      set({ error: 'No wallet selected' });
      return;
    }

    set({ isConnecting: true, error: null });

    try {
      const connectedApi = await wallet.connect(networkId);
      const status = await connectedApi.getConnectionStatus();
      
      if (status.status === 'connected') {
        const addresses = await connectedApi.getShieldedAddresses();
        const unshieldedAddress = await connectedApi.getUnshieldedAddress();
        const dustBalance = await connectedApi.getDustBalance();
        const dustAddress = await connectedApi.getDustAddress();

        // Remember wallet for auto-reconnect across refreshes
        if (wallet.rdns) {
          localStorage.setItem('midnight_last_wallet', wallet.rdns);
        }

        set({
          connectedApi,
          isConnected: true,
          addresses: {
            shieldedAddress: addresses.shieldedAddress,
            shieldedCoinPublicKey: addresses.shieldedCoinPublicKey,
            shieldedEncryptionPublicKey: addresses.shieldedEncryptionPublicKey,
            unshieldedAddress: unshieldedAddress.unshieldedAddress,
            dustAddress: dustAddress.dustAddress,
          },
          balances: {
            shielded: {},
            unshielded: {},
            dust: dustBalance,
          },
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Connection failed' });
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    localStorage.removeItem('midnight_last_wallet');
    set({
      wallet: null,
      connectedApi: null,
      isConnected: false,
      addresses: null,
      balances: null,
      config: null,
      showAccountModal: false,
    });
  },
}));

export function getCompatibleWallets(): InitialAPI[] {
  if (!window.midnight) return [];
  return Object.values(window.midnight).filter(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
  );
}
