# moid — minimal opaque ID

Mint short, opaque identifiers over a **configurable alphabet**, with an
optional **NOID-style check character** for typo detection. That's the whole
package.

```ts
import { Minter } from "moid";

// 6 random NOID extended-digit symbols + 1 check character = a 7-char id.
const minter = new Minter();
const id = minter.mint();     // "9nb12rp"
minter.isValid(id);           // true
```

Zero dependencies, ESM, and no build step at runtime — it works in Node, Deno,
Bun, browsers, and edge runtimes. The only host requirement is
`crypto.getRandomValues`, and only if you let `mint()` find its own entropy.

## A port, held to the original

This is a hand-written port of the [`moid`](https://crates.io/crates/moid) Rust
crate. Same seed in, same id out — enforced, not hoped for. See
[Parity](#parity) below.

Why a port and not WebAssembly: the algorithm is a weighted sum modulo the
alphabet size and a `xorshift64`. Compiling it to wasm would cost 20–40 KB, an
`await init()` before first use, and a per-bundler loading story, to avoid
writing about 150 lines of arithmetic. The Rust API is also closure-driven
(`mint(&mut impl FnMut() -> u8)`), so a wasm build would need a redesigned
JavaScript surface anyway.

## Scope: mint only

moid **mints and validates**. It deliberately does *not* do the other two things
the [NOID](https://arks.org/resources/noid/) tool bundles:

- **Binding** (id → value/metadata) — a stateful store; keep it in your own
  registry/index.
- **Resolution** (id → target over HTTP) — a resolver/proxy.

## Configurable alphabet

The radix (and the check-character arithmetic) follows the alphabet's length, so
any alphabet works. Presets:

| Preset | Radix | Notes |
| --- | --- | --- |
| `Alphabet.noidXdigit()` | 29 | **the default** — canonical NOID set; check chars match a standard NOID minter |
| `Alphabet.betanumeric()` | 28 | no vowels, no `0`/`1`/`l`, includes `y` |
| `Alphabet.crockford32()` | 32 | Crockford base32 |

Or `new Alphabet("...")` with your own.

```ts
import { Alphabet, Minter } from "moid";

const minter = new Minter({
  alphabet: Alphabet.crockford32(),
  randomLength: 10,
  check: true,
  prefix: "AB",     // an ARK-style shoulder
});
```

### Why `noidXdigit` is the default

A substitution at 1-based position `i` that shifts a symbol's ordinal by `delta`
moves the weighted sum by `delta × i`, so the check character catches it exactly
when the radix does not divide `delta × i`.

With **29 prime** and `delta` necessarily smaller than it, that fails only when
`29 | i` — so every single-character typo in an id shorter than 29 symbols is
caught.

Over a composite radix some are not, and the blind spots start at position 2 —
inside even the shortest id, not somewhere past the end of it:

```ts
const a = Alphabet.betanumeric();
// `c` -> `v` at position 2: ordinals 1 and 15, so 2 × 14 = 28 ≡ 0 (mod 28).
a.checkChar("bcdfgh") === a.checkChar("bvdfgh");   // true — undetectable
```

`c` and `v` are adjacent keys. Across positions 1–6 that is 140 invisible
substitutions for `betanumeric` and 160 for `crockford32` (32, earliest also
position 2, `delta` = 16, e.g. `B` → `V`). For `noidXdigit` it is zero.

Dropping `y` is the other reason. It is the letter that lets an otherwise
consonant-only string read as a word (`shy`, `dry`, `sky`), and it is the one
confusable pair (`v`/`y`) where betanumeric has *both* members in the alphabet.
`noidXdigit` reintroduces `0` and `1`, but `O`, `o`, `l`, and `I` are in neither
alphabet — so a misread lands outside the symbol set and fails as `BadChar`
rather than passing silently.

Pass `alphabet` if you need a specific symbol set. `betanumeric` is mainly a
compatibility set now — [diaryx](https://github.com/diaryx-org) and prov both
minted from it before moving to the NOID vocabulary, so reach for it to validate
ids from that era rather than to mint new ones. The blind spots above are a real
but bounded cost for those: they need a substitution of one exact size at one of
a few positions, so most corruptions are still caught.

## Entropy

`mint()` draws from `crypto.getRandomValues`. Two other options:

```ts
import { Minter, SeededRng } from "moid";

const minter = new Minter();

// Deterministic — for tests and reproducibility. Not cryptographic.
minter.mintSeeded(new SeededRng(42n));   // "0hscptb", same as the Rust

// Bring your own bytes: any () => number in 0..=255.
minter.mint(myByteSource);
```

Uniqueness comes from rejection against your taken-set, not from entropy
strength:

```ts
const taken = new Set<string>();
const id = minter.mintUnique((candidate) => taken.has(candidate));
```

## Errors

Rust's `Result` becomes a thrown `MoidError` carrying a stable `code`, with
`isValid` for when you only want a boolean:

```ts
import { MoidError } from "moid";

try {
  minter.validate(userInput);
} catch (e) {
  if (e instanceof MoidError && e.code === "BadCheck") {
    // a typo, most likely — the check character caught it
  }
}
```

Codes: `EmptyAlphabet`, `AlphabetTooLarge`, `NonAsciiAlphabet`,
`DuplicateSymbol`, `BadLength`, `BadChar`, `BadCheck`, `BadPrefix`,
`PrefixOutOfAlphabet`, `Entropy`. New ones may appear in a minor release, so
keep a default arm.

## Parity

Two ports of one algorithm drift. This one is pinned in both directions, and CI
fails on either.

**Rust → TypeScript.** `cargo run -p moid-parity` records what the crate does —
check characters, PRNG streams, minted ids, and every `validate` outcome across
six alphabets — into `test/vectors.json`, which is committed.
`test/parity.test.ts` asserts this package reproduces all of it. Regenerating
must be a no-op; a diff means the Rust moved and the port did not.

**TypeScript → Rust.** `npm run vectors:ts` mints ids *here* and
`parity/tests/ts_parity.rs` hands them to the crate: 1,248 seeded ids that Rust
re-mints and must match exactly, plus ~3,250 minted from real entropy that Rust
must accept. Following the reference is one thing; having the reference accept
what you invented is another.

**Neither.** Agreement is not correctness — a misreading ported faithfully into
both would pass every vector above. So `test/reference.test.ts` adds check
characters computed by hand from the prose definition, and a second naive
implementation built on different primitives (linear `indexOf` rather than a
lookup table, an unreduced sum rather than a modular one, `xorshift64` over two
32-bit halves rather than a `bigint`), compared against this package over a
generated corpus.

Two hazards this catches, both invisible in ordinary use:

- **Code points, not code units.** Rust's `chars()` counts an emoji once;
  JavaScript's `.length` counts it twice. Every position-sensitive path here
  iterates code points, and the vectors include astral characters to keep it
  that way.
- **64-bit seeds.** `SeededRng` takes a `bigint` because `xorshift64` needs
  exact 64-bit arithmetic, and seeds past 2^53 do not survive a JavaScript
  number. The vectors include `u64::MAX`.

### Running it

```console
$ npm test                    # the full suite, against the committed vectors
$ npm run check               # type-check sources and tests
$ npm run vectors:rust        # regenerate from the Rust (needs cargo)
$ npm run vectors:ts          # regenerate the ids the Rust side validates
$ cargo test -p moid-parity   # the reverse direction (from the repo root)
```

The package has no test-runner dependency: Node 24 strips the types and
`node:test` runs them, so `typescript` is the only real devDependency.

## License

MIT OR Apache-2.0
