import type { WalletError } from './wallet.types';

export function isWalletError(error: unknown): error is WalletError {
  return typeof error === 'object' && error !== null && 'type' in error && (error as Record<string, unknown>).type === 'DAppConnectorAPIError';
}

export function handleWalletError(error: unknown): string {
  if (isWalletError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export interface ErrorContext {
  cause?: unknown;
  fiberCause?: unknown;
  failure?: unknown;
  nodeErr?: unknown;
}

export function parseErrorChain(err: unknown): ErrorContext {
  const cause = (err as any)?.cause;
  const fiberCause = cause?.cause;
  const failure = fiberCause?.failure;
  const nodeErr = failure?.cause;
  return { cause, fiberCause, failure, nodeErr };
}

export function extractNodeError(err: unknown): string {
  const { nodeErr } = parseErrorChain(err);
  const nodeMsg = (nodeErr as any)?.message || nodeErr?.toString() || String(err);
  console.error('Node error:', nodeMsg);
  return nodeMsg.length > 100 ? nodeMsg.substring(0, 100) + '...' : nodeMsg;
}