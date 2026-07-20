//! Ready-made alphabets. Pass one to [`Alphabet::new`](crate::Alphabet::new),
//! or use the matching constructor (e.g. [`Alphabet::betanumeric`](crate::Alphabet::betanumeric)).

/// 28 chars: no vowels (no accidental words), no `0`/`1`/`l` (no ambiguity),
/// includes `y`. The alphabet colophon and diaryx mint from.
pub const BETANUMERIC: &[u8; 28] = b"bcdfghjkmnpqrstvwxyz23456789";

/// The canonical 29-char NOID extended-digit alphabet: digits `0`–`9` plus
/// consonants (no vowels, no `l`, **no `y`**). Use for check characters that
/// match a standard NOID minter.
pub const NOID_XDIGIT: &[u8; 29] = b"0123456789bcdfghjkmnpqrstvwxz";

/// Crockford base32 (uppercase, no `I`/`L`/`O`/`U`).
pub const CROCKFORD32: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
