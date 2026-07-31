/**
 * Error type for alphabet construction and id validation.
 *
 * Mirrors `moid::MoidError` one variant per code, including the `Display`
 * strings, so a failure reads identically on either side of the port.
 */

/**
 * One code per `moid::MoidError` variant.
 *
 * New codes may appear in a minor release (the Rust enum is
 * `#[non_exhaustive]`), so treat an unrecognised code as "some other moid
 * failure" rather than exhaustively switching without a default.
 */
export type MoidErrorCode =
  | "EmptyAlphabet"
  | "AlphabetTooLarge"
  | "NonAsciiAlphabet"
  | "DuplicateSymbol"
  | "BadLength"
  | "BadChar"
  | "BadCheck"
  | "BadPrefix"
  | "PrefixOutOfAlphabet"
  | "Entropy";

/** Verbatim from `impl Display for MoidError` — parity is asserted in tests. */
const MESSAGES: Record<MoidErrorCode, string> = {
  EmptyAlphabet: "alphabet is empty",
  AlphabetTooLarge: "alphabet has more than 255 symbols",
  NonAsciiAlphabet: "alphabet contains a non-ASCII symbol",
  DuplicateSymbol: "alphabet contains a duplicate symbol",
  BadLength: "id has an invalid length",
  BadChar: "id contains a character outside the alphabet",
  BadCheck: "id check character does not match",
  BadPrefix: "id is missing the expected prefix",
  PrefixOutOfAlphabet: "prefix contains a character outside the alphabet",
  Entropy: "the OS entropy source failed",
};

/**
 * A moid failure: a bad alphabet, a bad prefix, an id that does not validate,
 * or an unavailable entropy source.
 *
 * ```ts
 * try {
 *   minter.validate(id);
 * } catch (e) {
 *   if (e instanceof MoidError && e.code === "BadCheck") {
 *     // a typo, most likely — the check character caught it
 *   }
 * }
 * ```
 */
export class MoidError extends Error {
  /** Which failure this is. Stable across releases; switch on this, not on the message. */
  readonly code: MoidErrorCode;

  constructor(code: MoidErrorCode) {
    super(MESSAGES[code]);
    this.name = "MoidError";
    this.code = code;
  }
}
