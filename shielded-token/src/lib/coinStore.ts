import { uint8ArrayToHex } from './utils';

export interface StoredCoin {
  id: string;
  nonce: string;
  color: string;
  value: string;
  source: 'mint' | 'mintAndSend' | 'change';
  txId: string;
  createdAt: string;
}

const STORAGE_KEY = 'shielded_token_coins';

export function getStoredCoins(): StoredCoin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCoin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredCoins(coins: StoredCoin[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
}

export function addStoredCoin(coin: StoredCoin): void {
  const coins = getStoredCoins();
  if (!coins.some((c) => c.id === coin.id)) {
    coins.push(coin);
    saveStoredCoins(coins);
  }
}

export function removeStoredCoin(id: string): void {
  const coins = getStoredCoins().filter((c) => c.id !== id);
  saveStoredCoins(coins);
}

export function clearStoredCoins(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function coinFromShieldedCoinInfo(
  coin: { nonce: Uint8Array; color: Uint8Array; value: bigint },
  source: StoredCoin['source'],
  txId: string
): StoredCoin {
  const nonceHex = uint8ArrayToHex(coin.nonce);
  return {
    id: nonceHex,
    nonce: nonceHex,
    color: uint8ArrayToHex(coin.color),
    value: coin.value.toString(),
    source,
    txId,
    createdAt: new Date().toISOString(),
  };
}
