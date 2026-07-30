//! Round-trip proof for the Lua monster format, the counterpart to
//! `probe_monster` for the XML one.
//!
//! ```sh
//! cargo run --release --example probe_lua -- ../sources/canary-main/data-otservbr-global/monster
//! cargo run --release --example probe_lua -- ../sources/BlackTek-Server-master/data/scripts/monsters/monsters --verbose
//! ```
//!
//! Three gates, all of which must hold across the whole corpus:
//!
//! 1. **Identity.** Parsing a file and writing it back with no edits produces
//!    the original bytes. This is the acceptance gate; a splicing writer that
//!    cannot do this cannot be trusted with anyone's corpus.
//! 2. **Edit locality.** Changing one assignment rewrites one assignment —
//!    measured as changed lines, budgeted, because the whole point of splicing
//!    is that a one-field edit is a one-line diff.
//! 3. **Value round-trip.** Re-reading an edited file yields the value that was
//!    written, so the model and the bytes agree.
//!
//! It also reports coverage: how much of each file the assignment model
//! actually accounts for. A file that parses to zero assignments round-trips
//! perfectly and tells you nothing, so identity alone is not enough.

use std::path::{Path, PathBuf};
use std::time::Instant;

use monx_lib::luadoc::{self, LuaValue};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = args
        .iter()
        .find(|a| !a.starts_with("--"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../sources/canary-main/data-otservbr-global/monster"));
    let verbose = args.iter().any(|a| a == "--verbose");

    if !dir.is_dir() {
        eprintln!("not a folder: {}", dir.display());
        std::process::exit(2);
    }

    let mut files = Vec::new();
    collect(&dir, &mut files);
    files.sort();
    if files.is_empty() {
        eprintln!("no .lua files under {}", dir.display());
        std::process::exit(2);
    }

    let started = Instant::now();
    let mut identical = 0usize;
    let mut differing: Vec<String> = Vec::new();
    let mut no_assignments: Vec<String> = Vec::new();
    let mut edit_ok = 0usize;
    let mut edit_bad: Vec<String> = Vec::new();
    let mut edit_lines = 0usize;
    let mut total_assignments = 0usize;
    let mut raw_values = 0usize;
    let mut modelled_bytes = 0usize;
    let mut total_bytes = 0usize;
    let mut keys: std::collections::BTreeMap<String, usize> = Default::default();

    for path in &files {
        let name = rel(&dir, path);
        let Ok(bytes) = std::fs::read(path) else {
            differing.push(format!("{name}: unreadable"));
            continue;
        };
        let doc = luadoc::parse(&bytes);

        total_bytes += bytes.len();
        total_assignments += doc.assignments.len();
        for a in &doc.assignments {
            *keys.entry(a.key.clone()).or_default() += 1;
            modelled_bytes += a.span.len();
            if matches!(a.value, LuaValue::Raw(_)) {
                raw_values += 1;
            }
        }
        if doc.assignments.is_empty() {
            no_assignments.push(name.clone());
        }

        // 1. Identity.
        let written = luadoc::write_with(&doc, &[]);
        if written == bytes {
            identical += 1;
        } else {
            differing.push(format!("{name}: {}", first_difference(&bytes, &written)));
            continue;
        }

        // 2 + 3. Edit the first numeric assignment and check locality and value.
        let Some(target) = doc
            .assignments
            .iter()
            .find(|a| matches!(a.value, LuaValue::Num(_)))
        else {
            continue;
        };
        let before = target.value.as_i64().unwrap_or(0);
        let edited = LuaValue::Num((before + 7).to_string());
        let out = luadoc::write_with(&doc, &[(target.key.clone(), Some(edited.clone()))]);
        let reread = luadoc::parse(&out);
        match reread.get(&target.key) {
            Some(v) if *v == edited => {
                let changed = changed_lines(&bytes, &out);
                edit_lines += changed;
                if changed > 2 {
                    edit_bad.push(format!(
                        "{name}: editing {} rewrote {changed} lines",
                        target.key
                    ));
                } else {
                    edit_ok += 1;
                }
            }
            other => edit_bad.push(format!(
                "{name}: {} re-read as {other:?}, expected {edited:?}",
                target.key
            )),
        }
    }

    let elapsed = started.elapsed().as_millis();
    println!(
        "parsed {} files in {elapsed}ms · round-trip identical: {identical} · differing: {}",
        files.len(),
        differing.len()
    );
    println!(
        "coverage: {total_assignments} assignments · {:.1}% of bytes modelled · {raw_values} values kept raw",
        100.0 * modelled_bytes as f64 / total_bytes.max(1) as f64
    );
    if !no_assignments.is_empty() {
        println!(
            "files with no assignments at all: {} (these round-trip but are not modelled)",
            no_assignments.len()
        );
        for n in no_assignments.iter().take(if verbose { usize::MAX } else { 5 }) {
            println!("  BARE  {n}");
        }
    }
    println!(
        "edit round-trip: {edit_ok} files re-read equal after an edit · {edit_lines} lines changed in total ({} failed)",
        edit_bad.len()
    );

    for d in differing.iter().take(if verbose { usize::MAX } else { 15 }) {
        println!("  DIFF  {d}");
    }
    for e in edit_bad.iter().take(if verbose { usize::MAX } else { 15 }) {
        println!("  EDIT  {e}");
    }

    if verbose {
        println!("\nkeys seen:");
        let mut rows: Vec<_> = keys.iter().collect();
        rows.sort_by(|a, b| b.1.cmp(a.1));
        for (k, n) in rows {
            println!("  {n:6}  monster.{k}");
        }
    }

    if !differing.is_empty() || !edit_bad.is_empty() {
        std::process::exit(1);
    }
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect(&p, out);
        } else if p.extension().and_then(|s| s.to_str()) == Some("lua") {
            out.push(p);
        }
    }
}

fn rel(dir: &Path, p: &Path) -> String {
    p.strip_prefix(dir)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/")
}

fn changed_lines(a: &[u8], b: &[u8]) -> usize {
    let al: Vec<&[u8]> = a.split(|&c| c == b'\n').collect();
    let bl: Vec<&[u8]> = b.split(|&c| c == b'\n').collect();
    al.iter().zip(bl.iter()).filter(|(x, y)| x != y).count() + al.len().abs_diff(bl.len())
}

fn first_difference(a: &[u8], b: &[u8]) -> String {
    let at = a.iter().zip(b.iter()).position(|(x, y)| x != y).unwrap_or(a.len().min(b.len()));
    let line = a[..at.min(a.len())].iter().filter(|&&c| c == b'\n').count() + 1;
    let show = |s: &[u8]| {
        let start = at.saturating_sub(20);
        String::from_utf8_lossy(&s[start..(at + 30).min(s.len())])
            .replace('\n', "\\n")
            .replace('\t', "\\t")
    };
    format!("line {line}: expected …{}… got …{}…", show(a), show(b))
}
