//! A minimal JSON emitter — enough to write the vector file, and no more.
//!
//! Hand-rolled rather than pulled from crates.io so the workspace stays
//! dependency-free even in its dev tooling. It is not a general JSON library:
//! it writes, never parses, and the only consumer (`JSON.parse` on the
//! TypeScript side) fails loudly if any of it is wrong.

use core::fmt::Write as _;

/// A JSON value.
pub enum V {
    Str(String),
    Num(u64),
    Bool(bool),
    Null,
    Arr(Vec<V>),
    Obj(Vec<(&'static str, V)>),
}

impl V {
    /// A string value, from anything string-ish.
    pub fn s(value: impl Into<String>) -> V {
        V::Str(value.into())
    }

    /// A number value, from a `usize`.
    pub fn n(value: usize) -> V {
        V::Num(value as u64)
    }

    /// Write this value compactly (no newlines) onto `out`.
    pub fn write(&self, out: &mut String) {
        match self {
            V::Str(s) => escape(s, out),
            V::Num(n) => {
                let _ = write!(out, "{n}");
            }
            V::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            V::Null => out.push_str("null"),
            V::Arr(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    item.write(out);
                }
                out.push(']');
            }
            V::Obj(fields) => {
                out.push('{');
                for (i, (key, value)) in fields.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    escape(key, out);
                    out.push(':');
                    value.write(out);
                }
                out.push('}');
            }
        }
    }
}

/// Write `s` as a quoted JSON string.
///
/// Non-ASCII passes through as UTF-8 (valid JSON, and it keeps the astral
/// characters in the vectors legible); only the characters JSON forbids raw are
/// escaped.
fn escape(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// The top-level document: one line per vector, so a change to the algorithm
/// shows up as a readable diff rather than a wall of reflowed JSON.
pub struct Doc {
    out: String,
    first: bool,
}

impl Default for Doc {
    fn default() -> Doc {
        Doc {
            out: String::from("{\n"),
            first: true,
        }
    }
}

impl Doc {
    pub fn new() -> Doc {
        Doc::default()
    }

    /// A scalar (or small compact) member.
    pub fn field(&mut self, key: &'static str, value: V) {
        self.separate();
        self.out.push_str("  ");
        escape(key, &mut self.out);
        self.out.push_str(": ");
        value.write(&mut self.out);
    }

    /// An array member, one entry per line.
    pub fn section(&mut self, key: &'static str, entries: Vec<V>) {
        self.separate();
        self.out.push_str("  ");
        escape(key, &mut self.out);
        self.out.push_str(": [");
        if entries.is_empty() {
            self.out.push(']');
            return;
        }
        for (i, entry) in entries.iter().enumerate() {
            if i > 0 {
                self.out.push(',');
            }
            self.out.push_str("\n    ");
            entry.write(&mut self.out);
        }
        self.out.push_str("\n  ]");
    }

    pub fn finish(mut self) -> String {
        self.out.push_str("\n}\n");
        self.out
    }

    fn separate(&mut self) {
        if self.first {
            self.first = false;
        } else {
            self.out.push_str(",\n");
        }
    }
}
