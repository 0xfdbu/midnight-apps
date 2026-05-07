import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  createShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                      amount_0: bigint,
                      recipient_0: { is_left: boolean,
                                     left: { bytes: Uint8Array },
                                     right: { bytes: Uint8Array }
                                   }): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }>;
  mintAndSend(context: __compactRuntime.CircuitContext<PS>,
              amount_0: bigint,
              recipient_0: { is_left: boolean,
                             left: { bytes: Uint8Array },
                             right: { bytes: Uint8Array }
                           }): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                               value: { nonce: Uint8Array,
                                                                                        color: Uint8Array,
                                                                                        value: bigint
                                                                                      }
                                                                             },
                                                                     sent: { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }
                                                                   }>;
  transferShielded(context: __compactRuntime.CircuitContext<PS>,
                   coin_0: { nonce: Uint8Array,
                             color: Uint8Array,
                             value: bigint,
                             mt_index: bigint
                           },
                   recipient_0: { is_left: boolean,
                                  left: { bytes: Uint8Array },
                                  right: { bytes: Uint8Array }
                                },
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                      value: { nonce: Uint8Array,
                                                                                               color: Uint8Array,
                                                                                               value: bigint
                                                                                             }
                                                                                    },
                                                                            sent: { nonce: Uint8Array,
                                                                                    color: Uint8Array,
                                                                                    value: bigint
                                                                                  }
                                                                          }>;
  burnShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                    coin_0: { nonce: Uint8Array,
                              color: Uint8Array,
                              value: bigint,
                              mt_index: bigint
                            },
                    amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                       value: { nonce: Uint8Array,
                                                                                                color: Uint8Array,
                                                                                                value: bigint
                                                                                              }
                                                                                     },
                                                                             sent: { nonce: Uint8Array,
                                                                                     color: Uint8Array,
                                                                                     value: bigint
                                                                                   }
                                                                           }>;
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  burnByNonce(context: __compactRuntime.CircuitContext<PS>,
              nonce_0: Uint8Array,
              amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                 value: { nonce: Uint8Array,
                                                                                          color: Uint8Array,
                                                                                          value: bigint
                                                                                        }
                                                                               },
                                                                       sent: { nonce: Uint8Array,
                                                                               color: Uint8Array,
                                                                               value: bigint
                                                                             }
                                                                     }>;
  depositAndBurn(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                    value: { nonce: Uint8Array,
                                                                                             color: Uint8Array,
                                                                                             value: bigint
                                                                                           }
                                                                                  },
                                                                          sent: { nonce: Uint8Array,
                                                                                  color: Uint8Array,
                                                                                  value: bigint
                                                                                }
                                                                        }>;
}

export type ProvableCircuits<PS> = {
  createShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                      amount_0: bigint,
                      recipient_0: { is_left: boolean,
                                     left: { bytes: Uint8Array },
                                     right: { bytes: Uint8Array }
                                   }): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }>;
  mintAndSend(context: __compactRuntime.CircuitContext<PS>,
              amount_0: bigint,
              recipient_0: { is_left: boolean,
                             left: { bytes: Uint8Array },
                             right: { bytes: Uint8Array }
                           }): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                               value: { nonce: Uint8Array,
                                                                                        color: Uint8Array,
                                                                                        value: bigint
                                                                                      }
                                                                             },
                                                                     sent: { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }
                                                                   }>;
  transferShielded(context: __compactRuntime.CircuitContext<PS>,
                   coin_0: { nonce: Uint8Array,
                             color: Uint8Array,
                             value: bigint,
                             mt_index: bigint
                           },
                   recipient_0: { is_left: boolean,
                                  left: { bytes: Uint8Array },
                                  right: { bytes: Uint8Array }
                                },
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                      value: { nonce: Uint8Array,
                                                                                               color: Uint8Array,
                                                                                               value: bigint
                                                                                             }
                                                                                    },
                                                                            sent: { nonce: Uint8Array,
                                                                                    color: Uint8Array,
                                                                                    value: bigint
                                                                                  }
                                                                          }>;
  burnShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                    coin_0: { nonce: Uint8Array,
                              color: Uint8Array,
                              value: bigint,
                              mt_index: bigint
                            },
                    amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                       value: { nonce: Uint8Array,
                                                                                                color: Uint8Array,
                                                                                                value: bigint
                                                                                              }
                                                                                     },
                                                                             sent: { nonce: Uint8Array,
                                                                                     color: Uint8Array,
                                                                                     value: bigint
                                                                                   }
                                                                           }>;
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  burnByNonce(context: __compactRuntime.CircuitContext<PS>,
              nonce_0: Uint8Array,
              amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                 value: { nonce: Uint8Array,
                                                                                          color: Uint8Array,
                                                                                          value: bigint
                                                                                        }
                                                                               },
                                                                       sent: { nonce: Uint8Array,
                                                                               color: Uint8Array,
                                                                               value: bigint
                                                                             }
                                                                     }>;
  depositAndBurn(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                    value: { nonce: Uint8Array,
                                                                                             color: Uint8Array,
                                                                                             value: bigint
                                                                                           }
                                                                                  },
                                                                          sent: { nonce: Uint8Array,
                                                                                  color: Uint8Array,
                                                                                  value: bigint
                                                                                }
                                                                        }>;
}

