📁 **Full source code:** [midnight-apps/shielded-token](https://github.com/0xfdbu/midnight-apps/tree/main/shielded-token)

**Target audience:** Developers

This tutorial walks you through building a complete shielded token DApp on the Midnight network. You will deploy a Compact smart contract, implement operations such as minting, transferring, and burning tokens, generate zero-knowledge proofs, and build a React frontend that lets users interact with shielded tokens in the browser.

Shielded tokens differ from unshielded tokens in that all balances and amounts remain hidden from on-chain explorers. Only the wallet owner can decrypt their balances locally. The smart contract proves correctness via zero-knowledge proofs without revealing any sensitive values. Public state variables such as `totalSupply` and `totalBurned` track aggregate metrics, while individual coin values, recipients, and the transaction graph remain private.

---

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/shielded-token/package.json) with the needed packages
  - `@midnight-ntwrk/compact-runtime`
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/wallet-sdk-address-format`
  - `react`, `react-dom`, `react-router-dom`, `zustand`, `semver`

---

## 1. Building and compiling the smart contract

The smart contract for shielded tokens resides in `contracts/Token.compact`. It manages public counters such as `totalSupply` and `totalBurned`, and uses the Zswap shielded token primitives to create, transfer, and destroy private coins.

### Public ledger state

Create these two essential public counters to track the token lifecycle:

```compact

// --- Public ledger state ---

export ledger totalSupply: Uint<64>;
export ledger totalBurned: Uint<128>;
```

These two are public: they do not contain any sensitive or private information. They only track `totalSupply` and `totalBurned`; the ownership of the shielded tokens remains private.

### Witnesses for private data

The Compact smart contract for shielded tokens requires a source of randomness for coin nonces. Each shielded coin needs to have a unique nonce so its commitment is distinct:

```compact

// --- Witnesses for private/off-chain data ---

witness localNonce(): Bytes<32>;
```

For every mint, a fresh random 32-byte nonce is generated. It lives in the TypeScript layer and is bound into the zero-knowledge proof generation.

### TypeScript witness binding

`localNonce` witness is integrated in `contract.ts` and is attached to the compiled smart contract before deployment or circuit calling:

```typescript
const witnesses = {
  localNonce: ({ privateState }: any): [any, Uint8Array] => {
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    return [privateState, nonce];
  },
};

const withWitnesses = (CompiledContract as any).withWitnesses(witnesses);
const compiledContract = withWitnesses(withAssets(cc));
```

The witness receives the current private and must return `[nextPrivateState, witnessValue]`. The private state is passed through and a cryptographically secure nonce is generated.

### Minting a shielded token

The first circuit is `createShieldedToken`. It mints a new shielded token with a unique nonce and sends it to a recipient:

```compact

// --- Minting to self ---

export circuit createShieldedToken(
    amount: Uint<64>,
    recipient: Either<ZswapCoinPublicKey, ContractAddress>
): ShieldedCoinInfo {
    const domain = pad(32, "shielded:token");
    const nonce = localNonce();
    const coin = mintShieldedToken(
        disclose(domain),
        disclose(amount),
        disclose(nonce),
        disclose(recipient)
    );
    totalSupply = (totalSupply + disclose(amount)) as Uint<64>;
    return coin;
}
```

`mintShieldedToken` is a ledger primitive. It creates a new shielded token commitment. The domain separates this token from others on the network, and the nonce ensures its uniqueness.

> **Note:** `disclose()` is required because the ledger needs to see the recipient on-chain in order to route the output correctly. Only the recipient can decrypt the actual amount.

### The atomic mint-and-send pattern

`mintAndSend` is the most important circuit in this smart contract. It atomically mints a coin and forwards it to a recipient in one transaction without any Merkle qualification needed:

```compact

// --- Minting and sending ---

