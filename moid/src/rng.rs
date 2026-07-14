//! Entropy sources.
//!
//! Three layers, in order of dependency weight:
//!
//! 1. **Bring your own** — every mint method takes `rng: &mut impl FnMut() ->
//!    u8`. Zero dependencies; the only option on an Extism guest or an exotic
//!    wasm host with no ambient entropy.
//! 2. [`SeededRng`] — a deterministic `xorshift64` PRNG. Still dependency-free;
//!    reproducible for tests, and cheap enough to embed in a `Clone`/`Debug`
//!    workspace.
//! 3. `Minter::mint_os` — ambient OS/browser entropy via `getrandom`, behind
//!    the `os`/`js` features (see [`crate::Minter`]).
//!
//! The PRNG is **not** cryptographic and does not claim to be: minted ids are
//! opaque handles whose uniqueness is enforced by rejection against an existing
//! set, not by entropy. Reach for `mint_os` (or your own CSPRNG bytes) when you
//! want unpredictability.

/// A small, dependency-free, deterministic `xorshift64` byte source.
///
/// Seed it and it produces the same stream every time — the basis for
/// reproducible tests and for a minter that has to stay `Clone`/`Debug`.
#[derive(Debug, Clone)]
pub struct SeededRng {
    state: u64,
}

impl SeededRng {
    /// Seed the PRNG. A zero seed is nudged off `xorshift64`'s fixed point.
    pub fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed },
        }
    }

    /// The next byte (the top byte of the `xorshift64` state — its low bits are
    /// the weakest).
    #[inline]
    pub fn next_byte(&mut self) -> u8 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        (self.state >> 56) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(42);
        for _ in 0..64 {
            assert_eq!(a.next_byte(), b.next_byte());
        }
    }

    #[test]
    fn zero_seed_is_not_stuck() {
        let mut r = SeededRng::new(0);
        // A stuck PRNG would emit a constant; a healthy one varies.
        let first = r.next_byte();
        assert!((0..16).any(|_| r.next_byte() != first));
    }
}
