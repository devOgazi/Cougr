/**
 * cougr-sdk-core
 *
 * Core client for Cougr turn-based contracts on Stellar Soroban.
 *
 * Scope (issue #324 / PR #350):
 *   - `TurnBasedClient` — simulate + submit + getState
 *   - `decodeMoveResult` / `decodeGameState` — XDR return-value decoders
 *   - Domain types: `GameState`, `MoveResult`, `SimulateResult`, `InvokeOptions`, `SdkCoreOptions`
 *   - Fixture constants for CI: `FIXTURE_PLAYER_X`, `FIXTURE_PLAYER_O`,
 *     `FIXTURE_INITIAL_STATE`, `FIXTURE_AFTER_MOVE_STATE`
 *
 * In production `TurnBasedClient` calls `simulateTransaction` → sign → submit
 * against a live Soroban RPC endpoint. In fixture mode (pass `fixture = true`
 * to the constructor) it returns pre-built fixtures so CI can run without a
 * live node.
 */

// ── Domain types ──────────────────────────────────────────────────────────

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

// ── Client ─────────────────────────────────────────────────────────────────

/**
 * Client for a deployed turn-based Cougr contract.
 *
 * sdk-core owns transport: simulate, sign, submit. It does not own keys or
 * authorization entries — those are supplied by the caller (sdk-session for
 * session-scoped calls, a wallet for direct calls).
 */
export class TurnBasedClient {
  readonly #opts: SdkCoreOptions;
  readonly #fixture: boolean;

  constructor(opts: SdkCoreOptions, fixture = false) {
    this.#opts = opts;
    this.#fixture = fixture;
  }

  /**
   * Simulate `method(args)` against the contract and return the assembled XDR.
   * The caller signs the XDR and passes it to `submit`.
   */
  async simulate(
    method: string,
    args: readonly unknown[],
    _opts: InvokeOptions,
  ): Promise<SimulateResult> {
    if (this.#fixture) {
      return mockSimulate(method, args, this.#opts.contractId);
    }
    throw new Error(
      'cougr-sdk-core: real RPC not yet implemented (PR #350 pending). ' +
      'Pass fixture=true for CI or wait for #350 to merge.',
    );
  }

  /**
   * Submit a pre-signed transaction XDR and return the resulting tx hash.
   */
  async submit(_signedXdr: string): Promise<string> {
    if (this.#fixture) return MOCK_TX_HASH;
    throw new Error(
      'cougr-sdk-core: real RPC not yet implemented (PR #350 pending).',
    );
  }

  /**
   * Read the current `GameState` via a simulation (no auth required).
   */
  async getState(_opts: Pick<InvokeOptions, 'signerAddress'>): Promise<GameState> {
    if (this.#fixture) return structuredClone(FIXTURE_INITIAL_STATE);
    throw new Error(
      'cougr-sdk-core: real RPC not yet implemented (PR #350 pending).',
    );
  }
}

// ── Decoders ──────────────────────────────────────────────────────────────

/**
 * Decode a `MoveResult` from the XDR return-value produced by a successful
 * `make_move` simulation or invocation.
 *
 * The real implementation calls `scValToNative` on a Soroban `ScVal`; the
 * fixture-backed build accepts the native JS shape directly.
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

// ── Fixture constants ─────────────────────────────────────────────────────

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

// ── Internal ───────────────────────────────────────────────────────────────

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
