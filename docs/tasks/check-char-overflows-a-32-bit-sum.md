---
title: The check character overflows a 32-bit sum
description: "`Alphabet::check_char` sums `ordinal × position` in a `usize` and reduces once at the end, so on wasm32 a body of about 17,500 symbols panics in a debug build and gets a check character the TypeScript port and a 64-bit build disagree with in a release build"
status: open
created: 2026-10-29
updated: 2026-10-29
part_of: "[Tasks](tasks.md)"
---

# The check character overflows a 32-bit sum

`Alphabet::check_char` in `moid/src/alphabet.rs` adds
`ordinal(c) * (i + 1)` for every symbol into a `usize` and takes the
remainder by the radix only after the loop. The sum grows with the square of
the body's length. `usize` is 32 bits on wasm32, and the crate's docs name
WASM and Extism guests as targets. Over `noid_xdigit`, a body made entirely
of its last symbol (ordinal 28) passes `u32::MAX` at about 17,500 symbols. A
body over a 255-symbol alphabet passes it at about 5,800.

moid-ts already guards against this. Its `checkChar` takes the remainder at
every step, "identical result, but the running total cannot drift past
`Number.MAX_SAFE_INTEGER`". The Rust does not, so the two implementations
part at a length the TypeScript handles.

`Minter::validate` reaches the same code through `verify_check`, for any
minter whose length is that long. moid-cli's `check` reaches it with any
body.

## Repro

A scratch binary depending on `moid` by path:

```rust
let n: usize = std::env::args().nth(1).unwrap().parse().unwrap();
let a = moid::Alphabet::noid_xdigit();
let body: String = std::iter::repeat(a.symbol(a.radix() - 1)).take(n).collect();
println!("{:?}", a.check_char(&body));
```

Built for `wasm32-wasip1` and run under Node's `node:wasi`:

| n      | x86_64 | wasm32 debug                      | wasm32 release |
|--------|--------|-----------------------------------|----------------|
| 17,000 | `'8'`  | `'8'`                             | `'8'`          |
| 20,000 | `'f'`  | panics at `alphabet.rs`, overflow | `'w'`          |

`'f'` is also what the step-by-step reduction moid-ts uses gives.

## Done when

`check_char` reduces modulo the radix as it goes, as moid-ts does, so it
cannot overflow on any target and gives the result it gives today for every
body that does not overflow. A test pins the 20,000-symbol body above to
`'f'`. That test passes on x86_64 either way, so it has also been seen to
pass on a 32-bit target: wasm32-wasip1 under a WASI runtime, or
`i686-unknown-linux-gnu`.
