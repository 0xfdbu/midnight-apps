Let's build a full-stack DApp on Midnight network from scratch

📁 **Full source code and installation steps:** [midnight-apps/fullstack-dapp](https://github.com/0xfdbu/midnight-apps/tree/main/fullstack-dapp)

**Target audience:** Developers

Within the next few sections you go through smart contract compilation and focus on the DApp lifecycle.

You learn how to interact with smart contracts using a frontend as well as deploying them from a frontend and caching smart contract data off-chain on API and a database.

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [package.json](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/package.json) with the needed packages

---

## 1. Building the smart contract

For this demonstration, build a Zero-knowledge attestation protocol with selective disclosure.

For this attestation you're going to need two core witnesses. `localSecretKey()` will be used to fetch the user's secret key, and `findAgePath(commit: Bytes<32>)` fetches the required cryptographic Merkle path from the local private state and passes it to the circuit(s) as needed.

```typescript
witness localSecretKey(): Bytes<32>;
witness findAgePath(commit: Bytes<32>): MerkleTreePath<10, Bytes<32>>;
```

You would also need some essential ledgers which are:

- **`authority`** is used to store the public key of the admin (Only authority can issue attestations)

  ```typescript
  export sealed ledger authority: Bytes<32>;
  ```

- **`ageCommitments`** use `HistoricMerkleTree` think of it as a secure cryptographic folder, this is used instead of a list because of privacy and later on the user can mathematically prove their commitment is inside this tree without the blockchain knowing which leaf belongs to them.

  ```typescript
  export ledger ageCommitments: HistoricMerkleTree<10, Bytes<32>>;
  ```

- **`usedNullifiers`** whenever a user proves their age, a circuit generates a unique `nullifier` hash from their secret key, so if they try to prove a second time the circuit sees their `nullifier` is already present.

  ```typescript
  export ledger usedNullifiers: Set<Bytes<32>>;
  ```

- **`totalAgeProofs`** is a simple ledger. It is called to increment later on the `proveAge()` circuit

  ```typescript
  export ledger totalAgeProofs: Counter;
  ```

You also need a simple constructor to initialize the smart contract, **Constructor arguments are witness data** in this case `authoritySk`

```typescript
constructor(authoritySk: Bytes<32>) {
    // authoritySk is a constructor argument (witness data) — disclose required
    authority = disclose(publicKey(authoritySk));
}
```

The first circuit is `attestAge()`. It fetches the secret key via witness `localSecretKey()` and then checks if the entity attempting to run `attestAge()` is an authority or not.

```typescript
export circuit attestAge(userCommit: Bytes<32>): [] {
    const sk = localSecretKey();
    assert(authority == disclose(publicKey(sk)), "Not the authority");
    ageCommitments.insert(disclose(userCommit));
}
```

But as you can see `attestAge()` requires a `userCommit`, the user can forward a commitment to the authority so `userCommit` is an authority input to grant the user an attestation that they can use to prove their age.

Create a private helper circuit `commitment()` to compute a deterministic hash with the user's secret key and a domain separator.

```typescript
circuit commitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<3, Bytes<32>>>(
        [pad(32, "mydapp:commit:v1"), domain, sk]
    );
}
```

You can then use it in a circuit `getCommitment()` and because it is an export the frontend can execute this off-chain to generate the commitment.

```typescript
export circuit getCommitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return commitment(sk, domain);
}
```

The `proveAge()` circuit fetches `localSecretKey()` via witness and defines `domain` to age for this circuit. Then a `commitment` is computed using both values, and `findAgePath(commit)` witness is called. This is used to check whether there is an active attestation by an authority in the Merkle Tree or not, so then you can return whether a user has a valid attestation or not.

You then generate a `nullifier`. To understand why this is needed, you have to look at the privacy guarantees of the smart contract. If a user proves they are over 18 once, the blockchain only sees `TRUE` it does not know who proved it so without a `nullifier` a malicious user can spam the protocol with hundreds of generated on-chain proofs.

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

You now need to compile this smart contract but first install compact dev tools

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then run `compact compile contracts/Contract.compact src/contracts`. In this case you can assume `src/contracts` is a directory your frontend and API will use to load the compiled smart contract (ZKIR, keys...)

---

## 2. Wallet, identity & providers

You begin by setting up a wallet connection. For this you need DApp connector API v4 installed

```typescript
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
```

You can discover installed wallets using `InitialAPI[]`. Each object is injected by the browser installed wallet extensions. In this case there are 3 wallets installed (1am, lace, GSD)

```typescript
interface WalletSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: InitialAPI[];
  onSelect: (wallet: InitialAPI) => void;
  connecting: boolean;
}
```

You can then proceed to map them, see full code [WalletConnectModal.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/components/ui/WalletSelectModal.tsx)

```typescript
            {wallets.map((wallet) => {
              const iconUrl = getWalletIcon(wallet.rdns);
                // rest of the code
            })}
```

![Wallet Selection UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/it8z72wbhmy0f5t72o0z.png)

You also need to create a hook [useWallet.ts](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/hooks/useWallet.ts). It is a Zustand store that manages the entire wallet lifecycle, and it scans for installed wallets

```typescript
// 1. Find injected wallets
export function getCompatibleWallets(): InitialAPI[] {
  return Object.values(window.midnight).filter(/* version check */);
}
```

Then it proceeds to start a connection

```typescript
      const connectedApi = await wallet.connect(networkId);
      const status = await connectedApi.getConnectionStatus();
```

> **Note:** You reuse `useWallet.ts` across all of the frontend pages (Deploy, Attest, Prove)

Your identity is derived deterministically from two inputs: `userPassword` + `shieldedAddresses.shieldedCoinPublicKey`. It is then hashed with domain specific salts (User/Authority) to generate `attest_sk` (Prove identity) for users and `authoritySk` (Deploy, Attest identity) for authorities.

This derivation is used everywhere including `Deploy` to create the authority key, Attest to sign attestations and Prove to generate ZK proofs. Same wallet + same password always produces same key, so you do not lose your identity even if you clear browser storage. However, you would **lose** it if you forget your password.

This goes through a lock screen / session model as shown below

![Lock Screen UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sizdug72ug2xpp6r3i7a.png)

```typescript
const masterKey = await deriveKeyFromPassword(userPassword, shieldedAddresses.shieldedCoinPublicKey);
```

The most crucial step of this project is making sure the witnesses are correctly set up. You need a [witnesses.ts](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/witnesses.ts) file for this.

Index.js needs to point to the path where you compiled the smart contract previously

```typescript
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/attest/contract/index.js';
```

You need to define `AttestPrivateState` this defines the shape of the smart contract's private state, the only data needed is the `secretKey` and `createAttestPrivateState` helper constructs an object.

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

You can now proceed to setup the providers as shown below:

- `privateStateProvider` has `levelPrivateStateProvider` for persistent localstorage (IndexedDB)
- `publicDataProvider` used for on-chain read state on the indexer
- `zkConfigProvider` loads `FetchZkConfigProvider`  compiled verifiers, keys...
- `proofProvider` responsible for generating zero-knowledge proofs on your proof server
- `walletProvider` handles `balanceTx` via `connectedApi.balanceUnsealedTransaction`
- `midnightProvider` submits tx via `connectedApi.submitTransaction`

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

You can now proceed to create [Deploy.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Deploy.tsx)

Begin by setting the network, in this case it's `preprod`

```typescript
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');
```

Do note that it is recommended to run a proof server locally

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

Then the next step is to deploy when passing `authoritySk` as argument so this makes the admin deploying the smart contract an authority with the ability to create attestations.

```typescript
      const deployed = await deployContract(providers as any, {
        compiledContract,
        privateStateId: 'attestState',
        initialPrivateState,
        args: [authoritySk],
      } as any);
```

You then retrieve deployed address using

```typescript
const address = deployed.deployTxData.public.contractAddress;
```

![Deploy Success UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/zw1cwjnzlk18fp9mzsih.png)

---

## 4. Generate a commitment

A commitment is the bridge between your private identity and the public ledger. It is a deterministic hash computed from your secret key and a domain separator such as `age`. Because the hash is one-way, anyone can see the commitment on-chain without learning your secret key. This is the core of the privacy model: the authority knows *that* you are attested, but never learns *who* you are.

The commitment is generated off-chain in [Home.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Home.tsx). The `getCommitment` circuit takes two inputs: your `secretKey` (passed as witness from your private state) and a `domain` such as `age`, `residency`, or `certification`. The domain acts as a namespace, so a commitment for `age` is completely different from a commitment for `residency` even when both use the same secret key.

```typescript
      const commitment = contractModule.pureCircuits.getCommitment(
        secretKey,
        domainToBytes(domain)
      );
```

The output is a 32-byte hash. Send this commitment to the authority through any channel of communication. The authority never sees your secret key; they only receive the commitment. Once the authority attests it, the commitment is inserted into the `ageCommitments` Merkle tree on-chain. At that point, you can then generate a zero-knowledge proof showing that your secret key produced a commitment that exists in the tree.

Because the commitment is deterministic, the same wallet and password always produce the same hash. This means you can regenerate the exact same commitment on any machine, at any time, as long as you remember your password. If you forget the password, the commitment is lost forever, and any attestation tied to it becomes unusable.

Another design you could consider is making the private key into a file that the users can download however the same concept applies here if you lose your file you lose your identity.

![Commitment Builder UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0p0eb1diwr083hbnpis5.png)

---

## 5. Attest a credential

Here the authority can create an attestation by selecting type and pasting the user commitment.

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

Before you can interact with the deployed smart contract, you need to reconstruct its runtime interface. This is a three-step process:

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

`findDeployedContract()` does more than connect. It queries the on-chain contract state, extracts the embedded verifier keys, and compares them byte-for-byte against the compiled artifacts you just loaded. If there is a mismatch — for example, if someone deployed a different version of the contract — the call throws immediately. This protects you from accidentally interacting with the wrong smart contract.

The function also initializes your local private state. You pass `authoritySk` inside `createAttestPrivateState()` so the witness `localSecretKey()` can resolve correctly when the circuit runs. If the private state ID collides with another role (for example, the prover state), the authentication step fails with an opaque error, so keeping `attestState` separate is critical.

```javascript
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
        initialPrivateState: createAttestPrivateState(authoritySk),
      });
```

### Create the transaction interface

`createCircuitCallTxInterface()` builds a typed proxy over the deployed smart contract. Instead of manually constructing transactions, you call methods directly — `txInterface.attestAge(commitBytes)` — and the library handles the rest. Under the hood, it looks up the circuit definition, wires the witnesses, prepares the private state, and returns a transaction builder that you can execute.

```typescript
      const txInterface = createCircuitCallTxInterface(
        providers as never,
        finalContract as never,
        contractAddress,
        privateStateId
      );
```

### Execute the attestation

Calling `attestAge()` triggers the full Midnight transaction lifecycle:

1. **Witness resolution** — `localSecretKey()` fetches `authoritySk` from your private state
2. **Authority check** — the circuit verifies `publicKey(sk) == authority` on-chain
3. **Proof generation** — the proof server generates a zero-knowledge proof that the authority check passes without revealing `authoritySk`
4. **Transaction balancing** — `walletProvider` sends the unsigned transaction to your wallet extension, which adds fees and signs it
5. **Submission** — `midnightProvider` broadcasts the signed transaction to the network
6. **Confirmation** — the transaction is included in a block and the commitment is inserted into the `ageCommitments` Merkle tree

```typescript
result = await (txInterface as any).attestAge(commitBytes);
```

![Attestation UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4rt7hni1x2uvr1uw1r4m.png)

Now the user has a valid attestation under their unique `commitment` which was computed using the secret key passed through witness.

---

## 6. Prove your eligibility

The user can now attempt to verify and generate a proof in [Prove.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Prove.tsx)

`handleProve()` goes through a similar flow to `handleAttest()` except that it calls the circuit `proveAge()` and uses `attestSk` instead of `authoritySk` to authenticate.

`privateStateId` is also different. Attest must pass `attestState` while Prove must pass `attestProverState` otherwise it crashes with `Unsupported state unable to authenticate data`

`initialPrivateState` is different. Attest passes `createAttestPrivateState(authoritySk)` while Prove must pass `{ secretKey: attestSk }` — the prover identity key, not the authority key.

```typescript
result = await (txInterface as any).proveAge();
```

![Prove UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xvjck4o19r4gmpysnny9.png)

Now let's look at the nullifier in action. In this example the age has already been verified, as you can see in the explorer `proveAge`

https://explorer.1am.xyz/tx/a6b14a14c15d486bc547a449342cc196036be74e4c04699f2a6a1be1ebd03ccb

EXECUTION SUCCESSFUL!

![Explorer Success](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/cousj0aaeljdskkrljdh.png)

`Proof already used — each credential can only be proven once.` was returned, and the console log shows the error: `Prove error: Error: Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Age proof already used`

This means the smart contract is working exactly as intended — the `nullifier` is recognized as already used.

![Proof Already Used Error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/x2u5eh48ux62f4fl2err.png)

## 7. State read flow

When you unlock the Home page, it checks whether you are an authority or not. It does this by querying the smart contract state from the indexer. The raw state data is fed into `contractModule.ledger()` which deserializes it into typed ledger fields, including `authority: Bytes<32>`.


```
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

The frontend derives your authority secret key from the same master key that unlocked your identity, then hashes it through the smart contract's `publicKey()` circuit to produce your authority public key. If the on-chain authority matches your computed public key byte-for-byte, a green badge appears saying "You are the authority". If there is a mismatch, a grey badge shows "Not the authority"

```
        const match = onChainAuthority.length === authorityPublicKey.length &&
          onChainAuthority.every((b: number, i: number) => b === authorityPublicKey[i]);
```          


![Authority Badge UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wdvxbvplidwor9tgsn3u.png)

> **Note:** Even if you use the same wallet but there is a password mismatch, it does not show "You are the authority".

## 8. Off-chain API to store data

Reading smart contract state directly from the indexer on every page load is slow, adds unnecessary load to the network, and creates a poor user experience. Instead, run a lightweight Express server that polls the indexer every 15 seconds and caches the results in PostgreSQL. The frontend then reads from this cache in milliseconds rather than waiting for a remote GraphQL query.

### Database schema

On startup, `initDb()` drops and recreates two tables. The `contracts` table tracks which smart contract addresses are being monitored. The `contract_states` table stores every polled snapshot with counters for age, residency, and certification proofs.

```typescript
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

When the server starts, it calls `startPolling(TRACKED_CONTRACT)`. This immediately fetches the current state, then registers a `setInterval` loop that repeats every 15 seconds. If the server shuts down gracefully, `stopPolling()` clears the interval and closes the database connection.

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

The raw state returned by the indexer is not directly usable by the generated contract code. It must first be serialized back into bytes, then deserialized through `ContractState.deserialize()`, and finally passed to `ledger()` to extract typed fields like `totalAgeProofs`. The `insertState()` function writes these parsed values into the `contract_states` table and updates the `contracts` timestamp.

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

The frontend calls `GET /contract` to retrieve the latest cached snapshot. The endpoint joins the `contracts` and `contract_states` tables, returning the most recent row ordered by `recorded_at`.

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

In the frontend, the Home page fetches this endpoint on mount and refreshes the badge counters every few seconds. Because the data is cached locally, the UI updates instantly even when the indexer is under load.

![API Polling Logs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/s9tfyfxu0giutys8dzpu.png)

Now the data is being successfully cached `age=2 residency=1 cert=0` 


## Conclusion

You have now built a full-stack DApp on Midnight network, a complete ZK (zero-knowledge) attestation system. It is composed of: a Compact contract enforcing privacy-preserving proofs, a React frontend that derives identities deterministically from nothing but a wallet and a password, and an Express API that caches smart contract state. Your identity is not stored. This means if you lose your password you lose your identity. These critical design decisions are worth remembering.

## Next steps

Now that you've finished this tutorial, here are a few things you can do next:

- Check the full repository [source code](https://github.com/0xfdbu/midnight-apps/tree/main/fullstack-dapp)
- Add a new credential type e.g., "employment"
- Read the Midnight Compact language docs

## Troubleshooting

- **"Wallet not detected"** → Make sure 1AM or Lace browser extensions are installed
- **Transactions failing** → Make sure you have generated tDUST and that wallet is fully synced
- **Not the authority** → Password/Wallet mismatch 
- **Age proof already used** → You already proved this credential; use a different one.