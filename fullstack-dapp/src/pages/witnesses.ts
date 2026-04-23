import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/attest/contract/index.js';

export type AttestPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createAttestPrivateState = (
  secretKey: Uint8Array,
): AttestPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, AttestPrivateState>): [AttestPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],

  findAgePath: (
    { privateState, ledger }: WitnessContext<Ledger, AttestPrivateState>,
    commit: Uint8Array,
  ) => {
    const path = ledger.ageCommitments.findPathForLeaf(commit);
    if (!path) throw new Error('Age commitment not found in tree');
    return [privateState, path];
  },

  findResidencyPath: (
    { privateState, ledger }: WitnessContext<Ledger, AttestPrivateState>,
    commit: Uint8Array,
  ) => {
    const path = ledger.residencyCommitments.findPathForLeaf(commit);
    if (!path) throw new Error('Residency commitment not found in tree');
    return [privateState, path];
  },

  findCertPath: (
    { privateState, ledger }: WitnessContext<Ledger, AttestPrivateState>,
    commit: Uint8Array,
  ) => {
    const path = ledger.certCommitments.findPathForLeaf(commit);
    if (!path) throw new Error('Certification commitment not found in tree');
    return [privateState, path];
  },
};