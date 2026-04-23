import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  findAgePath(context: __compactRuntime.WitnessContext<Ledger, PS>,
              commit_0: Uint8Array): [PS, { leaf: Uint8Array,
                                            path: { sibling: { field: bigint },
                                                    goes_left: boolean
                                                  }[]
                                          }];
  findResidencyPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                    commit_0: Uint8Array): [PS, { leaf: Uint8Array,
                                                  path: { sibling: { field: bigint
                                                                   },
                                                          goes_left: boolean
                                                        }[]
                                                }];
  findCertPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
               commit_0: Uint8Array): [PS, { leaf: Uint8Array,
                                             path: { sibling: { field: bigint },
                                                     goes_left: boolean
                                                   }[]
                                           }];
}

export type ImpureCircuits<PS> = {
  attestAge(context: __compactRuntime.CircuitContext<PS>,
            userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestResidency(context: __compactRuntime.CircuitContext<PS>,
                  userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestCertification(context: __compactRuntime.CircuitContext<PS>,
                      userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveAge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveResidency(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveCertification(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  attestAge(context: __compactRuntime.CircuitContext<PS>,
            userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestResidency(context: __compactRuntime.CircuitContext<PS>,
                  userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestCertification(context: __compactRuntime.CircuitContext<PS>,
                      userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveAge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveResidency(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveCertification(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  getCommitment(sk_0: Uint8Array, domain_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  getCommitment(context: __compactRuntime.CircuitContext<PS>,
                sk_0: Uint8Array,
                domain_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  attestAge(context: __compactRuntime.CircuitContext<PS>,
            userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestResidency(context: __compactRuntime.CircuitContext<PS>,
                  userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  attestCertification(context: __compactRuntime.CircuitContext<PS>,
                      userCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveAge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveResidency(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
  proveCertification(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  readonly authority: Uint8Array;
  ageCommitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  residencyCommitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  certCommitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  usedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly totalAgeProofs: bigint;
  readonly totalResidencyProofs: bigint;
  readonly totalCertProofs: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               authoritySk_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
