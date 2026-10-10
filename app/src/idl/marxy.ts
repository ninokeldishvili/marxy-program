/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/marxy.json`.
 */
export type Marxy = {
  "address": "eFXAZBczq33MQPwveUxMPP9SfNw5RAeVpdeNtZYtcCF",
  "metadata": {
    "name": "marxy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Marxy: last-bid-wins auctions for crypto lots"
  },
  "instructions": [
    {
      "name": "buyCredits",
      "discriminator": [
        14,
        173,
        58,
        38,
        248,
        235,
        115,
        102
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "playerUsdc",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelAuction",
      "discriminator": [
        156,
        43,
        197,
        110,
        218,
        105,
        143,
        182
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "usdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createAuction",
      "discriminator": [
        234,
        6,
        201,
        246,
        47,
        219,
        176,
        107
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "params.auctionId"
              }
            ]
          }
        },
        {
          "name": "lotMint"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "usdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createAuctionParams"
            }
          }
        }
      ]
    },
    {
      "name": "fundLot",
      "discriminator": [
        120,
        168,
        108,
        255,
        107,
        63,
        28,
        146
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "lotMint"
        },
        {
          "name": "adminLotAccount",
          "docs": [
            "The admin's lot tokens, bought just before through Jupiter."
          ],
          "writable": true
        },
        {
          "name": "lotVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "lotTokenProgram"
              },
              {
                "kind": "account",
                "path": "lotMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "lotTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Becomes the platform admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "minMarginBps",
          "type": "u16"
        },
        {
          "name": "getReadySecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "placeBid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "postpone",
      "discriminator": [
        124,
        116,
        101,
        206,
        191,
        184,
        240,
        225
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newSalesClose",
          "type": "i64"
        }
      ]
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "usdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryUsdc",
          "writable": true,
          "optional": true
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "lotMint",
          "optional": true
        },
        {
          "name": "lotVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "lotRecipient",
          "docs": [
            "when nobody bid. Checked in the handler."
          ],
          "optional": true
        },
        {
          "name": "lotRecipientToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "lotTokenProgram",
          "optional": true
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "newTreasury",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "newUsdcMint",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "newMinMarginBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "newGetReadySecs",
          "type": {
            "option": "i64"
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.auctionId",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "usdcVault",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "playerUsdc",
          "writable": true,
          "optional": true
        },
        {
          "name": "usdcTokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "auction",
      "discriminator": [
        218,
        94,
        247,
        242,
        126,
        233,
        131,
        81
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "participant",
      "discriminator": [
        32,
        142,
        108,
        79,
        247,
        179,
        54,
        6
      ]
    }
  ],
  "events": [
    {
      "name": "auctionCreated",
      "discriminator": [
        133,
        190,
        194,
        65,
        172,
        0,
        70,
        178
      ]
    },
    {
      "name": "auctionPostponed",
      "discriminator": [
        94,
        199,
        13,
        13,
        87,
        169,
        13,
        177
      ]
    },
    {
      "name": "auctionRefunding",
      "discriminator": [
        246,
        215,
        155,
        210,
        135,
        217,
        182,
        159
      ]
    },
    {
      "name": "auctionSettled",
      "discriminator": [
        61,
        151,
        131,
        170,
        95,
        203,
        219,
        147
      ]
    },
    {
      "name": "bidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "creditsBought",
      "discriminator": [
        176,
        237,
        13,
        63,
        123,
        84,
        185,
        118
      ]
    },
    {
      "name": "lotFunded",
      "discriminator": [
        105,
        97,
        180,
        159,
        22,
        147,
        211,
        179
      ]
    },
    {
      "name": "participantClosed",
      "discriminator": [
        62,
        49,
        218,
        252,
        40,
        130,
        68,
        71
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the platform admin may perform this action"
    },
    {
      "code": 6001,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6002,
      "name": "zeroLotAmount",
      "msg": "Lot amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "zeroLotValue",
      "msg": "Lot value must be greater than zero"
    },
    {
      "code": 6004,
      "name": "zeroCreditPrice",
      "msg": "Credit price must be greater than zero"
    },
    {
      "code": 6005,
      "name": "zeroCountdown",
      "msg": "Countdown must be greater than zero"
    },
    {
      "code": 6006,
      "name": "zeroOpeningWindow",
      "msg": "Opening window must be greater than zero"
    },
    {
      "code": 6007,
      "name": "salesCloseInPast",
      "msg": "Sales close must be in the future"
    },
    {
      "code": 6008,
      "name": "thresholdBelowMargin",
      "msg": "Sales minimum must be at least the lot value plus the platform minimum margin"
    },
    {
      "code": 6009,
      "name": "creditPriceTooHigh",
      "msg": "One credit costs more than the per-player cap (10% of the lot value)"
    },
    {
      "code": 6010,
      "name": "invalidLotMint",
      "msg": "The lot mint cannot be the USDC mint"
    },
    {
      "code": 6011,
      "name": "invalidUsdcMint",
      "msg": "The USDC mint does not match the platform config"
    },
    {
      "code": 6012,
      "name": "auctionNotActive",
      "msg": "The auction is not active"
    },
    {
      "code": 6013,
      "name": "salesLocked",
      "msg": "Credit sales are closed"
    },
    {
      "code": 6014,
      "name": "salesStillOpen",
      "msg": "Credit sales are still open"
    },
    {
      "code": 6015,
      "name": "zeroCredits",
      "msg": "Must buy at least one credit"
    },
    {
      "code": 6016,
      "name": "creditLimitExceeded",
      "msg": "Purchase exceeds the per-player credit cap"
    },
    {
      "code": 6017,
      "name": "platformCannotBid",
      "msg": "The platform admin and treasury cannot participate"
    },
    {
      "code": 6018,
      "name": "thresholdNotMet",
      "msg": "Sales minimum has not been met"
    },
    {
      "code": 6019,
      "name": "thresholdAlreadyMet",
      "msg": "Sales minimum has already been met"
    },
    {
      "code": 6020,
      "name": "alreadyPostponed",
      "msg": "The auction has already been postponed once"
    },
    {
      "code": 6021,
      "name": "postponeWindowClosed",
      "msg": "The postpone window has closed"
    },
    {
      "code": 6022,
      "name": "postponeWindowOpen",
      "msg": "The postpone window is still open"
    },
    {
      "code": 6023,
      "name": "invalidNewSalesClose",
      "msg": "New sales close must be in the future and later than the current one"
    },
    {
      "code": 6024,
      "name": "postponeTooFar",
      "msg": "New sales close is too far in the future"
    },
    {
      "code": 6025,
      "name": "alreadyFunded",
      "msg": "The lot has already been funded"
    },
    {
      "code": 6026,
      "name": "notFunded",
      "msg": "The lot has not been funded"
    },
    {
      "code": 6027,
      "name": "fundingClosed",
      "msg": "Funding closed: the battle has started"
    },
    {
      "code": 6028,
      "name": "fundingWindowOpen",
      "msg": "The lot can still be funded until battle start"
    },
    {
      "code": 6029,
      "name": "lotNotDeposited",
      "msg": "The lot vault does not hold the full lot"
    },
    {
      "code": 6030,
      "name": "battleNotStarted",
      "msg": "The battle has not started yet"
    },
    {
      "code": 6031,
      "name": "noCreditsLeft",
      "msg": "No credits left"
    },
    {
      "code": 6032,
      "name": "alreadyLastBidder",
      "msg": "You are already the last bidder"
    },
    {
      "code": 6033,
      "name": "biddingEnded",
      "msg": "Bidding has ended"
    },
    {
      "code": 6034,
      "name": "auctionNotEnded",
      "msg": "The auction has not ended yet"
    },
    {
      "code": 6035,
      "name": "wrongRecipient",
      "msg": "Lot recipient does not match the auction outcome"
    },
    {
      "code": 6036,
      "name": "missingAccount",
      "msg": "A required account is missing"
    },
    {
      "code": 6037,
      "name": "auctionStillActive",
      "msg": "Withdrawals are not possible while the auction is active"
    },
    {
      "code": 6038,
      "name": "invalidGetReadySecs",
      "msg": "Get-ready period must be between 1 minute and 1 hour"
    }
  ],
  "types": [
    {
      "name": "auction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auctionId",
            "type": "u64"
          },
          {
            "name": "lotMint",
            "type": "pubkey"
          },
          {
            "name": "lotAmount",
            "docs": [
              "Lot size in the lot mint's base units."
            ],
            "type": "u64"
          },
          {
            "name": "lotValue",
            "docs": [
              "Lot value in USDC base units, fixed at creation."
            ],
            "type": "u64"
          },
          {
            "name": "usdcMint",
            "docs": [
              "USDC mint this auction was created with (the config may change later)."
            ],
            "type": "pubkey"
          },
          {
            "name": "creditPrice",
            "docs": [
              "Price of one credit in USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "maxCreditsPerPlayer",
            "type": "u64"
          },
          {
            "name": "salesMinimum",
            "docs": [
              "USDC that must be sold for the auction to run."
            ],
            "type": "u64"
          },
          {
            "name": "salesClose",
            "docs": [
              "Current sales close (moves once if postponed). Battle start is",
              "`sales_close + get_ready_secs`."
            ],
            "type": "i64"
          },
          {
            "name": "originalSalesClose",
            "docs": [
              "Sales close as created; the postpone window is measured from it."
            ],
            "type": "i64"
          },
          {
            "name": "getReadySecs",
            "docs": [
              "Get-ready period copied from the config at creation, so later config",
              "changes never move the battle start of an existing auction."
            ],
            "type": "i64"
          },
          {
            "name": "openingWindow",
            "docs": [
              "Seconds after battle start in which the first bid must land."
            ],
            "type": "i64"
          },
          {
            "name": "countdown",
            "docs": [
              "Seconds each bid adds from \"now\"."
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "0 until funded; then the time bidding closes."
            ],
            "type": "i64"
          },
          {
            "name": "funded",
            "type": "bool"
          },
          {
            "name": "fundedTime",
            "type": "i64"
          },
          {
            "name": "totalCreditsSold",
            "type": "u64"
          },
          {
            "name": "revenue",
            "docs": [
              "USDC currently held for this auction's credits."
            ],
            "type": "u64"
          },
          {
            "name": "participantCount",
            "docs": [
              "Open participant accounts."
            ],
            "type": "u32"
          },
          {
            "name": "bidCount",
            "type": "u64"
          },
          {
            "name": "lastBidder",
            "docs": [
              "Default pubkey until the first bid."
            ],
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "auctionStatus"
              }
            }
          },
          {
            "name": "postponed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "auctionCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "auctionId",
            "type": "u64"
          },
          {
            "name": "lotMint",
            "type": "pubkey"
          },
          {
            "name": "lotAmount",
            "type": "u64"
          },
          {
            "name": "lotValue",
            "type": "u64"
          },
          {
            "name": "creditPrice",
            "type": "u64"
          },
          {
            "name": "maxCreditsPerPlayer",
            "type": "u64"
          },
          {
            "name": "salesMinimum",
            "type": "u64"
          },
          {
            "name": "salesClose",
            "type": "i64"
          },
          {
            "name": "battleStart",
            "type": "i64"
          },
          {
            "name": "openingWindow",
            "type": "i64"
          },
          {
            "name": "countdown",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "auctionPostponed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "oldSalesClose",
            "type": "i64"
          },
          {
            "name": "newSalesClose",
            "type": "i64"
          },
          {
            "name": "newBattleStart",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "auctionRefunding",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "refundReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "auctionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "lotAmount",
            "type": "u64"
          },
          {
            "name": "revenue",
            "type": "u64"
          },
          {
            "name": "bidCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "auctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunding"
          }
        ]
      }
    },
    {
      "name": "bidPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "creditsLeft",
            "type": "u64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "bidCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Signs every platform action (create / postpone / cancel / fund)."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Receives revenue, returned lots and vault rent."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "USDC mint used for credits in new auctions."
            ],
            "type": "pubkey"
          },
          {
            "name": "minMarginBps",
            "docs": [
              "Minimum margin over the lot value that every sales minimum must cover,",
              "in basis points (2300 = 23%)."
            ],
            "type": "u16"
          },
          {
            "name": "getReadySecs",
            "docs": [
              "Get-ready period for new auctions, in seconds: battle start is",
              "`sales_close + get_ready_secs`. Each auction keeps the value it was created with."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createAuctionParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auctionId",
            "type": "u64"
          },
          {
            "name": "lotAmount",
            "type": "u64"
          },
          {
            "name": "lotValue",
            "type": "u64"
          },
          {
            "name": "creditPrice",
            "type": "u64"
          },
          {
            "name": "salesMinimum",
            "type": "u64"
          },
          {
            "name": "salesClose",
            "type": "i64"
          },
          {
            "name": "openingWindow",
            "type": "i64"
          },
          {
            "name": "countdown",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "creditsBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "credits",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "playerCredits",
            "type": "u64"
          },
          {
            "name": "totalCreditsSold",
            "type": "u64"
          },
          {
            "name": "revenue",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lotFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "lotAmount",
            "type": "u64"
          },
          {
            "name": "fundedTime",
            "type": "i64"
          },
          {
            "name": "battleStart",
            "docs": [
              "Bidding opens here."
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Battle start + opening window: the first bid must land before it."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "participant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "creditsBought",
            "type": "u64"
          },
          {
            "name": "creditsLeft",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participantClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "refunded",
            "docs": [
              "USDC returned to the player (0 after a settled auction)."
            ],
            "type": "u64"
          },
          {
            "name": "creditsBurned",
            "docs": [
              "Unused credits that were burned."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "refundReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "cancelled"
          },
          {
            "name": "salesMinimumMissed"
          },
          {
            "name": "notFunded"
          },
          {
            "name": "noBids"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "auctionSeed",
      "type": "bytes",
      "value": "[97, 117, 99, 116, 105, 111, 110]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "maxGetReadySecs",
      "type": "i64",
      "value": "3600"
    },
    {
      "name": "maxPlayerShareBps",
      "docs": [
        "Maximum share of the lot value one wallet may buy in credits (10%)."
      ],
      "type": "u64",
      "value": "1000"
    },
    {
      "name": "maxPostponeSeconds",
      "docs": [
        "How far ahead of \"now\" a postponed sales close may be (30 days)."
      ],
      "type": "i64",
      "value": "2592000"
    },
    {
      "name": "minGetReadySecs",
      "docs": [
        "Bounds for the get-ready period between sales close and battle start",
        "(`Config::get_ready_secs`): 1 minute to 1 hour. The backend buys and funds",
        "the lot during it, so it can't be shorter than a funding round trip."
      ],
      "type": "i64",
      "value": "60"
    },
    {
      "name": "participantSeed",
      "type": "bytes",
      "value": "[112, 97, 114, 116, 105, 99, 105, 112, 97, 110, 116]"
    },
    {
      "name": "postponeGraceSeconds",
      "docs": [
        "How long after the original sales close the admin may still postpone (1 hour)."
      ],
      "type": "i64",
      "value": "3600"
    }
  ]
};
