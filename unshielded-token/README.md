# Wallet Connect - Midnight DApp Integration

A React + Vite + TypeScript + Tailwind CSS application demonstrating wallet connection using the Midnight DApp Connector API v4.

## Tech Stack

- **React 19** - UI framework
- **Vite 8** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling (dark theme, black/white only)
- **Zustand** - State management
- **@midnight-ntwrk/dapp-connector-api** - Wallet integration

## Project Structure

```
src/
├── assets/
│   ├── lace.svg         # Lace wallet logo (full gradient)
│   ├── 1am.svg        # 1am wallet logo
│   └── index.ts        # Asset exports
├── components/
│   ├── ui/
│   │   ├── Button.tsx           # Reusable button component
│   │   ├── ConnectButton.tsx    # Header connect button
│   │   ├── AccountModal.tsx      # Connected account popup (centered modal)
│   │   ├── WalletSelectModal.tsx # Wallet selection modal
│   │   ├── WalletStateCard.tsx  # Wallet state display (unused)
│   │   └── Modal.tsx             # Base modal component
│   └── layout/
│       └── Layout.tsx           # App layout with header
├── hooks/
│   └── useWallet.ts            # Wallet state & API integration
├── pages/
│   └── Home.tsx               # Home page
├── lib/
│   ├── utils.ts               # Utility functions (cn)
│   └── constants.ts           # App constants
├── types/
│   └── wallet.ts             # Wallet type definitions
├── App.tsx
├── main.tsx
└── index.css                 # Tailwind + CSS variables
```

## Key Features

### 1. Wallet Discovery (v4)
- Uses `window.midnight` to detect installed wallets
- Filters by semver (`4.x`) for API compatibility
- Supports multiple wallets with dropdown selection

```typescript
// src/hooks/useWallet.ts
export function getCompatibleWallets(): InitialAPI[] {
  if (!window.midnight) return [];
  return Object.values(window.midnight).filter(
    (wallet) => semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
  );
}
```

### 2. Wallet Connection (v4)
- `wallet.connect(networkId)` replaces deprecated `enable()`
- Supports `'preprod'` | `'mainnet'` | `'preview'` | `'undeployed'`

```typescript
connect: async (networkId) => {
  const connectedApi = await wallet.connect(networkId);
  setConnectedApi(connectedApi);
}
```

### 3. Wallet State (v4)
- Granular methods replace single `state()` call:
  - `getShieldedAddresses()` → shielded address + keys
  - `getUnshieldedAddress()` → unshielded address
  - `getDustAddress()` → dust address
  - `getShieldedBalances()` → shielded token balances
  - `getUnshieldedBalances()` → unshielded balances
  - `getDustBalance()` → dust balance + cap
  - `getConfiguration()` → service URIs

### 4. Transaction Flow (v4)
- `makeTransfer()` → creates transaction
- `balanceUnsealedTransaction(tx)` → balances for contract interaction
- `submitTransaction(tx)` → submits to network

```typescript
const result = await connectedApi.makeTransfer([{
  kind: 'unshielded',
  type: NATIVE_TOKEN_TYPE, // '00'
  value: amount,
  recipient,
}]);
const balanced = await connectedApi.balanceUnsealedTransaction(result.tx);
await connectedApi.submitTransaction(balanced.tx);
```

### 5. Error Handling (v4)
- No more `instanceof APIError`
- Type check instead:

```typescript
if (error.type === 'DAppConnectorAPIError') {
  console.log(error.code); // 'PermissionRejected', 'Disconnected', etc.
}
```

## UI Components

### Connect Button (Header)
- Shows truncated address when connected
- Opens modal on click when connected
- Shows "Connect" or "No Wallet" otherwise

### Account Modal (Centered Popup)
- Triggered by clicking connected button
- Displays:
  - Wallet name + logo
  - Addresses (shielded, unshielded, dust)
  - Balances (shielded, unshielded, dust) in 3-column grid
  - Network indicator
  - Refresh & Disconnect buttons

### Wallet Select Modal
- Shows available wallets with icons
- Loading state while connecting
- Cancel button to close

## Theme

- Pure black background (`#000000`)
- White text only
- Dark gray for secondary elements
- Indigo/emerald/amber accents in AccountModal

## CSS Variables (Tailwind v4)

```css
@theme {
  --color-bg: #000000;
  --color-bg-secondary: #0a0a0a;
  --color-bg-tertiary: #141414;
  --color-border: #1a1a1a;
  --color-border-hover: #2a2a2a;
  --color-text: #ffffff;
  --color-text-secondary: #a1a1a1;
  --color-text-muted: #525252;
}
```

## Running

```bash
npm run dev    # Development server
npm run build  # Production build
```

## Requirements Mapping

| Requirement | Implementation |
|-------------|----------------|
| Wallet discovery | `getCompatibleWallets()` with semver |
| Connect to wallet | `wallet.connect(networkId)` |
| Check connection | `connectedApi.getConnectionStatus()` |
| Get config | `connectedApi.getConfiguration()` |
| Get addresses | `getShieldedAddresses()`, `getUnshieldedAddress()`, `getDustAddress()` |
| Get balances | `getShieldedBalances()`, `getUnshieldedBalances()`, `getDustBalance()` |
| Transaction | `makeTransfer()` → `balanceUnsealedTransaction()` → `submitTransaction()` |
| Error handling | `error.type === 'DAppConnectorAPIError'` |
| Multi-wallet | Dropdown when multiple wallets detected |