# Midnight Error Codes Reference

Quick reference for common error codes encountered when developing on the Midnight network.

---

## Deserialization Errors [0–49]

| Code | Type |
|------|------|
| 0 | NetworkId |
| 1 | Transaction |
| 2 | LedgerState |
| 3 | ContractAddress |
| 4 | PublicKey |
| 5 | VersionedArenaKey |
| 6 | UserAddress |
| 7 | TypedArenaKey |
| 8 | SystemTransaction |
| 9 | DustPublicKey |
| 10 | CNightGeneratesDustActionType |
| 11 | CNightGeneratesDustEvent |

---

## Serialization Errors [50–63]

| Code | Type |
|------|------|
| 50 | TransactionIdentifier |
| 51 | LedgerState |
| 52 | LedgerParameters |
| 53 | ContractAddress |
| 54 | ContractState |
| 55 | ContractStateToJson |
| 56 | ZswapState |
| 57 | UnknownType |
| 58 | MerkleTreeDigest |
| 59 | VersionedArenaKey |
| 60 | TypedArenaKey |
| 61 | CNightGeneratesDustEvent |
| 62 | SystemTransaction |
| 63 | ArenaHash |

---

## Transaction Invalid Errors

**Range 100–109:**

| Code | Error |
|------|-------|
| 100 | EffectsMismatch |
| 101 | ContractAlreadyDeployed |
| 102 | ContractNotPresent |
| 103 | Zswap(Unknown) |
| 104 | Transcript |
| 105 | InsufficientClaimable |
| 106 | VerifierKeyNotFound |
| 107 | VerifierKeyAlreadyPresent |
| 108 | ReplayCounterMismatch |
| 109 | UnknownError |

**Range 194–200:**

| Code | Error |
|------|-------|
| 194 | BalanceCheckOutOfBounds |
| 195 | InputNotInUtxos |
| 196 | DustDoubleSpend |
| 197 | DustDeregistrationNotRegistered |
| 198 | GenerationInfoAlreadyPresent |
| 199 | InvariantViolation |
| 200 | RewardTooSmall |

**Range 239–244:**

| Code | Error |
|------|-------|
| 239 | Zswap(NullifierAlreadyPresent) |
| 240 | Zswap(CommitmentAlreadyPresent) |
| 241 | Zswap(UnknownMerkleRoot) |
| 242 | ReplayProtectionViolation(IntentTtlExpired) |
| 243 | ReplayProtectionViolation(IntentTtlTooFarInFuture) |
| 244 | ReplayProtectionViolation(IntentAlreadyExists) |

**Range 248–250:**

| Code | Error |
|------|-------|
| 248 | DivideByZero |
| 249 | MerkleTreeError |
| 250 | Zswap(MerkleTreeError) |

---

## Transaction Malformed Errors [110–192, 212–238]

| Range | Description |
|-------|-------------|
| 110–139 | Various malformed transaction errors |
| 169–181 | Dust registration and contract deployment errors |
| 212–227 | Effects, disjoint, and sequencing check errors |
| 228–234 | Transaction application, balance, and Pedersen errors |

---

## System Transaction Errors [201–211, 245–247]

**Range 201–211:**

| Code | Error |
|------|-------|
| 201 | IllegalPayout |
| 202 | InsufficientTreasuryFunds |
| 203 | CommitmentAlreadyPresent |
| 204 | UnknownError |
| 206 | IllegalReserveDistribution |
| 207 | GenerationInfoAlreadyPresent |
| 208 | InvalidBasisPoints |
| 209 | InvariantViolation |
| 210 | TreasuryDisabled |
| 211 | MerkleTreeError |

**Range 245–247:**

| Code | Error |
|------|-------|
| 245 | ReplayProtectionFailure(IntentTtlExpired) |
| 246 | ReplayProtectionFailure(IntentTtlTooFarInFuture) |
| 247 | ReplayProtectionFailure(IntentAlreadyExists) |

---

## Other Errors [150–157, 165, 255]

| Code | Error |
|------|-------|
| 150 | LedgerCacheError |
| 151 | NoLedgerState |
| 152 | LedgerStateScaleDecodingError |
| 153 | ContractCallCostError |
| 154 | BlockLimitExceededError |
| 155 | FeeCalculationError |
| 156 | ContractNotPresent |
| 157 | BeneficiaryNotFound |
| 165 | GetTransactionContextError |
| 255 | HostApiError |
