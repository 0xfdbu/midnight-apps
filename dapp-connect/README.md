# Dapp Connect

A minimal Midnight Network reference demonstrating browser wallet connection (Lace / 1AM) and CLI transaction flows on Preprod.

## Features

- **Wallet Detection**: Auto-detect compatible wallets via `window.midnight`
- **Browser Transfers**: Send unshielded tNIGHT through Lace/1AM using `balanceUnsealedTransaction`
- **CLI Transfers**: Headless Node.js scripts with mnemonic-derived keys using `balanceUnboundTransaction`
- **State Persistence**: Save and restore wallet sync state to avoid re-syncing from genesis

## Tech Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 (dark theme)
- `@midnight-ntwrk/dapp-connector-api` v4 (wallet integration)
- `@midnight-ntwrk/wallet-sdk-*` v3 (CLI wallet SDK)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: Balances, addresses, wallet status |
| `/transfer` | Send an unshielded self-transfer via browser wallet |

## Prerequisites

- Node.js v22+
- Docker (for proof server)
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- 24-word test mnemonic for CLI scripts

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_INDEXER_HTTP=https://indexer.preprod.midnight.network/api/v4/graphql
VITE_INDEXER_WS=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
VITE_PROOF_SERVER=http://localhost:6300
```

## Running the Project

### 1. Install dependencies

```bash
npm install
```

### 2. Start the proof server

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3
```

### 3. Start the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### 4. Run the CLI transfer script

```bash
MNEMONIC="word1 word2 ... word24" npx tsx scripts/test-v3-sync-and-transfer.ts
```

This restores wallet state from `.wallet-state/` (or syncs from scratch), waits for sync, then submits a 1-unit unshielded self-transfer.

## Project Structure

```
Dapp-connect/
├── src/
│   ├── pages/
│   │   ├── Home.tsx          # Wallet dashboard
│   │   └── Transfer.tsx      # Transfer form
│   ├── hooks/
│   │   ├── useWallet.ts      # Zustand store + detection
│   │   └── useWalletSubscription.ts
│   ├── lib/
│   │   └── transaction-cli.ts # CLI wallet init + state persistence
│   └── App.tsx
├── scripts/
│   └── test-v3-sync-and-transfer.ts
└── README.md
```

## Browser vs CLI

| | Browser | CLI |
|--|---------|-----|
| **Key custody** | Wallet extension (Lace / 1AM) | 24-word mnemonic in script |
| **Balancing API** | `balanceUnsealedTransaction` | `balanceUnboundTransaction` |
| **Transfer API** | `makeTransfer` or manual `Intent` + `UnshieldedOffer` | `transferTransaction` + `signRecipe` |
| **Proof step** | `tx.prove()` via wallet's proving provider | Wallet SDK internal proving |
| **State sync** | Wallet extension handles it | `WalletFacade` + RxJS push streams |
| **State restore** | N/A (extension persists) | `restoreWalletState()` from `.wallet-state/` |

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Cannot read properties of undefined (reading 'toString')` | Use correct `DesiredOutput` fields: `kind`, `type`, `value`, `recipient` |
| `Invalid character 'm' at position 0` | Decode Bech32 address to hex before `UnshieldedOffer.new` |
| `expected ...proof..., got ...proof-preimage...` | Call `tx.prove()` before `balanceUnsealedTransaction` |
| `BALANCE_FAILED: invalid network ID` | Use `'preprod'` in `Transaction.fromParts`, not `'undeployed'` |
| `Custom error: 192` | Add `signRecipe()` step for CLI `transferTransaction` |
| `Custom error: 170` | Wait for `isSynced = true` before submitting |
| Dust sync timeout | Use `restoreWalletState()`; save on SIGINT; allow 2h timeout |

---

*Built with `@midnight-ntwrk/midnight-js` 4.0.4 and Wallet SDK 3.0.0 for the Midnight Preprod network.*
