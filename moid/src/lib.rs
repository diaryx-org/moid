//! # moid — minimal opaque ID
//!
//! Mint short, opaque identifiers over a **configurable alphabet**, with an
//! optional **NOID-style check character** for typo detection. That is the
//! whole crate.
//!
//! ```
//! use moid::{Alphabet, Minter, SeededRng};
//!
//! // 6 random betanumeric symbols + 1 check character = a 7-char id.
//! let minter = Minter::new(Alphabet::betanumeric(), 6);
//! let id = minter.mint_seeded(&mut SeededRng::new(42));
//! assert!(minter.validate(&id).is_ok());
//! ```
//!
//! ## Scope: mint only
//!
//! moid **mints and validates**. It deliberately does *not* do the other two
//! things the NOID tool bundles:
//!
//! - **Binding** (id → value/metadata) — that is a stateful store; keep it in
//!   your own registry/index.
//! - **Resolution** (id → target, over HTTP) — that is a resolver/proxy.
//!
//! Folding either into the minter would require persistent state and pull in
//! platform-specific storage, forfeiting the dependency-free core that lets moid
//! link into WASM and Extism guests. So they are out of scope by design, not by
//! omission.
//!
//! ## Non-goals
//!
//! These are declined on purpose,
//! so that "minimal" is a promise rather than an omission:
//!
//! - **Binding and resolution** — see [Scope](#scope-mint-only) above;
//!   both need persistent state and belong in your own registry or resolver.
//! - **Serialization / `serde`** — an [`Alphabet`] is a handful of ASCII bytes
//!   ([`Alphabet::as_str`]) and a [`Minter`] is a few plain fields;
//!   reconstruct them from your own config rather than pulling in a derive.
//! - **Sortable or time-encoded ids** (ULID-, KSUID-, Snowflake-style) —
//!   moid mints *opaque* handles that carry no embedded timestamp or ordering;
//!   reach for a dedicated crate when you need lexicographic sort keys.
//! - **Cryptographic randomness guarantees** — the built-in [`SeededRng`] is a
//!   deterministic, non-cryptographic PRNG;
//!   uniqueness comes from rejection against a taken-set,
//!   not from entropy strength.
//!   Supply your own CSPRNG bytes (or use [`Minter::mint_os`])
//!   when unpredictability matters.
//!
//! ## `no_std`
//!
//! The core is `#![no_std]`,
//! depending only on `alloc` for the [`String`](alloc::string::String) it mints.
//! The default `std` feature adds nothing but
//! `impl std::error::Error for `[`MoidError`];
//! disable it (`default-features = false`) to link into a `no_std` target.
//!
//! ## Entropy
//!
//! Every mint takes caller-supplied bytes, so the core has **no dependencies**
//! and runs anywhere. Two conveniences layer on top:
//!
//! - [`SeededRng`] — a deterministic `xorshift64` (dependency-free; for tests
//!   and reproducibility).
//! - [`Minter::mint_os`] — ambient OS/browser entropy via `getrandom`, behind
//!   the `os` (native/WASI) and `js` (browser wasm) features.
//!
//! The check-character algorithm is NOID's; the *result* matches a standard
//! NOID minter only when you mint over [`Alphabet::noid_xdigit`]. The
//! betanumeric set ([`Alphabet::betanumeric`]) is one preset among
//! [several](presets).

#![no_std]

extern crate alloc;

#[cfg(feature = "std")]
extern crate std;

mod alphabet;
mod error;
mod minter;
mod rng;

pub mod presets;

pub use alphabet::Alphabet;
pub use error::MoidError;
pub use minter::Minter;
pub use rng::SeededRng;
