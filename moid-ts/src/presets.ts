/**
 * Ready-made alphabets. Pass one to `new Alphabet(...)`, or use the matching
 * static constructor (e.g. {@link Alphabet.betanumeric}).
 */

/**
 * 28 chars: no vowels (no accidental words), no `0`/`1`/`l` (no ambiguity),
 * includes `y`. The alphabet colophon and diaryx mint from.
 */
export const BETANUMERIC = "bcdfghjkmnpqrstvwxyz23456789";

/**
 * The canonical 29-char NOID extended-digit alphabet: digits `0`–`9` plus
 * consonants (no vowels, no `l`, **no `y`**). Use for check characters that
 * match a standard NOID minter.
 */
export const NOID_XDIGIT = "0123456789bcdfghjkmnpqrstvwxz";

/** Crockford base32 (uppercase, no `I`/`L`/`O`/`U`). */
export const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
