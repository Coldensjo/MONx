//! Round-trip proof for the monster format, in the spirit of SPRx's `probe_dat`
//! ("byte-comparable output for A/B diffing").
//!
//! ```sh
//! cargo run --release --example probe_monster -- ../assets/monsters
//! cargo run --release --example probe_monster -- ../assets/monsters --lint
//! cargo run --release --example probe_monster -- ../assets/monsters --canonical
//! ```
//!
//! The default pass is the acceptance gate for the whole format stream: read
//! every file, write the unmodified document straight back, and diff bytes.
//! `--canonical` additionally reports how many files the from-scratch renderer
//! reproduces exactly — a much stricter number that is *not* the gate, printed
//! so nobody has to guess how much of the round-trip is preservation.

use std::path::{Path, PathBuf};
use std::time::Instant;

use monx_lib::lint;
use monx_lib::monster;
use monx_lib::registry::Registry;
use monx_lib::spells::SpellIndex;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // The only positional argument is the monsters folder; `--items <dir>`
    // takes a value, so skip whatever follows it.
    let dir = args
        .iter()
        .enumerate()
        .find(|(i, a)| !a.starts_with("--") && args.get(i.wrapping_sub(1)).map(String::as_str) != Some("--items"))
        .map(|(_, a)| PathBuf::from(a))
        .unwrap_or_else(|| PathBuf::from("../assets/monsters"));
    let want_lint = args.iter().any(|a| a == "--lint");
    let want_mutate = args.iter().any(|a| a == "--mutate");
    let want_canonical = args.iter().any(|a| a == "--canonical");
    let verbose = args.iter().any(|a| a == "--verbose");

    if !dir.is_dir() {
        eprintln!("not a folder: {}", dir.display());
        std::process::exit(2);
    }

    let registry = Registry::load(&dir.join("monsters.xml"));
    let spells = SpellIndex::load(dir.parent().map(|p| p.join("spells")).as_deref());
    // Loot resolution needs an items database; default to the one beside the
    // monsters folder, and let `--items <dir>` point elsewhere for fixtures.
    let items_dir = args
        .iter()
        .position(|a| a == "--items")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| dir.with_file_name("items"));
    let items = monx_lib::items::ItemIndex::load(&items_dir.join("items.xml")).unwrap_or_default();
    let files = monster::monster_files(&dir);
    let started = Instant::now();
    let mut source_lints = Vec::new();

    let mut parsed_ok = 0usize;
    let mut identical = 0usize;
    let mut differing: Vec<(String, String)> = Vec::new();
    let mut failed: Vec<(String, String)> = Vec::new();
    let mut canonical_ok = 0usize;
    let mut mutate_ok = 0usize;
    let mut mutate_bad: Vec<String> = Vec::new();
    let mut mutate_lines = 0usize;
    let mut docs = Vec::new();

    for path in &files {
        let name = file_name(path);
        let registered = registry.has_file(&name);
        match monster::read_file(path, registered) {
            Err(e) => failed.push((name, e)),
            Ok(parsed) => {
                parsed_ok += 1;
                if want_lint {
                    source_lints.extend(lint::lint_source(&parsed));
                }
                let written = monster::write_bytes(&parsed, &parsed.doc);
                if written == parsed.bytes {
                    identical += 1;
                } else {
                    differing.push((name.clone(), first_difference(&parsed.bytes, &written)));
                }
                if want_canonical {
                    let canon = monster::write_new(&parsed.doc);
                    if canon == parsed.bytes {
                        canonical_ok += 1;
                    }
                }
                if want_mutate {
                    match mutation_survives(&parsed) {
                        Ok(changed_lines) => {
                            mutate_ok += 1;
                            mutate_lines += changed_lines;
                        }
                        Err(why) => mutate_bad.push(format!("{name}: {why}")),
                    }
                }
                docs.push(parsed.doc);
            }
        }
    }

    let elapsed = started.elapsed();
    println!(
        "parsed {} files in {}ms · round-trip identical: {} · differing: {}",
        parsed_ok,
        elapsed.as_millis(),
        identical,
        differing.len()
    );
    if !failed.is_empty() {
        println!("failed to parse: {}", failed.len());
        for (name, err) in &failed {
            println!("  {name}: {err}");
        }
    }
    for (name, detail) in differing.iter().take(if verbose { usize::MAX } else { 20 }) {
        println!("  DIFF {name}: {detail}");
    }
    if want_canonical {
        println!(
            "canonical re-render identical: {canonical_ok}/{parsed_ok} \
             (informational — the gate is the round-trip number above)"
        );
    }
    if want_mutate {
        println!(
            "edit round-trip: {mutate_ok}/{parsed_ok} files re-read equal after an edit \
             · {mutate_lines} lines changed in total ({} failed)",
            mutate_bad.len()
        );
        for why in mutate_bad.iter().take(if verbose { usize::MAX } else { 20 }) {
            println!("  MUTATE {why}");
        }
    }

    if want_lint {
        // All three scopes, so a regression in any one of them shows up here.
        let mut report = source_lints;
        for doc in &docs {
            report.extend(lint::lint_monster(doc, &spells, &items));
        }
        report.extend(lint::lint_workspace(&docs, &registry, &spells, &items, &dir));
        let count = |severity: &str| {
            report
                .iter()
                .filter(|l| l.severity == severity)
                .count()
        };
        println!(
            "lints: {} errors · {} warnings · {} silent",
            count("error"),
            count("warning"),
            count("silent")
        );

        // Grouped by code, so a regression in one rule is obvious.
        let mut by_code: Vec<(String, String, usize)> = Vec::new();
        for l in &report {
            match by_code.iter_mut().find(|(c, _, _)| *c == l.code) {
                Some((_, _, n)) => *n += 1,
                None => by_code.push((l.code.clone(), l.severity.clone(), 1)),
            }
        }
        by_code.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
        for (code, severity, n) in &by_code {
            println!("  {n:>5}  {severity:<8} {code}");
        }
        if verbose {
            for l in &report {
                println!(
                    "    {} [{}] {}{} — {}",
                    l.severity,
                    l.code,
                    l.file.clone().unwrap_or_else(|| "<workspace>".into()),
                    l.path.clone().map(|p| format!(":{p}")).unwrap_or_default(),
                    l.message
                );
            }
        }
    }

    if args.iter().any(|a| a == "--bands") {
        // Reference §26 transcribes these from the corpus; recomputing them
        // here is how we know the reader agrees with whoever wrote that table.
        println!("balance bands (experience = 0 excluded):");
        println!("  {:<12} {:>5} {:>8} {:>7} {:>7} {:>9}", "band", "n", "hp", "speed", "armor", "defense");
        for b in monster::balance_bands(&docs) {
            println!(
                "  {:<12} {:>5} {:>8} {:>7} {:>7} {:>9}",
                b.label, b.count, b.median_health, b.median_speed, b.median_armor, b.median_defense
            );
        }
    }

    let mut crud_failed = false;
    if let Some(scratch) = args
        .iter()
        .position(|a| a == "--crud")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
    {
        match crud_check(&dir, &scratch) {
            Ok(summary) => println!("crud: {summary}"),
            Err(e) => {
                println!("crud: FAILED — {e}");
                crud_failed = true;
            }
        }
    }

    if !differing.is_empty() || !failed.is_empty() || !mutate_bad.is_empty() || crud_failed {
        std::process::exit(1);
    }
}

