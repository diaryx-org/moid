/**
 * An independent check on the port, written against the *specification* rather
 * than against the Rust output.
 *
 * `parity.test.ts` proves the two implementations agree. That is not the same
 * as proving either is right: a misreading of the algorithm ported faithfully
 * into both would sail through it. So this file adds two things the golden
 * vectors cannot:
 *
 * 1. **Hand-computed literals.** The check characters below are derived on
 *    paper from the prose definition, with the arithmetic written out. They
 *    hold no matter what any generator emits.
 * 2. **A naive second implementation.** Deliberately built on different
 *    primitives from `src/` — linear `indexOf` instead of a lookup table, an
 *    unreduced running sum instead of a modular one, and a `xorshift64` over
 *    two 32-bit halves instead of a `bigint`. Agreement between two
 *    implementations that share no structure is real evidence; agreement
 *    between one implementation and a copy of itself is not.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Alphabet, Minter, SeededRng } from "../src/index.ts";
import type { ByteSource } from "../src/index.ts";

// --------------------------------------------------------------- the oracle

/**
 * The check character, straight from the prose: "each character contributes
 * `ordinal × (1-based position)`; characters outside the alphabet contribute 0
 * but still advance the position. The sum modulo the radix indexes the check
 * character."
 *
 * Linear search, and the sum is accumulated whole and reduced once at the end
 * — the obvious reading, sharing no machinery with `src/alphabet.ts`.
 */
function referenceCheckChar(symbols: string[], body: string): string {
  const characters = [...body];
  let sum = 0;
  for (let i = 0; i < characters.length; i++) {
    const ordinal = symbols.indexOf(characters[i] as string);
    sum += (ordinal < 0 ? 0 : ordinal) * (i + 1);
  }
  return symbols[sum % symbols.length] as string;
}

/**
 * Minting, straight from the prose: draw bytes, discard any at or above the
 * largest multiple of the radix that fits in a byte, index the alphabet with
 * the remainder, then append the check character over prefix *and* body.
 */
function referenceMint(
  symbols: string[],
  randomLength: number,
  check: boolean,
  prefix: string,
  next: ByteSource,
): string {
  const radix = symbols.length;
  const limit = 256 - (256 % radix);
  let id = prefix;
  let drawn = 0;
  while (drawn < randomLength) {
    const byte = next();
    if (byte >= limit) continue; // biasing byte: throw it away and redraw
    id += symbols[byte % radix] as string;
    drawn += 1;
  }
  return check ? id + referenceCheckChar(symbols, id) : id;
}

/**
 * `xorshift64` over two unsigned 32-bit halves.
 *
 * `src/rng.ts` uses `bigint`; this uses the other approach entirely, so the two
 * agreeing means the 64-bit arithmetic is right rather than consistently wrong.
 * (A `bigint` appears only to split the decimal seed into halves — parsing, not
 * arithmetic.)
 */
function referenceRng(seed: bigint): () => number {
  const state = seed === 0n ? 0x9e3779b97f4a7c15n : BigInt.asUintN(64, seed);
  let hi = Number((state >> 32n) & 0xffffffffn);
  let lo = Number(state & 0xffffffffn);

  // x ^= x << n, for 0 < n < 32
  const xorShiftLeft = (n: number): void => {
    const shiftedHi = ((hi << n) | (lo >>> (32 - n))) >>> 0;
    const shiftedLo = (lo << n) >>> 0;
    hi = (hi ^ shiftedHi) >>> 0;
    lo = (lo ^ shiftedLo) >>> 0;
  };
  // x ^= x >> n (logical), for 0 < n < 32
  const xorShiftRight = (n: number): void => {
    const shiftedHi = hi >>> n;
    const shiftedLo = ((lo >>> n) | (hi << (32 - n))) >>> 0;
    hi = (hi ^ shiftedHi) >>> 0;
    lo = (lo ^ shiftedLo) >>> 0;
  };

  return () => {
    xorShiftLeft(13);
    xorShiftRight(7);
    xorShiftLeft(17);
    return hi >>> 24; // the top byte of the 64-bit state
  };
}

// ------------------------------------------------------------- test corpora

/** A Lehmer generator, so a property failure reproduces exactly. */
function lehmer(seed: number): () => number {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => {
    x = (x * 48271) % 2147483647;
    return x;
  };
}

/**
 * Characters random bodies are drawn from: alphabet symbols, symbols from
 * *other* alphabets, punctuation, and astral characters — because
 * `checkChar` is defined over any string, and the out-of-alphabet clause is
 * where a port drifts.
 */
