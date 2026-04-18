# Unshielded Token

A Midnight Network stablecoin DApp with unshielded token operations.

## Contract

- **Address**: `db5d7cb3ed5ab23217abedb86831f6f5b23a9179e91e48dab88d819ef41b8e6d`
- **Token Type**: `1193...9458`
- **Circuits**: `mintToContract`, `makeTransfer`, `receive`, `contractSend`

## Tech Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4 (dark theme)
- Zustand (state management)
- @midnight-ntwrk/dapp-connector-api (wallet integration)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard: Total Supply, Contract Balance, Wallet Balance |
| `/mint` | Mint tokens to contract |
| `/send` | Wallet-to-wallet transfer |
| `/receive` | Deposit tokens to contract |
| `/contract-send` | Contract sends tokens to wallet |
| `/wallet-info` | View addresses and balances |

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

- DUST values displayed with 6 decimal places (divide by 1,000,000)
- Uses `balanceUnsealedTransaction` for transaction balancing
- Uses `queryContractState` to read contract balance
