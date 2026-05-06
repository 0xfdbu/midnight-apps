# Shielded Token DApp Requirements

Functional and technical requirements for a shielded token DApp on the Midnight Network.

---

## Functional Requirements

### 1. Mint Shielded Tokens

Users must be able to create new shielded tokens through the DApp UI.

- Input: token value (positive integer)
- Circuit: `mintShieldedToken` with `evolveNonce`
- Output: new shielded coin committed to the ledger Merkle tree
- The minting authority is controlled by the contract's configured minter public key

### 2. Transfer Shielded Tokens

Users must be able to send shielded tokens to another shielded address.

- Input: recipient shielded address, amount to send
- Circuit: `sendShielded`
- Change management: automatic via `ShieldedSendResult`
- If the input coin value exceeds the send amount, the remainder is returned as a new shielded coin to the sender
- The recipient receives a single shielded coin with the exact sent amount

### 3. Burn Shielded Tokens

Users must be able to permanently destroy shielded tokens.

- Input: amount to burn
- Circuit: `sendImmediateShielded` to `shieldedBurnAddress()`
- The contract increases the public `totalBurned` counter
- Burned tokens are unrecoverable

### 4. Balance Display

Users must be able to view their shielded token balance in the UI.

- The balance is fetched from the connected wallet via `getShieldedBalances()`
- The UI displays the decrypted balance without revealing it to on-chain observers

### 5. Wallet Integration

The DApp must integrate with Midnight wallets via the dApp Connector API v4.

- Wallet detection via `window.midnight` with semver filtering (`4.x`)
- Auto-reconnect with `localStorage` persistence
- Account modal showing shielded address, unshielded address, dust address, and balances
- Transaction balancing via `balanceUnsealedTransaction`

---

## Smart Contract Requirements

### Ledger State

```compact
ledger tokens : Map<Bytes<32>, Uint<64>>;
ledger merkleRoot : Bytes<32>;
ledger totalSupply : Uint<64>;
ledger totalBurned : Uint<64>;
ledger minter : Bytes<32>;
```

### Circuits

#### `mintShieldedToken`

- Takes: value, recipient shielded address, current nonce
- Calls `evolveNonce` to derive the next nonce
- Creates a new shielded coin commitment
- Updates the Merkle tree root
- Increases `totalSupply`

#### `evolveNonce`

- Takes: current nonce (Bytes<32>)
- Returns: next nonce (Bytes<32>)
- Deterministic: same input always produces same output
- Used to ensure unique coin identifiers

#### `sendShielded`

- Takes: input coin(s), output recipient(s), Merkle path witness(es)
- Verifies input coins exist in the current Merkle tree
- Creates output coin(s) with new commitments
- Handles change: if input value > output value, returns change to sender
- Updates the Merkle tree root

#### `sendImmediateShielded`

- Takes: input coin(s), Merkle path witness(es)
- Sends full value to a fixed address (burn address)
- No change output
- Updates the Merkle tree root

### Merkle Tree Constraint

- Freshly minted coins must be included in the on-chain Merkle tree before they can be spent in a separate transaction
- The `sendShielded` circuit requires Merkle path witnesses for all input coins
- This prevents double-spending and ensures global state consistency

---

## Frontend Requirements

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: shielded balance, total supply, total burned |
| `/mint` | Mint form: amount input, submit button, transaction status |
| `/send` | Send form: recipient address, amount, submit button, change preview |
| `/burn` | Burn form: amount input, confirmation, transaction status |

### Components

- `ConnectButton`: Wallet connection with detection and auto-reconnect
- `AccountModal`: Address display, balance display, copy-to-clipboard, disconnect
- `MintForm`: Amount input with validation
- `SendForm`: Recipient + amount with balance check
- `BurnForm`: Amount input with confirmation dialog
- `TransactionStatus`: Pending / success / error states with tx hash link

### State Management

- Zustand store for wallet state
- Local component state for form inputs and transaction status

---

## Transaction Flow

### Mint Flow

1. User enters amount and clicks "Mint"
2. Frontend calls wallet to build unbalanced transaction with `mintShieldedToken` circuit
3. Transaction is serialized and passed to `balanceUnsealedTransaction`
4. Wallet balances the transaction (adds fees)
5. Frontend submits the balanced transaction
6. UI updates after confirmation

### Send Flow

1. User enters recipient shielded address and amount
2. Frontend calls wallet to build unbalanced transaction with `sendShielded` circuit
3. Change is automatically computed and included in `ShieldedSendResult`
4. Transaction is balanced and submitted
5. UI updates after confirmation

### Burn Flow

1. User enters amount and confirms
2. Frontend calls wallet to build unbalanced transaction with `sendImmediateShielded`
3. Target address is `shieldedBurnAddress()`
4. Transaction is balanced and submitted
5. UI updates after confirmation

---

## Environment

- **Network**: Preprod
- **Proof Server**: `midnightnetwork/proof-server:8.0.3` on port 6300
- **Wallet SDK**: v3 (`wallet-sdk-facade@3.0.0`, `wallet-sdk-shielded@2.1.0`)
- **Midnight.js**: `4.0.4`
- **dApp Connector API**: `4.0.1`
