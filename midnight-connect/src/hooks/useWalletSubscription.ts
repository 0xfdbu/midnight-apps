/**
 * Wallet State Subscriptions
 *
 * There are two ways to subscribe to wallet state changes depending on
 * which layer of the stack you are using:
 *
 * 1. Browser / dApp Connector (ConnectedAPI v4)
 *    The dApp Connector does NOT expose a native push/subscription API.
 *    Reactive updates are built on top of polling — see `useWalletSubscription`
 *    and `subscribeToWalletState` below.
 *
 * 2. Wallet SDK (WalletFacade)
 *    When you initialize the wallet directly (CLI, backend, or embedded),
 *    the Wallet SDK exposes an RxJS observable via `wallet.state()`.
 *    This is a true push-based subscription. See `subscribeWithWalletSdk`
 *    at the bottom of this file.
 */

import { useEffect, useRef } from 'react';
import { useWalletStore } from './useWallet';

interface WalletSubscriptionOptions {
  /** Poll balances every N ms (default: 15000) */
  balanceInterval?: number;
  /** Poll connection status every N ms (default: 5000) */
  connectionInterval?: number;
}

/**
 * Hook that sets up reactive wallet state updates.
 *
 * Under the hood, this polls the wallet extension because the v4 API
 * does not provide a push-based subscription. The hook abstracts this
 * away so components receive updates reactively.
 */
export function useWalletSubscription(options: WalletSubscriptionOptions = {}) {
  const {
    balanceInterval = 15000,
    connectionInterval = 5000,
  } = options;

  const { connectedApi, isConnected, loadWalletState, disconnect } = useWalletStore();
  const lastStatusRef = useRef<'connected' | 'disconnected'>('disconnected');

  /* ------------------------------------------------------------------ */
  /* 1. Balance polling                                                 */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isConnected || !connectedApi) return;

    loadWalletState();
    const id = setInterval(() => loadWalletState(), balanceInterval);
    return () => clearInterval(id);
  }, [isConnected, connectedApi, loadWalletState, balanceInterval]);

  /* ------------------------------------------------------------------ */
  /* 2. Connection-status polling                                       */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isConnected || !connectedApi) return;

    const check = async () => {
      try {
        const status = await connectedApi.getConnectionStatus();
        lastStatusRef.current = status.status;

        if (status.status === 'disconnected') {
          disconnect();
        }
      } catch {
        // Network or extension unreachable — treat as disconnected
        if (lastStatusRef.current === 'connected') {
          disconnect();
        }
      }
    };

    const id = setInterval(check, connectionInterval);
    return () => clearInterval(id);
  }, [isConnected, connectedApi, disconnect, connectionInterval]);
}

/* ------------------------------------------------------------------ */
/* 3. Imperative subscription API (outside React)                      */
/* ------------------------------------------------------------------ */

export interface WalletStateSnapshot {
  isConnected: boolean;
  balances: ReturnType<typeof useWalletStore.getState>['balances'];
  addresses: ReturnType<typeof useWalletStore.getState>['addresses'];
}

export type WalletStateListener = (snapshot: WalletStateSnapshot) => void;

/**
 * Subscribe to wallet state changes using a callback.
 *
 * Returns an unsubscribe function. This is useful for non-React
 * contexts (e.g., background tasks, vanilla JS integrations).
 *
 * For true push-based subscriptions, use the Wallet SDK's
 * `wallet.state().subscribe(...)` instead (see `src/lib/transaction-cli.ts`).
 */
export function subscribeToWalletState(
  listener: WalletStateListener,
  options: WalletSubscriptionOptions = {}
): () => void {
  const { balanceInterval = 15000 } = options;

  // Immediately emit current state
  const store = useWalletStore.getState();
  listener({
    isConnected: store.isConnected,
    balances: store.balances,
    addresses: store.addresses,
  });

  // Subscribe to Zustand store changes
  const unsubscribe = useWalletStore.subscribe((state) => {
    listener({
      isConnected: state.isConnected,
      balances: state.balances,
      addresses: state.addresses,
    });
  });

  // Drive updates via polling
  const interval = setInterval(() => {
    store.loadWalletState();
  }, balanceInterval);

  return () => {
    clearInterval(interval);
    unsubscribe();
  };
}
