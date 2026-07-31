/**
 * Golden-vector parity: every assertion here compares this port against output
 * recorded from the Rust crate by `cargo run -p moid-parity`.
 *
 * Nothing in this file states what moid *ought* to do — that is what
 * `reference.test.ts` is for. This file only asserts that the two
 * implementations agree, character for character and byte for byte.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Alphabet, Minter, MoidError, SeededRng } from "../src/index.ts";
import type { MoidErrorCode } from "../src/index.ts";
import {
  EXPECTED_SCHEMA,
  alphabetById,
  fromHex,
  minterFor,
  vectors,
} from "./vectors.ts";

/** `validate` as a comparable string: `"ok"`, or the error code it threw. */
function validateResult(minter: Minter, input: string): string {
  try {
    minter.validate(input);
    return "ok";
  } catch (e) {
    if (e instanceof MoidError) return e.code;
    throw e;
  }
}

/** The code a throwing call produced, or `"ok"` if it did not throw. */
function codeOf(f: () => unknown): string {
  try {
    f();
    return "ok";
  } catch (e) {
    if (e instanceof MoidError) return e.code;
    throw e;
  }
}

test("the vector file matches the schema this suite was written against", () => {
  assert.equal(
    vectors.schema,
    EXPECTED_SCHEMA,
    "vectors.json is from a different generator — rerun `npm run vectors:rust`",
  );
});

describe("alphabets", () => {
  test("radix and symbols round-trip", () => {
    for (const spec of vectors.alphabets) {
      const alphabet = new Alphabet(fromHex(spec.bytes_hex));
      assert.equal(alphabet.radix, spec.radix, spec.id);
      assert.equal(alphabet.toString(), spec.as_str, spec.id);
      // The Rust documents `Alphabet::new(a.as_str().as_bytes())` as the
      // inverse of `as_str`; the port owes the same round-trip.
      assert.ok(new Alphabet(alphabet.toString()).equals(alphabet), spec.id);
      assert.deepEqual(alphabet.toBytes(), fromHex(spec.bytes_hex), spec.id);
    }
  });

  test("every symbol reports its own ordinal", () => {
    for (const spec of vectors.alphabets) {
      const alphabet = alphabetById(spec.id);
      const symbols = [...spec.as_str];
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i] as string;
        assert.equal(alphabet.ordinal(symbol), i, `${spec.id} ${symbol}`);
        assert.equal(alphabet.symbol(i), symbol, `${spec.id} @${i}`);
        assert.ok(alphabet.contains(symbol), `${spec.id} ${symbol}`);
      }
    }
  });
});

test("error messages match `impl Display for MoidError`", () => {
  for (const { code, message } of vectors.error_messages) {
    assert.equal(
      new MoidError(code as MoidErrorCode).message,
      message,
      `message for ${code}`,
    );
  }
  // The Rust enum is `#[non_exhaustive]`; the generator emits "Unknown" for a
  // variant it does not recognise, which would mean a code this port lacks.
  assert.ok(
    !vectors.error_messages.some((e) => e.code === "Unknown"),
    "the Rust has a MoidError variant this port has not been taught",
  );
});

test("alphabet construction agrees, including which rule fires first", () => {
  for (const vector of vectors.alphabet_errors) {
    const bytes = fromHex(vector.bytes_hex);
    const expected = vector.ok ? "ok" : (vector.code as string);
    assert.equal(
      codeOf(() => new Alphabet(bytes)),
      expected,
      `alphabet ${vector.bytes_hex.slice(0, 32)}…`,
    );
    if (vector.ok) {
      assert.equal(new Alphabet(bytes).radix, vector.radix, vector.bytes_hex);
    }
  }
});

test("check characters agree over every alphabet and body", () => {
  for (const vector of vectors.check_char) {
    assert.equal(
      alphabetById(vector.alphabet).checkChar(vector.body),
      vector.check,
      `checkChar(${JSON.stringify(vector.body)}) over ${vector.alphabet}`,
    );
  }
});

test("check verification agrees", () => {
  for (const vector of vectors.verify_check) {
    assert.equal(
      alphabetById(vector.alphabet).verifyCheck(vector.input),
      vector.ok,
      `verifyCheck(${JSON.stringify(vector.input)}) over ${vector.alphabet}`,
    );
  }
});

test("the seeded PRNG produces identical byte streams", () => {
  for (const vector of vectors.rng) {
    const rng = new SeededRng(BigInt(vector.seed));
    const actual = Array.from({ length: vector.bytes.length }, () => rng.nextByte());
    assert.deepEqual(actual, vector.bytes, `seed ${vector.seed}`);
  }
});

test("prefixes are accepted and rejected identically", () => {
  for (const vector of vectors.prefix_errors) {
    const base = new Minter({ alphabet: alphabetById(vector.alphabet), randomLength: 6 });
    const expected = vector.ok ? "ok" : (vector.code as string);
    assert.equal(
      codeOf(() => base.withPrefix(vector.prefix)),
      expected,
      `prefix ${JSON.stringify(vector.prefix)} over ${vector.alphabet}`,
    );
    if (vector.ok) {
      assert.equal(
        base.withPrefix(vector.prefix).length,
        vector.expected_length,
        `length with prefix ${JSON.stringify(vector.prefix)}`,
      );
    }
  }
});

test("minting from the same seed produces the same ids", () => {
  for (const vector of vectors.mint) {
    const minter = minterFor(vector);
    assert.equal(minter.length, vector.expected_length, vector.config);

    const rng = new SeededRng(BigInt(vector.seed));
    const ids = vector.ids.map(() => minter.mintSeeded(rng));
    assert.deepEqual(ids, vector.ids, `${vector.config} @ seed ${vector.seed}`);
  }
});

test("validation agrees, including which failure is reported", () => {
  for (const vector of vectors.validate) {
    const minter = minterFor(vector);
    assert.equal(
      validateResult(minter, vector.input),
      vector.result,
      `${vector.config}: validate(${JSON.stringify(vector.input)})`,
    );
  }
});

test("the vector file actually covers what it claims to", () => {
  // A suite that silently loads an empty or truncated file passes everything.
  // These floors are well under the current counts; they exist to catch a
  // generator that half-ran, not to be kept in step with it.
  const floors: Record<string, number> = {
    alphabets: 6,
    error_messages: 10,
    alphabet_errors: 10,
    check_char: 150,
    verify_check: 300,
    rng: 10,
    prefix_errors: 15,
    mint: 40,
    validate: 250,
  };
  for (const [section, floor] of Object.entries(floors)) {
    const entries = vectors[section as keyof typeof vectors] as unknown[];
    assert.ok(
      Array.isArray(entries) && entries.length >= floor,
      `section "${section}" has ${Array.isArray(entries) ? entries.length : "no"} entries, expected at least ${floor}`,
    );
  }

  // The traps that make this suite worth running: astral characters (one Rust
  // `char`, two UTF-16 units) and seeds past 2^53.
  assert.ok(
    vectors.check_char.some((v) => [...v.body].some((c) => (c.codePointAt(0) ?? 0) > 0xffff)),
    "no astral-character check_char vector — the UTF-16 trap is uncovered",
  );
  assert.ok(
    vectors.rng.some((v) => BigInt(v.seed) > BigInt(Number.MAX_SAFE_INTEGER)),
    "no seed past 2^53 — the bigint trap is uncovered",
  );
});
