📁 **Full source code and installation steps:** [midnight-apps/fullstack-dapp](https://github.com/0xfdbu/midnight-apps/tree/main/fullstack-dapp)

**Target audience:** Developers

Within the next few sections, you go through smart contract compilation and focus on the DApp lifecycle.

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [`package.json`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/package.json) with the needed packages
  - `@midnight-ntwrk/compact-runtime`
  - `@midnight-ntwrk/dapp-connector-api`
  - `@midnight-ntwrk/ledger-v8`
  - `@midnight-ntwrk/midnight-js-contracts`
  - `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider`
  - `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-http-client-proof-provider`
  - `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
  - `@midnight-ntwrk/midnight-js-level-private-state-provider`
  - `@midnight-ntwrk/midnight-js-network-id`
  - `@midnight-ntwrk/midnight-js-node-zk-config-provider`
  - `@midnight-ntwrk/midnight-js-types`
  - `@midnight-ntwrk/wallet-sdk-address-format`
  - `@midnight-ntwrk/wallet-sdk-dust-wallet`
  - `@midnight-ntwrk/wallet-sdk-facade`
  - `@midnight-ntwrk/wallet-sdk-hd`
  - `@midnight-ntwrk/wallet-sdk-shielded`
  - `@midnight-ntwrk/wallet-sdk-unshielded-wallet`
  - `@scure/bip39`, `cors`, `express`, `postgres`, `react`, `react-dom`, `react-router-dom`, `rxjs`, `semver`, `vite-plugin-node-polyfills`, `vite-plugin-top-level-await`, `vite-plugin-wasm`, `ws`, `zustand`

---

## 1. Building the smart contract

For this demonstration, build a zero-knowledge attestation protocol with selective disclosure.

For this attestation you need two core witnesses. `localSecretKey()` will be used to fetch the user's secret key, and `findAgePath(commit: Bytes<32>)` fetches the required cryptographic Merkle path from the local private state and passes it to the circuit(s) as needed.

```typescript
witness localSecretKey(): Bytes<32>;
witness findAgePath(commit: Bytes<32>): MerkleTreePath<10, Bytes<32>>;
```

You also need some essential ledgers:

- **`authority`** stores the public key of the admin (only the authority can issue attestations)

  ```typescript
  export sealed ledger authority: Bytes<32>;
  ```

- **`ageCommitments`** uses `HistoricMerkleTree`. Think of it as a secure cryptographic folder. Use it instead of a list for privacy. Later, the user can mathematically prove their commitment is inside this tree without the blockchain knowing which leaf belongs to them.

  ```typescript
  export ledger ageCommitments: HistoricMerkleTree<10, Bytes<32>>;
  ```

- **`usedNullifiers`**: whenever a user proves their age, a circuit generates a unique `nullifier` hash from their secret key, so if they try to prove a second time, the circuit sees their `nullifier` is already present.

  ```typescript
  export ledger usedNullifiers: Set<Bytes<32>>;
  ```

- **`totalAgeProofs`** is a simple ledger. It is incremented later in the `proveAge()` circuit

  ```typescript
  export ledger totalAgeProofs: Counter;
  ```

You also need a simple constructor to initialize the smart contract. **Constructor arguments are witness data** — in this case, `authoritySk`.

```typescript
constructor(authoritySk: Bytes<32>) {
    // authoritySk is a constructor argument (witness data) — disclose required
    authority = disclose(publicKey(authoritySk));
}
```

The first circuit is `attestAge()`. It fetches the secret key via the `localSecretKey()` witness and then checks whether the entity attempting to run `attestAge()` is an authority.

```typescript
export circuit attestAge(userCommit: Bytes<32>): [] {
    const sk = localSecretKey();
    assert(authority == disclose(publicKey(sk)), "Not the authority");
    ageCommitments.insert(disclose(userCommit));
}
```

But as you can see, `attestAge()` requires a `userCommit`. The user can forward a commitment to the authority, so `userCommit` is an authority input to grant the user an attestation that they can use to prove their age.

Create a private helper circuit `commitment()` to compute a deterministic hash with the user's secret key and a domain separator.

```typescript
circuit commitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<3, Bytes<32>>>(
        [pad(32, "mydapp:commit:v1"), domain, sk]
    );
}
```

You can then use it in a `getCommitment()` circuit. Because it is an export, the frontend can execute this off-chain to generate the commitment.

```typescript
export circuit getCommitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return commitment(sk, domain);
}
```

The `proveAge()` circuit fetches `localSecretKey()` via witness and defines `domain` as `age` for this circuit. Compute a `commitment` using both values, then call the `findAgePath(commit)` witness to check whether an active attestation by an authority exists in the Merkle Tree. If there is, return whether the user has a valid attestation.

You then generate a `nullifier`. To understand why you need it, look at the privacy guarantees of the smart contract. If a user proves they are over 18 once, the blockchain only sees `TRUE`; it does not know who proved it, so without a `nullifier`, a malicious user can spam the protocol with hundreds of generated on-chain proofs.

```typescript
circuit nullifier(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<3, Bytes<32>>>(
        [pad(32, "mydapp:nullify:v1"), domain, sk]
    );
}
```

The full `proveAge()` demonstrates how the `nullifier` is implemented to address the issue.

```typescript
export circuit proveAge(): Boolean {
    const sk = localSecretKey();
    const domain = pad(32, "age");
    const commit = commitment(sk, domain);
    const path = findAgePath(commit);

    assert(
        ageCommitments.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(path))),
        "Age not attested"
    );

    const nul = nullifier(sk, domain);
    assert(!usedNullifiers.member(disclose(nul)), "Age proof already used");
    usedNullifiers.insert(disclose(nul));
    totalAgeProofs.increment(1);

    return disclose(true);
}
```

> **Note:** The example uses `domain` because the smart contract is set to handle multiple types of attestations (age, residency, certifications). Refer to the GitHub repo for more information.

You now need to compile this smart contract, but first install compact dev tools

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then run `compact compile contracts/Contract.compact src/contracts`. In this case, you can assume `src/contracts` is a directory your frontend and API will use to load the compiled smart contract (ZKIR, keys, etc.).

---

## 2. Wallet, identity & providers

You begin by setting up a wallet connection. For this you need DApp connector API v4 installed

```typescript
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
```

You can discover installed wallets using `InitialAPI[]`. Each object is injected by the browser-installed wallet extensions. In this case, there are 3 wallets installed (1AM, Lace, GSD).

```typescript
interface WalletSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}
```

View the full [`WalletSelectModal.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/components/ui/WalletSelectModal.tsx) on GitHub.

