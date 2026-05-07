import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CONTRACT_ADDRESS,
  INDEXER_WS,
} from './wallet/wallet.constants';
import {
  getContractState,
  getContractBalance,
  getUserStablecoinBalance,
} from './wallet/services/contractCalls';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

export interface ContractStateSnapshot {
  totalSupply: bigint;
  totalBurned: bigint;
  burnedBalance: bigint;
  contractBalance: bigint;
  walletBalance: bigint;
  blockHeight?: number;
}

export function useContractState(
  connectedApi: ConnectedAPI | null,
  opts: { pollInterval?: number } = {}
) {
  const { pollInterval = 15000 } = opts;
  const [state, setState] = useState<ContractStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastBlockRef = useRef<number | undefined>(undefined);

  const fetchState = useCallback(async () => {
    try {
      const [s, cb, wb] = await Promise.all([
        getContractState(),
        getContractBalance(),
        connectedApi ? getUserStablecoinBalance(connectedApi) : Promise.resolve(0n),
      ]);
      // Usable contract balance = raw balance minus tokens that were burned into the contract
      const usableContractBalance = cb > s.burnedBalance ? cb - s.burnedBalance : 0n;
      setState({
        totalSupply: s.totalSupply,
        totalBurned: s.totalBurned,
        burnedBalance: s.burnedBalance,
        contractBalance: usableContractBalance,
        walletBalance: wb,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [connectedApi]);

  // Initial fetch + polling fallback
  useEffect(() => {
    if (!connectedApi) {
      setLoading(false);
      return;
    }
    fetchState();
    const id = setInterval(fetchState, pollInterval);
    return () => clearInterval(id);
  }, [fetchState, pollInterval, connectedApi]);

  // WebSocket subscription for push updates
  useEffect(() => {
    if (!connectedApi) return;

    const ws = new WebSocket(INDEXER_WS, 'graphql-ws');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connection_init' }));
      ws.send(JSON.stringify({
        id: 'contract-state-sub',
        type: 'start',
        payload: {
          query: `
            subscription ContractStateUpdates($address: HexEncoded!) {
              contractActions(address: $address) {
                state { data }
                transaction { block { height } }
              }
            }
          `,
          variables: { address: CONTRACT_ADDRESS },
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' && msg.payload?.data?.contractActions) {
          const action = msg.payload.data.contractActions;
          const blockHeight = action.transaction?.block?.height;
          // Refetch on new block to avoid duplicate processing
          if (blockHeight && blockHeight !== lastBlockRef.current) {
            lastBlockRef.current = blockHeight;
            fetchState();
          }
        }
        if (msg.type === 'ka') {
          // Keep-alive, ignore
        }
      } catch (e) {
        console.error('[useContractState] Failed to parse message:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[useContractState] WebSocket error:', err);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.send(JSON.stringify({ id: 'contract-state-sub', type: 'stop' }));
        } catch {}
        ws.close();
      }
    };
  }, [connectedApi, fetchState]);

  return { state, loading, error, refetch: fetchState };
}
