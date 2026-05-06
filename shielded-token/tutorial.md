# Building a Shielded Token DApp on Midnight

This guide walks through building a complete shielded token DApp on the Midnight Network. You learn how to design a Compact smart contract for minting, transferring, and burning privacy-preserving tokens; implement TypeScript witnesses; integrate wallet proving through the DApp Connector API; and build a React frontend that lets users interact with shielded tokens without ever exposing private balances or amounts to on-chain observers.

You also learn the critical distinction between `sendShielded` (which requires Merkle tree qualification) and `sendImmediateShielded` (which operates on coins before they are committed to the Merkle tree), and why this shapes both contract design and UI architecture.

**Target audience:** Developers

---

## Prerequisites

- Node.js installed (v20+)
- A Midnight wallet (for example, 1AM or Lace) with Preprod NIGHT tokens
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens for transaction fees
- The Compact compiler installed globally:
  ```bash
  npm install -g @midnight-ntwrk/compact
  ```
- A [`package.json`](./package.json) with the needed packages:
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/wallet-sdk-address-format`
  - `react`, `react-dom`, `react-router-dom`
  - `zustand`, `semver`
  - `typescript`, `vite`

---

## Architecture: shielded tokens and the UTXO model

Midnight shielded tokens operate on a UTXO (Unspent Transaction Output) model, similar to Bitcoin but with zero-knowledge proofs. Every shielded token is a "coin" with three fields:

- **nonce**: A unique 32-byte identifier
- **color**: A 32-byte token type derived from a domain separator and contract address
- **value**: The amount of tokens in the coin

When you spend a coin, you destroy it (create a nullifier) and create one or more new coins as outputs. The old coin can never be spent again. This is why the contract's `transferShielded` returns `ShieldedSendResult` — it contains both the `sent` coin and an optional `change` coin.

### The Merkle tree constraint

For a coin to be spent in an independent transaction, it must first be committed to the ledger's coin commitment Merkle tree. This takes at least one block. Once committed, the coin has a **Merkle index** (`mt_index`), and spending it requires a Merkle path proof that the coin exists in the current tree.

This creates two distinct spending paths in the Compact standard library:

| Function | Input type | When to use |
|----------|-----------|-------------|
| `sendShielded` | `QualifiedShieldedCoinInfo` (with `mt_index`) | Spending coins already committed on-chain |
| `sendImmediateShielded` | `ShieldedCoinInfo` (no `mt_index`) | Spending coins created in the same transaction |

This distinction is the single most important design constraint for shielded token contracts. It determines which operations can be combined atomically and which require waiting for on-chain confirmation.

### The mint-and-send atomic pattern

When a user mints a token and wants to send it immediately, the coin does not yet have a Merkle index. You cannot call `transferShielded` because it requires `mt_index`. Instead, you mint the coin to the contract itself (`kernel.self()`), then immediately call `sendImmediateShielded` to forward it to the recipient — all in the same transaction. This is the **mint-and-send atomic pattern**.

---

## Compact contract design

The shielded token contract is intentionally minimal. It tracks only two public ledger values (`totalSupply` and `totalBurned`) and exposes circuits for minting, transferring, and burning.

View the full [`contracts/Token.compact`](./contracts/Token.compact) file.

```compact
pragma language_version 0.22;

import CompactStandardLibrary;

export ledger totalSupply: Uint<64>;
export ledger totalBurned: Uint<128>;

