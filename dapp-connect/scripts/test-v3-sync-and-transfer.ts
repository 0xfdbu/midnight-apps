#!/usr/bin/env node
/**
 * Test v3 wallet: fresh sync, wait for isSynced, then simple transfer.
 */

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { restoreWalletState, saveWalletState } from '../src/lib/transaction-cli';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';

(globalThis as any).WebSocket = WebSocket;
setNetworkId('preprod');

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
  console.error('Usage: MNEMONIC="..." npx tsx scripts/test-v3-sync-and-transfer.ts');
  process.exit(1);
}

async function main() {
  console.log('[Test] Restoring wallet state (or syncing from scratch)...');
  const ctx = await restoreWalletState(MNEMONIC);

  console.log('[Test] Waiting for isSynced=true...');
  // Save state on Ctrl+C so progress isn't lost
  const saveBeforeExit = async () => {
    console.log('\n[Test] Interrupted — saving partial state...');
    await saveWalletState(ctx, '.wallet-state');
    await (ctx.wallet as any).stop();
    process.exit(0);
  };
  process.on('SIGINT', saveBeforeExit);
  process.on('SIGTERM', saveBeforeExit);

  try {
    const syncedState = await Rx.firstValueFrom(
      ctx.wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.tap((s: any) => {
          const sp = s.shielded?.progress;
          const up = s.unshielded?.progress;
          const dp = s.dust?.progress;
          console.log(
            `[Test] isSynced=${s.isSynced} ` +
            `shielded=${sp?.appliedIndex ?? '?'}/${sp?.highestRelevantWalletIndex ?? '?'} ` +
            `unshielded=${up?.appliedId ?? '?'}/${up?.highestTransactionId ?? '?'} ` +
            `dust=${dp?.appliedIndex ?? '?'}/${dp?.highestRelevantWalletIndex ?? '?'} ` +
            `dustBal=${s.dust?.balance ? s.dust.balance(new Date()).toString() : '0'}`
          );
        }),
        Rx.filter((s: any) => s.isSynced === true),
        Rx.timeout(120 * 60 * 1000), // 2 hours for first-time dust sync
      )
    );
    console.log('[Test] ✅ Fully synced! Dust:', syncedState.dust?.balance(new Date())?.toString());
  } catch (e: any) {
    console.error('[Test] ❌ Sync failed or timed out:', e.message || e);
    await saveWalletState(ctx, '.wallet-state'); // save whatever progress we made
    await (ctx.wallet as any).stop();
    process.exit(1);
  }

  // Wait for dust > 0
  console.log('[Test] Waiting for dust balance...');
  try {
    await Promise.race([
      Rx.firstValueFrom(
        ctx.wallet.state().pipe(
          Rx.filter((s: any) => (s.dust?.balance ? s.dust.balance(new Date()) : 0n) > 0n)
        )
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Dust timeout')), 120_000)),
    ]);
    console.log('[Test] ✅ Dust ready');
  } catch {
    console.log('[Test] ⚠️ Dust not ready after 2min, attempting transfer anyway...');
  }

  // Try simple transfer
  console.log('[Test] Creating simple unshielded transfer...');
  try {
    const recipe = await (ctx.wallet as any).transferTransaction(
      [
        {
          type: 'unshielded',
          outputs: [
            {
              amount: 1n,
              receiverAddress: ctx.unshieldedKeystore.getBech32Address(),
              type: unshieldedToken().raw,
            },
          ],
        },
      ],
      { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
      { ttl: new Date(Date.now() + 30 * 60 * 1000) }
    );

    console.log('[Test] Signing recipe...');
    const signedRecipe = await (ctx.wallet as any).signRecipe(
      recipe,
      (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload)
    );

    console.log('[Test] Finalizing recipe...');
    const finalized = await (ctx.wallet as any).finalizeRecipe(signedRecipe);

    console.log('[Test] Submitting...');
    const txId = await (ctx.wallet as any).submitTransaction(finalized);
    console.log('[Test] ✅ Transfer success:', txId);
  } catch (e: any) {
    console.error('[Test] ❌ Transfer failed:', e.message || e);
  }

  await saveWalletState(ctx, '.wallet-state');
  await (ctx.wallet as any).stop();
  process.off('SIGINT', saveBeforeExit);
  process.off('SIGTERM', saveBeforeExit);
  console.log('[Test] Done');
}

main().catch(console.error);
