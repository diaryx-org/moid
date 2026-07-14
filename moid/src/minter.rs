//! The minter: alphabet + length + optional check char + optional prefix.

use crate::alphabet::Alphabet;
use crate::error::MoidError;
use crate::rng::SeededRng;

/// Draw one uniformly-distributed symbol from `alphabet`, rejection-sampling to
/// avoid modulo bias (bytes at or above the largest multiple of the radix are
/// discarded).
fn next_symbol(alphabet: &Alphabet, rng: &mut impl FnMut() -> u8) -> char {
    let radix = alphabet.radix();
    // Largest multiple of `radix` that fits in a byte's range [0, 256).
    let limit = 256 - (256 % radix);
    loop {
        let b = rng() as usize;
        if b < limit {
            return alphabet.symbol(b % radix);
        }
    }
}

/// A configured minter. Cheap to clone; holds no entropy of its own (you supply
/// that per call), so it stays `Clone`/`Debug` and reusable.
///
/// ```
/// use moid::{Alphabet, Minter, SeededRng};
/// let minter = Minter::new(Alphabet::betanumeric(), 6); // 6 random + 1 check
/// let mut rng = SeededRng::new(1);
/// let id = minter.mint_seeded(&mut rng);
/// assert_eq!(id.chars().count(), 7);
/// assert!(minter.validate(&id).is_ok());
/// ```
#[derive(Debug, Clone)]
pub struct Minter {
    alphabet: Alphabet,
    random_len: usize,
    check: bool,
    prefix: Option<Box<str>>,
}

impl Minter {
    /// A minter over `alphabet` producing `random_len` random symbols plus a
    /// trailing check character (on by default).
    pub fn new(alphabet: Alphabet, random_len: usize) -> Self {
        Self {
            alphabet,
            random_len,
            check: true,
            prefix: None,
        }
    }

    /// Drop the trailing check character.
    pub fn without_check(mut self) -> Self {
        self.check = false;
        self
    }

    /// Prepend a fixed prefix (a "shoulder", in ARK terms). The check character,
    /// if present, is computed over the prefix *and* the random body, so a
    /// corrupted prefix is detected. Prefix characters should be in the alphabet
    /// for the check to cover them meaningfully.
    pub fn with_prefix(mut self, prefix: impl Into<Box<str>>) -> Self {
        self.prefix = Some(prefix.into());
        self
    }

    /// The alphabet this minter draws from.
    pub fn alphabet(&self) -> &Alphabet {
        &self.alphabet
    }

    /// The total character length of every id this minter produces.
    pub fn len(&self) -> usize {
        self.prefix.as_ref().map_or(0, |p| p.chars().count())
            + self.random_len
            + usize::from(self.check)
    }

    /// Always false — a minter always produces a non-empty id. (Present to
    /// satisfy the `len`/`is_empty` clippy pairing.)
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Mint one id, pulling bytes from `rng` (bring-your-own entropy).
    pub fn mint(&self, rng: &mut impl FnMut() -> u8) -> String {
        let mut s = String::with_capacity(self.len());
        if let Some(p) = &self.prefix {
            s.push_str(p);
        }
        for _ in 0..self.random_len {
            s.push(next_symbol(&self.alphabet, rng));
        }
        if self.check {
            let c = self.alphabet.check_char(&s);
            s.push(c);
        }
        s
    }

    /// Mint, retrying until `is_taken` reports the id is free. The caller owns
    /// the taken-set (e.g. an existing registry, including tombstones).
    pub fn mint_unique(
        &self,
        rng: &mut impl FnMut() -> u8,
        is_taken: impl Fn(&str) -> bool,
    ) -> String {
        loop {
            let id = self.mint(rng);
            if !is_taken(&id) {
                return id;
            }
        }
    }

    /// Mint using a [`SeededRng`] (deterministic; convenience over `mint`).
    pub fn mint_seeded(&self, rng: &mut SeededRng) -> String {
        self.mint(&mut || rng.next_byte())
    }

    /// [`Self::mint_unique`] using a [`SeededRng`].
    pub fn mint_unique_seeded(
        &self,
        rng: &mut SeededRng,
        is_taken: impl Fn(&str) -> bool,
    ) -> String {
        self.mint_unique(&mut || rng.next_byte(), is_taken)
    }

    /// Mint using ambient OS/browser entropy (`getrandom`).
    ///
    /// Available with the `os` feature (and `js` for browser wasm). Returns
    /// [`MoidError::Entropy`] if the OS source fails.
    #[cfg(feature = "os")]
    pub fn mint_os(&self) -> Result<String, MoidError> {
        let mut buf = [0u8; 64];
        let mut pos = buf.len();
        let mut failed = false;
        let id = self.mint(&mut || {
            if pos >= buf.len() {
                if getrandom::getrandom(&mut buf).is_err() {
                    failed = true;
                    return 0;
                }
                pos = 0;
            }
            let b = buf[pos];
            pos += 1;
            b
        });
        if failed {
            Err(MoidError::Entropy)
        } else {
            Ok(id)
        }
    }