export circuit mintAndSend(
    amount: Uint<64>,
    recipient: Either<ZswapCoinPublicKey, ContractAddress>
): ShieldedSendResult {
    const domain = pad(32, "shielded:token");
    const nonce = localNonce();

    // Mint to contract first
    const coin = mintShieldedToken(
        disclose(domain),
        disclose(amount),
        disclose(nonce),
        right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
    );

    // Immediately forward — no Merkle qualification needed
    const result = sendImmediateShielded(
        disclose(coin),
        disclose(recipient),
        disclose(amount) as Uint<128>
    );

    totalSupply = (totalSupply + disclose(amount)) as Uint<64>;
    return result;
}
```

`sendImmediateShielded` spends a token that was created in the **same transaction**. The kernel pairs the mint and spend internally using `mt_index: 0`, meaning no on-chain Merkle path lookup is needed.

The `ShieldedSendResult` contains two fields:
- `sent`: the coin that was sent to the recipient
- `change`: a `Maybe<ShieldedCoinInfo>` containing any remainder

### The Merkle tree constraint

To understand why tokens need to be committed to the on-chain Merkle tree: freshly minted shielded tokens are not immediately spendable in an independent transaction. Thus the exported circuit `transferShielded` requires `QualifiedShieldedCoinInfo` (which includes `mt_index`), while the `mintAndSend` circuit bypasses this by using `sendImmediateShielded`.

```compact
export circuit transferShielded(
    coin: QualifiedShieldedCoinInfo,
    recipient: Either<ZswapCoinPublicKey, ContractAddress>,
    amount: Uint<128>
): ShieldedSendResult {
    const result = sendShielded(disclose(coin), disclose(recipient), disclose(amount));
    return result;
}
```

`sendShielded` requires a Merkle inclusion proof from `coin.mt_index` to the current Zswap root. The prover must have this path, and the verifier checks it against the on-chain root. If the wallet's local Zswap state is even slightly out of sync with the verifier's expected root, then the proof fails.

This is a trade-off to be considered carefully depending on your use case(s):

| Primitive | Requires `mt_index` | Use case |
|-----------|---------------------|----------|
| `sendImmediateShielded` | No | Same-tx mint/send or deposit/burn |
| `sendShielded` | Yes | Spending previously committed coins |

### Burning shielded tokens

The `depositAndBurn` circuit burns the received coin in the **same transaction**:

```compact
export circuit depositAndBurn(
    coin: ShieldedCoinInfo,
    amount: Uint<128>
): ShieldedSendResult {
    receiveShielded(disclose(coin));
    const burnAddr = shieldedBurnAddress();
    const result = sendImmediateShielded(
        disclose(coin),
        burnAddr,
        disclose(amount)
    );
    totalBurned = (totalBurned + disclose(amount)) as Uint<128>;
    return result;
}
```

`receiveShielded` declares that the smart contract receives the coin. The wallet's balancer adds a matching input automatically. `shieldedBurnAddress()` is a ledger constant on the Midnight network; coins sent there are permanently removed from the circulating supply.

> **Important Caveat:** `sendImmediateShielded` sends change to `kernel.self()` (the smart contract). Thus a partial burn leaves a contract-owned shielded output that is not tracked elsewhere. The UI enforces full burn by default to avoid this.

### Additional circuits

**`nextNonce`** is used to derive a deterministic nonce sequence:

```compact
export circuit nextNonce(index: Uint<128>, currentNonce: Bytes<32>): Bytes<32> {
    return evolveNonce(disclose(index), disclose(currentNonce));
}
```

`evolveNonce` is used to derive the next nonce from a counter index and current nonce; it's useful for applications requiring deterministic nonce sequences.

View the full contract in [`Token.compact`](https://github.com/0xfdbu/midnight-apps/blob/main/shielded-token/contracts/Token.compact).

### Compiling the compact smart contract

Install the Compact compiler:

```shell
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then compile:

```shell
compact compile contracts/Token.compact src/contracts
```