witness localNonce(): Bytes<32>;
```

### Minting: `createShieldedToken`

```compact
export circuit createShieldedToken(
  amount: Uint<64>,
  recipient: Either<ZswapCoinPublicKey, ContractAddress>
): ShieldedCoinInfo {
    const domain = pad(32, "shielded:token");
    const nonce = localNonce();
    const coin = mintShieldedToken(
      disclose(domain), disclose(amount), disclose(nonce), disclose(recipient)
    );
    totalSupply = (totalSupply + disclose(amount)) as Uint<64>;
    return coin;
}
```

This circuit:
1. Creates a domain separator (`pad(32, "shielded:token")`)
2. Calls the `localNonce` witness for a fresh random nonce
3. Mints a shielded coin via `mintShieldedToken`
4. Increments `totalSupply`
5. Returns the `ShieldedCoinInfo` so the caller knows what was created

The `disclose()` calls are required because `mintShieldedToken` operates on public ledger data. Any value passed to a stdlib function that interacts with the ledger must be explicitly disclosed.

### Atomic mint and send: `mintAndSend`

```compact
export circuit mintAndSend(
  amount: Uint<64>,
  recipient: Either<ZswapCoinPublicKey, ContractAddress>
): ShieldedSendResult {
    const domain = pad(32, "shielded:token");
    const nonce = localNonce();
    const coin = mintShieldedToken(
      disclose(domain), disclose(amount), disclose(nonce),
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
    );
    const result = sendImmediateShielded(
      disclose(coin), disclose(recipient), disclose(amount) as Uint<128>
    );
    totalSupply = (totalSupply + disclose(amount)) as Uint<64>;
    return result;
}
```

This is the atomic pattern in action. The coin is minted to `kernel.self()` (the contract address), then immediately forwarded via `sendImmediateShielded` to the recipient. Because both operations happen in the same transaction, the coin never needs a Merkle index.

### Transferring: `transferShielded`

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

This circuit spends an already-committed coin. The input must be `QualifiedShieldedCoinInfo`, which includes `mt_index` for the Merkle proof. If `amount < coin.value`, the remainder is returned as change in `result.change`.

Importantly, this circuit does **not** modify any public ledger state. It purely moves shielded coins between addresses. This is why the frontend uses the wallet's native `makeTransfer` instead of calling this circuit directly — the wallet handles coin selection, change, and balancing automatically.

### Burning: `burnShieldedToken`

```compact
export circuit burnShieldedToken(
  coin: ShieldedCoinInfo,
  amount: Uint<128>
): ShieldedSendResult {
    const burnAddr = shieldedBurnAddress();
    const result = sendImmediateShielded(disclose(coin), burnAddr, disclose(amount));
    totalBurned = (totalBurned + disclose(amount)) as Uint<128>;
    return result;
}
```

Burning uses `sendImmediateShielded` with the fixed `shieldedBurnAddress()` as recipient. This means even freshly minted coins can be burned without waiting for Merkle commitment. The public `totalBurned` counter is incremented so the destruction is auditable.

### Nonce evolution: `nextNonce`

```compact
export circuit nextNonce(index: Uint<128>, currentNonce: Bytes<32>): Bytes<32> {
    return evolveNonce(disclose(index), disclose(currentNonce));
}
```

This pure circuit lets clients deterministically derive nonces off-chain. Given an index and a starting nonce, `evolveNonce` produces a unique, deterministic next nonce.

---

## TypeScript witness implementation

The contract declares one witness:

```compact
witness localNonce(): Bytes<32>;
```

In the TypeScript runtime, this witness is implemented in [`src/hooks/wallet/services/contract.ts`](./src/hooks/wallet/services/contract.ts):

```typescript
const witnesses = {
  localNonce: ({ privateState }: any): [any, Uint8Array] => {
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    return [privateState, nonce];
  },
};
```

The witness receives the current private state and returns a tuple of `[nextPrivateState, witnessValue]`. Here the private state is unchanged, and the witness value is 32 random bytes from `crypto.getRandomValues`. This ensures every minted coin has a unique, unpredictable nonce.

When midnight-js executes a circuit call, it invokes this function to resolve the witness value, then passes it into the ZK circuit as a private input.

---

## Provider setup: wallet-backed proving

### The proving problem

Shielded token circuits invoke stdlib functions like `mintShieldedToken` and `sendShielded`, which internally call a built-in ledger circuit called `output`. This circuit is part of the ledger itself — it is **not** generated by the Compact compiler. When using a standalone local proof server (`httpClientProofProvider`), the prover needs the `output.prover` artifact. If it is missing, the proof fails.

In development, Vite's SPA fallback can make this worse: a request for `/src/contracts/keys/output.prover` returns `index.html` (HTTP 200) instead of a 404. The HTML string gets passed to the proof server, which rejects it with a confusing error about `<!doctype`.

### The solution: `dappConnectorProofProvider`

The wallet (Lace or 1AM) bundles all built-in ledger artifacts. By delegating proving to the wallet, the DApp never needs to supply the `output` circuit artifact.

View the full [`src/hooks/wallet/services/providers.ts`](./src/hooks/wallet/services/providers.ts) file.

```typescript
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';

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

  // ... private state setup ...

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    zkConfigProvider,
    proofProvider: await dappConnectorProofProvider(
      connectedApi, zkConfigProvider, CostModel.initialCostModel()
    ),
    walletProvider: { /* ... */ },
    midnightProvider: { /* ... */ },
  };
}
```

`dappConnectorProofProvider` is asynchronous because it must negotiate with the wallet extension. This is why `buildProviders` is `async` and all call sites (`api.ts`) `await` it.

### Artifact validation

To catch the Vite SPA fallback issue early, an `ArtifactValidatingProvider` wrapper detects HTML responses and throws a descriptive error:

```typescript
class ArtifactValidatingProvider extends ZKConfigProvider {
  private validate(data: Uint8Array, name: string) {
    if (data && data.length > 0 && data.length < 5000) {
      const start = new TextDecoder().decode(data.slice(0, 50)).toLowerCase();
      if (start.includes('<!doctype') || start.includes('<html')) {
        throw new Error(
          `Artifact ${name} is HTML (file missing or Vite SPA fallback). ` +
          `Built-in ledger circuits like "output" are not generated by compactc.`
        );
      }
    }
  }
}
```

This prevents cryptic proof server errors and immediately tells the developer what is wrong.

---

## Wallet integration

### Connection flow

The wallet store (`useWallet.ts`) handles detection, connection, and state management via Zustand. Wallet detection uses `window.midnight` and filters by the `4.x` API version:

```typescript
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

