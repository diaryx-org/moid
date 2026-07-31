//! Ready-made alphabets. Pass one to [`Alphabet::new`](crate::Alphabet::new),
//! or use the matching constructor (e.g. [`Alphabet::betanumeric`](crate::Alphabet::betanumeric)).

/// 28 chars: no vowels (no accidental words), no `0`/`1`/`l`, includes `y`.
/// The alphabet colophon and diaryx mint from.
///
/// Dropping `0` and `1` removes the `0`/`O` and `1`/`l` confusions, but note
/// that `O`, `o`, `l`, and `I` are absent from [`NOID_XDIGIT`] too, so there a
/// misread lands outside the alphabet and fails as
/// [`BadChar`](crate::MoidError::BadChar) rather than passing silently. What is
/// left here — `2`/`z`, `5`/`s`, `6`/`b`, `9`/`g`, and the `v`/`y` pair that
/// only this alphabet has — are confusions *between symbols both in the
/// alphabet*, which only the check character can catch.
///
/// And it cannot always: 28 is composite, so a substitution at position `i`
/// shifting the ordinal by `δ` is invisible whenever `28 | i·δ` (position 4
/// shifted by 7, say). Harmless at the usual 6-symbol length, but the blind
/// spots start at position 7. Prefer [`NOID_XDIGIT`] unless you need this
/// specific symbol set.
pub const BETANUMERIC: &[u8; 28] = b"bcdfghjkmnpqrstvwxyz23456789";

/// The canonical 29-char NOID extended-digit alphabet: digits `0`–`9` plus
/// consonants (no vowels, no `l`, **no `y`**). Use for check characters that
/// match a standard NOID minter.
///
/// The default for `moid-cli` and the TypeScript port, because 29 is **prime**:
/// with `δ` smaller than the radix, `29 | i·δ` requires `29 | i`, so the check
/// character catches *every* single-character substitution in an id shorter
/// than 29 symbols. No other preset can say that — see [`BETANUMERIC`].
///
/// Dropping `y` is the other half of "no accidental words": `y` is the letter
/// that lets an otherwise consonant-only string read as one (`shy`, `dry`,
/// `sky`).
pub const NOID_XDIGIT: &[u8; 29] = b"0123456789bcdfghjkmnpqrstvwxz";

/// Crockford base32 (uppercase, no `I`/`L`/`O`/`U`).
pub const CROCKFORD32: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
