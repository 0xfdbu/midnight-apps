# Midnight Apps

This repository originally contained a collection of decentralized applications and reference implementations built on the [Midnight Network](https://midnight.network/). Each project has been extracted into its own standalone repository with its own tutorial, source code, and release history.

Use the table below to find the project you are looking for.

---

## Standalone repositories

| Repository | Description | Topics |
|---|---|---|
| [**midnight-attestation-dapp**](https://github.com/0xfdbu/midnight-attestation-dapp) | A Midnight Network credential attestation DApp with privacy-preserving ZK proofs. | `identity`, `privacy`, `compact`, `zero-knowledge`, `midnightntwrk` |
| [**midnight-unshielded-token**](https://github.com/0xfdbu/midnight-unshielded-token) | A Midnight Network stablecoin DApp with unshielded token operations. | `midnight`, `compact`, `zero-knowledge`, `midnightntwrk` |
| [**midnight-shielded-token**](https://github.com/0xfdbu/midnight-shielded-token) | A complete shielded token DApp on the Midnight Network. | `midnight`, `compact`, `zero-knowledge`, `midnightntwrk` |
| [**midnight-dapp-connect**](https://github.com/0xfdbu/midnight-dapp-connect) | A minimal Midnight Network reference demonstrating browser wallet connection (Lace / 1AM) and CLI transaction flows. | `lace`, `midnightntwrk`, `1am` |

---

## Network and toolchain

| | |
|---|---|
| **Network** | Preprod |
| **Midnight.js** | 4.0.4 |
| **Compact compiler** | 0.30.0 |
| **DApp Connector API** | 4.0.1 |

---

## Legacy folders

The original project folders still live in this repository for reference:

```
midnight-apps/
├── dapp-connect/          # Wallet connection reference (browser + CLI)
├── fullstack-dapp/        # ZK identity attestation (Credence)
├── unshielded-token/      # Stablecoin vault DApp
└── shielded-token/        # Privacy-preserving token DApp
```

Active development, updated tutorials, and standalone releases now happen in the repositories linked above.

---

## Methodology

See [`Methodology.md`](./Methodology.md) for authorship, AI tooling, feedback application, and scope details.

## License

MIT
