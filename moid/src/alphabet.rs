//! The symbol set an id is drawn from, and the NOID-style check character
//! defined over it.

use crate::error::MoidError;
use crate::presets;

/// A validated set of ASCII symbols an id is minted from.
///
/// The radix (and therefore the check-character arithmetic) follows the
/// alphabet's length, so *any* alphabet works — the betanumeric set is just one
/// [`preset`](crate::presets).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Alphabet {
    symbols: Box<[u8]>,
}

impl Alphabet {
    /// Build an alphabet from a list of distinct ASCII symbols.
    ///
    /// Returns an error if the list is empty, longer than 255, non-ASCII, or
    /// contains a duplicate.
    pub fn new(symbols: &[u8]) -> Result<Self, MoidError> {
        if symbols.is_empty() {
            return Err(MoidError::EmptyAlphabet);
        }
        if symbols.len() > 255 {
            return Err(MoidError::AlphabetTooLarge);
        }
        for (i, &b) in symbols.iter().enumerate() {
            if !b.is_ascii() {
                return Err(MoidError::NonAsciiAlphabet);
            }
            if symbols[..i].contains(&b) {
                return Err(MoidError::DuplicateSymbol);
            }
        }
        Ok(Self {
            symbols: symbols.into(),
        })
    }

    /// The betanumeric preset (28 chars: no vowels, no `0`/`1`/`l`, includes
    /// `y`) — the alphabet colophon and diaryx share.
    pub fn betanumeric() -> Self {
        Self::new(presets::BETANUMERIC).expect("BETANUMERIC preset is valid")
    }

    /// The canonical 29-char NOID extended-digit alphabet (digits included, no
    /// `y`). Use this for check characters compatible with a real NOID minter.
    pub fn noid_xdigit() -> Self {
        Self::new(presets::NOID_XDIGIT).expect("NOID_XDIGIT preset is valid")
    }

    /// Crockford base32 (uppercase).
    pub fn crockford32() -> Self {
        Self::new(presets::CROCKFORD32).expect("CROCKFORD32 preset is valid")
    }

    /// The number of symbols — the radix for the check character.
    #[inline]
    pub fn radix(&self) -> usize {
        self.symbols.len()
    }

    /// The 0-based ordinal of `c`, or `None` if it is not in the alphabet.
    #[inline]
    pub fn ordinal(&self, c: char) -> Option<usize> {
        if c.is_ascii() {
            self.symbols.iter().position(|&b| b as char == c)
        } else {
            None
        }
    }

    /// Whether `c` is in the alphabet.
    #[inline]
    pub fn contains(&self, c: char) -> bool {
        self.ordinal(c).is_some()
    }

    /// The symbol at ordinal `ord` (wrapping into range).
    #[inline]
    pub fn symbol(&self, ord: usize) -> char {
        self.symbols[ord % self.radix()] as char
    }

    /// Whether every character of `s` is in the alphabet.
    pub fn all_in(&self, s: &str) -> bool {
        s.chars().all(|c| self.contains(c))
    }

    /// The NOID-style check character over `body`.
    ///
    /// Each character contributes `ordinal × (1-based position)`; characters
    /// outside the alphabet contribute 0 but still advance the position. The sum
    /// modulo the radix indexes the check character. This is the same algorithm
    /// the NOID minter uses; the *result* differs from NOID only when the
    /// alphabet differs (a different radix or ordering).
    pub fn check_char(&self, body: &str) -> char {
        let mut sum: usize = 0;
        for (i, c) in body.chars().enumerate() {
            sum += self.ordinal(c).unwrap_or(0) * (i + 1);
        }
        self.symbol(sum % self.radix())
    }

    /// Whether `blade_with_check`'s trailing character is the correct check
    /// character for the preceding body. `false` for an empty string.
    pub fn verify_check(&self, blade_with_check: &str) -> bool {
        let Some((last_idx, last)) = blade_with_check.char_indices().next_back() else {
            return false;
        };
        self.check_char(&blade_with_check[..last_idx]) == last
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_alphabets() {
        assert_eq!(Alphabet::new(b""), Err(MoidError::EmptyAlphabet));
        assert_eq!(Alphabet::new(b"abca"), Err(MoidError::DuplicateSymbol));
        assert_eq!(
            Alphabet::new(&[b'a', 0x80]),
            Err(MoidError::NonAsciiAlphabet)
        );
    }

    #[test]
    fn betanumeric_check_char_matches_ark_and_colophon_vectors() {
        let a = Alphabet::betanumeric();
        // diaryx_ark::tests::check_char_known_vectors
        assert_eq!(a.check_char("bcdfg"), 'r');
        assert_eq!(a.check_char("dxbcdfgh"), '6');
        // colophon::identity::tests::check_char_matches_the_ark_lineage
        assert_eq!(a.check_char("bcdfgh"), 't');
    }

    #[test]
    fn check_char_treats_unknown_as_zero_but_advances_position() {
        // diaryx_ark parity: "b-d" -> b(0)*1 + '-'(0)*2 + d(2)*3 = 6 -> 'j'
        assert_eq!(Alphabet::betanumeric().check_char("b-d"), 'j');
    }

    #[test]
    fn verify_check_rejects_empty() {
        assert!(!Alphabet::betanumeric().verify_check(""));
    }

    #[test]
    fn radix_follows_the_alphabet() {
        assert_eq!(Alphabet::betanumeric().radix(), 28);
        assert_eq!(Alphabet::noid_xdigit().radix(), 29);
        assert_eq!(Alphabet::crockford32().radix(), 32);
    }
}