### Balance polling

Shielded balances are encrypted. The wallet must scan the chain, decrypt outputs matching the user's coin public key, and index them locally. This is slower than reading public ledger state, so the balance may show `0` immediately after a mint.

The Home page sets up a 15-second polling interval:

```typescript
useEffect(() => {
  if (!isConnected) return;
  loadWalletState();
  const id = setInterval(() => loadWalletState(), 15_000);
  return () => clearInterval(id);
}, [isConnected, loadWalletState]);
```

`loadWalletState` calls `connectedApi.getShieldedBalances()`, which returns a `Record<TokenType, bigint>` — the keys are hex token type identifiers (coin colors), and the values are decrypted balance totals.

---

## Deploy flow

Deploying creates a new contract instance on-chain. The deploy circuit uses `CompiledContract.withWitnesses` to inject the `localNonce` witness, and `CompiledContract.withCompiledFileAssets` to load the ZKIR and key files from `CONTRACT_PATH`.

View the full [`src/hooks/wallet/services/api.ts`](./src/hooks/wallet/services/api.ts) file.

```typescript
export async function deployTokenContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string
): Promise<string> {
  const privateStateProvider = await ensurePrivateState(coinPublicKey, 'tmp-deploy');
  const providers = await buildProviders(connectedApi, coinPublicKey, encryptionPublicKey, undefined, privateStateProvider);

  const contractModule = await import(`${CONTRACT_PATH}/contract/index.js`);
  const cc = CompiledContract.make('shielded-token', contractModule.Contract);
  const withWitnesses = CompiledContract.withWitnesses({ localNonce: ... });
  const withAssets = CompiledContract.withCompiledFileAssets(CONTRACT_PATH);
  const compiledContract = withWitnesses(withAssets(cc));

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: createInitialPrivateState(),
    args: [],
  });

  const address = deployed.deployTxData.public.contractAddress;
  localStorage.setItem('shielded_token_contract', address);
  return address;
}
```

The contract address is stored in `localStorage` and used for all subsequent operations.

---

## Mint flow

### Two modes

The Mint page offers two modes:

1. **Mint to Self**: Calls `createShieldedToken`, which mints directly to the caller's shielded address. The returned `ShieldedCoinInfo` is saved to local storage.
2. **Mint & Send**: Calls `mintAndSend`, which atomically mints and forwards to a recipient. The `ShieldedSendResult` contains both the `sent` coin and optional `change`.

View the full [`src/pages/Mint.tsx`](./src/pages/Mint.tsx) file.

### Capturing mint results

When midnight-js submits a contract call, the returned `FinalizedCallTxData` contains the circuit result in `result.private.result`. For `createShieldedToken`, this is `ShieldedCoinInfo`. For `mintAndSend`, it is `ShieldedSendResult`:

```typescript
const result = await callCreateShieldedToken(...);
const txId = result?.public?.txId;

if (result?.private?.result) {
  const coin = coinFromShieldedCoinInfo(result.private.result, 'mint', txId);
  addStoredCoin(coin);
}
```

The `coinStore.ts` utility serializes the coin (nonce, color, value) to `localStorage` so the Burn page can display it in a dropdown later.

---

## Transfer flow: why `makeTransfer`?

The contract has a `transferShielded` circuit that takes `QualifiedShieldedCoinInfo` (including `mt_index`). However, requiring users to manually input nonce, color, value, and Merkle index is unacceptable UX.

Since `transferShielded` does **not** modify any public ledger state — it purely spends a shielded coin and creates outputs — the wallet's native `makeTransfer` achieves the exact same result. The wallet:

1. Selects input coins of the correct token type
2. Computes change if the input exceeds the send amount
3. Balances the transaction (including fees)
4. Generates proofs and signatures

The DApp only needs to specify the desired output:

```typescript
const result = await connectedApi.makeTransfer([
  { kind: 'shielded', type: tokenType, value: amount, recipient: recipientAddress }
]);

// makeTransfer for shielded tokens already submits the transaction internally.
// It returns { tx_id: string }, not { tx: string }.
const txId = result.tx_id;
```

