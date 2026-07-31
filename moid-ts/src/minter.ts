/**
 * The minter: alphabet + length + optional check char + optional prefix.
 */

import { Alphabet } from "./alphabet.ts";
import { MoidError } from "./error.ts";
import { osBytes, type ByteSource, type SeededRng } from "./rng.ts";

/** How a {@link Minter} is configured. Every field has a default. */
export interface MinterOptions {
  /** The symbol set to draw from. Defaults to {@link Alphabet.betanumeric}. */
  alphabet?: Alphabet;
  /** How many random symbols to draw. Defaults to `6`. */
  randomLength?: number;
  /** Whether to append a check character. Defaults to `true`. */
  check?: boolean;
  /** A fixed prefix (an ARK "shoulder"). Defaults to none. */
  prefix?: string;
}

const DEFAULT_RANDOM_LENGTH = 6;

/**
 * Draw one uniformly-distributed symbol from `alphabet`, rejection-sampling to
 * avoid modulo bias (bytes at or above the largest multiple of the radix are
 * discarded).
 */
function nextSymbol(alphabet: Alphabet, next: ByteSource): string {
  const radix = alphabet.radix;
  // Largest multiple of `radix` that fits in a byte's range [0, 256).
  const limit = 256 - (256 % radix);
  for (;;) {
    const b = next();
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new TypeError(`byte source must return an integer in 0..=255, got ${b}`);
    }
    if (b < limit) return alphabet.symbol(b % radix);
  }
}

/**
 * A configured minter. Immutable and cheap to hold onto; it carries no entropy
 * of its own (you supply that per call, or let it reach for `crypto`), so one
 * instance is safely reusable.
 *
 * ```ts
 * const minter = new Minter({ randomLength: 6 }); // 6 random + 1 check
 * const id = minter.mint();
 * id.length;                 // 7
 * minter.isValid(id);        // true
 * ```
 */
export class Minter {
  readonly #alphabet: Alphabet;
  readonly #randomLength: number;
  readonly #check: boolean;
  readonly #prefix: string | undefined;

  /**
   * A minter over `alphabet` producing `randomLength` random symbols plus a
   * trailing check character (on by default).
   *
   * Throws {@link MoidError} with code `PrefixOutOfAlphabet` if `prefix` has a
   * character the alphabet does not contain — see {@link Minter.withPrefix}.
   */
  constructor(options: MinterOptions = {}) {
    const {
      alphabet = Alphabet.betanumeric(),
      randomLength = DEFAULT_RANDOM_LENGTH,
      check = true,
      prefix,
    } = options;

    if (!Number.isInteger(randomLength) || randomLength < 0) {
      throw new RangeError(
        `randomLength must be a non-negative integer, got ${randomLength}`,
      );
    }
    if (prefix !== undefined && !alphabet.allIn(prefix)) {
      throw new MoidError("PrefixOutOfAlphabet");
    }

    this.#alphabet = alphabet;
    this.#randomLength = randomLength;
    this.#check = check;
    this.#prefix = prefix;
  }

  /** The alphabet this minter draws from. */
  get alphabet(): Alphabet {
    return this.#alphabet;
  }

  /** How many random symbols each id carries. */
  get randomLength(): number {
    return this.#randomLength;
  }

  /** Whether ids carry a trailing check character. */
  get check(): boolean {
    return this.#check;
  }

  /** The fixed prefix, if any. */
  get prefix(): string | undefined {
    return this.#prefix;
  }

  /** The total character length of every id this minter produces. */
  get length(): number {
    const prefixLength = this.#prefix === undefined ? 0 : Array.from(this.#prefix).length;
    return prefixLength + this.#randomLength + (this.#check ? 1 : 0);
  }

  /** A copy of this minter without the trailing check character. */
  withoutCheck(): Minter {
    return this.#with({ check: false });
  }

  /**
   * A copy of this minter with a fixed prefix (a "shoulder", in ARK terms).
   * The check character, if present, is computed over the prefix *and* the
   * random body, so a corrupted prefix is detected.
   *
   * Every prefix character must be in the alphabet: {@link Minter.validate}
   * requires the whole id (prefix included) to be alphabet-only, so a prefix
   * with an out-of-alphabet character would let this minter mint ids its own
   * `validate` always rejects. Throws {@link MoidError} with code
   * `PrefixOutOfAlphabet` in that case.
   */
  withPrefix(prefix: string): Minter {
    return this.#with({ prefix });
  }

  /**
   * Mint one id.
   *
   * Pulls bytes from `next` if given, otherwise from `crypto.getRandomValues`.
   * Throws {@link MoidError} with code `Entropy` if no source is given and the
   * host has no web crypto.
   */
  mint(next: ByteSource = osBytes()): string {
    let s = this.#prefix ?? "";
    for (let i = 0; i < this.#randomLength; i++) {
      s += nextSymbol(this.#alphabet, next);
    }
    if (this.#check) s += this.#alphabet.checkChar(s);
    return s;
  }

  /**
   * Mint, retrying until `isTaken` reports the id is free. The caller owns the
   * taken-set (e.g. an existing registry, including tombstones).
   */
  mintUnique(isTaken: (id: string) => boolean, next: ByteSource = osBytes()): string {
    for (;;) {
      const id = this.mint(next);
      if (!isTaken(id)) return id;
    }
  }

  /** Mint using a {@link SeededRng} (deterministic; convenience over `mint`). */
  mintSeeded(rng: SeededRng): string {
    return this.mint(() => rng.nextByte());
  }

  /** {@link Minter.mintUnique} using a {@link SeededRng}. */
  mintUniqueSeeded(rng: SeededRng, isTaken: (id: string) => boolean): string {
    return this.mintUnique(isTaken, () => rng.nextByte());
  }

  /**
   * Assert that `id` could have been produced by this minter: correct length,
   * correct prefix, alphabet-only, and (if configured) a matching check
   * character.
   *
   * Throws {@link MoidError} on the first failure, in that order — so the code
   * you get back names the most fundamental thing wrong with the id.
   */
  validate(id: string): void {
    // Code points, not UTF-16 units: Rust counts `chars()`, so a lone astral
    // character must fail as one wrong character, not two.
    if (Array.from(id).length !== this.length) throw new MoidError("BadLength");
    if (this.#prefix !== undefined && !id.startsWith(this.#prefix)) {
      throw new MoidError("BadPrefix");
    }
    if (!this.#alphabet.allIn(id)) throw new MoidError("BadChar");
    if (this.#check && !this.#alphabet.verifyCheck(id)) throw new MoidError("BadCheck");
  }

  /** Whether `id` passes {@link Minter.validate}. */
  isValid(id: string): boolean {
    try {
      this.validate(id);
      return true;
    } catch (e) {
      if (e instanceof MoidError) return false;
      throw e;
    }
  }

  /** This minter's configuration, overridden by `changes`. */
  #with(changes: MinterOptions): Minter {
    return new Minter({
      alphabet: this.#alphabet,
      randomLength: this.#randomLength,
      check: this.#check,
      ...(this.#prefix === undefined ? {} : { prefix: this.#prefix }),
      ...changes,
    });
  }
}
