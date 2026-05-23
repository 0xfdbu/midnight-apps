# Unshielded Token

A Midnight Network stablecoin DApp with unshielded token operations.

## Contract

- **Address**: `0c0ad6d96daa1b983751db2149a093c34ea73714c33fbad40d291d9e887f8084`
- **Token Type**: `1193...9458`
- **Circuits**: `mintToContract`, `mintToUser`, `sendToUser`, `receiveTokens`, `burnStablecoin`

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

## Usage flow

The unshielded token DApp follows a vault pattern. The smart contract holds tokens on-chain and operates as a central treasury:

1. **Deploy** — Create a new stablecoin vault contract. The dashboard automatically switches to the newly deployed address.
2. **Mint to contract** — Generate new tokens and send them directly to the contract balance. This increases total supply and funds the vault.
3. **Contract Send** — Distribute tokens from the contract to any wallet address. The recipient sees the tokens in their wallet balance.
4. **Receive (deposit)** — Send tokens from your wallet back into the contract, making them available for the contract to manage.
5. **Burn** — Destroy tokens from the contract, permanently reducing total supply.

Direct wallet-to-wallet transfers (the **Send** page) bypass the contract entirely and use the wallet's native transfer API.

## Notes

- DUST values displayed with 6 decimal places (divide by 1,000,000)
- Uses `balanceUnsealedTransaction` for transaction balancing
- Uses `queryContractState` to read contract balance
- Active contract address is persisted in localStorage and can be changed from the dashboard
