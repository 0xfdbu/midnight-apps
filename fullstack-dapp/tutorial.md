Let's build a full-stack Dapp on Midnight network from scratch

Within the next few sections you will go through contract compilation and focus on the Dapp lifecycle.

You'll learn how to interact with contracts using a frontend as well as Deploying them from a frontend and cache contract data off-chain on API and a database.

## Prerequisites

- Node.js installed (v20+)
- A Midnight Wallet (e.g., 1AM or Lace)
- Some Preprod [faucet](https://faucet.preprod.midnight.network/) NIGHT tokens
- A [package.json](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/package.json) with the needed packages

---

## 1. Building the contract

For this demonstration I have decided to build Zero-Knowledge Attestation Protocol with Selective Disclosure.

For this attestation your going to need two core witnesses, `localSecretKey()` will be used to fetch the user's secret key and `findAgePath(commit: Bytes<32>)` this witness fetches the required cryptographic Merkle path from the local private state and passes to the circuit(s) as needed.

```typescript
witness localSecretKey(): Bytes<32>;
witness findAgePath(commit: Bytes<32>): MerkleTreePath<10, Bytes<32>>;
```

You would also need these some essential ledgers which are:

- **`authority`** is used to store the public key of the admin (Only authority can issue attestations)

  ```typescript
  export sealed ledger authority: Bytes<32>;
  ```

- **`ageCommitments`** use `HistoricMerkleTree` think of it as a secure cryptographic folder, this is used instead of a list because of privacy and later on the user can mathematically prove their commitment is inside this tree without the blockchain knowing which leaf belongs to them.

  ```typescript
  export ledger ageCommitments: HistoricMerkleTree<10, Bytes<32>>;
  ```

- **`usedNullifiers`** whenever a user proves their age, a circuit generates a unique `nullifier` hash from their secret key so if they try to prove a second time the circuit sees their `nullifier` is already present.

  ```typescript
  export ledger usedNullifiers: Set<Bytes<32>>;
  ```

- **`totalAgeProofs`** is a simple ledger, it is called to increment later on our `proveAge()` circuit

  ```typescript
  export ledger totalAgeProofs: Counter;
  ```

You also need a simple constructor to initialize the contract, **Constructor arguments are witness data** in this case `authoritySk`

```typescript
constructor(authoritySk: Bytes<32>) {
    // authoritySk is a constructor argument (witness data) — disclose required
    authority = disclose(publicKey(authoritySk));
}
```

Our first circuit is `attestAge()`  fetch the secret key via witness `localSecretKey()` and then check if the entity attempting to run `attestAge()` is an authority or not.

```typescript
export circuit attestAge(userCommit: Bytes<32>): [] {
    const sk = localSecretKey();
    assert(authority == disclose(publicKey(sk)), "Not the authority");
    ageCommitments.insert(disclose(userCommit));
}
```

But as you can see `attestAge()` requires a `userCommit`, the user can forward a commitment to the authority so `userCommit` is an authority input to grant the user an attestation that can they use to prove their age.

Create a private helper circuit `commitment()` to compute a deterministic hash with the user's secret key and a domain separator.

```typescript
circuit commitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<3, Bytes<32>>>(
        [pad(32, "mydapp:commit:v1"), domain, sk]
    );
}
```

You can then use it in a circuit `getCommitment()` and because it is an export our frontend can execute this off-chain to generate the commitment.

```typescript
export circuit getCommitment(sk: Bytes<32>, domain: Bytes<32>): Bytes<32> {
    return commitment(sk, domain);
}
```

Our `proveAge()` circuit fetches `localSecretKey()` via witness and defines `domain` to age for this circuit then a `commitment` is computed using both values then `findAgePath(commit)` witness is called, this is used to check whether there is an active attestation by an authority in the Merkle Tree or not so then you can return whether a user has a valid attestation or not.

You then generate a `nullifier`, To understand why this is needed, you have to look at the privacy guarantees of the contract. If a user proves they are over 18 once, the blockchain only sees `TRUE` it does not know who proved it so without a `nullifier` a malicious user can spam the protocol with hundreds of generated onchain proofs.

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

> **Note : ** In the example uses `domain` because our contract is set to handle multiple types of attestations (age, residency, certifications) refer to the github repo for more information.

You now need to compile this contract but first install compact dev tools

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then run `compact compile contracts/Contract.compact src/contracts` in this case you can assume `src/contracts` is a directory your Frontend and API will use to load the compiled contract (ZKIR, Keys..)

---

## 2. Wallet, Identity & Providers

You begin by setting up a wallet connection, for this you would need to have Dapp-connector-api V4 installed

```typescript
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
```

You can discover installed wallets using `InitialAPI[]` each object is injected the browser installed wallet extensions in this case I have 3 wallets installed (1am, lace, GSD)

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

You also need to create a hook [useWallet.ts](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/hooks/useWallet.ts) it is a Zustand store that manages the entire wallet lifecycle, it scans for installed wallets

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

> **Note :** You will be reusing `useWallet.ts` across all of our frontend pages (Deploy, Attest, Prove)

Your identity is derived deterministically from two inputs: `userPassword` + `shieldedAddresses.shieldedCoinPublicKey`, it is then hashed with domain specific salts (User/Authority) to generate `attest_sk` (Prove identity) for users and `authoritySk` (Deploy, Attest identity) for authorities.

This derivation is used everywhere including `Deploy` to create the authority key, Attest to sign attestation and Prove to generate ZK proofs, Same wallet + same password will always produce same key so you would not lose your identity even if you clear browser storage however you would **lose** it if you forget your password.

This goes through a lock screen / session model as shown below

![Lock Screen UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sizdug72ug2xpp6r3i7a.png)

```javascript
const masterKey = await deriveKeyFromPassword(userPassword, shieldedAddresses.shieldedCoinPublicKey);
```

The most crucial step of this project is making sure the witnesses are correctly setup, you need a [witnesses.ts](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/witnesses.ts) file for this.

Index.js needs to point to the path where you compiled the contract previously

```typescript
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/attest/contract/index.js';
```

You would need to define `AttestPrivateState` this defines the shape of the contract's private state, the only data needed is the `secretKey` and `createAttestPrivateState` helper constructs an object.

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

Then you have two witnesses setup, `localSecretKey()` will be used to fetch the user's secret key and `findAgePath(commit: Bytes<32>)` this witness fetches the required cryptographic Merkle path from the local private state and passes to the circuit(s) as needed.

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

You can now proceed to setup the providers as show below:

- `privateStateProvider` has `levelPrivateStateProvider` for persistent localstorage
- `publicDataProvider` Used for onchain read state on the indexer
- `zkConfigProvider` Loads `FetchZkConfigProvider` <- Compiled Verifiers..
- `proofProvider` responsible for generating Zero-Knowledge proofs on your proof server
- `walletProvider` handles `balanceTx` via `connectedApi.balanceUnsealedTransaction`
- `midnightProvider` Submits tx via `connectedApi.submitTransaction`

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

## 3. Deploy the Contract

You can now proceed to create [Deploy.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Deploy.tsx)

Begin by setting the network in this case it's `prepod`

```typescript
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');
```

Do note that it is recommended to run a proof server locally

```bash
# Run on docker
sudo docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 midnight-proof-server -v
```

Then build the contract using `CompiledContract` API from `@midnight-ntwrk/compact-js`

```typescript
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const compiledContract = CompiledContract.withCompiledFileAssets(ccWithWitnesses, ZK_ARTIFACTS_PATH);
```

Then the next step would be to deploy when passing `authoritySk` as argument so this makes the admin deploying the contract an authority with ability to create attestations.

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

## 4. Generate a Commitment

Now that our contract is deployed, you can go ahead and copy our commitment from [Home.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Home.tsx)

This calls `getCommitment` circuit from our contract to compute a commitment using `secretKey` passed as witness and domain such as `age`.

```javascript
      const commitment = contractModule.pureCircuits.getCommitment(
        secretKey,
        domainToBytes(domain)
      );
```

![Commitment Builder UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0p0eb1diwr083hbnpis5.png)

---

## 5. Attest a Credential

In here the authority can create an attestation by selecting type and pasting the user commitment.

This page goes through a couple of steps:

### Set up the providers

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

### Build the contract interface

```javascript
      const cc = CompiledContract.make('attest', contractModule.Contract);
      const ccWithWitnesses = CompiledContract.withWitnesses(cc, witnesses as any);
      const finalContract = CompiledContract.withCompiledFileAssets(
        ccWithWitnesses,
        ZK_ARTIFACTS_PATH
      );
```

### Connect to the deployed contract

This also verifies the onchain verifier keys matches with the compiled contract also passes `authoritySk` to verify authority

```javascript
      await findDeployedContract(providers as never, {
        contractAddress,
        compiledContract: finalContract as never,
        privateStateId,
        initialPrivateState: createAttestPrivateState(authoritySk),
      });
```

### Create the transaction interface

```javascript
      const txInterface = createCircuitCallTxInterface(
        providers as never,
        finalContract as never,
        contractAddress,
        privateStateId
      );
```

### Execute the attestation

This triggers the full midnight transaction flow

```javascript
result = await (txInterface as any).attestAge(commitBytes);
```

![Attestation UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4rt7hni1x2uvr1uw1r4m.png)

Now the user has a valid attestation under their unique `commitment` which was computed using secret key passed through witness.

---

## 6. Prove Your Eligibility

The user can now attempt to verify and generate a proof in [Prove.tsx](https://github.com/0xfdbu/midnight-apps/blob/main/fullstack-dapp/src/pages/Prove.tsx)

`handleProve()` goes through a similar flow to `handleAttest()` except that it calls the circuit `proveAge()` and uses `attestSk` instead of `authoritySk` to authenticate.

`privateStateId` is also different. Attest must pass `attestState` while Prove must pass `attestProverState` otherwise it crashes with `Unsupported state unable to authenticate data`

`initialPrivateState` is different. Attest passes `createAttestPrivateState(authoritySk)` while Prove must pass `{ secretKey: attestSk }` Prover identity key not the the authority key.

```javascript
result = await (txInterface as any).proveAge();
```

![Prove UI](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xvjck4o19r4gmpysnny9.png)

So now let's speak about the nullifier in action, in my case I have already verified my age, as you can see in the explorer `proveAge`

https://explorer.1am.xyz/tx/a6b14a14c15d486bc547a449342cc196036be74e4c04699f2a6a1be1ebd03ccb

EXECUTION SUCCESSFUL!

![Explorer Success](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/cousj0aaeljdskkrljdh.png)

`Proof already used — each credential can only be proven once.` was returned and in console log error `Prove error: Error: Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Age proof already used`

This means our contract is working exactly as intended `nullifier` is recognized as already used.

![Proof Already Used Error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/x2u5eh48ux62f4fl2err.png)
