# Building an Unshielded Stablecoin DApp on Midnight Network

A practical guide to building a USD-compliant stablecoin on Midnight using Compact contracts and TypeScript.

## Table of Contents

1. [Introduction](#introduction)
2. [Understanding Unshielded vs Shielded Tokens](#understanding-unshielded-vs-shielded-tokens)
3. [The Stablecoin Contract](#the-stablecoin-contract)
4. [TypeScript Integration](#typescript-integration)
5. [React Frontend](#react-frontend)
6. [Wallet Operations](#wallet-operations)
7. [When to Use Unshielded Tokens](#when-to-use-unshielded-tokens)
8. [Privacy Considerations](#privacy-considerations)

---

## Introduction

This guide walks through building a US Dollar stablecoin on the Midnight Network. We chose unshielded tokens for this use case because USD stablecoins require regulatory compliance and transparency.

**What we built:**
- **Mint** - Create new stablecoins via contract
- **Send** - Direct wallet-to-wallet transfers
- **Receive** - Deposit tokens into contract
- **Contract Send** - Contract sends tokens to users
- **Dashboard** - Real-time balance display

---

## Understanding Unshielded vs Shielded Tokens

Midnight offers two token paradigms, each serving different needs:

### Key Differences

| Property | Unshielded | Shielded |
|----------|-------------|----------|
| **Visibility** | Public — amounts, addresses, timestamps on-chain | Private — amounts and addresses hidden |
| **Proof Mechanism** | Standard UTxO / Schnorr signatures | Zero-knowledge proofs (ZK-SNARKs) |
| **Compliance** | Full transparency for auditing | Privacy by default |
| **Use Case** | Stablecoins, regulated assets | Privacy-sensitive applications |

### When to Choose Unshielded

Unshielded tokens are appropriate when:

1. **Regulatory Compliance** — USD stablecoins must demonstrate backing and auditability
2. **Transparency Requirements** — Governance tokens, institutional settlements
3. **Simplicity** — Lower computational overhead, no ZK proof generation

### When to Choose Shielded

Shielded tokens excel when:

1. **Privacy is Core** — Confidential transactions, private DeFi
2. **User Protection** — Hide balances from surveillance
3. **Competitive Advantage** — Confidential business transactions

> **For a USD stablecoin, unshielded is the correct choice.** Regulatory frameworks require demonstrable reserves and transaction transparency. Shielded stablecoins face significant compliance obstacles.

---

## The Stablecoin Contract

The Compact contract implements five core operations. Save this as `contracts/Contract.compact`:

```compact
pragma language_version 0.22;

import CompactStandardLibrary;

export ledger totalSupply: Uint<64>;
export ledger totalBurned: Uint<64>;

// Mint tokens to contract's own balance
export circuit mintToContract(amount: Uint<64>): Bytes<32> {
    const domain = pad(32, "stablecoin:usd");
    const color = mintUnshieldedToken(
        disclose(domain),
        disclose(amount),
        left<ContractAddress, UserAddress>(kernel.self())
    );
    totalSupply = totalSupply + disclose(amount) as Uint<64>;
    return color;
}

// Mint tokens and send directly to user
export circuit mintToUser(amount: Uint<64>, recipient: UserAddress): Bytes<32> {
    const domain = pad(32, "stablecoin:usd");
    const color = mintUnshieldedToken(
        disclose(domain),
        disclose(amount),
        right<ContractAddress, UserAddress>(disclose(recipient))
    );
    totalSupply = totalSupply + disclose(amount) as Uint<64>;
    return color;
}

// Send tokens from contract to user
export circuit sendToUser(amount: Uint<64>, userAddr: UserAddress): [] {
    const domain = pad(32, "stablecoin:usd");
    const color = tokenType(disclose(domain), kernel.self());
    sendUnshielded(
        color,
        disclose(amount) as Uint<128>,
        right<ContractAddress, UserAddress>(disclose(userAddr))
    );
}

// Receive tokens into contract
export circuit receiveTokens(amount: Uint<128>): [] {
    const domain = pad(32, "stablecoin:usd");
    const color = tokenType(disclose(domain), kernel.self());
    receiveUnshielded(color, disclose(amount));
}

// Burn tokens from circulation
export circuit burnStablecoin(amount: Uint<64>): [] {
    const domain = pad(32, "stablecoin:usd");
    const color = tokenType(disclose(domain), kernel.self());
    receiveUnshielded(color, disclose(amount) as Uint<128>);
    totalBurned = totalBurned + disclose(amount) as Uint<64>;
}
```

### Compile the Contract

```bash
compact compile contracts/Contract.compact contracts/managed/stablecoin
```

This generates:
- Circuit keys (verifier/prover pairs)
- Compiled contract state definitions
- ZK circuits for each operation

---

## TypeScript Integration

### Configuration

Create `src/hooks/wallet/wallet.constants.ts`:

```typescript
export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
export const NATIVE_TOKEN_TYPE = '00';

// Your deployed token ID
export const STABLECOIN_TOKEN = '63c624d789c1d34ea8113473dbe3aaefaf03a68ffb784aef17f32db9c498d9c4';

// Deployed contract address
export const CONTRACT_ADDRESS = '60de8343d8a45eb3c2e673fec092e3efa82a9b5b651c5f0af08bb8a22f4ab436';

// Indexer endpoints
export const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

// Local proof server
export const PROOF_SERVER = 'http://localhost:6300';
export const CONTRACT_PATH = '/contracts/managed/stablecoin';
```

### Mint Tokens

```typescript
export async function mintToContract(
  connectedApi: ConnectedAPI,
  coinPublicKey: string,
  shieldedAddresses: { shieldedEncryptionPublicKey: string },
  amount: bigint,
  onSuccess: (txId: string) => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const mods = await getModules();
    const { indexerModule, FetchZkConfigProvider, levelModule, CompiledContract, ledger, proofModule } = mods;

    const providers = {
      privateStateProvider: levelPrivateStateProvider({ ... }),
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      zkConfigProvider,
      proofProvider,
      walletProvider: {
        getCoinPublicKey: () => coinPublicKey,
        getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
        async balanceTx(tx: any) {
          const serialized = uint8ArrayToHex(tx.serialize());
          const result = await connectedApi.balanceUnsealedTransaction(serialized);
          const bytes = hexToUint8Array(result.tx);
          return ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
        },
      },
      midnightProvider: { ... },
    };

    const [{ findDeployedContract }, contractModule] = await Promise.all([...]);
    const compiledContract = CompiledContract.make('stablecoin', contractModule.Contract).pipe(...);

    const contract = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: 'stablecoinState',
      initialPrivateState: {},
    });

    const txData = await contract.callTx.mintToContract(amount);
    onSuccess(txData.public.txId);
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}
```

### Wallet-to-Wallet Transfer

```typescript
export async function sendStablecoin(
  connectedApi: ConnectedAPI,
  recipient: string,
  amount: bigint,
  onSuccess: () => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const desiredOutput: DesiredOutput = {
      kind: 'unshielded',
      type: STABLECOIN_TOKEN,
      value: amount,
      recipient,
    };

    const result = await connectedApi.makeTransfer([desiredOutput]);
    const balancedResult = await connectedApi.balanceUnsealedTransaction(result.tx);
    await connectedApi.submitTransaction(balancedResult.tx);
    onSuccess();
  } catch (err) {
    onError(handleWalletError(err));
  }
}
```

---

## React Frontend

### Dashboard with Stats

```tsx
export function HomePage() {
  const { isConnected, connectedApi } = useWalletStore();
  const [totalSupply, setTotalSupply] = useState<bigint>(0n);
  const [contractBalance, setContractBalance] = useState<bigint>(0n);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);

  useEffect(() => {
    if (!isConnected || !connectedApi) return;

    const fetchData = async () => {
      const [state, cb, wb] = await Promise.all([
        getContractState(),
        getContractBalance(connectedApi),
        getUserStablecoinBalance(connectedApi)
      ]);
      setTotalSupply(state.totalSupply);
      setContractBalance(cb);
      setWalletBalance(wb);
    };

    fetchData();
  }, [isConnected, connectedApi]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
        <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">
          Total Supply
        </p>
        <p className="text-xl font-semibold text-white">{totalSupply.toString()}</p>
      </div>
      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
        <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">
          Contract Balance
        </p>
        <p className="text-xl font-semibold text-white">{contractBalance.toString()}</p>
      </div>
      <div className="bg-bg-tertiary/40 border border-border/80 rounded-2xl p-4">
        <p className="text-[11px] uppercase tracking-widest text-text-muted/60 mb-1">
          Wallet Balance
        </p>
        <p className="text-xl font-semibold text-white">{walletBalance.toString()}</p>
      </div>
    </div>
  );
}
```

### Wallet Connection

```typescript
const { connectedApi, connect, disconnect } = useWalletStore();

const handleConnect = async () => {
  await connect('preprod'); // Connect to preprod network
};

// Disconnect
const handleDisconnect = () => {
  disconnect();
  localStorage.removeItem('midnight_last_wallet');
};
```

---

## Wallet Operations

### Getting Balances

```typescript
// Get user's stablecoin balance
const balances = await connectedApi.getUnshieldedBalances();
const stablecoinBalance = balances[STABLECOIN_TOKEN];

// Get contract's balance (via indexer)
const contractState = await provider.queryContractState(CONTRACT_ADDRESS);
const contractTokenBalance = contractState.balance.get(STABLECOIN_TOKEN);
```

### Transaction Flow

1. **Create Transaction** - `makeTransfer()` or `contract.callTx.<operation>`
2. **Balance Transaction** - `balanceUnsealedTransaction()` adds wallet inputs/outputs
3. **Submit** - `submitTransaction()` sends to network

```typescript
// Complete transfer flow
const result = await connectedApi.makeTransfer([{
  kind: 'unshielded',
  type: STABLECOIN_TOKEN,
  value: 1000000n, // 1 USD with 6 decimals
  recipient: 'mn_addr_test1...',
}]);

const balanced = await connectedApi.balanceUnsealedTransaction(result.tx);
await connectedApi.submitTransaction(balanced.tx);
```

---

## When to Use Unshielded Tokens

### ✓ Perfect for Unshielded

- **Stablecoins** - Regulatory compliance requires transparent reserves
- **Enterprise Applications** - Companies need auditable transaction records
- **Payment Rails** - Merchants require predictable settlement visibility
- **Governance** - Token holders need transparent voting records

### ✗ Not Ideal for Unshielded

- **Privacy-First DeFi** - Use shielded for confidential finance
- **Anonymous Payments** - Use shielded for P2P privacy
- **Competitive Intelligence Protection** - Use shielded to hide business logic

---

## Privacy Considerations

### What Unshielded Means

When you use unshielded tokens, the following is **publicly visible**:

- Transaction amounts
- Sender and recipient addresses
- Timestamps
- Total supply and burn records

### What Remains Private

Even with unshielded tokens, **private data stays private**:

- Wallet private keys (never leave the wallet)
- Shielded balances (still use ZK proofs)
- Encryption keys (local only)
- Session credentials

### Compliance Use Case

A USD stablecoin on Midnight benefits from unshielded design:

```
┌─────────────────────────────────────────────────────┐
│           USD Stablecoin on Midnight                │
│                                                     │
│  ✓ Transparent minting (auditable supply)         │
│  ✓ Public reserve attestations                     │
│  ✓ Regulator-friendly transaction logs              │
│  ✓ Cross-border settlement transparency            │
│  ✓ Real-time monitoring capabilities               │
└─────────────────────────────────────────────────────┘
```

---

## Screenshots

Add the following screenshots to `/images`:

| Screenshot | Description |
|------------|-------------|
| `dashboard.png` | Dashboard showing Total Supply, Contract Balance, Wallet Balance |
| `mint-page.png` | Mint tokens page with amount input and submit button |
| `send-page.png` | Send tokens page with recipient and amount fields |
| `wallet-connected.png` | Connected wallet modal showing addresses and balances |
| `contract-send-page.png` | Contract Send page for withdrawing from contract |
| `receive-page.png` | Receive tokens page for depositing to contract |

---

## Summary

We built a complete unshielded stablecoin DApp on Midnight with:

- **5 contract operations**: mintToContract, mintToUser, sendToUser, receiveTokens, burnStablecoin
- **TypeScript integration** for wallet connection, transactions, and state queries
- **React frontend** with mint, send, receive, and balance display
- **Unshielded architecture** chosen for regulatory compliance

Unshielded tokens are the right choice for stablecoins and compliance-focused applications. Shielded tokens remain available for privacy-sensitive use cases within the same network.

---

## Resources

- [Midnight Documentation](https://docs.midnight.network)
- [Compact Language Reference](https://docs.midnight.network/compact)
- [Midnight JS SDK](https://github.com/midnightntwrk/midnight-js)
- [DApp Connector API v4](https://github.com/midnightntwrk/dapp-connector-api)