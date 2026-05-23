📁 **Full Source Code:** [midnight-apps/unshielded-token](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)

**Target audience:** Developers

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/package.json) with the needed packages
  - `@midnight-ntwrk/compact-runtime`
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `@midnight-ntwrk/midnight-js-node-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/wallet-sdk-dust-wallet`
  - `@midnight-ntwrk/wallet-sdk-facade`
  - `@midnight-ntwrk/wallet-sdk-hd`
  - `@midnight-ntwrk/wallet-sdk-shielded`
  - `@midnight-ntwrk/wallet-sdk-unshielded-wallet`
  - `@scure/bip39`, `react`, `react-dom`, `react-router-dom`, `semver`, `vite-plugin-node-polyfills`, `vite-plugin-top-level-await`, `vite-plugin-wasm`, `ws`, `zustand`


![Wallet connection UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/iej2avrvzu0wic5jpmvq.png)

Clone the [`dapp-connect`](https://github.com/0xfdbu/midnight-apps/tree/main/dapp-connect) project as a starting point. It includes wallet detection, connection, state polling, and the account modal — everything you need before adding smart contract operations.

```bash
git clone https://github.com/0xfdbu/midnight-apps.git
cd midnight-apps/dapp-connect
npm install
npm run dev
```

Now that you have a frontend that's ready to connect, the next step is to build the compact smart contract. Here are three core circuits that handle the native mint for unshielded token vault lifecycle:

**`mintToContract`: minting a stablecoin into the vault**

Use a padded string for the domain to define the token standard — in this case, `"stablecoin:usd"`, then call `mintUnshieldedToken` with the values.

```typescript
export circuit mintToContract(amount: Uint<64>): Bytes<32> {
    const domain = pad(32, "stablecoin:usd");
    const color = mintUnshieldedToken(
        disclose(domain),
        disclose(amount),
        left<ContractAddress, UserAddress>(kernel.self())
    );
    totalSupply = totalSupply + disclose(amount) as Uint<64>;
    return color;
}
```

> **Note:** You have to cast `amount` to `Uint<64>` when updating `totalSupply`

**`sendToUser`: transferring from vault to user**

To move tokens, `sendToUser` requires you to reconstruct the `color` using the same domain and the smart contract's address (`kernel.self()`), then pass `color` to `sendUnshielded()` to send the unshielded token.

```typescript
export circuit sendToUser(amount: Uint<64>, userAddr: UserAddress): [] {
    const domain = pad(32, "stablecoin:usd");
    const color = tokenType(disclose(domain), kernel.self());
    sendUnshielded(
        color,
        disclose(amount) as Uint<128>,
        right<ContractAddress, UserAddress>(disclose(userAddr))
    );
}
```

**`receiveTokens`: depositing into vault**

For the `receiveTokens` circuit, bit sizes matter here. Unlike the mint function, `receiveUnshielded` strictly requires a `Uint<128>` for the amount

```typescript
export circuit receiveTokens(amount: Uint<128>): [] {
    const domain = pad(32, "stablecoin:usd");
    const color = tokenType(disclose(domain), kernel.self());
    receiveUnshielded(color, disclose(amount));
}
```

View the full smart contract code in [`Contract.compact`](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/contracts/Contract.compact) on GitHub.

---

## Compiling the smart contract

Now compile the smart contract so you can use its artifacts in the frontend (verifiers, provers, ZKIR...).

First, install the Compact dev tools

```shell
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then compile

```shell
compact compile contracts/Contract.compact contracts/managed/stablecoin
```

> **Note:** Skip this step if you want to clone the [unshielded-token repository](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token). If you generate new keys, you need to redeploy because the old keys in this [path](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token/contracts/managed/stablecoin/) would no longer be usable by the frontend. A smart contract is already deployed on Preprod: `0c0ad6d96daa1b983751db2149a093c34ea73714c33fbad40d291d9e887f8084`. Paste this into the dashboard contract selector or set it in localStorage as `unshielded_contract_address` to use it.

A simple approach to quickly deploy without waiting for wallet sync: use your existing wallet extension state via [Deploy.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/unshielded-token/src/pages/Deploy.tsx) (highly recommended)

After this deployment this will set the deployed smart contract address in `localStorage`.

![Deploy page showing contract deployment with connected wallet](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/u84bdf1t71eghhip6i6o.png)

**Disclaimer:** This demonstration uses a smart contract where anybody can mint so do not use for production without proper authentication.

---

## Frontend integration

Now that your smart contract is deployed on the Preprod network, the next step is to integrate it with the frontend. Features to cover are shown below in the screenshot:

![Token operations dashboard](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/y8h4or529f14okhwd5v1.png)



---

## 1. Smart contract operations

Set up the smart contract providers

- `privateStateProvider`: uses `levelPrivateStateProvider` for persistent localStorage
- `publicDataProvider`: reads on-chain state from the indexer
- `zkConfigProvider`: loads `FetchZkConfigProvider` — compiled verifiers...
- `proofProvider`: generates zero-knowledge proofs via **connected wallet's DApp connector proof provider**
- `walletProvider`: handles `balanceTx` via `connectedApi.balanceUnsealedTransaction`
- `midnightProvider`: submits transactions via `connectedApi.submitTransaction`

> **Note:** In this tutorial, the providers are rebuilt in every function. In a production environment, initialize them once and reuse them across all operations.

The function below covers the full lifecycle of minting into the vault smart contract. The UI calls the store method `useWalletStore.getState().mintToContract(BigInt(amount))`, which wraps the service function shown below.

It runs through four stages inside a `try/catch`:

```typescript
export async function mintToContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void,
  contractAddress: string
): Promise<void> {
  try {
    // stages below
  } catch (err) {
    console.error('[Mint] Error:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}
```

**1. Load dependencies**

Define `mods` by awaiting `getModules()`, which imports the compiled smart contract dependencies. These are cached on the first call.

```typescript
const mods = await getModules();
const { indexerModule, FetchZkConfigProvider, levelModule, CompiledContract, ledger, dappConnectorProofProvider } = mods;
```

**2. Build providers**

```typescript
const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
const levelPrivateStateProvider = levelModule.levelPrivateStateProvider;
const zkConfigProvider = new FetchZkConfigProvider(window.location.origin + CONTRACT_PATH, fetch.bind(window));
const proofProvider = await dappConnectorProofProvider(connectedApi, zkConfigProvider, ledger.CostModel.initialCostModel());

const providers: any = {
  privateStateProvider: levelPrivateStateProvider({
    midnightDbName: 'midnight-stablecoin-db',
    privateStateStoreName: STORE_NAME,
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => STORAGE_PASSWORD,
  }),
  publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
  zkConfigProvider,
  proofProvider,
  walletProvider: {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
    async balanceTx(tx: any) {
      const serialized = uint8ArrayToHex(tx.serialize());
      const result = await connectedApi.balanceUnsealedTransaction(serialized);
      const bytes = hexToUint8Array(result.tx);
      return ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
    },
  },
  midnightProvider: {
    submitTx: async (tx: any): Promise<string> => {
      const serialized = uint8ArrayToHex(tx.serialize());
      await connectedApi.submitTransaction(serialized);
      return tx.identifiers()[0];
    },
  },
};
```

**3. Connect to the smart contract**

Import the smart contract module and attach it to the live instance on Preprod. `callTx` maps directly to your Compact circuits.

```typescript
const [{ findDeployedContract }] = await Promise.all([
  import('@midnight-ntwrk/midnight-js-contracts'),
]);

const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CONTRACT_PATH)
);

const contract: any = await findDeployedContract(providers, {
  contractAddress,
  compiledContract,
  privateStateId: 'stablecoinState',
  initialPrivateState: {},
});
```

**4. Execute the mint**

Generate the zero-knowledge proof, then submit the transaction and await the hash

```typescript
const txData = await contract.callTx.mintToContract(amount);
onSuccess(txData.public.txId);
```


![Mint transaction success](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/3vow9usvg56pah0kzbw7.png)

Now that you have minted tokens into the vault, the next step is to send them from the vault to an address.

First, encode the user address. The helper function parses a `Bech32m` string, decodes it to an unshielded address, and returns raw bytes because the `sendToUser` circuit expects a `Bytes<32>` field.

```typescript
export async function encodeUserAddress(bech32Address: string): Promise<Uint8Array> {
  const mods = await getModules();
  const { addressModule } = mods;
  const { MidnightBech32m, UnshieldedAddress } = addressModule;
  
  try {
    const parsed = MidnightBech32m.parse(bech32Address);
    const decoded: any = parsed.decode(UnshieldedAddress, 'preprod');
    return decoded.data;
  } catch (e) {
    console.error('[encodeUserAddress] Error:', e);
    throw new Error('Invalid address format');
  }
}
```

This function takes user input and runs it through `encodeUserAddress(recipient)`. It then calls `store.contractSend(params...)`, which invokes the `sendToUser` circuit containing `sendUnshielded`.

```typescript
  const handleSend = async () => {
    if (!amount || !recipient || !connectedApi) return;
    
    const recipientBytes = await encodeUserAddress(recipient);
    const store = useWalletStore.getState();
    const shieldedAddresses = await connectedApi.getShieldedAddresses();
    const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

    await store.contractSend(
      connectedApi,
      coinPublicKey,
      shieldedAddresses,
      BigInt(amount),
      recipientBytes,
      (txId: string) => {
        useWalletStore.getState().setTransactionHash(txId);
        useWalletStore.getState().loadWalletState();
      },
      (errMsg: string) => {
        useWalletStore.getState().setError(errMsg);
      }
    );
  };
```

![Send tokens from vault](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/k4vtqnir9kumwovgxe73.png)

Now deposit the token into the vault using `receiveUnshielded`. 

The frontend has `handleReceive`. It functions similarly to `handleSend`: `store.receiveTokens(params...)` calls the exported `receiveTokens(amount: Uint<128>)` circuit, which contains `receiveUnshielded(color, disclose(amount))`.

```typescript
   const handleReceive = async () => {
    if (!amount || !connectedApi) return;
    
    const store = useWalletStore.getState();
    const shieldedAddresses = await connectedApi.getShieldedAddresses();
    const coinPublicKey = shieldedAddresses.shieldedCoinPublicKey;

    await store.receiveTokens(
      connectedApi,
      coinPublicKey,
      shieldedAddresses,
      BigInt(amount),
      (txId: string) => {
        useWalletStore.getState().setTransactionHash(txId);
        useWalletStore.getState().loadWalletState();
      },
      (errMsg: string) => {
        useWalletStore.getState().setError(errMsg);
      }
    );
  };
```

> **Note:** Use `getShieldedAddresses()` because it retrieves both keys in one call. It returns `shieldedAddress`, `shieldedCoinPublicKey`, and `shieldedEncryptionPublicKey`.

---

## 2. Displaying statistics

The vault's smart contract `balance` state tracks token balances. After minting, query the contract via `getContractFirstTokenBalance` to identify the first token it holds. The dashboard then stores this as `selectedTokenId` in the Zustand store.

```typescript
export async function getContractBalance(contractAddress: string, tokenId: string): Promise<bigint> {
  try {
    const mods = await getModules();
    const { indexerModule } = mods;
    const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
    const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

    const contractState = await provider.queryContractState(contractAddress);
    console.log('[getContractBalance] Contract state balance:', contractState?.balance);

    if (!contractState?.balance) return 0n;

    for (const [key, value] of contractState.balance.entries()) {
      console.log('[getContractBalance] Key:', key, 'Value:', value.toString());
      if (key && typeof key === 'object' && 'raw' in key && key.raw === tokenId) {
        console.log('[getContractBalance] Found balance:', value.toString());
        return value;
      }
    }

    return 0n;
  } catch (err) {
    console.error('[getContractBalance] Error:', err);
    return 0n;
  }
}
```

`getContractFirstTokenBalance` functions similarly to `getContractBalance` but returns the first token found in the contract's balance map.

```typescript
export async function getContractFirstTokenBalance(contractAddress: string) {
  // rest of the code
  const contractState = await provider.queryContractState(contractAddress);
  if (!contractState?.balance) return null;
  for (const [key, value] of contractState.balance.entries()) {
    if (key && typeof key === 'object' && 'raw' in key) {
      return { tokenId: (key as any).raw, balance: value };
    }
  }
  return null;
}
```


Now get your token balance. First call `connectedApi.getUnshieldedBalances()` to get all wallet balances, then filter the results with `balances[tokenId]`.

```typescript
export async function getUserTokenBalance(connectedApi: ConnectedAPI, tokenId: string): Promise<bigint> {
  try {
    const balances = await connectedApi.getUnshieldedBalances();
    const tokenBalance = balances[tokenId];
    return tokenBalance || 0n;
  } catch (err) {
    console.error('[getUserTokenBalance] Error:', err);
    return 0n;
  }
}
```

To retrieve `totalSupply`, create a function `getContractState()`. It works in three stages:

```typescript
export async function getContractState(contractAddress: string): Promise<ContractState> {
  try {
    // stages below
  } catch (err) {
    console.error('[ContractState] Error:', err);
    return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
  }
}
```

**1. Query the indexer**

Fetch the raw smart contract state from the Preprod indexer.

```typescript
const mods = await getModules();
const { indexerModule } = mods;

const indexerPublicDataProvider = indexerModule.indexerPublicDataProvider;
const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);

