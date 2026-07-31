/**
 * # moid — minimal opaque ID
 *
 * Mint short, opaque identifiers over a **configurable alphabet**, with an
 * optional **NOID-style check character** for typo detection. That is the whole
 * package.
 *
 * ```ts
 * import { Minter } from "moid";
 *
 * // 6 random betanumeric symbols + 1 check character = a 7-char id.
 * const minter = new Minter();
 * const id = minter.mint();
 * minter.isValid(id); // true
 * ```
 *
 * This is a hand-written port of the [`moid`](https://crates.io/crates/moid)
 * Rust crate, held to byte-for-byte agreement with it by a golden-vector suite
 * generated from the Rust and checked in both directions on every commit. Same
 * seed in, same id out.
 *
 * ## Scope: mint only
 *
 * moid **mints and validates**. It deliberately does *not* do the other two
 * things the NOID tool bundles:
 *
 * - **Binding** (id → value/metadata) — that is a stateful store; keep it in
 *   your own registry/index.
 * - **Resolution** (id → target, over HTTP) — that is a resolver/proxy.
 *
 * ## Non-goals
 *
 * - **Sortable or time-encoded ids** (ULID-, KSUID-, Snowflake-style) — moid
 *   mints *opaque* handles that carry no embedded timestamp or ordering.
 * - **Cryptographic randomness guarantees** — {@link SeededRng} is a
 *   deterministic, non-cryptographic PRNG; uniqueness comes from rejection
 *   against a taken-set, not from entropy strength. {@link Minter.mint}
 *   defaults to `crypto.getRandomValues` when unpredictability matters.
 */

export { Alphabet, type AlphabetInput } from "./alphabet.ts";
export { MoidError, type MoidErrorCode } from "./error.ts";
export { Minter, type MinterOptions } from "./minter.ts";
export { SeededRng, osBytes, type ByteSource } from "./rng.ts";
export * as presets from "./presets.ts";
