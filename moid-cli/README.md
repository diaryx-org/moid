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
b29r4b9
$ moid mint --seed 42 -n 3
b29r4b9
yk7fbqx
9h8znpw
$ moid mint --prefix dx --seed 7          # an ARK-style shoulder
dxbb7mht2
$ moid mint --alphabet crockford32 --seed 1
0GVN6P7
$ moid validate b29r4b9
valid
$ moid validate b29r4bb                    # exits non-zero on a bad id
error: invalid: id check character does not match
$ moid check --alphabet betanumeric bcdfgh
t
$ moid alphabets
betanumeric  radix 28  bcdfghjkmnpqrstvwxyz23456789
noid-xdigit  radix 29  0123456789bcdfghjkmnpqrstvwxz
crockford32  radix 32  0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

Without `--seed`, `mint` draws from OS entropy.

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
| `--alphabet <NAME>` | `betanumeric` | Built-in alphabet: `betanumeric`, `noid-xdigit`, or `crockford32`. |
| `--chars <SYMBOLS>` | — | Custom alphabet symbols (overrides `--alphabet`). |
| `--len <N>` | `6` | Number of random symbols (before the check character). |
| `--no-check` | off | Omit the trailing check character. |
| `--prefix <P>` | — | Fixed prefix / shoulder; the check character covers it. |

`mint` also takes `-n, --count <N>` (how many to mint) and `--seed <U64>` (mint
deterministically instead of from OS entropy). `check` takes `--alphabet` /
`--chars`.

## License

MIT OR Apache-2.0
