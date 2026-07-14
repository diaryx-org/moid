//! Error type for alphabet construction and blade validation.

use std::error::Error;
use std::fmt;

/// Errors produced while constructing an [`crate::Alphabet`] or validating a
/// minted id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MoidError {
    /// An alphabet must have at least one symbol.
    EmptyAlphabet,
    /// An alphabet may hold at most 255 symbols (byte-addressable, ASCII).
    AlphabetTooLarge,
    /// An alphabet symbol was not ASCII.
    NonAsciiAlphabet,
    /// An alphabet listed the same symbol twice.
    DuplicateSymbol,
    /// A blade was not the length this minter produces.
    BadLength,
    /// A blade contained a character outside the alphabet.
    BadChar,
    /// A blade's trailing check character did not match its body.
    BadCheck,
    /// A blade did not carry the minter's configured prefix.
    BadPrefix,
    /// Ambient entropy was requested (`mint_os`) but the OS source failed.
    #[cfg(feature = "os")]
    Entropy,
}

impl fmt::Display for MoidError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let msg = match self {
            MoidError::EmptyAlphabet => "alphabet is empty",
            MoidError::AlphabetTooLarge => "alphabet has more than 255 symbols",
            MoidError::NonAsciiAlphabet => "alphabet contains a non-ASCII symbol",
            MoidError::DuplicateSymbol => "alphabet contains a duplicate symbol",
            MoidError::BadLength => "id has an invalid length",
            MoidError::BadChar => "id contains a character outside the alphabet",
            MoidError::BadCheck => "id check character does not match",
            MoidError::BadPrefix => "id is missing the expected prefix",
            #[cfg(feature = "os")]
            MoidError::Entropy => "the OS entropy source failed",
        };
        f.write_str(msg)
    }
}

impl Error for MoidError {}
