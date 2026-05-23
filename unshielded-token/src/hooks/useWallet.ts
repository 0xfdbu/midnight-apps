import { create } from 'zustand';
import semver from 'semver';
import type { InitialAPI, ConnectedAPI, Configuration as WalletConfiguration } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  COMPATIBLE_CONNECTOR_API_VERSION,
  NATIVE_TOKEN_ID,
  getActiveContractAddress,
  getSelectedTokenId,
} from './wallet/wallet.constants';
import type { WalletAddresses, WalletBalances } from './wallet/wallet.types';
import { isWalletError, handleWalletError, extractNodeError } from './wallet/wallet.utils';
import {
  mintToContract as mintToContractFn,
  burnFromContract as burnFromContractFn,
  receiveTokens as receiveTokensFn,
  sendToUser as sendToUserFn,
} from './wallet/services/contractCalls';
import {
  loadWalletState,
  sendStablecoin,
  checkConnectionStatus,
} from './wallet/services/walletState';

export interface WalletState {
  wallet: InitialAPI | null;
  connectedApi: ConnectedAPI | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  addresses: WalletAddresses | null;
  balances: WalletBalances | null;
  config: WalletConfiguration | null;
  isLoadingState: boolean;
  isSubmitting: boolean;
  transactionHash: string | null;
  showAccountModal: boolean;
  contractAddress: string | null;
  selectedTokenId: string | null;
  availableTokens: string[];
  setWallet: (wallet: InitialAPI | null) => void;
  setConnectedApi: (api: ConnectedAPI | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setIsLoadingState: (loading: boolean) => void;
  setIsSubmitting: (submitting: boolean) => void;
  setTransactionHash: (hash: string | null) => void;
  setShowAccountModal: (show: boolean) => void;
  setContractAddress: (address: string | null) => void;
  setSelectedTokenId: (tokenId: string | null) => void;
  setAddresses: (addresses: WalletAddresses) => void;
  setBalances: (balances: WalletBalances) => void;
  setConfig: (config: WalletConfiguration) => void;
  resetConnection: () => void;
  connect: (networkId: string) => Promise<void>;
  loadWalletState: () => Promise<void>;
  mintToContract: (amount: bigint) => Promise<void>;
  burnFromContract: (amount: bigint) => Promise<void>;
  sendStablecoin: (recipient: string, amount: bigint) => Promise<void>;
  receiveTokens: (
    connectedApi: ConnectedAPI,
    coinPublicKey: string,
    shieldedAddresses: { shieldedEncryptionPublicKey: string },
    amount: bigint,
    onSuccess: (txId: string) => void,
    onError: (err: string) => void
  ) => Promise<void>;
  contractSend: (
    connectedApi: ConnectedAPI,
    coinPublicKey: string,
    shieldedAddresses: { shieldedEncryptionPublicKey: string },
    amount: bigint,
    recipientAddress: Uint8Array,
    onSuccess: (txId: string) => void,
    onError: (err: string) => void
  ) => Promise<void>;
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
  isLoadingState: false,
  isSubmitting: false,
  transactionHash: null,
  showAccountModal: false,
  contractAddress: getActiveContractAddress(),
  selectedTokenId: getSelectedTokenId(),
  availableTokens: [],

  setWallet: (wallet) => set({ wallet }),
  setConnectedApi: (connectedApi) => set({ connectedApi, isConnected: !!connectedApi }),
  setIsConnecting: (isConnecting) => set({ isConnecting }),
  setError: (error) => set({ error }),
  setIsLoadingState: (isLoadingState) => set({ isLoadingState }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  setTransactionHash: (transactionHash) => set({ transactionHash }),
  setShowAccountModal: (showAccountModal) => set({ showAccountModal }),
  setContractAddress: (address) => {
    if (address) {
      localStorage.setItem('unshielded_contract_address', address);
      set({ contractAddress: address });
    } else {
      localStorage.removeItem('unshielded_contract_address');
      set({ contractAddress: null });
    }
  },
  setSelectedTokenId: (tokenId) => {
    if (tokenId) {
      localStorage.setItem('unshielded_selected_token', tokenId);
      set({ selectedTokenId: tokenId });
    } else {
      localStorage.removeItem('unshielded_selected_token');
      set({ selectedTokenId: null });
    }
  },
  setAddresses: (addresses) => set({ addresses }),
  setBalances: (balances) => set({ balances }),
  setConfig: (config) => set({ config }),

  connect: async (networkId) => {
    const { wallet, setIsConnecting, setConnectedApi, setError } = get();
    if (!wallet) {
      setError('No wallet found');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const connectedApi = await wallet.connect(networkId);
      const status = await connectedApi.getConnectionStatus();
      if (status.status === 'connected') {
        setNetworkId(status.networkId);
        if (wallet.rdns) {
          localStorage.setItem('midnight_last_wallet', wallet.rdns);
        }
      }
      setConnectedApi(connectedApi);
      await get().loadWalletState();
    } catch (err) {
      setError(handleWalletError(err));
    } finally {
      setIsConnecting(false);
    }
  },

  loadWalletState: async () => {
    const { connectedApi, setIsLoadingState, setError, setAddresses, setBalances, setConfig } = get();
    if (!connectedApi) return;

    setIsLoadingState(true);
    setError(null);

    try {
      const status = await connectedApi.getConnectionStatus();
      if (status.status === 'disconnected') {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
        return;
      }

      await loadWalletState(
        connectedApi,
        ({ addresses, balances, config }) => {
          setAddresses(addresses);
          setBalances(balances);
          setConfig(config as WalletConfiguration);
          const tokens = Object.keys(balances.unshielded).filter((id) => id !== NATIVE_TOKEN_ID);
          set({ availableTokens: tokens });
        },
        (err) => {
          if (isWalletError(err as any) && (err as any).code === 'Disconnected') {
            useWalletStore.getState().resetConnection();
          }
          setError(err);
        }
      );
    } catch (err) {
      if (isWalletError(err) && err.code === 'Disconnected') {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
      } else {
        setError(handleWalletError(err));
      }
    } finally {
      setIsLoadingState(false);
    }
  },

  mintToContract: async (amount) => {
    const { connectedApi, contractAddress, setIsSubmitting, setError, setTransactionHash, loadWalletState } = get();
    if (!connectedApi) {
      setError('Not connected');
      return;
    }
    if (!contractAddress) {
      setError('No contract configured. Deploy one first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const isConnected = await checkConnectionStatus(connectedApi);
      if (!isConnected) {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
        return;
      }

      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

      await mintToContractFn(
        connectedApi,
        coinPublicKey,
        shieldedAddresses,
        amount,
        (txId: string) => {
          setTransactionHash(txId);
          loadWalletState();
        },
        (errMsg: string) => {
          setError(errMsg.length > 100 ? errMsg.substring(0, 100) + '...' : errMsg);
        },
        contractAddress
      );
    } catch (err) {
      console.error('Mint error:', err);
      if (isWalletError(err) && err.code === 'Disconnected') {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
      } else {
        setError(extractNodeError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  },

  burnFromContract: async (amount) => {
    const { connectedApi, contractAddress, setIsSubmitting, setError, setTransactionHash, loadWalletState } = get();
    if (!connectedApi) {
      setError('Not connected');
      return;
    }
    if (!contractAddress) {
      setError('No contract configured. Deploy one first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const isConnected = await checkConnectionStatus(connectedApi);
      if (!isConnected) {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
        return;
      }

      const shieldedAddresses = await connectedApi.getShieldedAddresses();
      const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

      await burnFromContractFn(
        connectedApi,
        coinPublicKey,
        shieldedAddresses,
        amount,
        (txId: string) => {
          setTransactionHash(txId);
          loadWalletState();
        },
        (errMsg: string) => {
          setError(errMsg.length > 100 ? errMsg.substring(0, 100) + '...' : errMsg);
        },
        contractAddress
      );
    } catch (err) {
      console.error('Burn error:', err);
      if (isWalletError(err) && err.code === 'Disconnected') {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
      } else {
        setError(extractNodeError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  },

  sendStablecoin: async (recipient, amount) => {
    const { connectedApi, selectedTokenId, setIsSubmitting, setError, setTransactionHash, loadWalletState } = get();
    if (!connectedApi) {
      setError('Not connected');
      return;
    }
    if (!selectedTokenId) {
      setError('No token selected. Choose a token from the dashboard.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const isConnected = await checkConnectionStatus(connectedApi);
      if (!isConnected) {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
        return;
      }

      await sendStablecoin(
        connectedApi,
        recipient,
        amount,
        selectedTokenId,
        () => {
          setTransactionHash('transfer-success');
          loadWalletState();
        },
        (errMsg) => {
          setError(errMsg);
        }
      );
    } catch (err) {
      console.error('Send stablecoin error:', err);
      if (isWalletError(err) && err.code === 'Disconnected') {
        useWalletStore.getState().resetConnection();
        setError('Wallet disconnected. Please reconnect.');
      } else {
        setError(handleWalletError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  },

  receiveTokens: async (connectedApi, coinPublicKey, shieldedAddresses, amount, onSuccess, onError) => {
    const { contractAddress } = get();
    if (!contractAddress) {
      onError('No contract configured. Deploy one first.');
      return;
    }
    await receiveTokensFn(
      connectedApi,
      coinPublicKey,
      shieldedAddresses,
      amount,
      onSuccess,
      onError,
      contractAddress
    );
  },

  contractSend: async (connectedApi, coinPublicKey, shieldedAddresses, amount, recipientAddress, onSuccess, onError) => {
    const { contractAddress } = get();
    if (!contractAddress) {
      onError('No contract configured. Deploy one first.');
      return;
    }
    try {
      await sendToUserFn(connectedApi, coinPublicKey, shieldedAddresses, amount, recipientAddress, onSuccess, onError, contractAddress);
    } catch (err) {
      console.error('Contract send error:', err);
      onError(err instanceof Error ? err.message : String(err));
    }
  },

  resetConnection: () => {
    set({
      connectedApi: null,
      isConnected: false,
      error: null,
      addresses: null,
      balances: null,
      config: null,
      transactionHash: null,
    });
  },

  disconnect: () => {
    localStorage.removeItem('midnight_last_wallet');
    set({
      connectedApi: null,
      isConnected: false,
      error: null,
      addresses: null,
      balances: null,
      config: null,
      transactionHash: null,
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

export function getFirstCompatibleWallet(): InitialAPI | undefined {
  const wallets = getCompatibleWallets();
  return wallets[0];
}