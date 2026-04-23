# Attestation Credentials DApp

A Midnight Network credential attestation DApp with privacy-preserving ZK proofs.

## Features

- **Authority Attestations**: Authority attests users for age, residency, or certification credentials
- **Selective Disclosure**: Users prove eligibility without revealing which credential
- **Off-chain Analytics**: Tracks proof counts via Midnight indexer

## Tech Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4 (dark theme)
- @midnight-ntwrk/dapp-connector-api (wallet integration)
- PostgreSQL (off-chain state caching)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: View stats, copy commitment |
| `/deploy` | Deploy new attestation contract (authority only) |
| `/attest` | Attest users for credentials (authority only) |
| `/prove` | Generate ZK proof of eligibility |

## Setup

```bash
npm install
npm run dev
```

## Contract

Deployed on preprod: `8249a861a622c88a64a15ba5b9a0c3c9defb98fb93bec806f4ab22376ce4ff7e`

Ledger fields:
- `authority`: Contract authority (public key)
- `ageCommitments`: Merkle tree of age attestations
- `residencyCommitments`: Merkle tree of residency attestations
- `certCommitments`: Merkle tree of certification attestations
- `usedNullifiers`: Set of used nullifiers (prevents double-proving)
- `totalAgeProofs`: Counter of age proofs
- `totalResidencyProofs`: Counter of residency proofs
- `totalCertProofs`: Counter of certification proofs

## Analytics Server

```bash
cd node-analytics
npm install
node server.ts
```

API endpoints:
- `GET /contract` - Get proof counts (age, residency, cert)
- `GET /status` - Server status

Hardcoded contract: `8249a861a622c88a64a15ba5b9a0c3c9defb98fb93bec806f4ab22376ce4ff7e`

## Notes

- Proof generation requires local proof server on port 6300
- Private state stored locally via levelPrivateStateProvider
- Authority secret key stored in localStorage (`attest_secret_key`)
- User commitment computed as `getCommitment(secretKey, domainBytes)` where domain is 'age', 'residency', or 'certification'