This will generate files and folders such as `keys` and `zkir`, all of which are essential for deploying and interacting with the smart contract later.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1ru32dsi7f9boujot6oj.png)

> **Note:** You can skip this step if you cloned the repo, as compiled artifacts are already included. However, if you recompile, you will not be able to use the deployed smart contract because the old verification keys will no longer match.

---

## 2. React UI implementation

Using the smart contract-generated artifacts in `src/contracts` from the frontend involves a few steps:

### Wallet provider setup

Midnight wallets inject a global `window.midnight` object before page load.

Start with the constants:

```typescript
// src/hooks/wallet.constants.ts
export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
export const NETWORK_ID = 'preprod';
```

**Note:** `COMPATIBLE_CONNECTOR_API_VERSION` is `'4.x'`, not `'^4.0.0'`. The `'4.x'` semver range accepts any `4.x.y` version the wallet reports.

The detection function enumerates `window.midnight`, validates each entry, and filters by version.

```typescript
// src/hooks/useWallet.ts
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
```

When `wallet.connect(networkId)` is called, it triggers the wallet extension connection flow.

```typescript
// src/hooks/useWallet.ts
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
```

Or if you want, you can use a starter I built, [dapp-connect](https://github.com/0xfdbu/midnight-apps/tree/main/dapp-connect).

First, start by cloning the repository.

```shell
git clone https://github.com/0xfdbu/midnight-apps.git
```

Run the starter and install dependencies.

```shell
cd midnight-apps/dapp-connect
npm install
npm run dev
```

### Building the providers and the TypeScript API

Before continuing, you need a helper function to build the providers.

```typescript
// src/hooks/wallet/services/providers.ts

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { INDEXER_HTTP, INDEXER_WS, CONTRACT_PATH, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import type { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { Transaction, CostModel } from '@midnight-ntwrk/ledger-v8';
```

Provider builder function:

``` typescript
export async function buildProviders(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
  contractAddress?: string,
  existingPrivateStateProvider?: any
): Promise<MidnightProviders> {
  const fetchProvider = new FetchZkConfigProvider(
    `${window.location.origin}${CONTRACT_PATH}`,
    fetch.bind(window)
  );
  const zkConfigProvider = new ArtifactValidatingProvider(fetchProvider);

  const privateStateProvider = existingPrivateStateProvider || levelPrivateStateProvider({
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
  });

  if (contractAddress) {
    privateStateProvider.setContractAddress(contractAddress);
  }

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    zkConfigProvider,
    proofProvider: await dappConnectorProofProvider(connectedApi, zkConfigProvider, CostModel.initialCostModel()),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => encryptionPublicKey,
      async balanceTx(tx: any, _ttl?: Date): Promise<any> {
        const serializedTx = toHex(tx.serialize());
        const received = await connectedApi.balanceUnsealedTransaction(serializedTx);
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      async submitTx(tx: any): Promise<string> {
        await connectedApi.submitTransaction(toHex(tx.serialize()));
        const txIdentifiers = (tx as any).identifiers();
        return txIdentifiers?.[0] ?? '';
      },
    },
  };
}
```

Now proceed to create the hook for the TypeScript API. These are some of the essential imports for the API

```typescript
// src/hooks/wallet/services/api.ts

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { buildProviders } from './providers';
import { getContract, createInitialPrivateState } from './contract';
import { INDEXER_HTTP, INDEXER_WS, CONTRACT_PATH, PRIVATE_STATE_ID, PRIVATE_STATE_PASSWORD } from '../wallet.constants';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
```

### Deploying the smart contract

`deployTokenContract` builds a `CompiledContract` instance, binds the `localNonce` witness, attaches the compiled ZK artifacts, and then calls `deployContract` with the providers:

```typescript
// src/hooks/wallet/services/api.ts

export async function deployTokenContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string
): Promise<string> {
  const { deployContract } = await import('@midnight-ntwrk/midnight-js-contracts');
  const privateStateProvider = await ensurePrivateState(coinPublicKey, 'tmp-deploy');
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, undefined, privateStateProvider);

  const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);
  const cc: any = CompiledContract.make('shielded-token', contractModule.Contract);
  const withWitnesses = (CompiledContract as any).withWitnesses({
    localNonce: ({ privateState }: any): [any, Uint8Array] => {
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      return [privateState, nonce];
    },
  });
  const withAssets = (CompiledContract as any).withCompiledFileAssets(CONTRACT_PATH);
  const compiledContract = withWitnesses(withAssets(cc));

  const deployed = await deployContract(providers as any, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: createInitialPrivateState(),
    args: [],
  } as any);

  const address = deployed.deployTxData.public.contractAddress;
  localStorage.setItem('shielded_token_contract', address);
  return address;
}
```

Wire `deployTokenContract` into the frontend

```typescript
// src/pages/Deploy.tsx
// Other imports
import { useWalletStore } from '../hooks/useWallet';
import { deployTokenContract } from '../hooks/wallet/services/api';

  const handleDeploy = async () => {
    if (!connectedApi || !addresses?.shieldedCoinPublicKey || !addresses?.shieldedEncryptionPublicKey) {
      setError('Wallet not fully connected');
      return;
    }
    setStatus('pending');
    setError(null);

    try {
      const addr = await deployTokenContract(
        connectedApi,
        addresses.shieldedCoinPublicKey,
        addresses.shieldedEncryptionPublicKey
      );
      setContractAddress(addr);
      setStatus('success');
    } catch (err) {
      console.error('[Deploy] Error:', err);
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setStatus('error');
    }
  };
```

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/z2te4bhfpoyt9smo8xol.png)