const CORPUS_CHARACTERS = [
  ...".bcdfghjkmnpqrstvwxyz23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ01aeiou -_\\\"'",
  "é",
  "\u{301}",
  "\u{1F600}",
  "\u{10FFFF}",
];

function randomBody(random: () => number, maxLength: number): string {
  const length = random() % (maxLength + 1);
  let body = "";
  for (let i = 0; i < length; i++) {
    body += CORPUS_CHARACTERS[random() % CORPUS_CHARACTERS.length] as string;
  }
  return body;
}

const ALPHABETS: Array<[string, Alphabet]> = [
  ["betanumeric", Alphabet.betanumeric()],
  ["noidXdigit", Alphabet.noidXdigit()],
  ["crockford32", Alphabet.crockford32()],
  ["binary", new Alphabet("01")],
  ["ternary", new Alphabet("abc")],
  ["printable_ascii", new Alphabet(Array.from({ length: 95 }, (_, i) => 0x20 + i))],
];

// ------------------------------------------------------------------- checks

describe("hand-computed check characters", () => {
  // Worked out from the prose definition against
  // "bcdfghjkmnpqrstvwxyz23456789": b=0 c=1 d=2 f=3 g=4 h=5 j=6 … x=17 y=18.
  const betanumeric = Alphabet.betanumeric();

  test("the arithmetic in the specification", () => {
    // 0*1 + 1*2 + 2*3 + 3*4 + 4*5 = 40; 40 % 28 = 12 -> 'r'
    assert.equal(betanumeric.checkChar("bcdfg"), "r");
    // 40 + 5*6 = 70; 70 % 28 = 14 -> 't'
    assert.equal(betanumeric.checkChar("bcdfgh"), "t");
    // 2*1 + 17*2 + 0*3 + 1*4 + 2*5 + 3*6 + 4*7 + 5*8 = 136; 136 % 28 = 24 -> '6'
    assert.equal(betanumeric.checkChar("dxbcdfgh"), "6");
  });

  test("the shoulder genuinely enters the sum", () => {
    // d*1 + x*2 = 2 + 34 = 36; 36 % 28 = 8 -> 'm'
    assert.equal(betanumeric.checkChar("dxbbbbbb"), "m");
    // d*1 + y*2 = 2 + 36 = 38; 38 % 28 = 10 -> 'p'
    assert.equal(betanumeric.checkChar("dybbbbbb"), "p");
    assert.notEqual(
      betanumeric.checkChar("dxbbbbbb"),
      betanumeric.checkChar("dybbbbbb"),
    );
  });

  test("an unknown character contributes zero but still advances the position", () => {
    // b(0)*1 + '-'(0)*2 + d(2)*3 = 6 -> 'j'
    assert.equal(betanumeric.checkChar("b-d"), "j");
    // The same arithmetic with an astral character in the gap. Counting UTF-16
    // code units would put 'd' at position 4 and yield 8 -> 'm'.
    assert.equal(betanumeric.checkChar("b\u{1F600}d"), "j");
  });

  test("the empty body checks to the first symbol", () => {
    assert.equal(betanumeric.checkChar(""), "b");
  });
});

