// GENERATED FILE — do not edit by hand.
//
// A scripted King's Indian Defense line used by the mock game API. Positions
// (FEN), legal-move maps, captures and material were derived offline with
// chess.js from the SAN line below; evaluations are made-up demo numbers.
// The frontend never computes any of this — it only renders server snapshots.
//
// Line: d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5 a5 Bg5 h6 Bh4 Na6 Nd2 Qe8 O-O Nh7 Bg3 f5 exf5 gxf5 f3 Nf6 Nb3 Nc5 Nxc5 dxc5
import type { PromotionPiece, Square, PieceType } from "@/features/games/types/game.types";

export type DemoPosition = {
  ply: number;
  fen: string;
  lastMove: { from: Square; to: Square };
  checkSquare: Square | null;
  captured: { w: PieceType[]; b: PieceType[] };
  materialBalance: number;
  evaluationCp: number;
  /** Legal destinations per origin square, only when White is to move. */
  legalMoves: Partial<Record<Square, Square[]>>;
};

export type DemoMove = {
  ply: number;
  san: string;
  from: Square;
  to: Square;
  annotation: "best" | "book" | "inaccuracy" | null;
};

export const demoGame = {
  startingPly: 20,
  moves: [
  {
    ply: 1,
    san: "d4",
    from: "d2",
    to: "d4",
    annotation: null
  },
  {
    ply: 2,
    san: "Nf6",
    from: "g8",
    to: "f6",
    annotation: null
  },
  {
    ply: 3,
    san: "c4",
    from: "c2",
    to: "c4",
    annotation: null
  },
  {
    ply: 4,
    san: "g6",
    from: "g7",
    to: "g6",
    annotation: null
  },
  {
    ply: 5,
    san: "Nc3",
    from: "b1",
    to: "c3",
    annotation: null
  },
  {
    ply: 6,
    san: "Bg7",
    from: "f8",
    to: "g7",
    annotation: null
  },
  {
    ply: 7,
    san: "e4",
    from: "e2",
    to: "e4",
    annotation: null
  },
  {
    ply: 8,
    san: "d6",
    from: "d7",
    to: "d6",
    annotation: null
  },
  {
    ply: 9,
    san: "Nf3",
    from: "g1",
    to: "f3",
    annotation: null
  },
  {
    ply: 10,
    san: "O-O",
    from: "e8",
    to: "g8",
    annotation: null
  },
  {
    ply: 11,
    san: "Be2",
    from: "f1",
    to: "e2",
    annotation: null
  },
  {
    ply: 12,
    san: "e5",
    from: "e7",
    to: "e5",
    annotation: null
  },
  {
    ply: 13,
    san: "d5",
    from: "d4",
    to: "d5",
    annotation: null
  },
  {
    ply: 14,
    san: "a5",
    from: "a7",
    to: "a5",
    annotation: "book"
  },
  {
    ply: 15,
    san: "Bg5",
    from: "c1",
    to: "g5",
    annotation: null
  },
  {
    ply: 16,
    san: "h6",
    from: "h7",
    to: "h6",
    annotation: null
  },
  {
    ply: 17,
    san: "Bh4",
    from: "g5",
    to: "h4",
    annotation: null
  },
  {
    ply: 18,
    san: "Na6",
    from: "b8",
    to: "a6",
    annotation: null
  },
  {
    ply: 19,
    san: "Nd2",
    from: "f3",
    to: "d2",
    annotation: "best"
  },
  {
    ply: 20,
    san: "Qe8",
    from: "d8",
    to: "e8",
    annotation: "inaccuracy"
  },
  {
    ply: 21,
    san: "O-O",
    from: "e1",
    to: "g1",
    annotation: null
  },
  {
    ply: 22,
    san: "Nh7",
    from: "f6",
    to: "h7",
    annotation: null
  },
  {
    ply: 23,
    san: "Bg3",
    from: "h4",
    to: "g3",
    annotation: "best"
  },
  {
    ply: 24,
    san: "f5",
    from: "f7",
    to: "f5",
    annotation: null
  },
  {
    ply: 25,
    san: "exf5",
    from: "e4",
    to: "f5",
    annotation: null
  },
  {
    ply: 26,
    san: "gxf5",
    from: "g6",
    to: "f5",
    annotation: null
  },
  {
    ply: 27,
    san: "f3",
    from: "f2",
    to: "f3",
    annotation: null
  },
  {
    ply: 28,
    san: "Nf6",
    from: "h7",
    to: "f6",
    annotation: "inaccuracy"
  },
  {
    ply: 29,
    san: "Nb3",
    from: "d2",
    to: "b3",
    annotation: null
  },
  {
    ply: 30,
    san: "Nc5",
    from: "a6",
    to: "c5",
    annotation: null
  },
  {
    ply: 31,
    san: "Nxc5",
    from: "b3",
    to: "c5",
    annotation: "best"
  },
  {
    ply: 32,
    san: "dxc5",
    from: "d6",
    to: "c5",
    annotation: null
  }
] as DemoMove[],
  positions: [
  {
    ply: 20,
    fen: "r1b1qrk1/1pp2pb1/n2p1npp/p2Pp3/2P1P2B/2N5/PP1NBPPP/R2QK2R w KQ - 4 11",
    lastMove: {
      from: "d8",
      to: "e8"
    },
    checkSquare: null,
    captured: {
      w: [],
      b: []
    },
    materialBalance: 0,
    evaluationCp: 88,
    legalMoves: {
      c4: [
        "c5"
      ],
      h4: [
        "g5",
        "f6",
        "g3"
      ],
      c3: [
        "a4",
        "b5",
        "b1"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      d2: [
        "b3",
        "f3",
        "f1",
        "b1"
      ],
      e2: [
        "d3",
        "f3",
        "g4",
        "h5",
        "f1"
      ],
      f2: [
        "f3",
        "f4"
      ],
      g2: [
        "g3",
        "g4"
      ],
      h2: [
        "h3"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "c1",
        "b1"
      ],
      e1: [
        "f1",
        "g1"
      ],
      h1: [
        "g1",
        "f1"
      ]
    }
  },
  {
    ply: 21,
    fen: "r1b1qrk1/1pp2pb1/n2p1npp/p2Pp3/2P1P2B/2N5/PP1NBPPP/R2Q1RK1 b - - 5 11",
    lastMove: {
      from: "e1",
      to: "g1"
    },
    checkSquare: null,
    captured: {
      w: [],
      b: []
    },
    materialBalance: 0,
    evaluationCp: 94,
    legalMoves: {}
  },
  {
    ply: 22,
    fen: "r1b1qrk1/1pp2pbn/n2p2pp/p2Pp3/2P1P2B/2N5/PP1NBPPP/R2Q1RK1 w - - 6 12",
    lastMove: {
      from: "f6",
      to: "h7"
    },
    checkSquare: null,
    captured: {
      w: [],
      b: []
    },
    materialBalance: 0,
    evaluationCp: 81,
    legalMoves: {
      c4: [
        "c5"
      ],
      h4: [
        "g5",
        "f6",
        "e7",
        "d8",
        "g3"
      ],
      c3: [
        "a4",
        "b5",
        "b1"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      d2: [
        "b3",
        "f3",
        "b1"
      ],
      e2: [
        "d3",
        "f3",
        "g4",
        "h5"
      ],
      f2: [
        "f3",
        "f4"
      ],
      g2: [
        "g3",
        "g4"
      ],
      h2: [
        "h3"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "e1"
      ],
      g1: [
        "h1"
      ]
    }
  },
  {
    ply: 23,
    fen: "r1b1qrk1/1pp2pbn/n2p2pp/p2Pp3/2P1P3/2N3B1/PP1NBPPP/R2Q1RK1 b - - 7 12",
    lastMove: {
      from: "h4",
      to: "g3"
    },
    checkSquare: null,
    captured: {
      w: [],
      b: []
    },
    materialBalance: 0,
    evaluationCp: 102,
    legalMoves: {}
  },
  {
    ply: 24,
    fen: "r1b1qrk1/1pp3bn/n2p2pp/p2Ppp2/2P1P3/2N3B1/PP1NBPPP/R2Q1RK1 w - - 0 13",
    lastMove: {
      from: "f7",
      to: "f5"
    },
    checkSquare: null,
    captured: {
      w: [],
      b: []
    },
    materialBalance: 0,
    evaluationCp: 90,
    legalMoves: {
      c4: [
        "c5"
      ],
      e4: [
        "f5"
      ],
      c3: [
        "a4",
        "b5",
        "b1"
      ],
      g3: [
        "f4",
        "e5",
        "h4"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      d2: [
        "b3",
        "f3",
        "b1"
      ],
      e2: [
        "d3",
        "f3",
        "g4",
        "h5"
      ],
      f2: [
        "f3",
        "f4"
      ],
      h2: [
        "h3",
        "h4"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "e1"
      ],
      g1: [
        "h1"
      ]
    }
  },
  {
    ply: 25,
    fen: "r1b1qrk1/1pp3bn/n2p2pp/p2PpP2/2P5/2N3B1/PP1NBPPP/R2Q1RK1 b - - 0 13",
    lastMove: {
      from: "e4",
      to: "f5"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: []
    },
    materialBalance: 1,
    evaluationCp: 118,
    legalMoves: {}
  },
  {
    ply: 26,
    fen: "r1b1qrk1/1pp3bn/n2p3p/p2Ppp2/2P5/2N3B1/PP1NBPPP/R2Q1RK1 w - - 0 14",
    lastMove: {
      from: "g6",
      to: "f5"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 0,
    evaluationCp: 97,
    legalMoves: {
      c4: [
        "c5"
      ],
      c3: [
        "a4",
        "b5",
        "e4",
        "b1"
      ],
      g3: [
        "f4",
        "e5",
        "h4"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      d2: [
        "b3",
        "e4",
        "f3",
        "b1"
      ],
      e2: [
        "d3",
        "f3",
        "g4",
        "h5"
      ],
      f2: [
        "f3",
        "f4"
      ],
      h2: [
        "h3",
        "h4"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "e1"
      ],
      g1: [
        "h1"
      ]
    }
  },
  {
    ply: 27,
    fen: "r1b1qrk1/1pp3bn/n2p3p/p2Ppp2/2P5/2N2PB1/PP1NB1PP/R2Q1RK1 b - - 0 14",
    lastMove: {
      from: "f2",
      to: "f3"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 0,
    evaluationCp: 110,
    legalMoves: {}
  },
  {
    ply: 28,
    fen: "r1b1qrk1/1pp3b1/n2p1n1p/p2Ppp2/2P5/2N2PB1/PP1NB1PP/R2Q1RK1 w - - 1 15",
    lastMove: {
      from: "h7",
      to: "f6"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 0,
    evaluationCp: 84,
    legalMoves: {
      c4: [
        "c5"
      ],
      c3: [
        "a4",
        "b5",
        "e4",
        "b1"
      ],
      f3: [
        "f4"
      ],
      g3: [
        "f4",
        "e5",
        "h4",
        "f2",
        "e1"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      d2: [
        "b3",
        "e4",
        "b1"
      ],
      e2: [
        "d3"
      ],
      h2: [
        "h3",
        "h4"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "f2",
        "e1"
      ],
      g1: [
        "f2",
        "h1"
      ]
    }
  },
  {
    ply: 29,
    fen: "r1b1qrk1/1pp3b1/n2p1n1p/p2Ppp2/2P5/1NN2PB1/PP2B1PP/R2Q1RK1 b - - 2 15",
    lastMove: {
      from: "d2",
      to: "b3"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 0,
    evaluationCp: 121,
    legalMoves: {}
  },
  {
    ply: 30,
    fen: "r1b1qrk1/1pp3b1/3p1n1p/p1nPpp2/2P5/1NN2PB1/PP2B1PP/R2Q1RK1 w - - 3 16",
    lastMove: {
      from: "a6",
      to: "c5"
    },
    checkSquare: null,
    captured: {
      w: [
        "p"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 0,
    evaluationCp: 99,
    legalMoves: {
      b3: [
        "a5",
        "c5",
        "d4",
        "d2",
        "c1"
      ],
      c3: [
        "a4",
        "b5",
        "e4",
        "b1"
      ],
      f3: [
        "f4"
      ],
      g3: [
        "f4",
        "e5",
        "h4",
        "f2",
        "e1"
      ],
      a2: [
        "a3",
        "a4"
      ],
      e2: [
        "d3"
      ],
      h2: [
        "h3",
        "h4"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "d2",
        "d3",
        "d4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "f2",
        "e1"
      ],
      g1: [
        "f2",
        "h1"
      ]
    }
  },
  {
    ply: 31,
    fen: "r1b1qrk1/1pp3b1/3p1n1p/p1NPpp2/2P5/2N2PB1/PP2B1PP/R2Q1RK1 b - - 0 16",
    lastMove: {
      from: "b3",
      to: "c5"
    },
    checkSquare: null,
    captured: {
      w: [
        "p",
        "n"
      ],
      b: [
        "p"
      ]
    },
    materialBalance: 3,
    evaluationCp: 130,
    legalMoves: {}
  },
  {
    ply: 32,
    fen: "r1b1qrk1/1pp3b1/5n1p/p1pPpp2/2P5/2N2PB1/PP2B1PP/R2Q1RK1 w - - 0 17",
    lastMove: {
      from: "d6",
      to: "c5"
    },
    checkSquare: null,
    captured: {
      w: [
        "p",
        "n"
      ],
      b: [
        "p",
        "n"
      ]
    },
    materialBalance: 0,
    evaluationCp: 112,
    legalMoves: {
      d5: [
        "d6"
      ],
      c3: [
        "a4",
        "b5",
        "e4",
        "b1"
      ],
      f3: [
        "f4"
      ],
      g3: [
        "f4",
        "e5",
        "h4",
        "f2",
        "e1"
      ],
      a2: [
        "a3",
        "a4"
      ],
      b2: [
        "b3",
        "b4"
      ],
      e2: [
        "d3"
      ],
      h2: [
        "h3",
        "h4"
      ],
      a1: [
        "b1",
        "c1"
      ],
      d1: [
        "c2",
        "b3",
        "a4",
        "d2",
        "d3",
        "d4",
        "e1",
        "c1",
        "b1"
      ],
      f1: [
        "f2",
        "e1"
      ],
      g1: [
        "f2",
        "h1"
      ]
    }
  }
] as DemoPosition[],
};

export const promotionDemo = {
  startFen: "8/2P5/4k3/8/8/8/8/4K3 w - - 0 70",
  legalMoves: {
    c7: [
      "c8"
    ],
    e1: [
      "d2",
      "e2",
      "f2",
      "f1",
      "d1"
    ]
  },
  results: {
    q: {
      fen: "2Q5/8/4k3/8/8/8/8/4K3 b - - 0 70",
      lastMove: {
        from: "c7",
        to: "c8"
      },
      checkSquare: "e6",
      san: "c8=Q+"
    },
    r: {
      fen: "2R5/8/4k3/8/8/8/8/4K3 b - - 0 70",
      lastMove: {
        from: "c7",
        to: "c8"
      },
      checkSquare: null,
      san: "c8=R"
    },
    b: {
      fen: "2B5/8/4k3/8/8/8/8/4K3 b - - 0 70",
      lastMove: {
        from: "c7",
        to: "c8"
      },
      checkSquare: "e6",
      san: "c8=B+"
    },
    n: {
      fen: "2N5/8/4k3/8/8/8/8/4K3 b - - 0 70",
      lastMove: {
        from: "c7",
        to: "c8"
      },
      checkSquare: null,
      san: "c8=N"
    }
  }
} as {
  startFen: string;
  legalMoves: Partial<Record<Square, Square[]>>;
  results: Record<PromotionPiece, { fen: string; lastMove: { from: Square; to: Square }; checkSquare: Square | null; san: string }>;
};