The `tokenType` is the hex color string from `balances.shielded` (or from a stored coin). The `recipient` must be a Bech32m shielded address, not a raw coin public key.

View the full [`src/pages/Send.tsx`](./src/pages/Send.tsx) file.

---

## Burn flow

Burning uses the contract's `burnShieldedToken` circuit because it increments the public `totalBurned` counter. The circuit takes `ShieldedCoinInfo` (not `QualifiedShieldedCoinInfo`), so no Merkle index is needed.

The Burn page displays a dropdown of stored coins from `localStorage`:

```typescript
const coins = getStoredCoins();
```

When a coin is selected, its nonce, color, and value are auto-populated. The user enters the burn amount and the coin's **Merkle tree index** (`mt_index`). This is required because `sendShielded` needs to prove the coin exists in the on-chain Merkle tree.

If the burn amount equals the coin value, the coin is removed from storage after the transaction. If it is less, the `ShieldedSendResult.change` is captured and stored as a new coin.

View the full [`src/pages/Burn.tsx`](./src/pages/Burn.tsx) file.

---

## Frontend: React pages

### Home page

The Home page displays:
- Shielded balance total (sum of all token balances)
- Token breakdown pills (hex type + value)
- Stored coin inventory card
- Contract address and public stats (`totalSupply`, `totalBurned`)
- Navigation grid to Deploy, Mint, Send, Burn

### Deploy page

One-click contract deployment. The address is saved to `localStorage` and displayed on success.

### Mint page

Mode toggle (Mint to Self / Mint & Send), amount input, and recipient input for mint-and-send mode. On success, displays the transaction hash and the minted coin details.

### Send page

Recipient address (Bech32m) and amount inputs. Uses `makeTransfer` — no manual coin selection. Shows the inferred token type for transparency.

### Burn page

Coin selector dropdown populated from `localStorage`, amount input, and burn button. Shows coin details on selection. Handles change coins automatically.

---

## Troubleshooting

### Contract and proving errors

| Error | Cause | Fix |
|-------|-------|-----|
| `prove: expected header tag 'midnight:ir-source[v2]:', got '<!doctype...'` | Missing built-in `output` circuit artifact; Vite served `index.html` as SPA fallback | Switch to `dappConnectorProofProvider` (wallet proving) instead of `httpClientProofProvider` |
| `Artifact output.prover is HTML` | Same as above, caught by `ArtifactValidatingProvider` | Use wallet proving; do not rely on local proof server for shielded token operations |
| `No compatible wallet found` | Extension reports API version outside `'4.x'` | Update wallet extension to latest version |
| Shielded balance shows `0` after mint | Wallet hasn't scanned and decrypted the new output yet | Wait for auto-refresh (15s) or open wallet popup to trigger sync |

### Transaction errors

| Error | Cause | Fix |
|-------|-------|-----|
| `BALANCE_FAILED` | Insufficient NIGHT for fees | Fund wallet from [Preprod faucet](https://faucet.preprod.midnight.network/) |
| `sendImmediateShielded: value exceeds coin value` | Burn/send amount greater than input coin | Enter a smaller amount or select a larger coin |
| `invalid index into sparse merkle tree: 0` | Using `sendImmediateShielded` on an already-committed coin | Use `sendShielded` with `QualifiedShieldedCoinInfo` (including `mt_index`) instead |
| Contract call hangs | Proof generation is slow | Wallet proving can take 10-30 seconds; wait for completion |

### Development errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module '/src/contracts/contract/index.js'` | Contract not compiled | Run `npx compact compile contracts/Token.compact src/contracts` |
| `Module "crypto" has not been found` | Missing Node polyfills | Ensure `vite-plugin-node-polyfills` is configured in `vite.config.ts` |

---

## Conclusion

This DApp demonstrates the complete lifecycle of shielded tokens on Midnight: minting with unique nonces, atomic mint-and-send via `sendImmediateShielded`, wallet-native transfers that abstract away UTXO selection, and burning with public auditable counters. The key architectural insight is the Merkle tree constraint — it separates coins that can be spent immediately (`sendImmediateShielded`) from coins that require on-chain commitment (`sendShielded`), and this shapes every contract circuit and UI decision.

## Next steps

- Read the [`troubleshoot.md`](./troubleshoot.md) for deeper debugging guidance
- Extend the contract with a `mergeCoin` circuit to combine small change outputs
- Add a transaction history page using `connectedApi.getTxHistory()`
- Build a CLI agent that operates the same contract from a headless wallet

---

*Built with `@midnight-ntwrk/midnight-js` 4.0.4, Compact 0.30.0, and the Midnight Preprod network.*