The smart contract address is then saved to `localStorage`.

> **Note:** The same API pattern used in `deployTokenContract` will be used for calling the compiled circuits. View full API [api.ts](https://github.com/0xfdbu/midnight-apps/blob/main/shielded-token/src/hooks/wallet/services/api.ts)

### Minting tokens

The Mint page has two modes: **Mint to Self** and **Mint & Send**.

**Mint to Self** calls `createShieldedToken` and sends the minted coin into the user's shielded coin public key:

```typescript
const selfRecipient = {
  is_left: true,
  left: { bytes: parseKeyBytes(addresses.shieldedCoinPublicKey) },
  right: { bytes: ZERO_BYTES32 },
};

const result = await callCreateShieldedToken(
  connectedApi,
  addresses.shieldedCoinPublicKey,
  addresses.shieldedEncryptionPublicKey,
  value,
  selfRecipient
);
```


![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/bekl3z9psnkc6trlkm9m.png)

When a mint is successful, `Nonce`, `Color`, and `Value` are stored in `localStorage` so they can be referenced later during the burn phase.

**Mint & Send** calls `mintAndSend` and sends the freshly minted coins to the address the user entered:

```typescript
const recipientBytes = parseShieldedAddress(recipient);
const recipientEither = {
  is_left: true,
  left: { bytes: recipientBytes },
  right: { bytes: ZERO_BYTES32 },
};

const result = await callMintAndSend(
  connectedApi,
  addresses.shieldedCoinPublicKey,
  addresses.shieldedEncryptionPublicKey,
  value,
  recipientEither
);
```
A small utility function, `parseShieldedAddress`, extracts the 32 bytes from the user-typed shielded address

```typescript
/**
 * Parse a Bech32m shielded address (e.g. `m1q...`) and extract the 32-byte
 * shielded coin public key that the smart contract expects as a recipient.
 */
export function parseShieldedAddress(address: string): Uint8Array {
  try {
    const parsed = MidnightBech32m.parse(address);
    const shieldedAddr = ShieldedAddress.codec.decode(getNetworkId(), parsed);
    return new Uint8Array(shieldedAddr.coinPublicKey.data);
  } catch {
    throw new Error('Invalid shielded address. Paste a Bech32m address starting with the network prefix.');
  }
}
```

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/do8qhow4kyd91tx6fqh1.png)

