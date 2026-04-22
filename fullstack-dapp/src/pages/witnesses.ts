import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

export type MembershipPrivateState = {
  readonly secretKey: Uint8Array;
  readonly privateValue: bigint;
  readonly tokenColor: Uint8Array;
};

export const createMembershipPrivateState = (
  secretKey: Uint8Array,
  privateValue: bigint = 100n,
  tokenColor: Uint8Array = new Uint8Array(32),
): MembershipPrivateState => ({
  secretKey,
  privateValue,
  tokenColor,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<any, MembershipPrivateState>): [MembershipPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
  localPrivateValue: ({
    privateState,
  }: WitnessContext<any, MembershipPrivateState>): [MembershipPrivateState, bigint] => [
    privateState,
    privateState.privateValue,
  ],
  tokenColor: ({
    privateState,
  }: WitnessContext<any, MembershipPrivateState>): [MembershipPrivateState, Uint8Array] => [
    privateState,
    privateState.tokenColor,
  ],
};