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
single-character typo in an id shorter than 29 symbols is caught. Over a
composite radix some are not: with `betanumeric` (28), a shift of 7 at position
4 leaves the check character untouched, and `crockford32` (32) has the same
problem at position 2.

At the usual 6-symbol length all three are fine in practice; the blind spots
open up as ids get longer.

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

## Prefix / shoulder

`Minter::with_prefix("dx")` prepends a fixed prefix; the check character covers
it, so a corrupted prefix is detected. (This is how an ARK "shoulder" is
built.) It returns `Result<Minter, MoidError>`, erroring if the prefix has a
character outside the minter's alphabet — such a prefix would let the minter
mint ids that its own `validate` always rejects.

## License

MIT OR Apache-2.0
