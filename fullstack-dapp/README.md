# Attestation Credentials DApp

A Midnight Network credential attestation DApp with privacy-preserving ZK proofs.

## Features

- **Authority Attestations**: Authority attests users for age, residency, or certification credentials
- **Selective Disclosure**: Users prove eligibility without revealing which credential
- **Off-chain Analytics**: Tracks proof counts via Midnight indexer

## Tech Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4 (dark theme)
- `@midnight-ntwrk/dapp-connector-api` (wallet integration)
- PostgreSQL (off-chain state caching)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: View stats, copy commitment |
| `/deploy` | Deploy new attestation smart contract (authority only) |
| `/attest` | Attest users for credentials (authority only) |
| `/prove` | Generate ZK proof of eligibility |

## Prerequisites

- Node.js v20+
- Docker (for proof server)
- A Midnight wallet (1AM or Lace) with Preprod NIGHT tokens
- PostgreSQL database (local or Neon)

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_INDEXER_HTTP=https://indexer.preprod.midnight.network/api/v1
VITE_INDEXER_WS=wss://indexer.preprod.midnight.network/ws/v1
VITE_PROOF_SERVER=http://localhost:6300
```

Create a `.env` file in `node-analytics/`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/midnight_analytics
TRACKED_CONTRACT=331460e632fad9146d23b2176433413e8405976afef8a6f0999dda10433f599d
```

## Running the Project

### 1. Compile the smart contract [Skip If you want to use my generate keys]

```bash
npm install
npx compact compile contracts/Contract.compact src/contracts
```

### 2. Start the proof server

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 midnight-proof-server -v
```

### 3. Start the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### 4. Start the analytics server (optional)

```bash
cd node-analytics
npm install
npx tsx server.ts
```

The API runs at `http://localhost:3001`.

## Smart Contract

Deployed on preprod: `331460e632fad9146d23b2176433413e8405976afef8a6f0999dda10433f599d`

Ledger fields:
- `authority`: Smart contract authority (public key)
- `ageCommitments`: Merkle tree of age attestations
- `residencyCommitments`: Merkle tree of residency attestations
- `certCommitments`: Merkle tree of certification attestations
- `usedNullifiers`: Set of used nullifiers (prevents double-proving)
- `totalAgeProofs`: Counter of age proofs
- `totalResidencyProofs`: Counter of residency proofs
- `totalCertProofs`: Counter of certification proofs

## Analytics Server

API endpoints:
- `GET /contract` - Get proof counts (age, residency, cert)
- `GET /status` - Server status

Hardcoded contract: `331460e632fad9146d23b2176433413e8405976afef8a6f0999dda10433f599d`

## Important Notes

- **Proof generation requires the proof server running on port 6300**
- **Private state is stored locally via `levelPrivateStateProvider`**
- **Identity is derived deterministically from your password + wallet shielded coin public key**
  - Same wallet + same password = same identity forever
  - **If you forget your password, your identity is lost permanently**
  - The authority secret key is NOT stored; it is re-derived from your password every session
- User commitment is computed as `getCommitment(secretKey, domainBytes)` where domain is `age`, `residency`, or `certification`