```typescript
            {wallets.map((wallet) => {
              const iconUrl = getWalletIcon(wallet.rdns);
                // rest of the code
            })}
```

![Wallet Selection UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/it8z72wbhmy0f5t72o0z.png)

Create a Zustand hook in [`useWallet.ts`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/hooks/useWallet.ts) to manage the wallet lifecycle. It is a Zustand store that manages the entire wallet lifecycle, and it scans for installed wallets.

```typescript
// 1. Find injected wallets
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

Then create a wallet connection by calling:

```typescript
      const connectedApi = await wallet.connect(networkId);
      const status = await connectedApi.getConnectionStatus();
```

> **Note:** You reuse `useWallet.ts` across all the frontend pages (Deploy, Attest, Prove)

Derive your identity deterministically from two inputs: `userPassword` and `shieldedAddresses.shieldedCoinPublicKey`. Hash them with domain-specific salts (User/Authority) to generate `attest_sk` (prove identity) for users and `authoritySk` (deploy/attest identity) for authorities.

This derivation is used everywhere, including `Deploy` to create the authority key, `Attest` to sign attestations, and `Prove` to generate ZK proofs. Same wallet + same password always produces the same key, so you do not lose your identity even if you clear browser storage. However, you would **lose** it if you forget your password.

This goes through a lock screen / session model, as shown below

![Lock Screen UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sizdug72ug2xpp6r3i7a.png)

```typescript
const masterKey = await deriveKeyFromPassword(userPassword, shieldedAddresses.shieldedCoinPublicKey);
```

The most crucial step of this project is making sure the witnesses are correctly set up. You need a [witnesses.ts](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/witnesses.ts) file for this.

Point `index.js` to the path where you compiled the smart contract previously

```typescript
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/attest/contract/index.js';
```

You need to define `AttestPrivateState`. This defines the shape of the smart contract's private state. You only need the `secretKey`, and `createAttestPrivateState` is a helper that constructs an object.

```typescript
export type AttestPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createAttestPrivateState = (
  secretKey: Uint8Array,
): AttestPrivateState => ({
  secretKey,
});
```

Then you have two witnesses set up. `localSecretKey()` will be used to fetch the user's secret key, and `findAgePath(commit: Bytes<32>)` fetches the required cryptographic Merkle path from the local private state and passes it to the circuit(s) as needed.

```typescript
export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, AttestPrivateState>): [AttestPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],

  findAgePath: (
    { privateState, ledger }: WitnessContext<Ledger, AttestPrivateState>,
    commit: Uint8Array,
  ) => {
    const path = ledger.ageCommitments.findPathForLeaf(commit);
    if (!path) throw new Error('Age commitment not found in tree');
    return [privateState, path];
  },
};
```

You can now proceed to set up the providers, as shown below:

- `privateStateProvider`: uses `levelPrivateStateProvider` for persistent localStorage (IndexedDB)
- `publicDataProvider`: reads on-chain state from the indexer
- `zkConfigProvider`: loads `FetchZkConfigProvider` — compiled verifiers, keys...
- `proofProvider`: generates zero-knowledge proofs on your proof server
- `walletProvider`: handles `balanceTx` via `connectedApi.balanceUnsealedTransaction`
- `midnightProvider`: submits transactions via `connectedApi.submitTransaction`

```typescript
      const providers = {
        privateStateProvider: privateState,
        publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
        zkConfigProvider: zkConfig,
        proofProvider,
        walletProvider,
        midnightProvider,
      };
