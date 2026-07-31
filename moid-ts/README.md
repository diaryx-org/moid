# moid — minimal opaque ID

Mint short, opaque identifiers over a **configurable alphabet**, with an
optional **NOID-style check character** for typo detection. That's the whole
package.

```ts
import { Minter } from "moid";

// 6 random betanumeric symbols + 1 check character = a 7-char id.
const minter = new Minter();
const id = minter.mint();     // "b29r4b9"
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
| `Alphabet.betanumeric()` | 28 | no vowels, no `0`/`1`/`l`, includes `y` |
| `Alphabet.noidXdigit()` | 29 | canonical NOID set — check chars match a standard NOID minter |
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

### What the check character actually guarantees

A substitution at 1-based position `i` shifts the weighted sum by `delta × i`,
so it is caught exactly when the radix does not divide `delta × i`. Over a
**prime** radix larger than the id, that is every single-character typo. Over a
composite radix, a few slip through — with betanumeric (radix 28), changing
position 4 by exactly 7 ordinals leaves the check character untouched.

That is inherent to the algorithm, not a defect in this port, and it is why the
canonical NOID alphabet has 29 symbols. Reach for `Alphabet.noidXdigit()` when
catching every single-character typo matters.

## Entropy

`mint()` draws from `crypto.getRandomValues`. Two other options:

```ts
import { Minter, SeededRng } from "moid";

const minter = new Minter();

// Deterministic — for tests and reproducibility. Not cryptographic.
minter.mintSeeded(new SeededRng(42n));   // "b29r4b9", same as the Rust

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