describe("against a naive second implementation", () => {
  test("check characters agree over a random corpus", () => {
    const random = lehmer(20260730);
    for (const [name, alphabet] of ALPHABETS) {
      const symbols = [...alphabet.toString()];
      for (let i = 0; i < 2000; i++) {
        const body = randomBody(random, 40);
        assert.equal(
          alphabet.checkChar(body),
          referenceCheckChar(symbols, body),
          `${name}: checkChar(${JSON.stringify(body)})`,
        );
      }
    }
  });

  test("check characters agree on bodies long enough to overflow a naive sum", () => {
    const alphabet = Alphabet.betanumeric();
    const symbols = [...alphabet.toString()];
    // `src/` reduces the running total every step; the oracle reduces once at
    // the end. Both are exact here, which is the point: reducing early changed
    // nothing.
    for (const length of [100, 1000, 5000]) {
      const body = "z".repeat(length);
      assert.equal(alphabet.checkChar(body), referenceCheckChar(symbols, body), `${length}×z`);
    }
  });

  test("the PRNG agrees with a 32-bit-halves xorshift64", () => {
    const seeds = [
      0n,
      1n,
      42n,
      0x9e3779b97f4a7c15n,
      1n << 31n,
      1n << 32n,
      (1n << 53n) - 1n,
      (1n << 53n) + 1n,
      (1n << 63n) - 1n,
      (1n << 64n) - 1n,
    ];
    for (const seed of seeds) {
      const actual = new SeededRng(seed);
      const oracle = referenceRng(seed);
      for (let i = 0; i < 512; i++) {
        assert.equal(actual.nextByte(), oracle(), `seed ${seed}, byte ${i}`);
      }
    }
  });

  test("minting agrees, including which bytes rejection sampling discards", () => {
    for (const [name, alphabet] of ALPHABETS) {
      const symbols = [...alphabet.toString()];
      for (const randomLength of [0, 1, 6, 17]) {
        for (const check of [true, false]) {
          const minter = new Minter({ alphabet, randomLength, check });
          // Every byte value in order, so the rejection boundary is crossed
          // deterministically rather than by luck.
          let a = 0;
          let b = 0;
          const actual = minter.mint(() => a++ % 256);
          const expected = referenceMint(symbols, randomLength, check, "", () => b++ % 256);
          assert.equal(actual, expected, `${name} len=${randomLength} check=${check}`);
        }
      }
    }
  });

  test("minting agrees over seeded streams", () => {
    for (const [name, alphabet] of ALPHABETS) {
      const symbols = [...alphabet.toString()];
      for (const seed of [0n, 1n, 42n, (1n << 64n) - 1n]) {
        const minter = new Minter({ alphabet, randomLength: 9 }).withPrefix(
          alphabet.symbol(0) + alphabet.symbol(1),
        );
        const actual = new SeededRng(seed);
        const oracle = referenceRng(seed);
        for (let i = 0; i < 32; i++) {
          assert.equal(
            minter.mintSeeded(actual),
            referenceMint(symbols, 9, true, alphabet.symbol(0) + alphabet.symbol(1), oracle),
            `${name} seed ${seed} id ${i}`,
          );
        }
      }
    }
  });
});

