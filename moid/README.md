# moid — minimal opaque ID

Mint short, opaque identifiers over a **configurable alphabet**, with an
optional **NOID-style check character** for typo detection. That's the whole
crate.

```rust
use moid::{Alphabet, Minter, SeededRng};

// 6 random betanumeric symbols + 1 check character = a 7-char id.
let minter = Minter::new(Alphabet::betanumeric(), 6);
let id = minter.mint_seeded(&mut SeededRng::new(42));
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
| `Alphabet::betanumeric()` | 28 | no vowels, no `0`/`1`/`l`, includes `y` |
| `Alphabet::noid_xdigit()` | 29 | canonical NOID set — check chars match a standard NOID minter |
| `Alphabet::crockford32()` | 32 | Crockford base32 |

Or `Alphabet::new(b"...")` with your own.

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
