export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
export const NATIVE_TOKEN_TYPE = '00';
export const NATIVE_TOKEN_ID = '0000000000000000000000000000000000000000000000000000000000000000';
export const STABLECOIN_TOKEN = '88aca75e4dfebf5991aee89918528338809dacb71d62c4b7ed8a713839e46bbb';
export const CONTRACT_PATH = '/contracts/managed/stablecoin';
export const CONTRACT_ADDRESS = '0c0ad6d96daa1b983751db2149a093c34ea73714c33fbad40d291d9e887f8084';
export const INDEXER_HTTP = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
export const PRIVATE_STATE_STORE = 'stablecoin';

export const CONTRACT_ADDRESS_STORAGE_KEY = 'unshielded_contract_address';
export const SELECTED_TOKEN_STORAGE_KEY = 'unshielded_selected_token';

export function getActiveContractAddress(): string | null {
  return localStorage.getItem(CONTRACT_ADDRESS_STORAGE_KEY);
}

export function getSelectedTokenId(): string | null {
  return localStorage.getItem(SELECTED_TOKEN_STORAGE_KEY);
}
