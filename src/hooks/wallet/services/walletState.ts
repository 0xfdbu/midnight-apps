import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { DesiredOutput } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NATIVE_TOKEN_TYPE } from '../wallet.constants';
import { isWalletError, handleWalletError } from '../wallet.utils';

async function reconnectWallet(): Promise<ConnectedAPI> {
  const midnight = (window as any).midnight as Record<string, InitialAPI> | undefined;
  if (!midnight) {
    throw new Error('No wallet found. Please install and connect Lace wallet.');
  }
  
  const wallet = midnight.mnLace || Object.values(midnight)[0];
  if (!wallet) {
    throw new Error('No wallet found. Please install and connect Lace wallet.');
  }
  
  const connectedApi = await wallet.connect('preprod');
  setNetworkId('preprod');
  return connectedApi;
}

export async function connectWallet(
  connectedApi: ConnectedAPI,
  onError: (err: string) => void
): Promise<void> {
  try {
    const status = await connectedApi.getConnectionStatus();
    if (status.status === 'disconnected') {
      throw new Error('Wallet disconnected');
    }
    setNetworkId(status.networkId);
  } catch (err) {
    onError(handleWalletError(err));
    throw err;
  }
}

export async function loadWalletState(
  connectedApi: ConnectedAPI,
  setState: (state: {
    addresses: {
      shieldedAddress: string;
      shieldedCoinPublicKey: string;
      shieldedEncryptionPublicKey: string;
      unshieldedAddress: string;
      dustAddress: string;
    };
    balances: {
      shielded: Record<string, bigint>;
      unshielded: Record<string, bigint>;
      dust: { balance: bigint; cap: bigint };
    };
    config: unknown;
  }) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const status = await connectedApi.getConnectionStatus();
    if (status.status === 'disconnected') {
      throw new Error('Wallet disconnected');
    }

    const [shieldedAddresses, shieldedBalances, unshieldedBalances, dustBalance, config] = await Promise.all([
      connectedApi.getShieldedAddresses(),
      connectedApi.getShieldedBalances(),
      connectedApi.getUnshieldedBalances(),
      connectedApi.getDustBalance(),
      connectedApi.getConfiguration(),
    ]);

    const unshieldedAddress = await connectedApi.getUnshieldedAddress();
    const dustAddress = await connectedApi.getDustAddress();

    setState({
      addresses: {
        shieldedAddress: shieldedAddresses.shieldedAddress,
        shieldedCoinPublicKey: shieldedAddresses.shieldedCoinPublicKey,
        shieldedEncryptionPublicKey: shieldedAddresses.shieldedEncryptionPublicKey,
        unshieldedAddress: unshieldedAddress.unshieldedAddress,
        dustAddress: dustAddress.dustAddress,
      },
      balances: {
        shielded: shieldedBalances,
        unshielded: unshieldedBalances,
        dust: dustBalance,
      },
      config,
    });
  } catch (err) {
    onError(handleWalletError(err));
  }
}

export async function makeTransfer(
  connectedApi: ConnectedAPI,
  recipient: string,
  amount: bigint,
  onSuccess: () => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const desiredOutput: DesiredOutput = {
      kind: 'unshielded',
      type: NATIVE_TOKEN_TYPE,
      value: amount,
      recipient,
    };
    const result = await connectedApi.makeTransfer([desiredOutput]);
    const balancedResult = await connectedApi.balanceUnsealedTransaction(result.tx);
    await connectedApi.submitTransaction(balancedResult.tx);
    onSuccess();
  } catch (err) {
    if (isWalletError(err) && err.code === 'Disconnected') {
      throw err;
    }
    onError(handleWalletError(err));
  }
}

export async function completeSwapTransaction(
  connectedApi: ConnectedAPI,
  sealedTransaction: string,
  onSuccess: () => void,
  onError: (err: string) => void
): Promise<void> {
  let api = connectedApi;
  
  const tryOperation = async (): Promise<void> => {
    console.log('[CompleteSwap] Input sealed tx length:', sealedTransaction.length);
    console.log('[CompleteSwap] Input sealed tx (first 100 chars):', sealedTransaction.substring(0, 100));

    try {
      const status = await api.getConnectionStatus();
      if (status.status === 'disconnected') {
        throw new Error('Wallet disconnected. Please reconnect your wallet and try again.');
      }
    } catch (e) {
      console.log('[CompleteSwap] Connection check failed, reconnecting...');
      api = await reconnectWallet();
    }

    console.log('[CompleteSwap] Calling balanceUnsealedTransaction...');
    const balancedResult = await api.balanceUnsealedTransaction(sealedTransaction);
    console.log('[CompleteSwap] Balanced tx length:', balancedResult.tx.length);

    console.log('[CompleteSwap] Calling submitTransaction...');
    await api.submitTransaction(balancedResult.tx);
    console.log('[CompleteSwap] SUCCESS');

    onSuccess();
  };

  try {
    await tryOperation();
  } catch (err) {
    console.error('[CompleteSwap] Error:', err);
    const errName = (err as any)?.constructor?.name;
    const errMsg = (err as any)?.message;
    
    if (errName === 'RemoteApiShutdownError') {
      console.log('[CompleteSwap] RemoteApiShutdownError, attempting reconnect...');
      try {
        api = await reconnectWallet();
        await tryOperation();
        return;
      } catch (retryErr) {
        onError('Wallet connection lost. Please refresh the page and reconnect your wallet.');
        return;
      }
    }
    
    if (isWalletError(err as any) && (err as any).code === 'Disconnected') {
      onError('Wallet disconnected. Please reconnect and try again.');
      return;
    }
    
    onError(errMsg || handleWalletError(err));
  }
}

export async function checkConnectionStatus(connectedApi: ConnectedAPI): Promise<boolean> {
  try {
    const status = await connectedApi.getConnectionStatus();
    return status.status === 'connected';
  } catch {
    return false;
  }
}