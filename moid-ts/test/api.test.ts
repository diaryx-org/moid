/**
 * The parts of the port that have no Rust counterpart to compare against:
 * where `Result` became a thrown error, where a `u64` became a `bigint`, and
 * where JavaScript lets a caller pass something Rust's types would have
 * rejected at compile time.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Alphabet, Minter, MoidError, SeededRng, osBytes, presets } from "../src/index.ts";

describe("MoidError", () => {
  test("is a real Error carrying a stable code", () => {
    const error = new MoidError("BadCheck");
    assert.ok(error instanceof Error);
    assert.ok(error instanceof MoidError);
    assert.equal(error.name, "MoidError");
    assert.equal(error.code, "BadCheck");
    assert.equal(error.message, "id check character does not match");
    assert.match(String(error), /^MoidError: /);
  });
});

describe("Alphabet", () => {
  test("accepts symbols as a string, bytes, or numbers", () => {
    const fromString = new Alphabet("abc");
    const fromBytes = new Alphabet(new Uint8Array([0x61, 0x62, 0x63]));
    const fromNumbers = new Alphabet([0x61, 0x62, 0x63]);
    assert.ok(fromString.equals(fromBytes));
    assert.ok(fromString.equals(fromNumbers));
    assert.equal(fromString.toString(), "abc");
  });

  test("the presets match their constants", () => {
    assert.equal(Alphabet.betanumeric().toString(), presets.BETANUMERIC);
    assert.equal(Alphabet.noidXdigit().toString(), presets.NOID_XDIGIT);
    assert.equal(Alphabet.crockford32().toString(), presets.CROCKFORD32);
  });

  test("rejects malformed symbol sets", () => {
    assert.throws(() => new Alphabet(""), { code: "EmptyAlphabet" });
    assert.throws(() => new Alphabet("abca"), { code: "DuplicateSymbol" });
    assert.throws(() => new Alphabet("aé"), { code: "NonAsciiAlphabet" });
    assert.throws(() => new Alphabet("a\u{1F600}"), { code: "NonAsciiAlphabet" });
    assert.throws(() => new Alphabet(new Uint8Array(256)), { code: "AlphabetTooLarge" });
  });

  test("ordinal wants exactly one character", () => {
    const alphabet = Alphabet.betanumeric();
    assert.equal(alphabet.ordinal("b"), 0);
    assert.equal(alphabet.ordinal("9"), 27);
    assert.equal(alphabet.ordinal("a"), undefined);
    assert.equal(alphabet.ordinal(""), undefined);
    assert.equal(alphabet.ordinal("bc"), undefined, "two characters is not one");
    // One astral character is two UTF-16 units but still one character, so it
    // must come back "not in the alphabet" rather than be mistaken for two.
    assert.equal(alphabet.ordinal("\u{1F600}"), undefined);
    assert.equal(alphabet.contains("\u{1F600}"), false);
  });

  test("symbol wraps, but rejects nonsense indices", () => {
    const alphabet = Alphabet.betanumeric();
    assert.equal(alphabet.symbol(0), "b");
    assert.equal(alphabet.symbol(28), "b", "wraps at the radix");
    assert.equal(alphabet.symbol(29), "c");
    assert.throws(() => alphabet.symbol(-1), RangeError);
    assert.throws(() => alphabet.symbol(1.5), RangeError);
  });

  test("toBytes hands back a copy", () => {
    const alphabet = new Alphabet("abc");
    const bytes = alphabet.toBytes();
    bytes[0] = 0x7a;
    assert.equal(alphabet.toString(), "abc", "mutating the copy changed the alphabet");
  });

  test("NUL is a legal symbol", () => {
    // ASCII is ASCII. Surprising, but the Rust allows it, so the port must.
    const alphabet = new Alphabet(new Uint8Array([0]));
    assert.equal(alphabet.radix, 1);
    assert.equal(alphabet.checkChar("anything"), "\0");
  });
});

describe("Minter", () => {
  test("defaults to six betanumeric symbols plus a check character", () => {
    const minter = new Minter();
    assert.equal(minter.length, 7);
    assert.equal(minter.randomLength, 6);
    assert.equal(minter.check, true);
    assert.equal(minter.prefix, undefined);
    assert.ok(minter.alphabet.equals(Alphabet.betanumeric()));
  });

  test("the builders return new minters and leave the original alone", () => {
    const base = new Minter();
    const prefixed = base.withPrefix("dx");
    const unchecked = base.withoutCheck();

    assert.equal(base.length, 7);
    assert.equal(base.prefix, undefined);
    assert.equal(base.check, true);

    assert.equal(prefixed.length, 9);
    assert.equal(prefixed.prefix, "dx");
    assert.equal(unchecked.length, 6);
    assert.equal(unchecked.check, false);

    // And they compose without losing what came before.
    assert.equal(base.withPrefix("dx").withoutCheck().length, 8);
    assert.equal(base.withoutCheck().withPrefix("dx").prefix, "dx");
  });

  test("rejects a prefix outside the alphabet, from either entry point", () => {
    assert.throws(() => new Minter({ prefix: "a1" }), { code: "PrefixOutOfAlphabet" });
    assert.throws(() => new Minter().withPrefix("a1"), { code: "PrefixOutOfAlphabet" });
    assert.doesNotThrow(() => new Minter({ prefix: "" }), "an empty prefix is vacuously fine");
  });

  test("rejects a nonsensical random length", () => {
    assert.throws(() => new Minter({ randomLength: -1 }), RangeError);
    assert.throws(() => new Minter({ randomLength: 1.5 }), RangeError);
    assert.throws(() => new Minter({ randomLength: Number.NaN }), RangeError);
    assert.equal(new Minter({ randomLength: 0 }).length, 1, "just the check character");
  });

  test("rejects a byte source that does not return bytes", () => {
    // Rust's `FnMut() -> u8` makes this unrepresentable; TypeScript's structural
    // types do not, so it has to fail loudly rather than mint a wrong id.
    const minter = new Minter();
    assert.throws(() => minter.mint(() => 256), TypeError);
    assert.throws(() => minter.mint(() => -1), TypeError);
    assert.throws(() => minter.mint(() => 1.5), TypeError);
    assert.throws(() => minter.mint(() => Number.NaN), TypeError);
  });

  test("validate throws the specific failure; isValid just answers", () => {
    const minter = new Minter();
    const id = minter.mintSeeded(new SeededRng(42n));

    assert.doesNotThrow(() => minter.validate(id));
    assert.equal(minter.isValid(id), true);

    assert.throws(() => minter.validate(""), { code: "BadLength" });
    assert.throws(() => minter.validate("bcdfg"), { code: "BadLength" });
    assert.throws(() => minter.validate("bcdfgha"), { code: "BadChar" });
    assert.equal(minter.isValid("bcdfgha"), false);

    // Right shape, wrong check character.
    const corrupted = id.slice(0, -1) + (id.endsWith("b") ? "c" : "b");
    assert.throws(() => minter.validate(corrupted), { code: "BadCheck" });
  });

  test("length counts characters, not UTF-16 units", () => {
    const minter = new Minter();
    // Seven astral characters: seven characters, fourteen code units. Counting
    // units would call this BadLength; counting characters gets to the real
    // problem, which is that none of them are in the alphabet.
    assert.throws(() => minter.validate("\u{1F600}".repeat(7)), { code: "BadChar" });
    assert.throws(() => minter.validate("\u{1F600}".repeat(6)), { code: "BadLength" });
  });
});

describe("SeededRng", () => {
  test("number and bigint seeds agree", () => {
    const fromNumber = new SeededRng(42);
    const fromBigInt = new SeededRng(42n);
    for (let i = 0; i < 32; i++) assert.equal(fromNumber.nextByte(), fromBigInt.nextByte());
  });

  test("a zero seed is nudged off the fixed point", () => {
    const zero = new SeededRng(0n);
    const escape = new SeededRng(0x9e3779b97f4a7c15n);
    for (let i = 0; i < 16; i++) assert.equal(zero.nextByte(), escape.nextByte());
    // And it is not stuck emitting a constant.
    const stream = new SeededRng(0n);
    const first = stream.nextByte();
    assert.ok(
      Array.from({ length: 16 }, () => stream.nextByte()).some((b) => b !== first),
      "the PRNG is stuck",
    );
  });

  test("rejects a seed that is not an integer", () => {
    assert.throws(() => new SeededRng(1.5), RangeError);
    assert.throws(() => new SeededRng(Number.NaN), RangeError);
    assert.throws(() => new SeededRng(2 ** 53 + 2), RangeError, "past exact integer range");
  });

  test("nextBytes and source draw from the same stream", () => {
    assert.deepEqual(
      Array.from(new SeededRng(7n).nextBytes(8)),
      Array.from({ length: 8 }, ((rng) => () => rng.nextByte())(new SeededRng(7n))),
    );
    const rng = new SeededRng(7n);
    const source = rng.source();
    assert.equal(source(), new SeededRng(7n).nextByte());
  });
});

describe("ambient entropy", () => {
  test("mint defaults to crypto and produces valid, varied ids", () => {
    const minter = new Minter();
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = minter.mint();
      assert.ok(minter.isValid(id), id);
      ids.add(id);
    }
    // 28^6 possibilities; 2000 draws colliding more than a handful of times
    // would mean the entropy is not what it claims.
    assert.ok(ids.size > 1990, `only ${ids.size} distinct ids in 2000 draws`);
  });

  test("reports a missing entropy source rather than minting a weak id", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    if (!descriptor?.configurable) {
      // Some hosts pin `crypto`. Nothing to assert here, and faking it any
      // harder would test the fake.
      return;
    }
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      assert.throws(() => osBytes(), { code: "Entropy" });
      assert.throws(() => new Minter().mint(), { code: "Entropy" });
    } finally {
      Object.defineProperty(globalThis, "crypto", descriptor);
    }
  });
});
