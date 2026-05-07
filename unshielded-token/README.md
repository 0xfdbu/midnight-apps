# Unshielded Token

A Midnight Network stablecoin DApp with unshielded token operations.

## Contract

- **Address**: `0c0ad6d96daa1b983751db2149a093c34ea73714c33fbad40d291d9e887f8084`
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
