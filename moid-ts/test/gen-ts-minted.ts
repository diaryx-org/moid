/**
 * Writes the reverse-direction parity artifacts: ids minted **by this port**,
 * for the Rust crate to validate (`parity/tests/ts_parity.rs`).
 *
 * ```console
 * $ npm run vectors:ts
 * ```
 *
 * The golden vectors prove this port reproduces Rust output. That is one
 * direction. This is the other: output this port invented, handed back to the
 * reference implementation to accept or reject. A shared misreading that
 * happens to round-trip within TypeScript does not survive it.
 *
 * Two files, because they answer different questions:
 *
 * - `ts-minted.tsv` — seeded, so it is reproducible, committed, and checked for
 *   drift in CI. The Rust re-mints each id and demands an exact match.
 * - `ts-minted-random.tsv` — drawn from `crypto`, so it is different every run
 *   and cannot be committed. It sweeps far more of the byte space than four
 *   fixed seeds can, and the Rust validates every id it contains.
 *
 * TSV rather than JSON so the Rust side needs a `split('\t')` and no parser.
 */

import { writeFileSync } from "node:fs";

import { Alphabet, Minter, SeededRng } from "../src/index.ts";

interface Config {
  id: string;
  alphabet: Alphabet;
  randomLength: number;
  check: boolean;
  prefix?: string;
}

const printableAscii = new Alphabet(Array.from({ length: 95 }, (_, i) => 0x20 + i));

/**
 * Configurations chosen by this side, not copied from the generator — including
 * shapes the Rust vectors do not cover, so the reverse direction widens the net
 * instead of retracing it.
 */
const CONFIGS: Config[] = [
  { id: "betanumeric-6-check", alphabet: Alphabet.betanumeric(), randomLength: 6, check: true },
  {
    id: "betanumeric-6-check-dx",
    alphabet: Alphabet.betanumeric(),
    randomLength: 6,
    check: true,
    prefix: "dx",
  },
  { id: "betanumeric-6-nocheck", alphabet: Alphabet.betanumeric(), randomLength: 6, check: false },
  { id: "betanumeric-0-check", alphabet: Alphabet.betanumeric(), randomLength: 0, check: true },
  { id: "betanumeric-64-check", alphabet: Alphabet.betanumeric(), randomLength: 64, check: true },
  { id: "noid_xdigit-10-check", alphabet: Alphabet.noidXdigit(), randomLength: 10, check: true },
  { id: "crockford32-9-check", alphabet: Alphabet.crockford32(), randomLength: 9, check: true },
  { id: "binary-24-check", alphabet: new Alphabet("01"), randomLength: 24, check: true },
  { id: "ternary-15-check", alphabet: new Alphabet("abc"), randomLength: 15, check: true },
  { id: "printable_ascii-11-check", alphabet: printableAscii, randomLength: 11, check: true },
  // A long shoulder over a wide alphabet: the check character has to run over
  // every prefix position too.
  {
    id: "printable_ascii-5-check-long-prefix",
    alphabet: printableAscii,
    randomLength: 5,
    check: true,
    prefix: "shoulder/",
  },
  // Radix 7 divides neither 256 nor anything convenient — nothing in the Rust
  // vector configs looks like it.
  { id: "septenary-13-check", alphabet: new Alphabet("abcdefg"), randomLength: 13, check: true },
  { id: "single-symbol-4-check", alphabet: new Alphabet("z"), randomLength: 4, check: true },
];

/** Seeds spanning the fixed point, small values, and the top of the u64 range. */
const SEEDS = [0n, 1n, 42n, 999n, (1n << 53n) + 1n, (1n << 64n) - 1n];
const IDS_PER_SEED = 16;
const RANDOM_IDS_PER_CONFIG = 250;

function toHex(text: string): string {
  return Array.from(text, (c) => (c.codePointAt(0) as number).toString(16).padStart(2, "0")).join(
    "",
  );
}

function minterFor(config: Config): Minter {
  return new Minter({
    alphabet: config.alphabet,
    randomLength: config.randomLength,
    check: config.check,
    ...(config.prefix === undefined ? {} : { prefix: config.prefix }),
  });
}

/** `-` for no prefix; hex otherwise, so an empty prefix stays distinguishable. */
function prefixField(prefix: string | undefined): string {
  return prefix === undefined ? "-" : toHex(prefix);
}

const HEADER =
  "# Minted by moid-ts. Regenerate with `npm run vectors:ts`.\n" +
  "# config\talphabet_hex\trandom_len\tcheck\tprefix_hex\tseed\tindex\tid\n";

function row(config: Config, seed: string, index: number, id: string): string {
  return [
    config.id,
    toHex(config.alphabet.toString()),
    String(config.randomLength),
    String(config.check),
    prefixField(config.prefix),
    seed,
    String(index),
    id,
  ].join("\t");
}

function seededRows(): string {
  const lines: string[] = [];
  for (const config of CONFIGS) {
    const minter = minterFor(config);
    for (const seed of SEEDS) {
      const rng = new SeededRng(seed);
      for (let index = 0; index < IDS_PER_SEED; index++) {
        lines.push(row(config, seed.toString(), index, minter.mintSeeded(rng)));
      }
    }
  }
  return HEADER + lines.join("\n") + "\n";
}

function randomRows(): string {
  const lines: string[] = [];
  for (const config of CONFIGS) {
    const minter = minterFor(config);
    for (let index = 0; index < RANDOM_IDS_PER_CONFIG; index++) {
      lines.push(row(config, "-", index, minter.mint()));
    }
  }
  return HEADER + lines.join("\n") + "\n";
}

const seededPath = new URL("./ts-minted.tsv", import.meta.url);
const randomPath = new URL("./ts-minted-random.tsv", import.meta.url);

writeFileSync(seededPath, seededRows());
writeFileSync(randomPath, randomRows());

const total = CONFIGS.length * (SEEDS.length * IDS_PER_SEED + RANDOM_IDS_PER_CONFIG);
process.stdout.write(
  `moid-ts: wrote ${total} ids across ${CONFIGS.length} configurations\n` +
    `  ${seededPath.pathname} (seeded, committed)\n` +
    `  ${randomPath.pathname} (random, ignored)\n` +
    "Verify with: cargo test -p moid-parity\n",
);
