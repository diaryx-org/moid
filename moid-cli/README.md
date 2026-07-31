# moid-cli

A small command-line companion for [`moid`](https://crates.io/crates/moid),
the *minimal opaque ID* minter. Mint, validate, and inspect short opaque identifiers with an optional NOID-style check character.

The crate is `moid-cli`; the installed binary is **`moid`**.

## Install

```console
$ cargo install moid-cli
```

## Usage

```console
$ moid mint --seed 42
0hscptb
$ moid mint --seed 42 -n 3
0hscptb
f2p0z49
v2pk788
$ moid mint --prefix dx --seed 7          # an ARK-style shoulder
dx0vn4188
$ moid mint --alphabet crockford32 --seed 1
0GVN6P7
$ moid validate 0hscptb
valid
$ moid validate 0hscptc                    # exits non-zero on a bad id
error: invalid: id check character does not match
$ moid check --alphabet betanumeric bcdfgh
t
$ moid alphabets
noid-xdigit  radix 29  0123456789bcdfghjkmnpqrstvwxz  (default)
betanumeric  radix 28  bcdfghjkmnpqrstvwxyz23456789
crockford32  radix 32  0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

Without `--seed`, `mint` draws from OS entropy.

`--alphabet` defaults to `noid-xdigit` because 29 is prime, which is what lets
the check character catch every single-character typo in an id shorter than 29
symbols. Over a composite radix some substitutions leave the check character
untouched. See the [library README](https://github.com/diaryx-org/moid/tree/master/moid#which-one).

## Commands

| Command | What it does |
| --- | --- |
| `mint` | Mint one or more opaque ids. |
| `validate <id>` | Validate an id against a shape; exits non-zero if it doesn't match. |
| `check <body>` | Print the check character for `body` over an alphabet. |
| `alphabets` | List the built-in alphabets. |

### Shape flags (`mint`, `validate`)

| Flag | Default | Meaning |
| --- | --- | --- |
| `--alphabet <NAME>` | `noid-xdigit` | Built-in alphabet: `noid-xdigit`, `betanumeric`, or `crockford32`. |
| `--chars <SYMBOLS>` | — | Custom alphabet symbols (overrides `--alphabet`). |
| `--len <N>` | `6` | Number of random symbols (before the check character). |
| `--no-check` | off | Omit the trailing check character. |
| `--prefix <P>` | — | Fixed prefix / shoulder; the check character covers it. |

`mint` also takes `-n, --count <N>` (how many to mint) and `--seed <U64>` (mint
deterministically instead of from OS entropy). `check` takes `--alphabet` /
`--chars`.

## License

MIT OR Apache-2.0
