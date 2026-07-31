# moid

[![CI](https://github.com/diaryx-org/moid/actions/workflows/ci.yml/badge.svg)](https://github.com/diaryx-org/moid/actions/workflows/ci.yml)
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
- **`moid-cli/`** — a small command-line companion (the installed binary is
  `moid`). Published to crates.io: `cargo install moid-cli`.
- **`moid-ts/`** — a hand-written TypeScript port (published to npm as `moid`).
  Zero dependencies, ESM, no wasm. See [`moid-ts/README.md`](moid-ts/README.md).
- **`parity/`** — the harness that keeps the two implementations honest. Never
  published.

## Parity

The port is pinned to the crate in both directions, and CI fails on either.
`cargo run -p moid-parity` records what the crate does into
`moid-ts/test/vectors.json`, which is committed and which the TypeScript suite
asserts against; `npm run vectors:ts` mints ids on the TypeScript side that
`cargo test -p moid-parity` hands back to the crate to re-mint and validate.
Regenerating either artifact must be a no-op — a diff means one side moved
without the other.

Agreement alone would not prove much, so `moid-ts/test/reference.test.ts` also
checks the port against check characters computed by hand from the prose
definition and against a second naive implementation built on different
primitives. Details in [`moid-ts/README.md`](moid-ts/README.md#parity).

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
