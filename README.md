# Midnight Apps

A collection of decentralized applications built on the [Midnight Network](https://midnight.network/).

## Apps

### [dapp-connect](./dapp-connect/)

A reference implementation for connecting to Midnight from both the browser and the CLI. Covers wallet detection, connection, state monitoring, transaction construction, proving, balancing, signing, and submission.

**Features:**
- Wallet detection via `window.midnight` with version filtering
- Auto-reconnect with `localStorage` persistence
- Account modal with balances, addresses, and copy-to-clipboard
- Manual `Intent` + `UnshieldedOffer` transaction flow
- Headless CLI wallet with mnemonic-derived keys
- State persistence to `.wallet-state/`
- RxJS push subscriptions for wallet state

**Tech stack:** React + TypeScript + Vite + Zustand + Midnight SDK

---

### [fullstack-dapp](./fullstack-dapp/)

A zero-knowledge attestation protocol with selective disclosure. Authorities attest users for credentials (age, residency, certification), and users prove eligibility without revealing which credential they hold.

**Features:**
- Compact smart contract with `HistoricMerkleTree` and nullifiers
- Deterministic identity derivation from password + wallet public key
- Off-chain Express API with PostgreSQL caching
- Real-time analytics dashboard

**Tech stack:** React + TypeScript + Vite + PostgreSQL + Midnight SDK

---

### [unshielded-token](./unshielded-token/)

A stablecoin DApp with unshielded token operations. Demonstrates native minting, vault transfers, and wallet-to-wallet transfers using the `makeTransfer` API.

**Features:**
- Mint tokens to contract vault
- Send tokens from vault to user address
- Deposit tokens into vault
- Wallet-to-wallet transfers
- Dashboard with total supply, contract balance, and wallet balance

**Tech stack:** React + TypeScript + Vite + Midnight SDK

---

## Getting started

Each app has its own README with setup instructions. Generally:

```bash
cd <app-folder>
npm install
npm run dev
```

## Repository structure

```
midnight-apps/
├── README.md           # This file
├── dapp-connect/       # Wallet connection reference
├── fullstack-dapp/     # ZK attestation protocol
└── unshielded-token/   # Stablecoin vault DApp
```

## License

MIT
