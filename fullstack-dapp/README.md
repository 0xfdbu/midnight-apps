# Membership Club DApp

A Midnight Network membership club DApp with privacy-preserving ZK proofs.

## Features

- **Register**: Join the membership club by paying a fee (1 NIGHT)
- **Prove Eligibility**: Generate ZK proof to prove membership without revealing identity
- **Off-chain Analytics**: Tracks registrations and proofs via WebSocket subscription

## Tech Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4 (dark theme)
- @midnight-ntwrk/dapp-connector-api (wallet integration)
- PostgreSQL (off-chain state caching)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home: View analytics (registrations, proofs count) |
| `/join` | Connect to an existing contract |
| `/deploy` | Deploy new membership contract |
| `/register` | Register as a member (pays fee) |
| `/prove-eligibility` | Generate ZK proof of membership |
| `/dashboard` | View wallet info and state |

## Setup

```bash
npm install
npm run dev
```

## Contract

Deployed contract tracks:
- `hashedMembers`: Set of member commitments
- `usedNullifiers`: Set of used nullifiers (prevents double-proving)
- `totalRegistrations`: Counter of total registrations
- `totalProofs`: Counter of total proofs generated

## Analytics Server

Node.js server (`node-analytics/`) polls Midnight indexer for contract state:

```bash
cd node-analytics
npm install
npm start
```

API endpoints:
- `POST /track/:address` - Track a contract
- `GET /contract/:address` - Get cached state
- `GET /status` - Server status

## Notes

- Registration fee: 1,000,000 raw units (1 NIGHT)
- Proof generation requires local proof server on port 6300
- Private state stored locally via IndexedDB