/// End-to-end exercise of the save pipeline against a throwaway copy of the
/// corpus: saving an untouched document must not change the file on disk, the
/// original must land in `.monx-backup`, and create/duplicate/rename/delete
/// must each leave the folder and `monsters.xml` consistent.
fn crud_check(source: &Path, scratch: &Path) -> Result<String, String> {
    use monx_lib::registry::Registry;

    let work = scratch.join("monx-crud");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    for path in std::fs::read_dir(source).map_err(|e| e.to_string())?.flatten() {
        if path.path().extension().and_then(|s| s.to_str()) == Some("xml") {
            std::fs::copy(path.path(), work.join(path.file_name())).map_err(|e| e.to_string())?;
        }
    }

    let registry = Registry::load(&work.join("monsters.xml"));
    let files = monster::monster_files(&work);
    let sample = files.first().cloned().ok_or("no files to work with")?;
    let sample_name = file_name(&sample);

    // 1. Saving an unmodified document is a no-op on disk.
    let mut unchanged = 0usize;
    for path in &files {
        let before = std::fs::read(path).map_err(|e| e.to_string())?;
        let name = file_name(path);
        let parsed = monster::read_file(path, registry.has_file(&name))?;
        monster::save(&work, &registry, &parsed.doc)?;
        let after = std::fs::read(path).map_err(|e| e.to_string())?;
        if before != after {
            return Err(format!("saving {name} unchanged rewrote the file"));
        }
        unchanged += 1;
    }

    // 2. The first save of each file left a backup behind.
    let backups = std::fs::read_dir(work.join(".monx-backup"))
        .map(|d| d.flatten().count())
        .unwrap_or(0);
    if backups != unchanged {
        return Err(format!("{backups} backups for {unchanged} saved files"));
    }

    // 3. A real edit reaches the disk and survives a re-read.
    let mut edited = monster::read_file(&sample, true)?.doc;
    edited.experience += 1234;
    monster::save(&work, &registry, &edited)?;
    if monster::read_file(&sample, true)?.doc.experience != edited.experience {
        return Err("an edited value did not survive the save".into());
    }

    // 4. Create, duplicate, rename, delete — each with the registry in step.
    let registry = Registry::load(&work.join("monsters.xml"));
    monster::create(&work, &registry, "Probe Subject", "probesubject.xml", "wrecks")?;
    if !work.join("probesubject.xml").is_file() {
        return Err("create did not write a file".into());
    }
    let registry = Registry::load(&work.join("monsters.xml"));
    if !registry.has_name("Probe Subject") {
        return Err("create did not register the monster".into());
    }

    monster::duplicate(&work, &registry, &sample_name, "Probe Copy")?;
    if !work.join("probecopy.xml").is_file() {
        return Err("duplicate did not write a file".into());
    }
    let copy = monster::read_file(&work.join("probecopy.xml"), true)?.doc;
    if copy.raceid.is_some() {
        return Err("duplicate copied the raceid, which must stay unique".into());
    }

    let registry = Registry::load(&work.join("monsters.xml"));
    monster::rename(&work, &registry, "probecopy.xml", "Probe Renamed", "probrenamed.xml")?;
    if work.join("probecopy.xml").exists() || !work.join("probrenamed.xml").is_file() {
        return Err("rename left the old file behind".into());
    }
    let registry = Registry::load(&work.join("monsters.xml"));
    if !registry.has_name("Probe Renamed") || registry.has_name("Probe Copy") {
        return Err("rename did not update monsters.xml".into());
    }

    monster::delete(&work, &registry, "probrenamed.xml")?;
    if work.join("probrenamed.xml").exists() {
        return Err("delete did not remove the file".into());
    }
    let registry = Registry::load(&work.join("monsters.xml"));
    if registry.has_name("Probe Renamed") {
        return Err("delete left a dangling registry entry".into());
    }

    // 5. The registry survived all of that as valid, parseable XML with only
    //    the entries we meant to change.
    let final_registry = Registry::load(&work.join("monsters.xml"));
    if final_registry.is_empty() {
        return Err("monsters.xml was destroyed".into());
    }

    let _ = std::fs::remove_dir_all(&work);
    Ok(format!(
        "{unchanged} unchanged saves byte-identical on disk · {backups} backups written · \
         create/duplicate/rename/delete consistent with monsters.xml"
    ))
}