describe("properties that must hold for any implementation", () => {
  const CONFIGS = ALPHABETS.flatMap(([name, alphabet]) =>
    [0, 1, 6, 12].flatMap((randomLength) =>
      [undefined, alphabet.symbol(0) + alphabet.symbol(1)].map((prefix) => ({
        name: `${name}/${randomLength}/${prefix ?? "-"}`,
        minter: new Minter({
          alphabet,
          randomLength,
          ...(prefix === undefined ? {} : { prefix }),
        }),
        alphabet,
      })),
    ),
  );

  test("every minted id validates, and has the advertised length", () => {
    for (const { name, minter, alphabet } of CONFIGS) {
      const rng = new SeededRng(2026n);
      for (let i = 0; i < 200; i++) {
        const id = minter.mintSeeded(rng);
        assert.equal([...id].length, minter.length, `${name}: ${id}`);
        assert.ok(alphabet.allIn(id), `${name}: ${id} has a foreign character`);
        assert.doesNotThrow(() => minter.validate(id), `${name}: ${id}`);
      }
    }
  });

  test("the check character catches exactly the substitutions the arithmetic allows", () => {
    // A substitution at 1-based position `i` shifts the weighted sum by
    // `delta * i`, so it moves the check character — and is caught — precisely
    // when the radix does not divide `delta * i`.
    //
    // That is a real limit, not a bug: over a composite radix some single-
    // character typos are invisible (radix 28, position 4, a shift of 7). Over
    // a *prime* radix larger than any position, none are — which is why the
    // canonical NOID alphabet has 29 symbols. Asserting the law both ways
    // pins the guarantee and stops the caveat from being quietly "fixed" away.
    for (const [name, alphabet] of ALPHABETS) {
      const radix = alphabet.radix;
      const symbols = [...alphabet.toString()];
      const minter = new Minter({ alphabet, randomLength: 12 });
      const id = minter.mintSeeded(new SeededRng(99n));
      const characters = [...id];

      for (let index = 0; index < characters.length; index++) {
        const original = characters[index] as string;
        const position = index + 1; // 1-based, as the algorithm weights it
        const isCheckCharacter = index === characters.length - 1;

        for (const replacement of symbols) {
          if (replacement === original) continue;
          const corrupted = characters.map((c, j) => (j === index ? replacement : c)).join("");

          const delta =
            (alphabet.ordinal(replacement) as number) - (alphabet.ordinal(original) as number);
          // Corrupting the check character itself always shows: the body it is
          // checked against did not move.
          const detected = isCheckCharacter || (position * delta) % radix !== 0;

          assert.equal(
            !minter.isValid(corrupted),
            detected,
            `${name}: ${id} -> ${corrupted} (position ${position}, delta ${delta})`,
          );
        }
      }
    }
  });

  test("a prime radix catches every single-symbol typo", () => {
    // The practical form of the law above, and the reason to reach for
    // `noidXdigit`: with radix 29 prime and every position below 29, `delta *
    // position` is never a multiple of the radix.
    const alphabet = Alphabet.noidXdigit();
    const symbols = [...alphabet.toString()];
    const minter = new Minter({ alphabet, randomLength: 20 });
    assert.ok(minter.length < alphabet.radix, "the guarantee needs every position under the radix");

    const rng = new SeededRng(31n);
    for (let attempt = 0; attempt < 16; attempt++) {
      const id = minter.mintSeeded(rng);
      const characters = [...id];
      for (let index = 0; index < characters.length; index++) {
        for (const replacement of symbols) {
          if (replacement === characters[index]) continue;
          const corrupted = characters.map((c, j) => (j === index ? replacement : c)).join("");
          assert.ok(!minter.isValid(corrupted), `${id} -> ${corrupted} slipped through`);
        }
      }
    }
  });

  test("rejection sampling accepts and discards exactly the right byte values", () => {
    // Byte by byte across the whole range, so the boundary is pinned rather
    // than sampled. A limit that is off by one biases the first symbol towards
    // the low end of the alphabet — a defect no round-trip test would notice.
    for (const [name, alphabet] of ALPHABETS) {
      const radix = alphabet.radix;
      const symbols = [...alphabet.toString()];
      const limit = 256 - (256 % radix);
      const minter = new Minter({ alphabet, randomLength: 1, check: false });

      for (let byte = 0; byte < 256; byte++) {
        // A source stuck on a rejected value would loop forever, so hand it
        // the byte under test followed by an always-accepted 0.
        const stream = [byte, 0];
        let i = 0;
        const id = minter.mint(() => stream[i++] ?? 0);
        const expected = byte < limit ? (symbols[byte % radix] as string) : (symbols[0] as string);
        assert.equal(id, expected, `${name}: byte ${byte} (limit ${limit})`);
      }
    }
  });

  test("every symbol is reachable at every position", () => {
    // Catches a rejection window that is too narrow: symbols above the cut
    // would simply never appear.
    const alphabet = Alphabet.betanumeric();
    const minter = new Minter({ alphabet, randomLength: 4, check: false });
    const rng = new SeededRng(7n);
    const seen = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    for (let i = 0; i < 20000; i++) {
      const id = minter.mintSeeded(rng);
      for (let position = 0; position < 4; position++) seen[position]?.add(id[position] as string);
    }
    for (let position = 0; position < 4; position++) {
      assert.equal(
        seen[position]?.size,
        alphabet.radix,
        `position ${position} never produced every symbol`,
      );
    }
  });

  test("mintUnique never returns a taken id", () => {
    // A tiny body so collisions actually happen and the retry loop is exercised.
    const minter = new Minter({ alphabet: Alphabet.betanumeric(), randomLength: 2 });
    const taken = new Set<string>();
    const rng = new SeededRng(5n);
    for (let i = 0; i < 200; i++) {
      const id = minter.mintUniqueSeeded(rng, (candidate) => taken.has(candidate));
      assert.ok(!taken.has(id), `${id} was already taken`);
      assert.ok(minter.isValid(id), `${id} does not validate`);
      taken.add(id);
    }
  });

  test("a corrupted shoulder is always caught", () => {
    // Two independent defences, and the test separates them: `validate`
    // rejects a wrong prefix outright, *and* the check character genuinely
    // depends on the prefix, so the shoulder is not merely decorative.
    // Betanumeric explicitly, not the default: the hand-computed check
    // characters at the bottom are specific to it, and `y` is not in every
    // alphabet.
    const alphabet = Alphabet.betanumeric();
    const minter = new Minter({ alphabet, randomLength: 6, prefix: "dx" });
    const id = minter.mintSeeded(new SeededRng(7n));
    assert.ok(id.startsWith("dx"));
    assert.ok(minter.isValid(id));

    for (const replacement of [...alphabet.toString()]) {
      if (replacement === "d") continue;
      const corrupted = replacement + id.slice(1);
      assert.ok(!minter.isValid(corrupted), corrupted);
      // Detected by the prefix check specifically, before the check character
      // is even consulted.
      assert.throws(() => minter.validate(corrupted), { code: "BadPrefix" }, corrupted);
    }

    // And the shoulder really does move the check character: same body, one
    // different shoulder symbol, different check.
    assert.notEqual(alphabet.checkChar("dxbbbbbb"), alphabet.checkChar("dybbbbbb"));
  });
});
