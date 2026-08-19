//! # moid — minimal opaque ID
//!
//! Mint short, opaque identifiers over a **configurable alphabet**, with an
//! optional **NOID-style check character** for typo detection. That is the
//! whole crate.
//!
//! ```
//! use moid::{Alphabet, Minter, SeededRng};
//!
//! // 6 random NOID extended-digit symbols + 1 check character = a 7-char id.
//! let minter = Minter::new(Alphabet::noid_xdigit(), 6);
//! let id = minter.mint_seeded(&mut SeededRng::new(42));
//! assert_eq!(id, "0hscptb");
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
//! ## Content-addressed ids
//!
//! [`Minter::mint`] takes any `FnMut() -> u8`, so pointing it at a hash rather
//! than a PRNG turns it into a deterministic, content-derived id over the
//! configured alphabet — check character and all. No feature or extra API is
//! involved; it is the same mint with a different byte source:
//!
//! ```ignore
//! let minter = Minter::new(Alphabet::noid_xdigit(), 16);
//!
//! // Any extendable-output function will do; BLAKE3 in XOF mode here.
//! let mut xof = blake3::Hasher::new().update(content).finalize_xof();
//! let mut buf = [0u8; 1];
//! let id = minter.mint(&mut || {
//!     xof.fill(&mut buf);
//!     buf[0]
//! });
//! ```
//!
//! Three things to keep straight when doing this:
//!
//! - **Feed it an XOF, not a fixed-width digest.** Minting rejection-samples to
//!   avoid modulo bias, so it consumes an unbounded number of bytes — over
//!   [`Alphabet::noid_xdigit`] a byte is accepted with probability 232/256.
//!   Draining a 32-byte digest for 16 symbols runs off the end about once in
//!   2·10⁹: rare enough never to surface in testing, common enough to be a real
//!   bug. With only a fixed digest to hand, expand it in counter mode —
//!   `H(content ‖ 0)`, `H(content ‖ 1)`, … — and read from that stream.
//! - **The entropy is the id's, not the digest's.** `n` symbols carry
//!   `n·log₂(radix)` bits however wide the hash behind them was, so collisions
//!   arrive at the birthday bound: 16 noid symbols is 77.7 bits (collisions
//!   around 2³⁹ ids), 26 symbols is 126.3 bits (around 2⁶³). Rendering SHA-256
//!   into 10 symbols leaves 48.6 bits, not 256.
//! - **[`Minter::mint_unique`] does not apply.** Retrying until a candidate is
//!   untaken is right for a random draw and wrong for a content hash: the same
//!   input has to keep yielding the same id, and a clash between two *different*
//!   inputs is a real collision rather than something to mint past.
//!
//! The check character is a deterministic function of the body, so it adds a
//! symbol of length and no bits of entropy — leave it out of the budget above.
//!
//! ## Choosing an alphabet
//!
//! There is no default here — [`Minter::new`] takes one — but `moid-cli` and
//! the TypeScript port both default to [`Alphabet::noid_xdigit`], and it is the
//! one to reach for unless you need a specific symbol set.
//!
//! The reason is the radix. A substitution at 1-based position `i` that shifts
//! a symbol's ordinal by `δ` moves the weighted sum by `i·δ`, so
//! [`Alphabet::check_char`] catches it exactly when the radix does not divide
//! `i·δ`. With 29 prime and `δ` necessarily smaller, that fails only when
//! `29 | i` — every single-character typo in an id shorter than 29 symbols is
//! caught. Over a composite radix some are not, starting at position 2 rather
//! than somewhere safely past the end of a short id:
//! [`Alphabet::betanumeric`] (28) misses a shift of 14 there (`c` -> `v`, two
//! adjacent keys), and [`Alphabet::crockford32`] (32) misses a shift of 16.
//! See [`presets`] for the full comparison.
//!
//! The check-character algorithm is NOID's; the *result* matches a standard
//! NOID minter only when you mint over [`Alphabet::noid_xdigit`].

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
