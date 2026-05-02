import { create } from 'zustand';
import semver from 'semver';
import type {
  InitialAPI,
  ConnectedAPI,
  Configuration as WalletConfiguration,
} from '@midnight-ntwrk/dapp-connector-api';
import { COMPATIBLE_CONNECTOR_API_VERSION, NETWORK_ID } from './wallet.constants';
import type { WalletAddresses, WalletBalances } from '../types/wallet';

export interface WalletState {
  /* Connection */
  wallet: InitialAPI | null;
  connectedApi: ConnectedAPI | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  config: WalletConfiguration | null;

  /* Data */
  addresses: WalletAddresses | null;
  balances: WalletBalances | null;
  isLoadingState: boolean;

  /* UI */
  showAccountModal: boolean;
  setShowAccountModal: (show: boolean) => void;

  /* Actions */
  setWallet: (wallet: InitialAPI | null) => void;
  connect: (networkId?: string) => Promise<void>;
  disconnect: () => void;
  loadWalletState: () => Promise<void>;
  resetError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  connectedApi: null,
  isConnecting: false,
  isConnected: false,
  error: null,
  config: null,
  addresses: null,
  balances: null,
  isLoadingState: false,
  showAccountModal: false,

  setWallet: (wallet) => set({ wallet }),
  setShowAccountModal: (show) => set({ showAccountModal: show }),

  resetError: () => set({ error: null }),

  connect: async (networkId = NETWORK_ID) => {
    const { wallet } = get();
    if (!wallet) {
      set({ error: 'No wallet selected' });
      return;
    }

    set({ isConnecting: true, error: null });

    try {
      const connectedApi = await wallet.connect(networkId);
      const status = await connectedApi.getConnectionStatus();

      if (status.status !== 'connected') {
        throw new Error(`Wallet status: ${status.status}`);
      }

      const config = await connectedApi.getConfiguration();
      const shielded = await connectedApi.getShieldedAddresses();
      const unshielded = await connectedApi.getUnshieldedAddress();
      const dustAddr = await connectedApi.getDustAddress();

      set({
        connectedApi,
        isConnected: true,
        config,
        addresses: {
          shieldedAddress: shielded.shieldedAddress,
          shieldedCoinPublicKey: shielded.shieldedCoinPublicKey,
          shieldedEncryptionPublicKey: shielded.shieldedEncryptionPublicKey,
          unshieldedAddress: unshielded.unshieldedAddress,
          dustAddress: dustAddr.dustAddress,
        },
        balances: {
          shielded: {},
          unshielded: {},
          dust: { balance: 0n, cap: 0n },
        },
      });

      // Persist for auto-reconnect
      localStorage.setItem('midnight_last_wallet', wallet.rdns);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Connection failed',
        isConnected: false,
        connectedApi: null,
      });
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    const { wallet } = get();
    wallet?.disconnect?.();

    set({
      connectedApi: null,
      isConnected: false,
      addresses: null,
      balances: null,
      config: null,
      wallet: null,
      error: null,
    });

    localStorage.removeItem('midnight_last_wallet');
  },

  loadWalletState: async () => {
    const { connectedApi } = get();
    if (!connectedApi) return;

    set({ isLoadingState: true, error: null });

    try {
      const [shieldedBalances, unshieldedBalances, dustBalance] = await Promise.all([
        connectedApi.getShieldedBalances(),
        connectedApi.getUnshieldedBalances(),
        connectedApi.getDustBalance(),
      ]);

      set({
        balances: {
          shielded: shieldedBalances,
          unshielded: unshieldedBalances,
          dust: dustBalance,
        },
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load wallet state' });
    } finally {
      set({ isLoadingState: false });
    }
  },
}));

/**
 * Detect wallets injected by browser extensions.
 * Each extension writes its `InitialAPI` object into `window.midnight`.
 */
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

/**
 * Attempt to reconnect to the last wallet the user connected.
 */
export async function tryAutoConnect(): Promise<void> {
  const lastRdns = localStorage.getItem('midnight_last_wallet');
  if (!lastRdns || !window.midnight) return;

  const wallets = getCompatibleWallets();
  const match = wallets.find((w) => w.rdns === lastRdns);
  if (!match) return;

  const store = useWalletStore.getState();
  store.setWallet(match);
  await store.connect();
}
