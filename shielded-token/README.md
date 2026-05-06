# Shielded Token DApp

A complete shielded token DApp on the Midnight Network. Users can mint, transfer, and burn privacy-preserving shielded tokens using zero-knowledge proofs. All token balances and transaction amounts remain hidden from on-chain observers.

## Features

- **Mint Shielded Tokens**: Create new shielded tokens with `mintShieldedToken` and unique nonces via `evolveNonce`
- **Atomic Mint & Send**: Mint tokens and forward them in a single transaction using `sendImmediateShielded`
- **Private Transfers**: Send shielded tokens through the wallet's native transfer path — no manual coin selection required
- **Burn Shielded Tokens**: Destroy committed tokens via `sendShielded` to `shieldedBurnAddress()` with automatic change return
- **Coin Inventory**: Minted coins are saved locally for easy burning without manual hex input
- **Wallet Integration**: Connect via Lace or 1AM through the DApp Connector API v4
- **Balance Display**: View shielded balances with 15-second auto-sync

## Tech Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4 (dark theme)
- `@midnight-ntwrk/dapp-connector-api` (wallet integration)
- `@midnight-ntwrk/midnight-js-contracts` (contract deployment and calls)
- `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` (wallet-backed proving)
- Compact language for zero-knowledge smart contracts

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: View shielded balance, stored coins, and token stats |
| `/deploy` | Deploy the shielded token smart contract |
| `/mint` | Mint new shielded tokens to your address or another address |
| `/send` | Send shielded tokens to another address (wallet handles coin selection) |
| `/burn` | Burn shielded tokens using your stored coin inventory |

## Prerequisites

- Node.js v20+
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- The Compact compiler installed globally:
  ```bash
  npm install -g @midnight-ntwrk/compact
  ```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Compile the smart contract

```bash
npx compact compile contracts/Token.compact src/contracts
```

This generates the contract runtime, ZKIR, and proving/verifying keys in `src/contracts/`.

### 3. Start the dev server

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### 4. Connect your wallet

Click **Connect Wallet**, approve the connection in your wallet extension, and switch to the **Preprod** network.

## How It Works

### Smart Contract

The shielded token contract (`contracts/Token.compact`) manages:

- **Public ledger state**: `totalSupply`, `totalBurned`
- **Minting**: `createShieldedToken` mints shielded coins with unique nonces
- **Atomic mint & send**: `mintAndSend` mints to the contract then immediately forwards to a recipient
- **Transfer**: `transferShielded` spends existing shielded coins via `sendShielded`
- **Burn**: `burnShieldedToken` sends committed coins to the burn address via `sendShielded`
- **Nonce evolution**: `evolveNonce` derives deterministic nonces from counters

### Key Circuits

| Circuit | Purpose |
|---------|---------|
| `createShieldedToken` | Mint a new shielded coin to a recipient |
| `mintAndSend` | Atomically mint and forward a coin in one transaction |
| `transferShielded` | Spend an existing shielded coin (requires Merkle qualification) |
| `burnShieldedToken` | Burn a shielded coin (uses `sendShielded`, requires Merkle index) |
| `nextNonce` | Derive the next nonce from an index and current nonce |
| `acceptShielded` | Receive a shielded coin into the contract |

### Merkle Tree Constraint

Freshly minted shielded coins are not immediately spendable in an independent transaction. They must first be committed to the on-chain Merkle tree. This is why `transferShielded` requires `QualifiedShieldedCoinInfo` (with `mt_index`), while `mintAndSend` and `burnShieldedToken` use `sendImmediateShielded` which bypasses the Merkle qualification.

### Proving Strategy

This DApp uses **wallet-backed proving** via `dappConnectorProofProvider`. The wallet (Lace/1AM) bundles all required ZK artifacts, including built-in ledger circuits like `output` that standalone proof servers may lack. This avoids the artifact-missing errors common when using a local `httpClientProofProvider`.

### Coin Storage

When you mint tokens, the returned `ShieldedCoinInfo` is automatically saved to `localStorage`. The Burn page uses this inventory to let you select coins from a dropdown instead of pasting hex nonces and colors manually. Change coins returned from burns are also stored.

## Project Structure

```
contracts/
  Token.compact           # Compact smart contract source
src/
  contracts/              # Compiled contract artifacts (ZKIR, keys, JS runtime)
  hooks/
    useWallet.ts          # Zustand store for wallet state
    wallet/services/
      api.ts              # Contract call helpers (deploy, mint, burn)
      contract.ts         # Contract instance + witness implementations
      providers.ts        # Provider builder with wallet proving
  lib/
    coinStore.ts          # LocalStorage-based coin inventory
  pages/
    Home.tsx              # Balance display + stored coins
    Deploy.tsx            # Contract deployment
    Mint.tsx              # Mint to self or mint & send
    Send.tsx              # Wallet-native transfer
    Burn.tsx              # Burn from stored coin inventory
```

## Troubleshooting

See [`troubleshoot.md`](./troubleshoot.md) for detailed guidance on:
- Proof server 400/500 errors
- Missing built-in ledger circuit artifacts
- Vite SPA fallback issues
- Contract compilation problems

Common quick fixes:

| Error | Cause | Fix |
|-------|-------|-----|
| `prove: expected header tag 'midnight:ir-source[v2]:', got '<!doctype...'` | Missing `output` circuit artifact, Vite served `index.html` as fallback | Use `dappConnectorProofProvider` (wallet-backed proving) instead of local proof server |
| `No compatible wallet found` | Extension reports API version outside `'4.x'` | Update your wallet extension |
| `BALANCE_FAILED` | Insufficient NIGHT for fees | Fund your wallet from the [Preprod faucet](https://faucet.preprod.midnight.network/) |
| Shielded balance shows `0` after mint | Wallet hasn't synced the new coin yet | Wait 15 seconds (auto-refresh) or open your wallet to trigger sync |

## Important Notes

- **Private state is stored locally** via IndexedDB through the level private state provider
- **Shielded balances are private** — the UI shows your balance only because the wallet decrypts it locally; on-chain observers see only commitments
- **Nonce management is automatic** — the `localNonce` witness generates fresh random nonces for each mint
- **Change outputs are automatic** — when burning tokens, any remainder is returned as a new shielded coin via `ShieldedSendResult.change`
- **Coin storage is local-only** — clearing browser storage removes your saved coin inventory, but your actual tokens remain in the wallet

---

*Built with `@midnight-ntwrk/midnight-js` 4.0.4, Compact 0.30.0, and the Midnight Preprod network.*
