# Midnight Apps

A collection of decentralized applications and reference implementations built on the [Midnight Network](https://midnight.network/). Each project includes a working Compact smart contract, a React frontend, and a step-by-step tutorial covering the full DApp lifecycle.

**Network:** Preprod  
**Midnight.js:** 4.0.4 · **Compact:** 0.30.0 · **DApp Connector API:** 4.0.1

---

## Apps

### [dapp-connect](./dapp-connect/)

A reference implementation for connecting to Midnight from both the browser and the CLI. Demonstrates the complete wallet lifecycle across two distinct security contexts.

**What it covers:**
- Wallet detection via `window.midnight` with semver version filtering (`4.x`)
- Connection flow with DApp Connector API v4 (1AM, Lace, GSD)
- Auto-reconnect with `localStorage` persistence
- Account modal with shielded/unshielded/dust balances and addresses
- **Browser transaction flow:** manual `Intent` + `UnshieldedOffer` construction, required `tx.prove()` step, `balanceUnsealedTransaction` for wallet balancing and signing
- **CLI transaction flow:** headless `WalletFacade` with mnemonic-derived keys, `transferTransaction` + `signRecipe` + `finalizeRecipe`, RxJS push subscriptions
- Dust sync handling with state persistence to `.wallet-state/`

**Key distinction:** In the browser flow the wallet extension holds all keys; in the CLI flow your script acts as the wallet.

---

### [fullstack-dapp](./fullstack-dapp/) (Credence)

A fullstack ZK identity and credential attestation system. Authorities attest users by inserting commitments into an on-chain Merkle tree; users prove eligibility via zero-knowledge proofs without revealing their identity.

**What it covers:**
- Compact contract with `HistoricMerkleTree` for privacy-preserving membership proofs
- Multi-credential support (age, residency, certification) via domain-separated commitments
- Deterministic identity derivation from wallet public key + user password — no `localStorage` storage of identity
- Nullifier-based anti-replay: each credential can only be proven once
- Lock screen / session model for authority and prover roles
- Off-chain Express API with PostgreSQL caching and indexer polling

**Key architectural decision:** The authority knows a user is attested but never learns who they are. The blockchain only sees `TRUE` — not the user's identity.

---

### [unshielded-token](./unshielded-token/)

A stablecoin vault DApp demonstrating native unshielded token primitives on Midnight. Shows the transparency and regulatory auditability of unshielded tokens compared to shielded alternatives.

**What it covers:**
- Native mint into a contract vault with `mintUnshieldedToken`
- Send from vault to user address with `sendUnshielded`
- Deposit into vault with `receiveUnshielded`
- Wallet-to-wallet transfers via `makeTransfer` (wallet handles proving and balancing)
- Contract state reading via indexer with ledger deserialization
- Dashboard with total supply, vault balance, and wallet balance
- Comparison of unshielded vs shielded tokens for compliance vs privacy use cases

**Key distinction:** `contractSend` (vault→user, ZK-proven circuit call) vs `makeTransfer` (wallet→wallet, wallet-handled).

---

### [shielded-token](./shielded-token/)

A privacy-preserving token DApp using Zswap shielded primitives. All balances and amounts remain hidden from on-chain observers; only the wallet owner can decrypt them locally.

**What it covers:**
- Mint shielded tokens with `createShieldedToken` and random nonce witness
- Atomic mint-and-send with `mintAndSend` + `sendImmediateShielded` — bypasses Merkle tree qualification
- Burn via `depositAndBurn` (`receiveShielded` + `sendImmediateShielded`) — no Merkle path needed
- Wallet-native shielded transfers via `makeTransfer`
- `localStorage` coin tracking (DApp Connector API does not expose individual coin nonces)
- The Merkle tree constraint: why `sendImmediateShielded` (same-tx) differs from `sendShielded` (requires `mt_index`)
- Proving strategy: `dappConnectorProofProvider` (wallet-backed) for built-in ledger circuits

**Key caveat:** `depositAndBurn` sends change to `kernel.self()` (the contract). The UI enforces full burn by default to avoid locked change outputs.

---

## Shared patterns

All four apps reuse these patterns:

| Pattern | Implementation |
|---------|---------------|
| Wallet detection | `window.midnight` enumeration with version filtering |
| Provider builder | `privateStateProvider` + `publicDataProvider` + `zkConfigProvider` + `proofProvider` + `walletProvider` + `midnightProvider` |
| State polling | 15-second interval via `loadWalletState()` |
| Network | `preprod` |
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS v4 |

---

## Tutorials

Each app folder contains a `tutorial.md` that walks through the smart contract, witness binding, provider setup, frontend integration, and deployment:

- [`dapp-connect/tutorial.md`](./dapp-connect/tutorial.md) — Wallet connection, browser vs CLI transactions
- [`fullstack-dapp/tutorial.md`](./fullstack-dapp/tutorial.md) — ZK attestation, Merkle trees, nullifiers
- [`unshielded-token/tutorial.md`](./unshielded-token/tutorial.md) — Unshielded token vault, native mint/send
- [`shielded-token/tutorial.md`](./shielded-token/tutorial.md) — Shielded tokens, atomic patterns, Merkle constraints

See [`Methodology.md`](./Methodology.md) for authorship, AI tooling, and scope details.

---

## Quick start

```bash
git clone https://github.com/0xfdbu/midnight-apps.git
cd midnight-apps/<app-folder>
npm install
npm run dev
```

Each app requires:
- Node.js v20+
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- The [Compact compiler](https://docs.midnight.network/relnotes/compact-tools) (if recompiling contracts)

---

## Repository structure

```
midnight-apps/
├── README.md              # This file
├── Methodology.md         # Authorship, AI tooling, and scope
├── dapp-connect/          # Wallet connection reference (browser + CLI)
├── fullstack-dapp/        # ZK identity attestation (Credence)
├── unshielded-token/      # Stablecoin vault DApp
└── shielded-token/        # Privacy-preserving token DApp
```

## License

MIT
