/**
 * Entropy sources.
 *
 * Three layers, in order of dependency weight:
 *
 * 1. **Bring your own** — every mint method takes an optional
 *    {@link ByteSource}, a `() => number` yielding bytes in `0..=255`. Works
 *    anywhere, including hosts with no ambient entropy.
 * 2. {@link SeededRng} — a deterministic `xorshift64` PRNG. Reproducible for
 *    tests, and byte-for-byte identical to the Rust `SeededRng`.
 * 3. The default source — `crypto.getRandomValues`, the JS counterpart of the
 *    Rust `Minter::mint_os`.
 *
 * The PRNG is **not** cryptographic and does not claim to be: minted ids are
 * opaque handles whose uniqueness is enforced by rejection against an existing
 * set, not by entropy. Leave the default source in place (or supply your own
 * CSPRNG bytes) when you want unpredictability.
 */

import { MoidError } from "./error.ts";

/** A source of bytes: each call returns an integer in `0..=255`. */
export type ByteSource = () => number;

/** `xorshift64`'s fixed point is zero, so a zero seed is nudged off it. */
const ZERO_SEED_ESCAPE = 0x9e3779b97f4a7c15n;

/**
 * A small, dependency-free, deterministic `xorshift64` byte source.
 *
 * Seed it and it produces the same stream every time — the basis for
 * reproducible tests, and for cross-checking against the Rust implementation.
 *
 * ```ts
 * const rng = new SeededRng(42n);
 * new Minter().mintSeeded(rng); // the same id the Rust mints from seed 42
 * ```
 *
 * The state is a `bigint` because the algorithm is 64-bit and JavaScript
 * numbers are not: emulating it with 32-bit halves is possible but easy to get
 * subtly wrong, and a handful of bytes per id makes the cost irrelevant.
 */
export class SeededRng {
  #state: bigint;

  /**
   * Seed the PRNG with a `u64`. A zero seed is nudged off `xorshift64`'s fixed
   * point, exactly as the Rust does.
   *
   * A `number` seed must be a safe integer. Values outside `u64` wrap, matching
   * a Rust `as u64` cast.
   */
  constructor(seed: bigint | number) {
    if (typeof seed === "number" && !Number.isSafeInteger(seed)) {
      throw new RangeError(`seed must be a safe integer or a bigint, got ${seed}`);
    }
    const state = BigInt.asUintN(64, BigInt(seed));
    this.#state = state === 0n ? ZERO_SEED_ESCAPE : state;
  }

  /**
   * The next byte — the top byte of the `xorshift64` state, whose low bits are
   * the weakest.
   */
  nextByte(): number {
    let x = this.#state;
    x = BigInt.asUintN(64, x ^ (x << 13n));
    x = x ^ (x >> 7n); // state is unsigned, so this needs no masking
    x = BigInt.asUintN(64, x ^ (x << 17n));
    this.#state = x;
    return Number(x >> 56n);
  }

  /** The next `n` bytes. */
  nextBytes(n: number): Uint8Array {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`byte count must be a non-negative integer, got ${n}`);
    }
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.nextByte();
    return out;
  }

  /** This PRNG as a {@link ByteSource}, for passing to `mint`. */
  source(): ByteSource {
    return () => this.nextByte();
  }
}

/** The shape of `crypto` this package needs, declared so it can stay lib-agnostic. */
interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

/** Matches the 64-byte refill buffer in the Rust `Minter::mint_os`. */
const OS_BUFFER_BYTES = 64;

/**
 * A {@link ByteSource} over `crypto.getRandomValues` — the default for
 * {@link Minter.mint}.
 *
 * Throws {@link MoidError} with code `Entropy` if the host exposes no web
 * crypto, which is the JS analogue of the Rust `MoidError::Entropy`.
 */
export function osBytes(): ByteSource {
  const source = (globalThis as { crypto?: RandomSource }).crypto;
  if (!source || typeof source.getRandomValues !== "function") {
    throw new MoidError("Entropy");
  }
  const buffer = new Uint8Array(OS_BUFFER_BYTES);
  let position = buffer.length;
  return () => {
    if (position >= buffer.length) {
      source.getRandomValues(buffer);
      position = 0;
    }
    return buffer[position++] as number;
  };
}