const contractState = await provider.queryContractState(contractAddress);
if (!contractState) {
  return { totalSupply: 0n, totalBurned: 0n, burnedBalance: 0n };
}
```

**2. Deserialize into typed ledger state**

The indexer returns raw bytes. Import the smart contract module and pass the raw data through `ledger()` to get typed fields like `totalSupply` and `totalBurned`.

```typescript
const contractModule = await import(CONTRACT_PATH + '/contract/index.js');
const ledgerState = contractModule.ledger(contractState.data);
```

**3. Return the values**

```typescript
let burnedBalance = 0n;
try {
  burnedBalance = ledgerState.burnedBalance ?? 0n;
} catch {
  // burnedBalance not available in older contracts
}

return {
  totalSupply: ledgerState.totalSupply,
  totalBurned: ledgerState.totalBurned,
  burnedBalance,
};
```

## 3. Wallet operations

For displaying user receiving addresses and token balances, see section 2.

```typescript
const unshieldedAddress = await connectedApi.getUnshieldedAddress();
const unshieldedBalances = await connectedApi.getUnshieldedBalances();
```

```tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../hooks/useWallet';
import { getUserTokenBalance } from '../hooks/wallet/services/contractCalls';

export function WalletInfoPage() {
  const { connectedApi, addresses, selectedTokenId } = useWalletStore();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!connectedApi || !selectedTokenId) return;
    
    const fetchBalance = async () => {
      const bal = await getUserTokenBalance(connectedApi, selectedTokenId);
      setBalance(bal);
    };
    
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [connectedApi, selectedTokenId]);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatBalance = (bal: bigint | null): string => {
    if (bal === null) return '—';
    return bal.toLocaleString();
  };

  const formatAddress = (addr: string): string => {
    if (!addr) return '—';
    return addr.length > 24 ? `${addr.slice(0, 12)}...${addr.slice(-12)}` : addr;
  };