When a mint is successful, `Nonce`, `Color`, and `Value` are stored in `localStorage` so they can be referenced later during the burn phase. This means users won't need to enter the values manually when they are already stored in `localStorage`.

> **Note:** The `createShieldedToken` circuit returns `ShieldedCoinInfo`, while the `mintAndSend` circuit returns a `ShieldedSendResult` containing `sent` and `change`. For `mintAndSend` with exact amounts, `change` is typically `None`.

### Coin storage

Shielded coins are different from unshielded ones: they are private, and the wallet does not expose an API to enumerate them with their nonces, so the DApp stores mint results in `localStorage`.

```typescript
export interface StoredCoin {
  id: string;
  nonce: string;
  color: string;
  value: string;
  source: 'mint' | 'mintAndSend' | 'change';
  txId: string;
  createdAt: string;
}
```

Mint page writes using `saveStoredCoins` and burn page reads using `getStoredCoins`. Sending tokens from wallet does not require reading or writing.

### Sending tokens

The send page uses the wallet's native `makeTransfer` for shielded transfers. The wallet handles everything, including proving; however, you still need to call `submitTransaction` to broadcast it:

```typescript
const desiredOutput = {
  kind: 'shielded' as const,
  type: selectedToken,
  value,
  recipient: recipientClean,
};

const result = await connectedApi.makeTransfer([desiredOutput]);
if (result.tx) {
  await connectedApi.submitTransaction(result.tx);
}
```

`makeTransfer` is the most convenient way of sending shielded tokens using the DApp Connector API.

### Burning tokens

The Burn page uses the `depositAndBurn` circuit to destroy stored coins


```typescript
const coin = {
  nonce: hexToUint8Array(selectedCoin.nonce),
  color: hexToUint8Array(selectedCoin.color),
  value: BigInt(selectedCoin.value),
};

const result = await callDepositAndBurn(
  connectedApi,
  addresses.shieldedCoinPublicKey,
  addresses.shieldedEncryptionPublicKey,
  coin,
  BigInt(amount)
);
```

After burning, the coin is removed from `localStorage`.

```typescript
const updatedCoins = getStoredCoins().filter((c) => c.id !== selectedCoin.id);
saveStoredCoins(updatedCoins);
```

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0jjlnd47pzj0g5fr7msn.png)

> **Caveat:** `sendImmediateShielded` sends change to `kernel.self()` (smart contract). Therefore, a partial burn leaves a contract-owned shielded output that is not tracked anywhere, which is why the UI enforces a full burn by default to avoid this.

### Home and balance display

The main dashboard displays 3 types of data:

**Shielded balance(s)** - it displays the combined balance of tokens, `shieldedBalanceTotal`, that enumerates across all balances. It also calls `connectedApi.getShieldedBalances()` internally and refreshes every 15 seconds:

```typescript
const { balances, loadWalletState } = useWalletStore();

useEffect(() => {
  if (!isConnected) return;
  loadWalletState();
  const id = setInterval(() => loadWalletState(), 15_000);
  return () => clearInterval(id);
}, [isConnected, loadWalletState]);

const shieldedBalanceTotal = (() => {
  if (!balances?.shielded) return null;
  const entries = Object.entries(balances.shielded);
  if (entries.length === 0) return 0n;
  return entries.reduce((sum, [, v]) => sum + (v ?? 0n), 0n);
})();
```

**Contract states** like `totalSupply` and `totalBurned` are fetched via the `getContractState` helper, which uses `ledger()` to deserialize the raw bytes into readable data.