```

---

## 3. Deploy the smart contract

You can now proceed to create [`Deploy.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Deploy.tsx)

Begin by setting the network — in this case, it's `preprod`

```typescript
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');
```

Run a proof server locally.

```bash
# Run on docker
sudo docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 midnight-proof-server -v
```

Then build the smart contract using `CompiledContract` API from `@midnight-ntwrk/compact-js`

```typescript
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const compiledContract = CompiledContract.withCompiledFileAssets(ccWithWitnesses, ZK_ARTIFACTS_PATH);
```

Then the next step is to deploy, passing `authoritySk` as an argument. This makes the admin deploying the smart contract an authority with the ability to create attestations.

```typescript
      const deployed = await deployContract(providers as any, {
        compiledContract,
        privateStateId: 'attestState',
        initialPrivateState,
        args: [authoritySk],
      } as any);
```

You then retrieve the deployed address using

```typescript
const address = deployed.deployTxData.public.contractAddress;
```

![Deploy Success UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/zw1cwjnzlk18fp9mzsih.png)

---

## 4. Generate a commitment

A commitment is a tunnel between your private identity and the public ledger. It is a deterministic hash computed from the secret key (derived from `userPassword` + `shieldedAddresses.shieldedCoinPublicKey`) and a domain separator such as `age` (it could be anything — `residence`, etc.). Because the hash is one-way, anybody can see the commitment on-chain without learning your secret key. This is the core of the privacy model: the authority knows that you are attested but never learns who you are. **However**, be sure to force a strong password because an attacker can attempt to compute a similar commitment in many ways.

