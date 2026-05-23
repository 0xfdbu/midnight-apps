import type { ConnectedAPI, DesiredOutput } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
// STABLECOIN_TOKEN removed — token is now passed dynamically
import { handleWalletError } from '../wallet.utils';

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

export async function checkConnectionStatus(connectedApi: ConnectedAPI): Promise<boolean> {
  try {
    const status = await connectedApi.getConnectionStatus();
    return status.status === 'connected';
  } catch {
    return false;
  }
}

export async function sendStablecoin(
  connectedApi: ConnectedAPI,
  recipient: string,
  amount: bigint,
  tokenId: string,
  onSuccess: () => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const desiredOutput: DesiredOutput = {
      kind: 'unshielded',
      type: tokenId,
      value: amount,
      recipient,
    };
    const result: any = await connectedApi.makeTransfer([desiredOutput]);
    console.log('[sendStablecoin] makeTransfer result:', result);

    if (result.tx_id) {
      onSuccess();
      return;
    }

    if (result.tx) {
      await connectedApi.submitTransaction(result.tx);
      onSuccess();
      return;
    }

    onSuccess();
  } catch (err) {
    if ((err as any)?.type === 'DAppConnectorAPIError' && (err as any)?.code === 'Disconnected') {
      throw err;
    }
    onError(handleWalletError(err));
  }
}