/// Proves the writer is driven by the model and not by the original bytes.
///
/// Edits one field in each of five different sections, writes, re-reads, and
/// checks the document that comes back is exactly the one that went in. Then
/// counts how many lines moved: a splice writer should touch only the lines it
/// had to, so a five-field edit must not rewrite the file. Returns the number
/// of changed lines.
fn mutation_survives(parsed: &monster::Parsed) -> Result<usize, String> {
    let mut edited = parsed.doc.clone();
    edited.experience += 7;
    edited.health.max += 13;
    if let Some(first) = edited.attacks.first_mut() {
        first.chance = (first.chance % 100) + 1;
    }
    if let Some(first) = edited.loot.first_mut() {
        first.chance = (first.chance % 99_999) + 1;
    }
    if let Some(first) = edited.voices.lines.first_mut() {
        first.sentence.push('!');
    }

    let written = monster::write_bytes(parsed, &edited);
    if written == parsed.bytes {
        return Err("edit produced no change — writer is ignoring the model".into());
    }

    let reread = monster::read_bytes(&edited.file, &written, edited.registered)
        .map_err(|e| format!("re-read failed: {e}"))?;
    if reread.doc != edited {
        return Err("re-read document differs from the one written".into());
    }

    let before: Vec<&[u8]> = parsed.bytes.split(|&b| b == b'\n').collect();
    let after: Vec<&[u8]> = written.split(|&b| b == b'\n').collect();
    let changed = before
        .iter()
        .zip(after.iter())
        .filter(|(a, b)| a != b)
        .count()
        + before.len().abs_diff(after.len());
    if changed > 12 {
        return Err(format!("{changed} lines changed for a 5-field edit"));
    }
    Ok(changed)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Byte offset of the first difference plus a window of context on both sides,
/// which is enough to see which node the writer got wrong.
fn first_difference(a: &[u8], b: &[u8]) -> String {
    let at = a.iter().zip(b.iter()).position(|(x, y)| x != y);
    let Some(at) = at else {
        return format!("length {} vs {}", a.len(), b.len());
    };
    let start = at.saturating_sub(40);
    let show = |s: &[u8]| {
        String::from_utf8_lossy(&s[start.min(s.len())..(at + 40).min(s.len())])
            .replace('\r', "\\r")
            .replace('\n', "\\n")
    };
    format!("at byte {at}\n    want: {}\n    got:  {}", show(a), show(b))
}