Generate the commitment off-chain in [`Home.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Home.tsx). The `getCommitment` circuit takes two inputs: your `secretKey` (passed as witness from your private state) and a `domain` such as `age`, `residency`, or `certification`. The domain acts as a namespace, so a commitment for `age` is completely different from a commitment for `residency` even when both use the same secret key.

```typescript
      const commitment = contractModule.pureCircuits.getCommitment(
        secretKey,
        domainToBytes(domain)
      );
```

The output is a `32-byte` hash. Send this commitment to the authority through any channel of communication. The authority never sees your secret key; they only receive the commitment. Once the authority creates an attestation, they insert the commitment into the `ageCommitments` Merkle tree on-chain. You can then use it to generate a zero-knowledge proof (ZKP) validating that your secret key produced a commitment that exists in the tree.

When the commitment is deterministic, the same wallet and password always generate the same hash. The current design does not rely on `localStorage`. Derive the secret key from the public key and a user password instead — this prevents losing your identity.

![Commitment Builder UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0p0eb1diwr083hbnpis5.png)

---

## 5. Attest a credential

The authority creates an attestation by selecting type and pasting the user commitment.

This page goes through a couple of steps:

### Set up the providers

The provider bundle is the bridge between your frontend and the Midnight network. Each provider handles a specific responsibility:

- `privateStateProvider` manages your local encrypted state (secret keys, Merkle paths) via IndexedDB
- `publicDataProvider` reads on-chain data from the indexer without submitting transactions
- `zkConfigProvider` loads the compiled ZK circuit artifacts (proving keys, verifier keys)
- `proofProvider` forwards proof-generation requests to your local proof server on port 6300
- `walletProvider` handles transaction balancing: it serializes the unsigned transaction, sends it to your wallet extension for fee coverage and signing, then returns the balanced transaction
- `midnightProvider` submits the final signed transaction to the network and returns the transaction identifier

```typescript
      const providers = {
        privateStateProvider,
        publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
        zkConfigProvider: zkConfig,
        proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfig),
        walletProvider: {
          getCoinPublicKey(): string {
            return shieldedAddresses.shieldedCoinPublicKey;
          },
          getEncryptionPublicKey(): string {
            return shieldedAddresses.shieldedEncryptionPublicKey;
          },
          async balanceTx(tx: unknown, _ttl?: Date): Promise<unknown> {
            const serializedTx = toHex((tx as { serialize: () => Uint8Array }).serialize());
            const received = await connectedApi.balanceUnsealedTransaction(serializedTx);
            return Transaction.deserialize(
              'signature', 'proof', 'binding', fromHex(received.tx)
            );
          },
        },
        midnightProvider: {
          async submitTx(tx: unknown): Promise<string> {
            const txData = tx as { serialize: () => Uint8Array; identifiers: () => string[] };
            await connectedApi.submitTransaction(toHex(txData.serialize()));
            return txData.identifiers()?.[0] ?? '';
          },
        },
      };
```

### Build the smart contract interface

Reconstruct the deployed smart contract's runtime interface. This is a three-step process:

1. `CompiledContract.make()` creates a base contract descriptor from the generated Compact module
2. `CompiledContract.withWitnesses()` binds your TypeScript witness implementations so the runtime knows how to resolve `localSecretKey()` and `findAgePath()` when the circuit calls them
3. `CompiledContract.withCompiledFileAssets()` loads the ZK artifacts from disk — the proving keys, verifier keys, and circuit definitions that the proof server needs

```typescript
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const finalContract = CompiledContract.withCompiledFileAssets(
        ccWithWitnesses,
        ZK_ARTIFACTS_PATH
      );
```

### Connect to the deployed smart contract

`findDeployedContract()` serves multiple purposes. It fetches the on-chain smart contract state, then extracts the embedded verifier keys and compares them head-to-head with the compiled artifacts generated after running `compact contracts/Contract.compact {compile_path}`. If there is a mismatch between the verifier keys, it throws an error instead of proceeding. This acts like protection against accidentally interacting with the wrong smart contract.

`findDeployedContract()` also initializes your local private state. Pass `authoritySk` to `createAttestPrivateState()` so the witness `localSecretKey()` resolves correctly when the circuit runs. If the private state ID collides with another role — for example, the prover state — the authentication step would fail with an error, so keeping `attestState` separate is crucial.

```typescript
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
        initialPrivateState: createAttestPrivateState(authoritySk),
      });
```

### Create the transaction interface

`createCircuitCallTxInterface()` builds a proxy over the deployed smart contract. Instead of manually building transactions, you can call methods such as `txInterface.attestAge(commitBytes)` directly, and the installed library handles constructing the transaction.

It looks up the circuit definition, wires the witnesses, prepares the private state, and returns a transaction builder that you can execute directly.

```typescript
      const txInterface = createCircuitCallTxInterface(
        providers as never,
        finalContract as never,
        contractAddress,
        privateStateId
      );
