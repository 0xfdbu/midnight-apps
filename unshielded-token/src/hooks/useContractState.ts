import { useState, useEffect, useRef, useCallback } from 'react';
import {
  INDEXER_WS,
} from './wallet/wallet.constants';
import {
  getContractState,
  getContractBalance,
  getUserTokenBalance,
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
  contractAddress: string | null,
  selectedTokenId: string | null,
  opts: { pollInterval?: number } = {}
) {
  const { pollInterval = 15000 } = opts;
  const [state, setState] = useState<ContractStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlockRef = useRef<number | undefined>(undefined);
  const intentionalCloseRef = useRef(new WeakSet<WebSocket>());

  const fetchState = useCallback(async () => {
    if (!contractAddress) {
      setState(null);
      setLoading(false);
      return;
    }
    try {
      const [s, cb, wb] = await Promise.all([
        getContractState(contractAddress),
        selectedTokenId ? getContractBalance(contractAddress, selectedTokenId) : Promise.resolve(0n),
        connectedApi && selectedTokenId ? getUserTokenBalance(connectedApi, selectedTokenId) : Promise.resolve(0n),
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
  }, [connectedApi, contractAddress, selectedTokenId]);

  // Initial fetch + polling fallback
  // TEMP: Polling disabled to test WebSocket-only updates

  useEffect(() => {
    if (!connectedApi || !contractAddress) {
      setLoading(false);
      return;
    }
    console.log('[useContractState] Polling: fetching state...');
    fetchState();
    const id = setInterval(() => {
      console.log('[useContractState] Polling: interval tick');
      fetchState();
    }, pollInterval);
    return () => clearInterval(id);
  }, [fetchState, pollInterval, connectedApi, contractAddress, selectedTokenId]);
  

  // WebSocket subscription for push updates
  useEffect(() => {
    if (!connectedApi || !contractAddress) return;

    let ws: WebSocket | null = null;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 500;

    function connect() {
      ws = new WebSocket(INDEXER_WS, 'graphql-ws');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useContractState] Socket: connected');
        reconnectDelay = 1000; // Reset backoff on successful connection
        ws!.send(JSON.stringify({ type: 'connection_init' }));
        ws!.send(JSON.stringify({
          id: 'contract-state-sub',
          type: 'start',
          payload: {
            query: `
              subscription ContractStateUpdates($address: HexEncoded!) {
                contractActions(address: $address) {
                  state
                  transaction { block { height } }
                }
              }
            `,
            variables: { address: contractAddress },
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data' && msg.payload?.data?.contractActions) {
            const action = msg.payload.data.contractActions;
            const blockHeight = action.transaction?.block?.height;
            
            if (blockHeight && blockHeight !== lastBlockRef.current) {
              lastBlockRef.current = blockHeight;
              // Debounce: the indexer sends a backlog of historical actions on connect.
              // Wait for the flood to stop before fetching, so 150 messages become 1 fetch.
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                console.log('[useContractState] Socket: debounced fetch for block', blockHeight);
                fetchState();
                debounceTimer = null;
              }, DEBOUNCE_MS);
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
        // Suppress errors from intentional closes (React Strict Mode cleanup)
        if (ws && intentionalCloseRef.current.has(ws)) return;
        console.error('[useContractState] WebSocket error:', err);
      };

      ws.onclose = () => {
        if (ws && intentionalCloseRef.current.has(ws)) {
          console.log('[useContractState] Socket: closed intentionally');
          return;
        }
        console.log(`[useContractState] Socket: disconnected, reconnecting in ${reconnectDelay}ms...`);
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
          connect();
        }, reconnectDelay);
      };
    }

    connect();

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (ws) {
        intentionalCloseRef.current.add(ws);
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ id: 'contract-state-sub', type: 'stop' })); } catch {}
          ws.close();
        }
        // If the socket is still CONNECTING (common in React Strict Mode),
        // do not call close(). The browser will clean it up, and calling
        // close() on a CONNECTING socket produces a console warning.
      }
    };
  }, [connectedApi, fetchState, contractAddress, selectedTokenId]);

  return { state, loading, error, refetch: fetchState };
}
