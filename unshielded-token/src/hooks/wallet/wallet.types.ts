import type { InitialAPI, ConnectedAPI, Configuration as WalletConfiguration } from '@midnight-ntwrk/dapp-connector-api';

export interface WalletAddresses {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
  unshieldedAddress: string;
  dustAddress: string;
}

export interface WalletBalances {
  shielded: Record<string, bigint>;
  unshielded: Record<string, bigint>;
  dust: { balance: bigint; cap: bigint };
}

export interface WalletError {
  type: 'DAppConnectorAPIError';
  code: string;
  message: string;
}

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
}

export interface ContractResult {
  public: {
    txId: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}