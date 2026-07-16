# moid

[![CI](https://github.com/adammharris/moid/actions/workflows/ci.yml/badge.svg)](https://github.com/adammharris/moid/actions/workflows/ci.yml)
[![crates.io](https://img.shields.io/crates/v/moid.svg)](https://crates.io/crates/moid)
[![docs.rs](https://img.shields.io/docsrs/moid)](https://docs.rs/moid)
[![license](https://img.shields.io/crates/l/moid.svg)](#license)

A cargo workspace for **moid** — *minimal opaque ID*: mint short, opaque
identifiers over a configurable alphabet, with an optional NOID-style check
character. Mint-only — binding and resolution are deliberately out of scope.

## Layout

- **`moid/`** — the library (published to crates.io). Dependency-free core;
  `getrandom` is optional behind the `os`/`js` features. See
  [`moid/README.md`](moid/README.md) for the full API and rationale.
- **`moid-cli/`** — a small command-line companion for exercising the library
  (the installed binary is `moid`). Not published.

## CLI

```console
$ cargo run -p moid-cli -- mint --seed 42
b29r4b9
$ cargo run -p moid-cli -- mint --prefix dx        # an ARK-style shoulder
dxbb7mht2
$ cargo run -p moid-cli -- validate b29r4b9
valid
$ cargo run -p moid-cli -- alphabets
betanumeric  radix 28  bcdfghjkmnpqrstvwxyz23456789
noid-xdigit  radix 29  0123456789bcdfghjkmnpqrstvwxz
crockford32  radix 32  0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

`mint` (with `--len`, `--no-check`, `--prefix`, `--alphabet`/`--chars`,
`--seed`, `-n`), `validate`, `check`, and `alphabets`.

## License

MIT OR Apache-2.0.
