Here are the V4 requirements and implementation instructions for the DApp Connector API tutorial.

---

## Requirements for DApp Connector API V4 Tutorial

### Installation

```bash
npm install @midnight-ntwrk/dapp-connector-api
```

Or with Yarn:

```bash
yarn add @midnight-ntwrk/dapp-connector-api
```

[[DApp Connector API](https://docs.midnight.network/api-reference/dapp-connector)]

---

## Core V4 Concepts

### 1. Wallet Discovery

Wallets are exposed under `window.midnight.{walletId}`. Use `semver` to filter compatible wallets.

```typescript
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import semver from 'semver';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

function getFirstCompatibleWallet(): InitialAPI | undefined {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
}
```

[[bboard example](https://github.com/midnightntwrk/example-bboard/blob/main/bboard-ui/src/contexts/BrowserDeployedBoardManager.ts#L219-L282)]

---

### 2. Connecting to a Wallet

Replace `enable()` / `isEnabled()` with `connect(networkId)`. Valid network IDs: `'preview'`, `'preprod'`, `'mainnet'`, `'undeployed'` (local dev).

```typescript
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

const wallet = window.midnight?.mnLace; // or use discovery above
const connectedApi: ConnectedAPI = await wallet.connect('preprod');
```

[[React wallet guide](https://docs.midnight.network/guides/react-wallet-connect#set-up-a-react-project)]

---

### 3. Check Connection Status

Replace `isEnabled()` with `getConnectionStatus()`.

```typescript
const status = await connectedApi.getConnectionStatus();
// status.status === 'connected'
// status.networkId === 'preprod'
```

[[DApp Connector API](https://docs.midnight.network/api-reference/dapp-connector)]

---

### 4. Get Configuration (Service URIs)

Replace `serviceUriConfig()` with `getConfiguration()`. DApps **must** use these URIs to respect user preferences.

```typescript
const config = await connectedApi.getConfiguration();
// config.indexerUri
// config.indexerWsUri
// config.proverServerUri  (optional, may be undefined)
// config.substrateNodeUri
// config.networkId
```

[[query wallet state](https://docs.midnight.network/api-reference/dapp-connector#query-wallet-state-and-initiate-transactions)]

---

### 5. Read Wallet Addresses & Balances

Replace the single `state()` call with granular methods.

```typescript
const shieldedAddresses = await connectedApi.getShieldedAddresses();
// shieldedAddresses.shieldedAddress
// shieldedAddresses.shieldedCoinPublicKey
// shieldedAddresses.shieldedEncryptionPublicKey

const unshieldedAddress = await connectedApi.getUnshieldedAddress();
const dustAddress = await connectedApi.getDustAddress();

const shieldedBalances = await connectedApi.getShieldedBalances();
const unshieldedBalances = await connectedApi.getUnshieldedBalances();
const dustBalance = await connectedApi.getDustBalance();
```

[[DApp integration](https://docs.midnight.network/sdks/official/wallet-developer-guide#dapp-integration)]

---

### 6. Transaction Balancing

Replace `balanceAndProveTransaction(tx, newCoins)` with two distinct methods:

| Method | When to use |
|---|---|
| `balanceUnsealedTransaction(tx)` | Contract interactions (most common) |
| `balanceSealedTransaction(tx)` | Completing a swap (sealed tx from another party) |

```typescript
// For contract interactions:
const serializedTx = toHex(tx.serialize());
const { tx: balancedTx } = await connectedApi.balanceUnsealedTransaction(serializedTx);

// For swap completion:
const { tx: balancedTx } = await connectedApi.balanceSealedTransaction(sealedTxHex);
```

[[breaking changes](https://docs.midnight.network/relnotes/dapp-connector-api/dapp-connector-api-4-0-0#breaking-changes)]

---

### 7. Submit a Transaction

```typescript
await connectedApi.submitTransaction(balancedTx);
```

---

### 8. Make a Transfer (Payment)

```typescript
import { nativeToken } from '@midnight-ntwrk/ledger-v8';

const tx = await connectedApi.makeTransfer([{
  kind: 'unshielded',
  type: nativeToken().raw,
  value: 10_000_000, // 10 Night
  recipient: 'mn_addr1...'
}]);
await connectedApi.submitTransaction(tx);
```

[[examples](https://docs.midnight.network/api-reference/dapp-connector#examples)]

---

### 9. Error Handling

Replace `instanceof APIError` with a type check.

```typescript
try {
  await connectedApi.submitTransaction(tx);
} catch (error) {
  if (error.type === 'DAppConnectorAPIError') {
    console.log(error.code);
    // New V4 codes: 'PermissionRejected', 'Disconnected'
  }
}
```

[[breaking changes](https://docs.midnight.network/relnotes/dapp-connector-api/dapp-connector-api-4-0-0#breaking-changes)]

---

## Quick V4 Migration Cheat Sheet

| V3 (deprecated) | V4 |
|---|---|
| `DAppConnectorAPI` | `InitialAPI` |
| `DAppConnectorWalletAPI` | `WalletConnectedAPI` / `ConnectedAPI` |
| `wallet.enable()` | `wallet.connect(networkId)` |
| `wallet.isEnabled()` | `connectedApi.getConnectionStatus()` |
| `walletApi.state()` | `getShieldedAddresses()`, `getShieldedBalances()`, etc. |
| `balanceAndProveTransaction(tx, newCoins)` | `balanceUnsealedTransaction(tx)` |
| `serviceUriConfig()` | `getConfiguration()` |
| `instanceof APIError` | `error.type === 'DAppConnectorAPIError'` |
| `ServiceUriConfig` type | `Configuration` type |

[[DApp Connector v4.0.0](https://docs.midnight.network/relnotes/dapp-connector-api/dapp-connector-api-4-0-0)]