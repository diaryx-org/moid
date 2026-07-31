/**
 * The symbol set an id is drawn from, and the NOID-style check character
 * defined over it.
 */

import { MoidError } from "./error.ts";
import { BETANUMERIC, CROCKFORD32, NOID_XDIGIT } from "./presets.ts";

/** What `new Alphabet(...)` accepts: a string of ASCII symbols, or their bytes. */
export type AlphabetInput = string | Uint8Array | readonly number[];

const MAX_SYMBOLS = 255;
const ASCII_TABLE_SIZE = 128;

/**
 * Normalise the constructor input to a byte array.
 *
 * A string is read as **code points**, not UTF-16 code units, so a non-BMP
 * character is one (rejected, non-ASCII) symbol rather than two lone
 * surrogates. Either way the result is `NonAsciiAlphabet`; going through code
 * points just makes the reason honest.
 */
function toBytes(symbols: AlphabetInput): number[] {
  if (typeof symbols === "string") {
    return Array.from(symbols, (c) => c.codePointAt(0) as number);
  }
  return Array.from(symbols);
}

/**
 * A validated set of ASCII symbols an id is minted from.
 *
 * The radix (and therefore the check-character arithmetic) follows the
 * alphabet's length, so *any* alphabet works — the betanumeric set is just one
 * {@link https://github.com/diaryx-org/moid | preset}.
 *
 * ```ts
 * const a = Alphabet.betanumeric();
 * a.radix;                  // 28
 * a.checkChar("bcdfg");     // "r"
 * ```
 *
 * Instances are immutable and cheap to hold onto; build one and reuse it.
 */
export class Alphabet {
  readonly #symbols: Uint8Array;
  /** `ordinal + 1` at each ASCII code point, `0` for "not in the alphabet". */
  readonly #index: Uint8Array;
  readonly #text: string;

  /**
   * Build an alphabet from a list of distinct ASCII symbols.
   *
   * Throws {@link MoidError} if the list is empty (`EmptyAlphabet`), longer
   * than 255 (`AlphabetTooLarge`), non-ASCII (`NonAsciiAlphabet`), or contains
   * a duplicate (`DuplicateSymbol`).
   */
  constructor(symbols: AlphabetInput) {
    const bytes = toBytes(symbols);
    if (bytes.length === 0) throw new MoidError("EmptyAlphabet");
    if (bytes.length > MAX_SYMBOLS) throw new MoidError("AlphabetTooLarge");

    // Checked per symbol in order — non-ASCII before duplicate — so the code
    // thrown for a list that is wrong in several ways matches the Rust.
    const index = new Uint8Array(ASCII_TABLE_SIZE);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] as number;
      if (!Number.isInteger(b) || b < 0 || b >= ASCII_TABLE_SIZE) {
        throw new MoidError("NonAsciiAlphabet");
      }
      if (index[b] !== 0) throw new MoidError("DuplicateSymbol");
      index[b] = i + 1;
    }

    this.#symbols = Uint8Array.from(bytes);
    this.#index = index;
    this.#text = String.fromCharCode(...bytes);
  }

  /**
   * The betanumeric preset (28 chars: no vowels, no `0`/`1`/`l`, includes
   * `y`) — the alphabet colophon and diaryx share.
   */
  static betanumeric(): Alphabet {
    return new Alphabet(BETANUMERIC);
  }

  /**
   * The canonical 29-char NOID extended-digit alphabet (digits included, no
   * `y`). Use this for check characters compatible with a real NOID minter.
   */
  static noidXdigit(): Alphabet {
    return new Alphabet(NOID_XDIGIT);
  }

  /** Crockford base32 (uppercase). */
  static crockford32(): Alphabet {
    return new Alphabet(CROCKFORD32);
  }

  /** The number of symbols — the radix for the check character. */
  get radix(): number {
    return this.#symbols.length;
  }

  /**
   * The symbols, in order.
   *
   * The inverse of the constructor: `new Alphabet(a.toString())` reproduces
   * `a`. Handy for logging, debugging, or persisting a minter's configuration
   * without reaching for a serializer.
   */
  toString(): string {
    return this.#text;
  }

  /** The symbols, in order, as bytes. Returns a fresh copy. */
  toBytes(): Uint8Array {
    return Uint8Array.from(this.#symbols);
  }

  /**
   * The 0-based ordinal of `c`, or `undefined` if it is not in the alphabet.
   *
   * `c` must be exactly one character (one code point); anything else is
   * `undefined`.
   */
  ordinal(c: string): number | undefined {
    if (c.length === 0 || c.length > 2) return undefined;
    const cp = c.codePointAt(0) as number;
    // Reject a two-unit string that is not a single surrogate pair — that is
    // two characters, not one.
    if (c.length === 2 && cp < 0x10000) return undefined;
    const ord = this.#ordinalOf(cp);
    return ord < 0 ? undefined : ord;
  }

  /** Whether `c` is in the alphabet. */
  contains(c: string): boolean {
    return this.ordinal(c) !== undefined;
  }

  /** The symbol at ordinal `ord` (wrapping into range). */
  symbol(ord: number): string {
    if (!Number.isInteger(ord) || ord < 0) {
      throw new RangeError(`ordinal must be a non-negative integer, got ${ord}`);
    }
    return this.#text[ord % this.radix] as string;
  }

  /** Whether every character of `s` is in the alphabet. */
  allIn(s: string): boolean {
    for (const c of s) {
      if (this.#ordinalOf(c.codePointAt(0) as number) < 0) return false;
    }
    return true;
  }

  /**
   * The NOID-style check character over `body`.
   *
   * Each character contributes `ordinal × (1-based position)`; characters
   * outside the alphabet contribute 0 but still advance the position. The sum
   * modulo the radix indexes the check character. This is the same algorithm
   * the NOID minter uses; the *result* differs from NOID only when the
   * alphabet differs (a different radix or ordering).
   *
   * `body` is walked by **code point**, matching Rust's `str::chars()` — an
   * emoji is one position, not two. Iterating UTF-16 code units instead would
   * silently disagree with the Rust for any non-BMP input.
   */
  checkChar(body: string): string {
    const radix = this.radix;
    let sum = 0;
    let position = 0;
    for (const c of body) {
      const ord = this.#ordinalOf(c.codePointAt(0) as number);
      position += 1;
      // Reduced every step rather than at the end: identical result, but the
      // running total cannot drift past `Number.MAX_SAFE_INTEGER` on a
      // pathologically long body.
      if (ord >= 0) sum = (sum + ord * position) % radix;
    }
    return this.symbol(sum);
  }

  /**
   * Whether `s`'s trailing character is the correct check character for the
   * preceding body. `false` for an empty string.
   */
  verifyCheck(s: string): boolean {
    const chars = Array.from(s);
    const last = chars.pop();
    if (last === undefined) return false;
    return this.checkChar(chars.join("")) === last;
  }

  /** Whether `other` holds the same symbols in the same order. */
  equals(other: Alphabet): boolean {
    return this.#text === other.#text;
  }

  /** The ordinal of an ASCII code point, or `-1`. */
  #ordinalOf(codePoint: number): number {
    if (codePoint >= ASCII_TABLE_SIZE) return -1;
    return (this.#index[codePoint] as number) - 1;
  }
}
