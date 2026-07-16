//! `moid` — a small command-line companion for exercising the minter.

use std::process::ExitCode;

use clap::{Args, Parser, Subcommand, ValueEnum};
use moid::{presets, Alphabet, Minter, MoidError, SeededRng};

#[derive(Parser)]
#[command(name = "moid", version, about = "Minimal opaque ID minter")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Mint one or more opaque ids.
    Mint {
        #[command(flatten)]
        shape: Shape,
        /// How many ids to mint.
        #[arg(short = 'n', long, default_value_t = 1)]
        count: usize,
        /// Mint deterministically from this seed (default: OS entropy).
        #[arg(long)]
        seed: Option<u64>,
    },
    /// Validate that an id matches a shape (exits non-zero if not).
    Validate {
        #[command(flatten)]
        shape: Shape,
        /// The id to validate.
        id: String,
    },
    /// Print the check character for a body over an alphabet.
    Check {
        #[command(flatten)]
        alphabet: AlphabetArg,
        /// The body to compute a check character over.
        body: String,
    },
    /// List the built-in alphabets.
    Alphabets,
}

/// How to select an alphabet: a preset, or a custom symbol set.
#[derive(Args)]
struct AlphabetArg {
    /// Built-in alphabet.
    #[arg(long, value_enum, default_value_t = Preset::Betanumeric)]
    alphabet: Preset,
    /// Custom alphabet symbols (overrides --alphabet).
    #[arg(long, value_name = "SYMBOLS")]
    chars: Option<String>,
}

/// The full shape of a minted id.
#[derive(Args)]
struct Shape {
    #[command(flatten)]
    alphabet: AlphabetArg,
    /// Number of random symbols (before the check character).
    #[arg(long, default_value_t = 6)]
    len: usize,
    /// Omit the trailing check character.
    #[arg(long)]
    no_check: bool,
    /// Fixed prefix / shoulder (the check character covers it).
    #[arg(long)]
    prefix: Option<String>,
}

#[derive(Copy, Clone, ValueEnum)]
enum Preset {
    Betanumeric,
    NoidXdigit,
    Crockford32,
}

impl AlphabetArg {
    fn build(&self) -> Result<Alphabet, MoidError> {
        match &self.chars {
            Some(s) => Alphabet::new(s.as_bytes()),
            None => Ok(match self.alphabet {
                Preset::Betanumeric => Alphabet::betanumeric(),
                Preset::NoidXdigit => Alphabet::noid_xdigit(),
                Preset::Crockford32 => Alphabet::crockford32(),
            }),
        }
    }
}

impl Shape {
    fn minter(&self) -> Result<Minter, MoidError> {
        let mut m = Minter::new(self.alphabet.build()?, self.len);
        if self.no_check {
            m = m.without_check();
        }
        if let Some(p) = &self.prefix {
            m = m.with_prefix(p.clone())?;
        }
        Ok(m)
    }
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<(), Box<dyn std::error::Error>> {
    match cli.command {
        Command::Mint { shape, count, seed } => {
            let minter = shape.minter()?;
            match seed {
                Some(s) => {
                    let mut rng = SeededRng::new(s);
                    for _ in 0..count {
                        println!("{}", minter.mint_seeded(&mut rng));
                    }
                }
                None => {
                    for _ in 0..count {
                        println!("{}", minter.mint_os()?);
                    }
                }
            }
        }
        Command::Validate { shape, id } => match shape.minter()?.validate(&id) {
            Ok(()) => println!("valid"),
            Err(e) => return Err(format!("invalid: {e}").into()),
        },
        Command::Check { alphabet, body } => {
            println!("{}", alphabet.build()?.check_char(&body));
        }
        Command::Alphabets => {
            for (name, chars) in [
                ("betanumeric", &presets::BETANUMERIC[..]),
                ("noid-xdigit", &presets::NOID_XDIGIT[..]),
                ("crockford32", &presets::CROCKFORD32[..]),
            ] {
                let symbols = std::str::from_utf8(chars).unwrap_or("<non-utf8>");
                println!("{name:<12} radix {:>2}  {symbols}", chars.len());
            }
        }
    }
    Ok(())
}
