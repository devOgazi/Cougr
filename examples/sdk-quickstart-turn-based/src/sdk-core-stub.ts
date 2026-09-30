/**
 * sdk-core stub — models the interface described in issue #324 / PR #350.
 *
 * This module will be replaced by `cougr-sdk-core` once PR #350 merges.
 * Every exported name here maps 1-to-1 to what that package commits to in its
 * own issue scope: `invoke`, `simulate`, `decodeMoveResult`, and
 * `decodeGameState`. No name is invented; if the real package spells something
 * differently, only this file changes.
 *
 * The implementation is a fixture-backed mock so CI can run without a live
 * Soroban node. The real `cougr-sdk-core` performs actual RPC calls; the
 * shape is identical.
 */

// ── Types exposed by sdk-core ──────────────────────────────────────────────

export interface GameState {
  cells: number[];          // 9 cells, 0=empty 1=X 2=O
  player_x: string;         // Stellar address
  player_o: string;         // Stellar address
  is_x_turn: boolean;
  move_count: number;
  status: number;           // 0=in_progress 1=x_wins 2=o_wins 3=draw
}

export interface MoveResult {
  success: boolean;
  game_state: GameState;
  message: string;          // "ok" | "gameover" | "bounds" | "occupied" | "notturn" | "notplay"
}

export interface SimulateResult {
  /** Simulated return value from the contract, not yet submitted. */
  returnValue: unknown;
  /** The assembled transaction XDR, ready to be signed and sent. */
  transactionXdr: string;
  /** Ledger sequence number the simulation ran against. */
  ledger: number;
}

export interface SdkCoreOptions {
  /** Soroban RPC endpoint. */
  rpcUrl: string;
  /** The deployed turn-based contract address. */
  contractId: string;
  /** Network passphrase, e.g. `"Test SDF Network ; September 2015"`. */
  networkPassphrase: string;
}

export interface InvokeOptions {
  /** The signer's Stellar account address. sdk-core owns transport only. */
  signerAddress: string;
  /**
   * Authorization entries supplied by the caller (sdk-session provides
   * these for session-scoped calls; the native wallet supplies them for
   * direct calls). sdk-core attaches them to the transaction but does not
   * create them.
   */
  authEntries?: readonly string[];   // base64 XDR SorobanAuthorizationEntry
}

// ── Mock implementation ────────────────────────────────────────────────────

/**
 * Minimal mock that stands in for the real `cougr-sdk-core` package.
 *
 * In production the methods here call `simulateTransaction` → sign → submit.
 * In CI they return pre-built fixtures so no network is needed.
 */
export class TurnBasedClient {
  readonly #opts: SdkCoreOptions;

  /** Fixture mode: set to `true` so CI skips actual RPC calls. */
  readonly #fixture: boolean;

  constructor(opts: SdkCoreOptions, fixture = false) {
    this.#opts = opts;
    this.#fixture = fixture;
  }

  /**
   * Simulate `init_game(player_x, player_o)` and return the assembled XDR.
   * sdk-core owns the simulation; the caller signs it and calls `submit`.
   */
  async simulate(
    method: string,
    args: readonly unknown[],
    _opts: InvokeOptions,
  ): Promise<SimulateResult> {
    if (this.#fixture) {
      return mockSimulate(method, args, this.#opts.contractId);
    }
    throw new Error('Real RPC not available in this stub; pass fixture=true for CI');
  }

  /**
   * Submit a pre-signed transaction XDR and return the resulting tx hash.
   * The caller is responsible for obtaining auth entries (sdk-session for
   * scoped calls, a wallet for direct calls).
   */
  async submit(_signedXdr: string): Promise<string> {
    if (this.#fixture) {
      return MOCK_TX_HASH;
    }
    throw new Error('Real RPC not available in this stub; pass fixture=true for CI');
  }

  /**
   * Read the current `GameState` via a simulation (no auth required).
   */
  async getState(_opts: Pick<InvokeOptions, 'signerAddress'>): Promise<GameState> {
    if (this.#fixture) {
      return structuredClone(FIXTURE_INITIAL_STATE);
    }
    throw new Error('Real RPC not available in this stub; pass fixture=true for CI');
  }
}

// ── Decoders ──────────────────────────────────────────────────────────────

/**
 * Decode a `MoveResult` from the XDR return-value produced by a successful
 * `make_move` simulation or invocation.
 *
 * The real implementation calls `scValToNative` on a Soroban `ScVal`; the mock
 * accepts the native JS shape directly so the test harness can drive it
 * without touching XDR.
 */
export function decodeMoveResult(raw: unknown): MoveResult {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'success' in raw &&
    'game_state' in raw &&
    'message' in raw
  ) {
    return raw as MoveResult;
  }
  throw new TypeError('decodeMoveResult: unexpected shape');
}

/**
 * Decode a `GameState` from the XDR return-value produced by `get_state`.
 */
export function decodeGameState(raw: unknown): GameState {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'cells' in raw &&
    Array.isArray((raw as { cells: unknown }).cells)
  ) {
    return raw as GameState;
  }
  throw new TypeError('decodeGameState: unexpected shape');
}

// ── Internal fixtures ──────────────────────────────────────────────────────

const MOCK_TX_HASH =
  'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

export const FIXTURE_PLAYER_X =
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
export const FIXTURE_PLAYER_O =
  'GBCFAMVYPVP3C7AIZGHOWB4BPJZK3BBI4QSE53OHKZFNFB7OT6YBSIX';

export const FIXTURE_INITIAL_STATE: GameState = {
  cells: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  player_x: FIXTURE_PLAYER_X,
  player_o: FIXTURE_PLAYER_O,
  is_x_turn: true,
  move_count: 0,
  status: 0,
};

export const FIXTURE_AFTER_MOVE_STATE: GameState = {
  cells: [1, 0, 0, 0, 0, 0, 0, 0, 0],  // X placed at cell 0
  player_x: FIXTURE_PLAYER_X,
  player_o: FIXTURE_PLAYER_O,
  is_x_turn: false,
  move_count: 1,
  status: 0,
};

function mockSimulate(
  method: string,
  args: readonly unknown[],
  contractId: string,
): SimulateResult {
  void args;
  void contractId;
  const returnValue =
    method === 'init_game'
      ? structuredClone(FIXTURE_INITIAL_STATE)
      : method === 'make_move'
        ? ({ success: true, game_state: structuredClone(FIXTURE_AFTER_MOVE_STATE), message: 'ok' } satisfies MoveResult)
        : null;
  return {
    returnValue,
    transactionXdr: `MOCK_XDR_${method.toUpperCase()}`,
    ledger: 1000,
  };
}
