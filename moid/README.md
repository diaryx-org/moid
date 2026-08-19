# moid — minimal opaque ID

Mint short, opaque identifiers over a **configurable alphabet**, with an
optional **NOID-style check character** for typo detection. That's the whole
crate.

```rust
use moid::{Alphabet, Minter, SeededRng};

// 6 random NOID extended-digit symbols + 1 check character = a 7-char id.
let minter = Minter::new(Alphabet::noid_xdigit(), 6);
let id = minter.mint_seeded(&mut SeededRng::new(42));
assert_eq!(id, "0hscptb");
assert!(minter.validate(&id).is_ok());
```

## Scope: mint only

moid **mints and validates**. It deliberately does *not* do the other two things
the [NOID](https://arks.org/resources/noid/) tool bundles:

- **Binding** (id → value/metadata) — a stateful store; keep it in your own
  registry/index.
- **Resolution** (id → target over HTTP) — a resolver/proxy.

Both require persistent state and platform-specific storage, which would forfeit
the dependency-free core that lets moid link into WASM and Extism guests. Out of
scope by design.

## Configurable alphabet

The radix (and the check-character arithmetic) follows the alphabet's length, so
any alphabet works. Presets:

| Preset | Radix | Notes |
| --- | --- | --- |
| `Alphabet::noid_xdigit()` | 29 | canonical NOID set — check chars match a standard NOID minter |
| `Alphabet::betanumeric()` | 28 | no vowels, no `0`/`1`/`l`, includes `y` |
| `Alphabet::crockford32()` | 32 | Crockford base32 |

Or `Alphabet::new(b"...")` with your own.

### Which one

The library has no default — `Minter::new` takes the alphabet — but `moid-cli`
and the TypeScript port both default to `noid_xdigit`, and it is the one to
reach for unless you need a specific symbol set.

The reason is the radix. A substitution at 1-based position `i` that shifts a
symbol's ordinal by `δ` moves the weighted sum by `i·δ`, so the check character
catches it exactly when the radix does not divide `i·δ`. With **29 prime** and
`δ` necessarily smaller than it, that fails only when `29 | i` — so every
single-character typo in an id shorter than 29 symbols is caught.

Over a composite radix some are not, and not only in long ids: for both other
presets the blind spots start at position 2. With `betanumeric` (28), a shift
of 14 there leaves the check character untouched —

```rust
let a = moid::Alphabet::betanumeric();
// `c` -> `v`: ordinals 1 and 15, so 2·14 = 28 ≡ 0 (mod 28).
assert_eq!(a.check_char("bcdfgh"), a.check_char("bvdfgh"));
```

— and `c`/`v` are adjacent keys. Across positions 1–6 that is 140 invisible
substitutions for `betanumeric` and 160 for `crockford32` (32, earliest also
position 2, `δ` = 16, e.g. `B` -> `V`). For `noid_xdigit` it is zero. That is
the whole argument for the default.

## Entropy

Every mint takes caller-supplied bytes, so the core has **no dependencies** and
runs anywhere. Conveniences:

- `SeededRng` — deterministic `xorshift64` (dependency-free; tests,
  reproducibility). **Not** cryptographic — uniqueness comes from rejection
  against your taken-set, not entropy.
- `Minter::mint_os()` — ambient OS/browser entropy via `getrandom`.

### Features

- `std` *(default)* — implements `std::error::Error` for `MoidError`. That's
  the *only* thing it gates: the rest of the crate is `#![no_std]`, needing just
  `alloc` for the `String` it mints. Build with `default-features = false` to
  link into a `no_std` target.
- `os` — enables `mint_os` via `getrandom` (native + WASI).
- `js` — browser `wasm32-unknown-unknown` entropy (implies `os`).

Leave `os`/`js` off (the default) on Extism guests and exotic wasm hosts, and
supply bytes yourself via `mint`.

```toml
# no_std: dependency-free core, bring-your-own entropy.
moid = { version = "1", default-features = false }
```

## Content-addressed ids

`Minter::mint` takes any `FnMut() -> u8`, so pointing it at a hash rather than a
PRNG turns it into a deterministic, content-derived id over the configured
alphabet — check character and all. No feature or extra API is involved; it's
the same mint with a different byte source:

```rust
let minter = Minter::new(Alphabet::noid_xdigit(), 16);

// Any extendable-output function will do; BLAKE3 in XOF mode here.
let mut xof = blake3::Hasher::new().update(content).finalize_xof();
let mut buf = [0u8; 1];
let id = minter.mint(&mut || {
    xof.fill(&mut buf);
    buf[0]
});
```

Three things to keep straight when doing this:

- **Feed it an XOF, not a fixed-width digest.** Minting rejection-samples to
  avoid modulo bias, so it consumes an unbounded number of bytes — over
  `noid_xdigit` a byte is accepted with probability 232/256. Draining a 32-byte
  digest for 16 symbols runs off the end about once in 2·10⁹: rare enough never
  to surface in testing, common enough to be a real bug. With only a fixed
  digest to hand, expand it in counter mode — `H(content ‖ 0)`,
  `H(content ‖ 1)`, … — and read from that stream.
- **The entropy is the id's, not the digest's.** `n` symbols carry
  `n·log₂(radix)` bits however wide the hash behind them was, so collisions
  arrive at the birthday bound: 16 noid symbols is 77.7 bits (collisions around
  2³⁹ ids), 26 symbols is 126.3 bits (around 2⁶³). Rendering SHA-256 into 10
  symbols leaves 48.6 bits, not 256.
- **`mint_unique` does not apply.** Retrying until a candidate is untaken is
  right for a random draw and wrong for a content hash: the same input has to
  keep yielding the same id, and a clash between two *different* inputs is a
  real collision rather than something to mint past.

The check character is a deterministic function of the body, so it adds a symbol
of length and no bits of entropy — leave it out of the budget above.

## Prefix / shoulder

`Minter::with_prefix("dx")` prepends a fixed prefix; the check character covers
it, so a corrupted prefix is detected. (This is how an ARK "shoulder" is
built.) It returns `Result<Minter, MoidError>`, erroring if the prefix has a
character outside the minter's alphabet — such a prefix would let the minter
mint ids that its own `validate` always rejects.

## License

MIT OR Apache-2.0
