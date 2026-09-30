/**
 * cougr-sdk-session
 *
 * Session-key authorization for Cougr games on Stellar Soroban.
 *
 * Scope (issue #325 / PR #351):
 *   - `SessionBuilder` — fluent builder that produces a `SessionPolicy`
 *   - `buildSessionAuth` — signs an invocation with the session keypair and
 *     returns base64-encoded `SorobanAuthorizationEntry` XDR blobs
 *   - Types: `SessionPolicy`, `SessionScope`, `SessionAuthEntries`, `AuthEntryXdr`
 *   - Fixture constant for CI: `FIXTURE_SESSION_SEED`
 *
 * sdk-session owns the signer: it takes a player-approved ephemeral keypair
 * and produces the `SorobanAuthorizationEntry` XDR that sdk-core attaches to
 * the assembled transaction. The player's main wallet approves the session once;
 * subsequent moves are signed by the session keypair.
 *
 * In fixture mode (`buildSessionAuth(..., { fixture: true })`) the entries are
 * opaque deterministic strings so CI can verify composition without real
 * cryptography.
 */

// ── Types ─────────────────────────────────────────────────────────────────

/** An opaque base64-encoded `SorobanAuthorizationEntry` XDR blob. */
export type AuthEntryXdr = string;

/** What the session key is permitted to sign. */
export interface SessionScope {
  /** Contract addresses the session key may invoke. */
  contractIds: readonly string[];
  /** Function names within those contracts. If omitted, all functions allowed. */
  functionNames?: readonly string[];
}

export interface SessionPolicy {
  /** Stellar address of the player who approved the session. */
  playerAddress: string;
  /** Ephemeral keypair seed (hex or base64). sdk-session manages key derivation. */
  sessionKeySeed: string;
  /** Ledger sequence number after which the session expires. */
  expiryLedger: number;
  /** What the session key may sign. */
  scope: SessionScope;
}

/** Authorization entries ready to be attached to a transaction by sdk-core. */
export interface SessionAuthEntries {
  /** One entry per `require_auth` in the contract invocation. */
  entries: readonly AuthEntryXdr[];
  /** Ledger the entries were built against; sdk-core uses this for TTL checks. */
  ledger: number;
  /** The session key's public key, for auditing purposes only. */
  sessionPublicKey: string;
}

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Fluent builder that produces a `SessionPolicy`.
 *
 * The same policy object can be reused across multiple moves without
 * re-deriving keys. Call `buildSessionAuth(policy, ...)` once per invocation
 * to produce fresh auth entries.
 */
export class SessionBuilder {
  #playerAddress: string;
  #sessionKeySeed: string = generateEphemeralSeed();
  #expiryLedger: number = 0;
  #scope: SessionScope = { contractIds: [] };

  constructor(playerAddress: string) {
    this.#playerAddress = playerAddress;
  }

  withScope(scope: SessionScope): this {
    this.#scope = scope;
    return this;
  }

  withExpiry(expiryLedger: number): this {
    this.#expiryLedger = expiryLedger;
    return this;
  }

  /** Override the auto-generated ephemeral seed (useful in tests). */
  withSeed(seed: string): this {
    this.#sessionKeySeed = seed;
    return this;
  }

  build(): SessionPolicy {
    if (this.#scope.contractIds.length === 0) {
      throw new Error('SessionBuilder: at least one contractId must be in scope');
    }
    if (this.#expiryLedger <= 0) {
      throw new Error('SessionBuilder: expiryLedger must be a positive ledger number');
    }
    return {
      playerAddress: this.#playerAddress,
      sessionKeySeed: this.#sessionKeySeed,
      expiryLedger: this.#expiryLedger,
      scope: this.#scope,
    };
  }
}

// ── Auth entry producer ────────────────────────────────────────────────────

/**
 * Produce `SorobanAuthorizationEntry` XDR blobs for a specific invocation.
 *
 * In production this function:
 *  1. Derives the session keypair from `policy.sessionKeySeed`.
 *  2. Builds a `SorobanAuthorizedInvocation` targeting `contractId` / `functionName`.
 *  3. Signs it with the session keypair and encodes it as base64 XDR.
 *
 * In fixture mode (`options.fixture = true`) it returns deterministic opaque
 * strings so CI tests can assert the composition without needing real
 * cryptography.
 */
export function buildSessionAuth(
  policy: SessionPolicy,
  options: {
    contractId: string;
    functionName: string;
    /** Current ledger; entries expire at `policy.expiryLedger`. */
    ledger: number;
    fixture?: boolean;
  },
): SessionAuthEntries {
  const { contractId, functionName, ledger, fixture = false } = options;

  if (!policy.scope.contractIds.includes(contractId)) {
    throw new Error(
      `buildSessionAuth: contractId ${contractId} is not in session scope`,
    );
  }
  if (
    policy.scope.functionNames !== undefined &&
    !policy.scope.functionNames.includes(functionName)
  ) {
    throw new Error(
      `buildSessionAuth: functionName ${functionName} is not in session scope`,
    );
  }
  if (ledger >= policy.expiryLedger) {
    throw new Error(
      `buildSessionAuth: session has expired (ledger ${ledger} >= expiry ${policy.expiryLedger})`,
    );
  }

  if (fixture) {
    const entry = btoa(
      `session:${policy.playerAddress}:${contractId}:${functionName}:${policy.expiryLedger}`,
    );
    return {
      entries: [entry],
      ledger,
      sessionPublicKey: `MOCK_PUBKEY_${policy.sessionKeySeed.slice(0, 8)}`,
    };
  }

  // Real implementation calls stellar-sdk here (PR #351).
  throw new Error(
    'buildSessionAuth: real XDR signing not yet implemented (PR #351 pending). ' +
    'Pass fixture: true for CI.',
  );
}

// ── Internal ───────────────────────────────────────────────────────────────

function generateEphemeralSeed(): string {
  return 'ephemeral-seed-placeholder-' + Date.now().toString(16);
}

/** Fixture seed for reproducible test output. */
export const FIXTURE_SESSION_SEED = 'test-ephemeral-seed-0000';
