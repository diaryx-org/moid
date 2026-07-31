//! The reverse direction: ids minted by `moid-ts`, checked by the Rust crate.
//!
//! `moid-ts/test/parity.test.ts` proves the port reproduces Rust output. On its
//! own that only shows the port can follow. This shows the reference
//! implementation *accepts what the port invents* — a misreading shared by both
//! sides would still round-trip within TypeScript, but it would not survive
//! being handed back here.
//!
//! Two inputs, written by `npm run vectors:ts`:
//!
//! - `ts-minted.tsv` — seeded and committed, so `cargo test` verifies parity
//!   with no Node.js installed. Every id is re-minted here and must match
//!   exactly.
//! - `ts-minted-random.tsv` — drawn from `crypto`, regenerated every run and
//!   never committed. Unreproducible by construction, so it is validated
//!   rather than re-minted, and skipped when absent.

use std::fs;
use std::path::{Path, PathBuf};

use moid::{Alphabet, Minter, SeededRng};

/// A row of the TSV: one id, plus everything needed to rebuild the minter that
/// produced it. Self-describing on purpose — no table here has to be kept in
/// step with the TypeScript.
struct Row {
    config: String,
    alphabet: Vec<u8>,
    random_len: usize,
    check: bool,
    prefix: Option<String>,
    /// `None` in the random file, which has no reproducible stream.
    seed: Option<u64>,
    index: usize,
    id: String,
}

fn artifact(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../moid-ts/test")
        .join(name)
}

fn from_hex(hex: &str) -> Vec<u8> {
    assert!(hex.len().is_multiple_of(2), "odd-length hex field: {hex:?}");
    (0..hex.len() / 2)
        .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).expect("hex field"))
        .collect()
}

fn parse(text: &str) -> Vec<Row> {
    text.lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            // `splitn` so a tab inside an id (possible over an exotic alphabet)
            // lands in the final field rather than derailing the parse.
            let mut fields = line.splitn(8, '\t');
            let mut next = |name: &str| {
                fields
                    .next()
                    .unwrap_or_else(|| panic!("missing field {name} in row: {line:?}"))
            };
            Row {
                config: next("config").to_string(),
                alphabet: from_hex(next("alphabet_hex")),
                random_len: next("random_len").parse().expect("random_len"),
                check: match next("check") {
                    "true" => true,
                    "false" => false,
                    other => panic!("check must be true or false, got {other:?}"),
                },
                prefix: match next("prefix_hex") {
                    "-" => None,
                    hex => Some(String::from_utf8(from_hex(hex)).expect("prefix is ASCII")),
                },
                seed: match next("seed") {
                    "-" => None,
                    seed => Some(seed.parse().expect("seed")),
                },
                index: next("index").parse().expect("index"),
                id: next("id").to_string(),
            }
        })
        .collect()
}

fn minter_for(row: &Row) -> Minter {
    let alphabet = Alphabet::new(&row.alphabet).expect("moid-ts sent a valid alphabet");
    let mut minter = Minter::new(alphabet, row.random_len);
    if !row.check {
        minter = minter.without_check();
    }
    if let Some(prefix) = &row.prefix {
        minter = minter
            .with_prefix(prefix.as_str())
            .expect("moid-ts sent a valid prefix");
    }
    minter
}

#[test]
fn seeded_ids_from_moid_ts_validate_and_re_mint_identically() {
    let path = artifact("ts-minted.tsv");
    let text = fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read {}: {e}\n\
             This file is committed. Regenerate it with `npm run vectors:ts` in moid-ts/.",
            path.display()
        )
    });

    let rows = parse(&text);
    assert!(
        rows.len() >= 500,
        "only {} rows — the artifact looks truncated",
        rows.len()
    );

    // Rows arrive grouped by (config, seed) and ordered by index, so one PRNG
    // walks each group. Anything out of order trips the index assertion rather
    // than silently comparing against the wrong point in the stream.
    let mut group: Option<(String, u64)> = None;
    let mut minter = Minter::new(Alphabet::betanumeric(), 0);
    let mut rng = SeededRng::new(0);

    for row in &rows {
        let seed = row.seed.expect("the seeded artifact has no unseeded rows");
        let key = (row.config.clone(), seed);
        if group.as_ref() != Some(&key) {
            assert_eq!(
                row.index, 0,
                "{} @ seed {seed} does not start at index 0 — rows are out of order",
                row.config
            );
            group = Some(key);
            minter = minter_for(row);
            rng = SeededRng::new(seed);
        }

        assert_eq!(
            minter.len(),
            row.id.chars().count(),
            "{} @ seed {seed}: {} is not the length this minter produces",
            row.config,
            row.id
        );
        assert!(
            minter.validate(&row.id).is_ok(),
            "{} @ seed {seed}: moid rejects {} minted by moid-ts ({:?})",
            row.config,
            row.id,
            minter.validate(&row.id)
        );
        assert_eq!(
            minter.mint_seeded(&mut rng),
            row.id,
            "{} @ seed {seed} index {}: the two implementations diverge",
            row.config,
            row.index
        );
    }
}

#[test]
fn random_ids_from_moid_ts_validate() {
    let path = artifact("ts-minted-random.tsv");
    let Ok(text) = fs::read_to_string(&path) else {
        // Not committed — it is different on every run. CI generates it before
        // this test; locally, `npm run vectors:ts` does.
        eprintln!(
            "skipping: {} not present (run `npm run vectors:ts` in moid-ts/)",
            path.display()
        );
        return;
    };

    let rows = parse(&text);
    assert!(!rows.is_empty(), "{} is empty", path.display());

    for row in &rows {
        let minter = minter_for(row);
        assert!(
            minter.validate(&row.id).is_ok(),
            "{} index {}: moid rejects {} minted by moid-ts from ambient entropy ({:?})",
            row.config,
            row.index,
            row.id,
            minter.validate(&row.id)
        );
    }
}
