#!/usr/bin/env node
/**
 * Test Wallet SDK push subscriptions.
 * Restores state, waits for sync, then logs every state change via RxJS.
 * Read-only — does NOT submit transactions or modify wallet state.
 */

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { restoreWalletState, saveWalletState, subscribeToWalletSdkState } from '../src/lib/transaction-cli';

(globalThis as any).WebSocket = WebSocket;
setNetworkId('preprod');

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
  console.error('Usage: MNEMONIC="..." npx tsx scripts/test-subscription.ts [duration-seconds]');
  process.exit(1);
}

const DURATION_MS = parseInt(process.argv[2] || '30', 10) * 1000;

async function main() {
  console.log('[Subscription] Restoring wallet state...');
  const ctx = await restoreWalletState(MNEMONIC);

  // Safety: save state on interrupt so progress is never lost
  let exiting = false;
  const saveBeforeExit = async () => {
    if (exiting) return;
    exiting = true;
    console.log('\n[Subscription] Interrupted — saving state...');
    await saveWalletState(ctx, '.wallet-state');
    await (ctx.wallet as any).stop();
    process.exit(0);
  };
  process.on('SIGINT', saveBeforeExit);
  process.on('SIGTERM', saveBeforeExit);

  // Helper: check if dust is close enough to tip
  const isDustCloseEnough = (s: any, maxGap: bigint = 1000n): boolean => {
    const dp = s.dust?.progress;
    if (!dp) return false;
    const gap = BigInt(Math.abs(Number(dp.highestRelevantWalletIndex - dp.appliedIndex)));
    return dp.isConnected && gap <= maxGap;
  };

  console.log('[Subscription] Waiting for sync...');
  try {
    await Rx.firstValueFrom(
      ctx.wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.tap((s: any) => {
          const sp = s.shielded?.progress;
          const up = s.unshielded?.progress;
          const dp = s.dust?.progress;
          console.log(
            `[Sync] isSynced=${s.isSynced} ` +
            `shielded=${sp?.appliedIndex ?? '?'}/${sp?.highestRelevantWalletIndex ?? '?'} ` +
            `unshielded=${up?.appliedId ?? '?'}/${up?.highestTransactionId ?? '?'} ` +
            `dust=${dp?.appliedIndex ?? '?'}/${dp?.highestRelevantWalletIndex ?? '?'}`
          );
        }),
        Rx.filter((s: any) => {
          if (s.isSynced) return true;
          const sp = s.shielded?.progress;
          const up = s.unshielded?.progress;
          const shieldedDone = sp && BigInt(sp.highestRelevantWalletIndex - sp.appliedIndex) === 0n;
          const unshieldedDone = up && BigInt(up.highestTransactionId - up.appliedId) === 0n;
          return shieldedDone && unshieldedDone && isDustCloseEnough(s, 1000n);
        }),
        Rx.timeout(120 * 60 * 1000),
      )
    );
    console.log('[Subscription] ✅ Synced enough. Starting push subscription...\n');
  } catch (e: any) {
    console.error('[Subscription] ❌ Sync failed or timed out:', e.message || e);
    await saveWalletState(ctx, '.wallet-state');
    await (ctx.wallet as any).stop();
    process.exit(1);
  }

  // Start the push subscription
  let updateCount = 0;
  const unsubscribe = subscribeToWalletSdkState(ctx, (state: any) => {
    updateCount++;
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);

    const shielded = state.shielded?.balances ?? {};
    const unshielded = state.unshielded?.balances ?? {};
    const dust = state.dust?.balance ? state.dust.balance(new Date()) : 0n;

    console.log(`[${ts}] Update #${updateCount} | isSynced=${state.isSynced}`);
    console.log(`  Shielded:   ${Object.entries(shielded).map(([k, v]) => `${k.slice(0, 8)}..=${v?.toString()}`).join(', ') || '(empty)'}`);
    console.log(`  Unshielded: ${Object.entries(unshielded).map(([k, v]) => `${k.slice(0, 8)}..=${v?.toString()}`).join(', ') || '(empty)'}`);
    console.log(`  Dust:       ${dust.toString()}`);
    console.log('');
  });

  // Run for the requested duration
  console.log(`[Subscription] Listening for push updates for ${DURATION_MS / 1000}s...`);
  console.log('[Subscription] Press Ctrl+C to stop early.\n');

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  console.log(`[Subscription] Done. Received ${updateCount} push update(s).`);

  unsubscribe();
  await saveWalletState(ctx, '.wallet-state');
  await (ctx.wallet as any).stop();
  process.off('SIGINT', saveBeforeExit);
  process.off('SIGTERM', saveBeforeExit);
}

main().catch(async (err) => {
  console.error('[Subscription] Fatal error:', err);
  process.exit(1);
});