    /// Validate that `s` could have been produced by this minter: correct
    /// length, correct prefix, alphabet-only, and (if configured) a matching
    /// check character.
    pub fn validate(&self, s: &str) -> Result<(), MoidError> {
        if s.chars().count() != self.len() {
            return Err(MoidError::BadLength);
        }
        if let Some(p) = &self.prefix {
            if !s.starts_with(&**p) {
                return Err(MoidError::BadPrefix);
            }
        }
        if !self.alphabet.all_in(s) {
            return Err(MoidError::BadChar);
        }
        if self.check && !self.alphabet.verify_check(s) {
            return Err(MoidError::BadCheck);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(bytes: Vec<u8>) -> impl FnMut() -> u8 {
        let mut i = 0;
        move || {
            let b = bytes[i % bytes.len()];
            i += 1;
            b
        }
    }

    #[test]
    fn mints_expected_length_and_validates() {
        let m = Minter::new(Alphabet::betanumeric(), 6);
        assert_eq!(m.len(), 7);
        let mut rng = SeededRng::new(1);
        for _ in 0..1000 {
            let id = m.mint_seeded(&mut rng);
            assert_eq!(id.chars().count(), 7);
            assert!(m.validate(&id).is_ok(), "{id}");
        }
    }

    #[test]
    fn rejection_sampling_skips_biasing_bytes() {
        // diaryx_ark parity: 252..=255 rejected for radix 28; next usable is 0 -> 'b'.
        let m = Minter::new(Alphabet::betanumeric(), 1).without_check();
        let mut rng = seq(vec![252, 253, 254, 255, 0]);
        assert_eq!(m.mint(&mut rng), "b");
    }

    #[test]
    fn prefix_check_covers_the_prefix() {
        // Rebuilds diaryx_ark's workspace blade: `dx` + 6 random + check(dx+body).
        let m = Minter::new(Alphabet::betanumeric(), 6).with_prefix("dx");
        assert_eq!(m.len(), 9);
        let mut rng = SeededRng::new(7);
        let id = m.mint_seeded(&mut rng);
        assert!(id.starts_with("dx"));
        assert!(m.validate(&id).is_ok());
        // Corrupting the shoulder is caught two ways. (1) A wrong prefix fails
        // BadPrefix outright:
        assert_eq!(m.validate(&format!("b{}", &id[1..])), Err(MoidError::BadPrefix));
        // (2) The check character genuinely depends on the shoulder — changing a
        // shoulder char at equal length changes the check (hand-computed, so the
        // proof can't collide by luck):
        let a = Alphabet::betanumeric();
        assert_eq!(a.check_char("dxbbbbbb"), 'm'); // d*1 + x*2 = 2 + 34 = 36; 36 % 28 = 8
        assert_eq!(a.check_char("dybbbbbb"), 'p'); // d*1 + y*2 = 2 + 36 = 38; 38 % 28 = 10
        assert_ne!(a.check_char("dxbbbbbb"), a.check_char("dybbbbbb"));
    }

    #[test]
    fn validate_catches_corruption() {
        let m = Minter::new(Alphabet::betanumeric(), 6);
        assert_eq!(m.validate("bcdfg"), Err(MoidError::BadLength));
        // 'a' is not in the betanumeric alphabet.
        assert_eq!(m.validate("bcdfgha"), Err(MoidError::BadChar));
        // Right shape, wrong check char.
        let mut rng = SeededRng::new(3);
        let id = m.mint_seeded(&mut rng);
        let mut chars: Vec<char> = id.chars().collect();
        let last = chars.len() - 1;
        chars[last] = if chars[last] == 'b' { 'c' } else { 'b' };
        let bad: String = chars.into_iter().collect();
        assert_eq!(m.validate(&bad), Err(MoidError::BadCheck));
    }

    #[test]
    fn mint_unique_avoids_taken() {
        let m = Minter::new(Alphabet::betanumeric(), 6);
        let first = m.mint_seeded(&mut SeededRng::new(5));
        let taken_first = first.clone();
        let out = m.mint_unique_seeded(&mut SeededRng::new(5), move |s| s == taken_first);
        assert_ne!(out, first);
        assert!(m.validate(&out).is_ok());
    }

    #[test]
    fn without_check_drops_the_trailing_char() {
        let m = Minter::new(Alphabet::betanumeric(), 6).without_check();
        assert_eq!(m.len(), 6);
        let id = m.mint_seeded(&mut SeededRng::new(1));
        assert_eq!(id.chars().count(), 6);
        assert!(m.validate(&id).is_ok());
    }

    #[cfg(feature = "os")]
    #[test]
    fn mint_os_produces_valid_ids() {
        let m = Minter::new(Alphabet::betanumeric(), 6);
        let id = m.mint_os().expect("os entropy");
        assert!(m.validate(&id).is_ok(), "{id}");
    }
}
