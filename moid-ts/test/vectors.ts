/**
 * Loads `vectors.json` — the golden file generated from the Rust crate by
 * `cargo run -p moid-parity`.
 *
 * The types here are hand-written rather than inferred from the JSON so that a
 * field disappearing on the Rust side is a type error, not a silent `undefined`
 * that makes an assertion vacuously pass.
 */

import { readFileSync } from "node:fs";
import { Alphabet, Minter } from "../src/index.ts";

/** Bumped by the generator when the file's shape changes. */
export const EXPECTED_SCHEMA = 1;

export interface AlphabetVector {
  id: string;
  bytes_hex: string;
  radix: number;
  as_str: string;
}

export interface ErrorMessageVector {
  code: string;
  message: string;
}

export interface AlphabetErrorVector {
  bytes_hex: string;
  ok: boolean;
  radix?: number;
  code?: string;
}

export interface CheckCharVector {
  alphabet: string;
  body: string;
  check: string;
}

export interface VerifyCheckVector {
  alphabet: string;
  input: string;
  ok: boolean;
}

export interface RngVector {
  /** Decimal string: these seeds run past 2^53. */
  seed: string;
  bytes: number[];
}

export interface PrefixErrorVector {
  alphabet: string;
  prefix: string;
  ok: boolean;
  expected_length?: number;
  code?: string;
}

/** The minter configuration repeated on every mint and validate vector. */
export interface ConfigVector {
  config: string;
  alphabet: string;
  random_len: number;
  check: boolean;
  prefix: string | null;
  expected_length: number;
}

export interface MintVector extends ConfigVector {
  seed: string;
  ids: string[];
}

export interface ValidateVector extends ConfigVector {
  input: string;
  /** `"ok"`, or a `MoidErrorCode`. */
  result: string;
}

export interface Vectors {
  schema: number;
  note: string;
  alphabets: AlphabetVector[];
  error_messages: ErrorMessageVector[];
  alphabet_errors: AlphabetErrorVector[];
  check_char: CheckCharVector[];
  verify_check: VerifyCheckVector[];
  rng: RngVector[];
  prefix_errors: PrefixErrorVector[];
  mint: MintVector[];
  validate: ValidateVector[];
}

/** Resolved from this module, not the working directory. */
const VECTORS_URL = new URL("./vectors.json", import.meta.url);

export const vectors = JSON.parse(readFileSync(VECTORS_URL, "utf8")) as Vectors;

/** Decode the hex byte strings the generator writes alphabets as. */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const alphabetCache = new Map<string, Alphabet>();

/**
 * The alphabet a vector names, built from the bytes in the file rather than
 * from a preset — so a preset that drifts from the Rust is caught rather than
 * assumed.
 */
export function alphabetById(id: string): Alphabet {
  const cached = alphabetCache.get(id);
  if (cached) return cached;

  const spec = vectors.alphabets.find((a) => a.id === id);
  if (!spec) throw new Error(`vectors.json declares no alphabet "${id}"`);

  const alphabet = new Alphabet(fromHex(spec.bytes_hex));
  alphabetCache.set(id, alphabet);
  return alphabet;
}

/** Rebuild the minter a mint/validate vector was produced by. */
export function minterFor(config: ConfigVector): Minter {
  return new Minter({
    alphabet: alphabetById(config.alphabet),
    randomLength: config.random_len,
    check: config.check,
    // `exactOptionalPropertyTypes` forbids passing `prefix: undefined`, and an
    // absent prefix is not the same as an empty one.
    ...(config.prefix === null ? {} : { prefix: config.prefix }),
  });
}