```

### Attestation execution

Calling `attestAge()` triggers the full Midnight transaction process:

1. **Witness resolution**: `localSecretKey()` fetches `authoritySk` from the private state
2. **Authority check**: the circuit verifies whether the user is an authority by checking if `publicKey(sk) == authority` on-chain
3. A zero-knowledge proof is then generated by the proof server, proving that the authority check passes.
4. **Transaction balancing**: `walletProvider` sends the unsigned transaction to your wallet extension/provider, which calculates fees and signs it.
5. **Submission**: `midnightProvider` broadcasts the signed transaction to the Midnight network
6. **Confirmation**: the network includes the transaction in a block and inserts the commitment into the `ageCommitments` Merkle Tree. The user can then use that commitment to prove their age.

```typescript
result = await (txInterface as any).attestAge(commitBytes);
```

![Attestation UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4rt7hni1x2uvr1uw1r4m.png)

Now the user has a valid attestation under their unique `commitment`, which was computed using the secret key passed through witness.

---

## 6. Prove your eligibility

The user verifies and generates a proof in [`Prove.tsx`](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Prove.tsx)

`handleProve()` goes through a similar flow to `handleAttest()`, except that it calls the `proveAge()` circuit and uses `attestSk` instead of `authoritySk` for authentication.

`privateStateId` is also different. Attest passes `attestState`, while Prove passes `attestProverState` — otherwise the transaction fails with `Unsupported state unable to authenticate data`

`initialPrivateState` differs too. Attest passes `createAttestPrivateState(authoritySk)`, while Prove passes `{ secretKey: attestSk }` — the prover identity key, not the authority key.

```typescript
result = await (txInterface as any).proveAge();
```

![Prove UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xvjck4o19r4gmpysnny9.png)

Now look at the nullifier in action. In this example, the age has already been verified, as you can see in the explorer: `proveAge`

https://explorer.1am.xyz/tx/a6b14a14c15d486bc547a449342cc196036be74e4c04699f2a6a1be1ebd03ccb

Execution successful

![Explorer Success](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/cousj0aaeljdskkrljdh.png)

The wallet returns `Proof already used — each credential can only be proven once`. The console shows: `Prove error: Error: Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Age proof already used`

This means the smart contract is working exactly as intended — the `nullifier` is recognized as already used.

![Proof Already Used Error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/x2u5eh48ux62f4fl2err.png)

## 7. State read flow

When you unlock the Home page, it checks whether you are an authority or not. It does this by querying the smart contract state from the indexer. The raw state data is fed into `contractModule.ledger()`, which deserializes it into typed ledger fields, including `authority: Bytes<32>`.


```typescript
        // Compute publicKey(authoritySk) using the same hash as the contract
        const enc = new TextEncoder();
        const pad = new Uint8Array(32);
        pad.set(enc.encode('mydapp:pk:v1'));
        const descriptor = new CompactTypeVector(2, new CompactTypeBytes(32));
        const authorityPublicKey = persistentHash(descriptor, [pad, authoritySk]);

        const provider = indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS);
        const state = await provider.queryContractState(contractAddress);
        if (!state) return;

        const ledger = contractModule.ledger(state.data);
        const onChainAuthority = ledger.authority;
```

The frontend derives your authority secret key from the same master key that unlocked your identity. It then hashes that key through the smart contract's `publicKey()` circuit to produce your authority public key. If the on-chain authority matches your computed public key byte-for-byte, a green badge appears saying "You are the authority". If there is a mismatch, a grey badge shows "Not the authority".

```typescript
        const match = onChainAuthority.length === authorityPublicKey.length &&
          onChainAuthority.every((b: number, i: number) => b === authorityPublicKey[i]);
```


![Authority Badge UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wdvxbvplidwor9tgsn3u.png)

> **Note:** Even if you use the same wallet but there is a password mismatch, it does not show "You are the authority".

## 8. Off-chain API to store data

Directly requesting the smart contract state from the indexer loads the network unnecessarily and creates a slow user experience. A solution to this is to run a lightweight Express server connected to PostgreSQL. It polls the indexer every 15 seconds or so and caches the data inside PostgreSQL, improving the user experience.

Import a factory function that queries data via GraphQL on the indexer:
```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
```

Use `setNetworkId('preprod')` to set the network to Preprod:
```typescript
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
```
Import `compact-runtime`. `contractRuntime.ContractState.deserialize(serialized)` reconstructs a contract's state from its serialized bytes so you can read ledger data such as `totalAgeProofs`.
```typescript
import * as contractRuntime from '@midnight-ntwrk/compact-runtime';
```
Use the V4 Midnight indexer GraphQL endpoints:
```typescript
const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
```

### Database schema

When you start the server, it begins tracking the hardcoded smart contract

```typescript
const TRACKED_CONTRACT = '331460e632fad9146d23b2176433413e8405976afef8a6f0999dda10433f599d';
```
A simple database schema stores the data. The `contracts` table tracks which smart contracts are being monitored.

```sql
await sql`
  CREATE TABLE contracts (
    address TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'synced'
  )
`;