```typescript
const [stats, setStats] = useState<{ totalSupply: bigint; totalBurned: bigint } | null>(null);

useEffect(() => {
  if (contractAddress) {
    getContractState(contractAddress).then(setStats);
  }
}, [contractAddress]);
```

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/mu2m532x96rkjppm869p.png)

---

## 3. The mint-and-send atomic pattern

The `mintAndSend` circuit pattern solves a critical problem in shielded token design.

The main **issue** is that a freshly minted shielded coin is not immediately spendable via `sendShielded` when it has not yet been committed to the Merkle tree. If you mint a coin in transaction X, you cannot spend it in transaction X+1 without waiting for it to be included in the Merkle tree and obtaining its `mt_index`.

`sendImmediateShielded` is different, it bypasses the Merkle qualification by using `mt_index: 0`.

**The circuit pattern:**
1. `mintShieldedToken(..., kernel.self())` — mint shielded coins to the kernel (smart contract)
2. `sendImmediateShielded(coin, recipient, amount)` — forward to the recipient

Either both steps succeed, or the entire transaction fails. The recipient receives a fully qualified shielded coin that is spendable in future transactions with `sendShielded` once it is committed to the Merkle tree.

`depositAndBurn` circuit pattern:
1. `receiveShielded(coin)` — deposits user coins into the transaction
2. `sendImmediateShielded(coin, burnAddr, amount)` — burn it immediately in the same transaction

This atomic pattern makes it possible to burn a shielded coin through the smart contract without using `sendShielded` with `mt_index`, which **requires** the commitment of the coin to the Merkle tree.

---

## 4. Key architectural decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Proving strategy | `dappConnectorProofProvider` (wallet-backed) | Built-in ledger circuits like `output` are not generated by the Compact compiler; the wallet has them |
| Send path | Wallet `makeTransfer` for transfers, smart contract `depositAndBurn` for burns | `makeTransfer` handles change correctly; smart contract burns update `totalBurned` |
| Coin storage | `localStorage` via `coinStore.ts` | The DApp Connector API does not expose individual coin nonces; storing mint results enables smart contract burns |
| Burn default | Full burn | Partial burns via `depositAndBurn` lock change in the smart contract |
| Network | Preprod | Testnet with faucet support |

---

## Conclusion

You have now built a complete shielded token DApp that demonstrates the ability to mint privacy-preserving tokens with `mintShieldedToken`, atomically forward freshly minted coins with `sendImmediateShielded`, burn tokens with `receiveShielded` + `sendImmediateShielded`, and finally build a React frontend with deploy, mint, send, burn, and balance display.

It is important to distinguish between `sendImmediateShielded` (bypasses Merkle path before spending) and `sendShielded` (requires `mt_index`). Understanding this correctly determines whether the coins you minted are immediately spendable or locked.

## Next steps

- Check the full repository [source code on GitHub](https://github.com/0xfdbu/midnight-apps/tree/main/shielded-token)
- Read the Midnight Compact language docs
- Experiment with `transferShielded` by storing `mt_index` for committed coins
- Add admin authentication to restrict minting privileges

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Shielded balance shows 0 after mint | Wallet hasn't synced the mint block yet | Wait 15s (auto-refresh) or open wallet extension to trigger sync |
| Burn page empty dropdown | Burn only shows DApp-minted coins, not wallet-received coins | Use Send page (`makeTransfer` to burn address) for wallet balance burns |
| Wallet disconnects during proving | ZK proof generation timed out in wallet popup | Reconnect wallet, ensure extension is active and unlocked |
| `"Invalid shielded address"` on Mint & Send | Recipient field expects Bech32m, not raw hex | Use `parseShieldedAddress()` to decode the wallet's shielded address |
| `Invalid Transaction: Custom error: 138` on burn | 1AM wallet dust sponsoring interferes with contract call balancing | Turn off dust sponsoring in 1AM wallet settings |
| `"No compatible wallet found"` | Extension API version outside `4.x` | Update Lace or 1AM to latest version |