export type PureCircuits = {
  nextNonce(index_0: bigint, currentNonce_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  createShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                      amount_0: bigint,
                      recipient_0: { is_left: boolean,
                                     left: { bytes: Uint8Array },
                                     right: { bytes: Uint8Array }
                                   }): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }>;
  nextNonce(context: __compactRuntime.CircuitContext<PS>,
            index_0: bigint,
            currentNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  mintAndSend(context: __compactRuntime.CircuitContext<PS>,
              amount_0: bigint,
              recipient_0: { is_left: boolean,
                             left: { bytes: Uint8Array },
                             right: { bytes: Uint8Array }
                           }): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                               value: { nonce: Uint8Array,
                                                                                        color: Uint8Array,
                                                                                        value: bigint
                                                                                      }
                                                                             },
                                                                     sent: { nonce: Uint8Array,
                                                                             color: Uint8Array,
                                                                             value: bigint
                                                                           }
                                                                   }>;
  transferShielded(context: __compactRuntime.CircuitContext<PS>,
                   coin_0: { nonce: Uint8Array,
                             color: Uint8Array,
                             value: bigint,
                             mt_index: bigint
                           },
                   recipient_0: { is_left: boolean,
                                  left: { bytes: Uint8Array },
                                  right: { bytes: Uint8Array }
                                },
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                      value: { nonce: Uint8Array,
                                                                                               color: Uint8Array,
                                                                                               value: bigint
                                                                                             }
                                                                                    },
                                                                            sent: { nonce: Uint8Array,
                                                                                    color: Uint8Array,
                                                                                    value: bigint
                                                                                  }
                                                                          }>;
  burnShieldedToken(context: __compactRuntime.CircuitContext<PS>,
                    coin_0: { nonce: Uint8Array,
                              color: Uint8Array,
                              value: bigint,
                              mt_index: bigint
                            },
                    amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                       value: { nonce: Uint8Array,
                                                                                                color: Uint8Array,
                                                                                                value: bigint
                                                                                              }
                                                                                     },
                                                                             sent: { nonce: Uint8Array,
                                                                                     color: Uint8Array,
                                                                                     value: bigint
                                                                                   }
                                                                           }>;
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
  burnByNonce(context: __compactRuntime.CircuitContext<PS>,
              nonce_0: Uint8Array,
              amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                 value: { nonce: Uint8Array,
                                                                                          color: Uint8Array,
                                                                                          value: bigint
                                                                                        }
                                                                               },
                                                                       sent: { nonce: Uint8Array,
                                                                               color: Uint8Array,
                                                                               value: bigint
                                                                             }
                                                                     }>;
  depositAndBurn(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 amount_0: bigint): __compactRuntime.CircuitResults<PS, { change: { is_some: boolean,
                                                                                    value: { nonce: Uint8Array,
                                                                                             color: Uint8Array,
                                                                                             value: bigint
                                                                                           }
                                                                                  },
                                                                          sent: { nonce: Uint8Array,
                                                                                  color: Uint8Array,
                                                                                  value: bigint
                                                                                }
                                                                        }>;
}

export type Ledger = {
  readonly totalSupply: bigint;
  readonly totalBurned: bigint;
  coins: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { nonce: Uint8Array,
                                 color: Uint8Array,
                                 value: bigint,
                                 mt_index: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { nonce: Uint8Array, color: Uint8Array, value: bigint, mt_index: bigint }]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
