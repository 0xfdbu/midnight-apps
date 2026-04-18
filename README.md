# Midnight Apps

A collection of decentralized applications built on the [Midnight Network](https://midnight.network/).

## Apps

### [unshielded-token](./unshielded-token/)
A stablecoin DApp with unshielded token operations.

**Features:**
- Mint tokens to contract
- Direct wallet-to-wallet transfers
- Deposit tokens to contract (Receive)
- Contract sends tokens to user (Contract Send)
- Dashboard with Total Supply, Contract Balance, and Wallet Balance

**Tech Stack:** React + TypeScript + Vite + Midnight SDK

## Getting Started

Each app has its own README with setup instructions. Generally:

```bash
cd <app-folder>
npm install
npm run dev
```

## Repository Structure

```
midnight-apps/
├── README.md           # This file
└── <app-name>/         # Individual DApp folders
    ├── src/            # Frontend code
    ├── contracts/      # Midnight smart contracts (Compact)
    ├── scripts/         # Deployment scripts
    └── ...
```

## License

MIT