await sql`
  CREATE TABLE contract_states (
    id SERIAL PRIMARY KEY,
    contract_address TEXT REFERENCES contracts(address) ON DELETE CASCADE,
    total_age_proofs BIGINT NOT NULL DEFAULT 0,
    total_residency_proofs BIGINT NOT NULL DEFAULT 0,
    total_cert_proofs BIGINT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
```

### Polling lifecycle

When you start the server, it calls `startPolling(TRACKED_CONTRACT)`. `TRACKED_CONTRACT` is a hardcoded `331460e632fad9146d23b2176433413e8405976afef8a6f0999dda10433f599d` smart contract value. It then begins fetching the current state and registers a `setInterval` loop repeating every 15 seconds. If the server shuts down, `stopPolling()` clears the interval and closes the database connection.


```typescript
function startPolling(address: string) {
  const poll = async () => {
    try {
      const state = await provider.queryContractState(address);
      if (state) await insertState(address, state);
    } catch (e) {
      console.error(`[Poll] ${address.slice(0, 12)}:`, e);
    }
  };

  poll();
  const interval = setInterval(poll, 15_000);
  pollingIntervals.set(address, interval);
}
```

### Parsing and inserting state

The generated smart contract code cannot read raw states returned by the indexer GraphQL V4 endpoint. They must first be serialized back into bytes, then deserialized through `ContractState.deserialize()`. This is when `@midnight-ntwrk/compact-runtime` comes in. Finally, the state is passed to `ledger()` to extract fields such as `totalAgeProofs` (number of age proofs committed), and then the `insertState()` function inserts the values into the PostgreSQL database `contract_states` table.

```typescript
async function parseContractState(address: string, state: any) {
  const serialized = state.serialize();
  const freshState = contractRuntime.ContractState.deserialize(serialized);
  const ls = ledger(freshState.data);

  return {
    totalAgeProofs: Number(ls.totalAgeProofs) || 0,
    totalResidencyProofs: Number(ls.totalResidencyProofs) || 0,
    totalCertProofs: Number(ls.totalCertProofs) || 0,
  };
}
```

### Serving cached data

The frontend sends a `GET /contract` request to retrieve the latest snapshot stored in the database. The endpoint joins the `contracts` and `contract_states` tables, returning the most recent row ordered by `recorded_at`.

```typescript
app.get('/contract', async (req, res) => {
  const c = await sql`SELECT * FROM contracts WHERE address = ${TRACKED_CONTRACT}`;
  if (!c.length) return res.status(404).json({ error: 'Not tracked' });

  const latest = await sql`
    SELECT total_age_proofs, total_residency_proofs, total_cert_proofs, recorded_at
    FROM contract_states
    WHERE contract_address = ${TRACKED_CONTRACT}
    ORDER BY recorded_at DESC
    LIMIT 1
  `;

  res.json({
    address: TRACKED_CONTRACT,
    totalAgeProofs: Number(latest[0]?.total_age_proofs ?? 0),
    totalResidencyProofs: Number(latest[0]?.total_residency_proofs ?? 0),
    totalCertProofs: Number(latest[0]?.total_cert_proofs ?? 0),
  });
});
```

In the frontend, the Home page sends a request to the `/contract` endpoint, then renders the cached data.

![API Polling Logs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/s9tfyfxu0giutys8dzpu.png)

Now the data is being successfully cached: `age=2 residency=1 cert=0`


## Conclusion

You have now built a full-stack DApp on the Midnight network: a complete zero-knowledge attestation system. It consists of a Compact contract enforcing privacy-preserving zero-knowledge proofs, a UI that derives identities deterministically from nothing but a wallet's `shieldedAddresses.shieldedCoinPublicKey` and a user password, and an Express API that caches smart contract state. Your identity is not stored. If you lose your password, you lose your identity. Remember these critical design decisions.

## Next steps

Now that you've finished this tutorial, here are a few things you can do next:

- Check the full repository [source code](https://github.com/0xfdbu/midnight-apps/tree/main/fullstack-dapp)
- Add a new credential type e.g., "employment"
- Read the Midnight Compact language docs

## Troubleshooting

- **"Wallet not detected"** → Make sure 1AM or Lace browser extensions are installed
- **Transactions failing** → Make sure you have tDUST and that the wallet is fully synced
- **Not the authority** → Password or wallet mismatch 
- **Age proof already used** → You already proved this credential; use a different one.