```

![Wallet info and balance](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/p6f6wqp5w9cxcqelbxcq.png)

Next, send the token between user wallets. The `handleSend` function — different from `contractSend` — looks like this:

```typescript
const handleSend = async () => {
    if (!amount || !recipient) return;
    await sendStablecoin(recipient, BigInt(amount));
  };
```
`sendStablecoin` wraps `connectedApi.makeTransfer`. Instead of sending `nativeToken`, it passes the token ID as the `type`, so the wallet knows which asset to transfer. The `makeTransfer` call constructs the output, balances the transaction, and returns a result. If the wallet already submitted the transaction (`result.tx_id`), it calls `onSuccess` directly. Otherwise, it submits the unsigned transaction (`result.tx`) via `connectedApi.submitTransaction` before calling `onSuccess`.

```typescript
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
    const result = await connectedApi.makeTransfer([desiredOutput]);
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
```

Key differences from `contractSend`

| | `contractSend` | `makeTransfer` |
| --- | --- | --- |
| Funds source | Vault funds | User funds |
| Mechanism | `handleSend` | DApp connector `makeTransfer` |
| Address encoding | Requires encoding → `Bytes<32>` | Passes `Bech32m` directly |
| ZK proofs | Required for circuit execution | Handled by wallet |

![Wallet-to-wallet transfer](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/rz2an0l2mqqc8jsc6h2s.png)


## When to use unshielded vs shielded tokens and the privacy trade-offs

| | **Unshielded** | **Shielded** |
| --- | --- | --- |
| Privacy mechanism | None — completely transparent blockchain transactions | Zero-knowledge proofs (Zswap) |
| Legal Compliance | Can be audited for AML | Requires keys for selective disclosure |
| Use cases | Compliant stablecoins... as required by regulators | Confidential transfers...|

## Why choose unshielded for the stablecoin

1. **Regulatory compliance:** Stablecoin issuers typically need to demonstrate full traceability of supply and transfers due to AML (anti-money laundering) regulations.

2. **Verifiability:** The vault demonstrates native mint functionality for this stablecoin. It contains a public state `totalSupply` that is publicly readable so regulators can monitor it.

3. **Exchange listings:** Many exchanges have delisted privacy coins due to regulatory pressure, while unshielded tokens such as NIGHT have been listed because they offer full transparency.

## When to choose shielded over unshielded

1. **Private tokenized securities:** Transfers are confidential while specific properties like voting rights remain verifiable.

2. **Regulated industries requiring data minimization:** In healthcare, frameworks like GDPR, CCPA, and HIPAA require minimal data disclosure. Shielded tokens ensure sensitive information stays in local storage while zero-knowledge proofs can still confirm eligibility and compliance.

3. **Forward secrecy:** Even if encryption keys are compromised in the future, shielded transactions remain private. This is something unshielded transactions cannot offer.

## Conclusion

Midnight's multi-modal design is different from other networks that enforce a single model. You are not forced into shielded transactions only, like XMR, or fully transparent ones, like Bitcoin. Instead, you can use whatever fits your use case at the circuit level.

## Next steps

Now that you have finished this tutorial, here are a few things you can do next:

- Check the full repository [source code on GitHub](https://github.com/0xfdbu/midnight-apps/tree/main/unshielded-token)
- Read the Midnight Compact language docs
- Add authentication / allowlist for mint

## Troubleshooting

- **"Wallet not detected"** → Make sure 1AM or Lace browser extensions are installed.
- **Transactions failing** → Make sure you have tDUST and that the wallet is fully synced.