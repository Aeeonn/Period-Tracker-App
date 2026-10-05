/**
 * `PairingService` (architecture.md §4.2): in-person commit-then-reveal
 * pairing with a 6-digit safety code. Planner design, to be audited
 * (T-PAIR-02). The same payloads travel as QR codes or `.flopair` files.
 */
import type { Base64Url, Brand, PairingSessionId, SpaceId } from './brand.ts';

/** QR-A, shown by her phone. Carries no secret (T-PAIR-02 e). */
export interface PairingOffer {
  readonly v: 1;
  readonly sessionId: PairingSessionId;
  readonly spaceId: SpaceId;
  readonly relayUrl: string | null;
  readonly signPub: Base64Url;
  readonly agreePub: Base64Url;
  /** C = SHA-256("pair/v1/commit" ‖ sessionId ‖ signPub ‖ agreePub ‖ Nh). */
  readonly commitment: Base64Url;
  /** Unix ms; sessions last 10 minutes and are single use. */
  readonly expires: number;
}

/** QR-B, shown by his phone. */
export interface PairingResponse {
  readonly sessionId: PairingSessionId;
  readonly signPub: Base64Url;
  readonly agreePub: Base64Url;
  /** Np, 32 bytes. */
  readonly nonce: Base64Url;
}

/** QR-C, shown by her phone only after recording QR-B. */
export interface PairingReveal {
  readonly sessionId: PairingSessionId;
  /** Nh, 32 bytes. */
  readonly nonce: Base64Url;
}

/** Six decimal digits, from T (architecture.md §4.2). */
export type SafetyCode = Brand<string, 'SafetyCode'>;

export type PairingAbortReason =
  | 'expired'
  | 'reused_session'
  | 'commitment_mismatch'
  | 'codes_do_not_match'
  | 'out_of_order'
  | 'bad_signature'
  | 'cancelled';

export type PairingStep<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: PairingAbortReason };

export type UnpairResult =
  | { readonly status: 'done' }
  /** Lists what could not be confirmed, e.g. an unreachable relay. */
  | { readonly status: 'partial'; readonly unconfirmed: readonly string[] };

export interface PairingService {
  /* Her phone */
  startSession(): Promise<PairingOffer>;
  /** Records QR-B; only then may Nh be revealed. */
  acceptResponse(response: PairingResponse): Promise<PairingStep<PairingReveal>>;
  /* His phone */
  respondToOffer(offer: PairingOffer): Promise<PairingStep<PairingResponse>>;
  /** Checks the reveal against the commitment, else aborts. */
  receiveReveal(reveal: PairingReveal): Promise<PairingStep<null>>;
  /* Both phones */
  safetyCode(sessionId: PairingSessionId): Promise<PairingStep<SafetyCode>>;
  /** Each person taps "Codes match"; a mismatch aborts and is logged. */
  confirmCodesMatch(sessionId: PairingSessionId, matched: boolean): Promise<PairingStep<null>>;
  abort(sessionId: PairingSessionId, reason: PairingAbortReason): Promise<void>;
  /** Either person can unpair (CR-19). */
  unpair(): Promise<UnpairResult>;
}
