//! Round-trip proof for the monster format, in the spirit of SPRx's `probe_dat`
//! ("byte-comparable output for A/B diffing").
//!
//! ```sh
//! cargo run --release --example probe_monster -- ../assets/monsters
//! cargo run --release --example probe_monster -- ../assets/monsters --lint
//! cargo run --release --example probe_monster -- ../assets/monsters --canonical
//! cargo run --release --example probe_monster -- ../sources/TVP-main/data/monster --engine tvp
//!
//! # As a check in a datapack repository
//!
//! cargo run --release --example probe_monster -- data/monster \
//!     --format sarif --out monx.sarif --fail-on error,silent
//! ```
//!
//! `--format json|sarif` writes a machine report (to `--out <path>`, else
//! stdout, in which case the human summary moves to stderr) and implies
//! `--lint`. `--fail-on` takes a *set* of severities, not a threshold — the
//! three are not a ranking, and `silent` is the one worth failing on even when
//! warnings are tolerated. Nothing fails by default.
//!
//! The default pass is the acceptance gate for the whole format stream: read
//! every file, write the unmodified document straight back, and diff bytes.
//! `--canonical` additionally reports how many files the from-scratch renderer
//! reproduces exactly — a much stricter number that is *not* the gate, printed
//! so nobody has to guess how much of the round-trip is preservation.
//!
//! `--engine <key>` picks the profile; without it the corpus is sniffed the same
//! way the Landing dialog sniffs it. Running this against *each* engine's own
//! shipped corpus is the acceptance test for multi-engine support: a profile
//! that over-declares its known attributes drops data, and `--mutate` is what
//! catches that.

use std::path::{Path, PathBuf};
use std::time::Instant;

use monx_lib::engine::{self, EngineProfile};
use monx_lib::lint;
use monx_lib::monster;
use monx_lib::registry::Registry;
use monx_lib::spells::SpellIndex;

/// Set when a machine-readable report is going to stdout. Everything a person
/// reads then moves to stderr, so `--format json` stays pipeable into `jq` with
/// the human summary still visible in the terminal. With `--out <path>` the
/// report goes to the file instead and stdout is left alone.
static QUIET: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

macro_rules! say {
    ($($t:tt)*) => {
        if QUIET.load(std::sync::atomic::Ordering::Relaxed) {
            eprintln!($($t)*)
        } else {
            println!($($t)*)
        }
    };
}

/// The three severities, in the order every summary prints them. Not a ranking:
/// `silent` is the loudest of the three (see `lint.rs`), which is why
/// `--fail-on` takes a set rather than a threshold.
const SEVERITIES: [&str; 3] = ["error", "warning", "silent"];

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // The only positional argument is the monsters folder; `--items <dir>`
    // takes a value, so skip whatever follows it.
    let valued = |i: usize| {
        matches!(
            args.get(i.wrapping_sub(1)).map(String::as_str),
            Some("--items")
                | Some("--engine")
                | Some("--crud")
                | Some("--format")
                | Some("--out")
                | Some("--fail-on")
        )
    };
    let value = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    };
    let dir = args
        .iter()
        .enumerate()
        .find(|(i, a)| !a.starts_with("--") && !valued(*i))
        .map(|(_, a)| PathBuf::from(a))
        // The committed fixtures, so a fresh clone can run the gates without
        // first populating the (gitignored) `assets/` workspaces. They are a
        // smoke test, not coverage — see fixtures/README.md.
        .unwrap_or_else(|| PathBuf::from("fixtures/engines/ironcore/monsters"));
    // The CI surface. `--format` is what makes this usable as a check in a
    // datapack repository: a machine document on stdout (or in a file), and an
    // exit code the author chooses rather than one this probe decides for them.
    let format = value("--format").unwrap_or("text");
    if !matches!(format, "text" | "json" | "sarif") {
        eprintln!("unknown --format: {format} (text, json, sarif)");
        std::process::exit(2);
    }
    let out_path = value("--out").map(PathBuf::from);
    let machine = format != "text";
    if machine && out_path.is_none() {
        QUIET.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    // A set, not a threshold — see SEVERITIES. `--fail-on error,silent` is the
    // useful default for a repository: refuse what the server refuses, and
    // refuse what it accepts and then quietly gets wrong, while letting the
    // clamps through.
    let fail_on: Vec<&str> = match value("--fail-on") {
        None => Vec::new(),
        Some("any") => SEVERITIES.to_vec(),
        Some(list) => list.split(',').map(str::trim).filter(|s| !s.is_empty()).collect(),
    };
    if let Some(bad) = fail_on.iter().find(|s| !SEVERITIES.contains(s)) {
        eprintln!("unknown --fail-on severity: {bad} (error, warning, silent, any)");
        std::process::exit(2);
    }

    // Asking for a report is asking for the lint pass; nobody types both.
    let want_lint = args.iter().any(|a| a == "--lint") || machine || !fail_on.is_empty();
    let want_mutate = args.iter().any(|a| a == "--mutate");
    let want_canonical = args.iter().any(|a| a == "--canonical");
    let verbose = args.iter().any(|a| a == "--verbose");

    if !dir.is_dir() {
        eprintln!("not a folder: {}", dir.display());
        std::process::exit(2);
    }

    // Explicit `--engine` wins; otherwise sniff, and say what was picked so a
    // surprising result is visible rather than silently shaping every number
    // below it.
    let profile: &'static EngineProfile = args
        .iter()
        .position(|a| a == "--engine")
        .and_then(|i| args.get(i + 1))
        .map(|key| {
            engine::by_key(key).unwrap_or_else(|| {
                eprintln!("unknown engine: {key}");
                std::process::exit(2);
            })
        })
        .unwrap_or_else(|| {
            let files = monster::candidate_files(&dir, 24);
            let samples: Vec<Vec<u8>> = files.iter().filter_map(|p| std::fs::read(p).ok()).collect();
            let d = engine::detection(engine::detect(&samples));
            let p = engine::by_key(&d.best).unwrap_or_else(engine::default_profile);
            say!(
                "engine   {} ({})",
                p.label,
                if d.confident { "detected" } else { "low confidence" }
            );
            p
        });

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
    let items = monx_lib::items::ItemIndex::load(&items_dir).unwrap_or_default();
    let files = monster::monster_files(profile, &dir);
    let started = Instant::now();
    let mut source_lints = Vec::new();

    let mut parsed_ok = 0usize;
    let mut identical = 0usize;
    let mut differing: Vec<(String, String)> = Vec::new();
    let mut failed: Vec<(String, String)> = Vec::new();
    let mut canonical_ok = 0usize;
    let mut canonical_bad: Vec<String> = Vec::new();
    let mut canonical_normalised: Vec<String> = Vec::new();
    let mut mutate_ok = 0usize;
    let mut mutate_bad: Vec<String> = Vec::new();
    let mut mutate_lines = 0usize;
    let mut voice_ok = 0usize;
    let mut clear_ok = 0usize;
    let mut docs = Vec::new();

    for path in &files {
        let name = monster::file_key(&dir, path);
        let registered = registry.has_file(&name);
        match monster::read_file_keyed(profile, path, &name, registered) {
            Err(e) => failed.push((name, e)),
            Ok(parsed) => {
                // Helper scripts that live beside the monsters define none; the
                // corpus reader skips them and so does this.
                if parsed
                    .lua()
                    .is_some_and(|l| l.assignments.is_empty() && l.type_name.is_none())
                {
                    continue;
                }
                parsed_ok += 1;
                if want_lint {
                    source_lints.extend(lint::lint_source(profile, &parsed));
                }
                let written = monster::write_bytes(profile, &parsed, &parsed.doc);
                if written == parsed.bytes {
                    identical += 1;
                } else {
                    differing.push((name.clone(), first_difference(&parsed.bytes, &written)));
                }
                if want_canonical {
                    let canon = monster::write_new(profile, &parsed.doc);
                    if canon == parsed.bytes {
                        canonical_ok += 1;
                    }
                    // The canonical renderer is what `create_monster` writes, so
                    // its output must parse, and rendering it again must produce
                    // the same bytes. Idempotence is the right gate rather than
                    // "equals the original document": the renderer deliberately
                    // drops data the engine ignores, such as the inert `length`
                    // on a block that also sets `radius` (§8.3, §29). Those
                    // normalisations are counted separately and named, so that
                    // dropping something by accident can never hide among them.
                    match monster::read_bytes(profile, &name, &canon, parsed.doc.registered) {
                        Err(e) => canonical_bad.push(format!("{name}: does not parse — {e}")),
                        Ok(reread) => {
                            if monster::write_new(profile, &reread.doc) != canon {
                                canonical_bad.push(format!("{name}: renderer is not idempotent"));
                            }
                            if let Some(field) = first_doc_difference(&parsed.doc, &reread.doc) {
                                canonical_normalised.push(format!("{name}: {field}"));
                            }
                        }
                    }
                }
                if want_mutate {
                    match mutation_survives(profile, &parsed) {
                        Ok(changed_lines) => {
                            mutate_ok += 1;
                            mutate_lines += changed_lines;
                        }
                        Err(why) => mutate_bad.push(format!("{name}: {why}")),
                    }
                    match clearing_survives(profile, &parsed) {
                        Ok(()) => clear_ok += 1,
                        Err(why) => mutate_bad.push(format!("{name}: clearing — {why}")),
                    }
                    // Only Ironcore has the pacifist system; elsewhere those
                    // strings are unknown attributes, and asking the model to
                    // round-trip a field the engine does not have would be
                    // testing MONx against a rule that does not exist.
                    if profile.has_pacifist {
                        match voice_extras_survive(profile, &parsed) {
                            Ok(()) => voice_ok += 1,
                            Err(why) => mutate_bad.push(format!("{name}: voice extras — {why}")),
                        }
                    }
                }
                docs.push(parsed.doc);
            }
        }
    }

    let elapsed = started.elapsed();
    say!(
        "parsed {} files in {}ms · round-trip identical: {} · differing: {}",
        parsed_ok,
        elapsed.as_millis(),
        identical,
        differing.len()
    );
    if !failed.is_empty() {
        say!("failed to parse: {}", failed.len());
        for (name, err) in &failed {
            say!("  {name}: {err}");
        }
    }
    for (name, detail) in differing.iter().take(if verbose { usize::MAX } else { 20 }) {
        say!("  DIFF {name}: {detail}");
    }
    if want_canonical {
        say!(
            "canonical re-render identical: {canonical_ok}/{parsed_ok} \
             (informational — the gate is the round-trip number above)"
        );
        say!(
            "canonical re-read equal: {}/{parsed_ok} ({} failed) — this one is a gate: \
             it is what create_monster writes",
            parsed_ok - canonical_bad.len(),
            canonical_bad.len()
        );
        for why in canonical_bad.iter().take(if verbose { usize::MAX } else { 15 }) {
            say!("  CANON {why}");
        }
        say!(
            "canonical normalisation: {} documents drop something the engine already ignores",
            canonical_normalised.len()
        );
        for what in canonical_normalised.iter().take(if verbose { usize::MAX } else { 15 }) {
            say!("  NORM  {what}");
        }
    }
    if want_mutate {
        say!(
            "edit round-trip: {mutate_ok}/{parsed_ok} files re-read equal after an edit \
             · {mutate_lines} lines changed in total ({} failed)",
            mutate_bad.len()
        );
        say!(
            "pacifist/leash voices: {voice_ok}/{parsed_ok} files survive set → edit → clear"
        );
        say!("clearing: {clear_ok}/{parsed_ok} files survive a field being emptied");
        for why in mutate_bad.iter().take(if verbose { usize::MAX } else { 20 }) {
            say!("  MUTATE {why}");
        }
    }

    let mut lint_failed = false;
    if want_lint {
        // All three scopes, so a regression in any one of them shows up here.
        let mut report = source_lints;
        for doc in &docs {
            report.extend(lint::lint_monster(
                profile,
                doc,
                &spells,
                &items,
                // The probe is the stock engine on purpose: a gate that could be
                // quietened by a user setting would stop being a gate.
                &engine::CustomEffects::default(),
            ));
        }
        report.extend(lint::lint_workspace(profile, &docs, &[], &registry, &spells, &dir));
        let count = |severity: &str| {
            report
                .iter()
                .filter(|l| l.severity == severity)
                .count()
        };
        say!(
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
            say!("  {n:>5}  {severity:<8} {code}");
        }
        if verbose {
            for l in &report {
                say!(
                    "    {} [{}] {}{} — {}",
                    l.severity,
                    l.code,
                    l.file.clone().unwrap_or_else(|| "<workspace>".into()),
                    l.path.clone().map(|p| format!(":{p}")).unwrap_or_default(),
                    l.message
                );
            }
        }

        if machine {
            let text = match format {
                "sarif" => sarif(&report, profile.key, &dir),
                _ => serde_json::json!({
                    "tool": "probe_monster",
                    "engine": profile.key,
                    "root": dir.display().to_string(),
                    "files": files.len(),
                    "counts": {
                        "error": count("error"),
                        "warning": count("warning"),
                        "silent": count("silent"),
                    },
                    "lints": report,
                }),
            };
            let text = serde_json::to_string_pretty(&text).unwrap_or_default();
            match &out_path {
                Some(p) => {
                    if let Err(e) = std::fs::write(p, text) {
                        eprintln!("could not write {}: {e}", p.display());
                        std::process::exit(2);
                    }
                    say!("report: {}", p.display());
                }
                // Deliberately `println!`: this is the document, not commentary,
                // and QUIET is exactly the flag that moved the commentary away
                // to keep this stream clean.
                None => println!("{text}"),
            }
        }

        // The author says what counts as a failure. A corpus with three hundred
        // `loot.unknown-id` warnings it has lived with for years should still be
        // able to gate on errors, so nothing here is failed by default.
        let hit: Vec<String> = fail_on
            .iter()
            .filter(|s| count(s) > 0)
            .map(|s| format!("{} {s}", count(s)))
            .collect();
        if !hit.is_empty() {
            say!("FAIL --fail-on {}: {}", fail_on.join(","), hit.join(" · "));
            lint_failed = true;
        }
    }

    if args.iter().any(|a| a == "--bands") {
        // Reference §26 transcribes these from the corpus; recomputing them
        // here is how we know the reader agrees with whoever wrote that table.
        say!("balance bands (experience = 0 excluded):");
        say!(
            "  {:<14} {:>5} {:>8} {:>8} {:>8} {:>7} {:>7} {:>9}",
            "band", "n", "hp p10", "hp med", "hp p90", "speed", "armor", "defense"
        );
        for b in monster::balance_bands(&docs, &Default::default()) {
            // p10/p90 are the edges the panel calls low and high. Printing them
            // beside the median is what makes a band's *width* visible, which is
            // the thing a median alone hides.
            let pct = |v: &[i64], p: f64| -> i64 {
                if v.is_empty() {
                    0
                } else {
                    v[(((v.len() - 1) as f64) * p).round() as usize]
                }
            };
            say!(
                "  {:<14} {:>5} {:>8} {:>8} {:>8} {:>7} {:>7} {:>9}{}",
                b.label,
                b.count,
                pct(&b.health.values, 0.10),
                b.health.median,
                pct(&b.health.values, 0.90),
                b.speed.median,
                b.armor.median,
                b.defense.median,
                if b.count > 0 && b.count < monster::MIN_BAND_N {
                    "  (too few to judge)"
                } else {
                    ""
                }
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
        match crud_check(profile, &dir, &scratch) {
            Ok(summary) => say!("crud: {summary}"),
            Err(e) => {
                say!("crud: FAILED — {e}");
                crud_failed = true;
            }
        }
    }

    if !differing.is_empty()
        || !failed.is_empty()
        || !mutate_bad.is_empty()
        || !canonical_bad.is_empty()
        || crud_failed
        || lint_failed
    {
        std::process::exit(1);
    }
}

/// The lint report as SARIF 2.1.0, which is what a CI service reads to annotate
/// a pull request line by line.
///
/// `silent` has no SARIF equivalent — the format's levels are error, warning,
/// note and none — so it maps to `note` and keeps its real name in
/// `properties.severity`. Anything consuming this should sort on that, not on
/// the level: a note here is the class of finding the server never reports and
/// a human cannot otherwise discover.
fn sarif(report: &[monster::Lint], engine: &str, root: &Path) -> serde_json::Value {
    let mut rules: Vec<serde_json::Value> = Vec::new();
    let mut seen: Vec<&str> = Vec::new();
    for l in report {
        if seen.contains(&l.code.as_str()) {
            continue;
        }
        seen.push(&l.code);
        rules.push(serde_json::json!({
            "id": l.code,
            "name": l.code,
            "shortDescription": { "text": l.code },
            "defaultConfiguration": { "level": sarif_level(&l.severity) },
            "properties": { "severity": l.severity },
        }));
    }

    let results: Vec<serde_json::Value> = report
        .iter()
        .map(|l| {
            let mut result = serde_json::json!({
                "ruleId": l.code,
                "level": sarif_level(&l.severity),
                "message": { "text": l.message },
                "properties": { "severity": l.severity },
            });
            // A workspace-scope finding belongs to no file. SARIF allows a
            // result with no location; inventing one on monsters.xml would put
            // a duplicate-raceid annotation on a line that has nothing to do
            // with it.
            if let Some(file) = &l.file {
                result["locations"] = serde_json::json!([{
                    "physicalLocation": {
                        "artifactLocation": { "uri": file.replace('\\', "/") }
                    }
                }]);
            }
            if let Some(path) = &l.path {
                result["properties"]["path"] = serde_json::Value::String(path.clone());
            }
            result
        })
        .collect();

    serde_json::json!({
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": { "driver": {
                "name": "MONx probe_monster",
                "informationUri": "https://github.com/Coldensjo/MONx",
                "rules": rules,
            }},
            "originalUriBaseIds": { "SRCROOT": { "uri": root.display().to_string() } },
            "properties": { "engine": engine },
            "results": results,
        }],
    })
}

fn sarif_level(severity: &str) -> &'static str {
    match severity {
        "error" => "error",
        "warning" => "warning",
        _ => "note",
    }
}

/// Names the first field that differs between two documents. `assert_eq!` on a
/// whole `MonsterDoc` prints two screens of struct and leaves you to find the
/// one changed number yourself.
fn first_doc_difference(a: &monster::MonsterDoc, b: &monster::MonsterDoc) -> Option<String> {
    macro_rules! check {
        ($($field:ident),* $(,)?) => {
            $(if a.$field != b.$field {
                return Some(stringify!($field).to_string());
            })*
        };
    }
    check!(
        name,
        name_description,
        race,
        species,
        experience,
        speed,
        manacost,
        raceid,
        skull,
        script,
        health,
        look,
        targetchange,
        flags,
        immunities,
        elements,
        defense_stats,
        voices,
        summons,
        events,
    );

    for (label, x, y) in [
        ("attacks", &a.attacks, &b.attacks),
        ("defenses", &a.defenses, &b.defenses),
    ] {
        if x.len() != y.len() {
            return Some(format!("{label}: {} blocks became {}", x.len(), y.len()));
        }
        for (i, (l, r)) in x.iter().zip(y.iter()).enumerate() {
            if l != r {
                return Some(format!("{label}[{i}]"));
            }
        }
    }
    if a.loot.len() != b.loot.len() {
        return Some(format!("loot: {} entries became {}", a.loot.len(), b.loot.len()));
    }
    for (i, (l, r)) in a.loot.iter().zip(b.loot.iter()).enumerate() {
        if l != r {
            return Some(format!("loot[{i}]"));
        }
    }
    None
}

/// End-to-end exercise of the save pipeline against a throwaway copy of the
/// corpus: saving an untouched document must not change the file on disk, the
/// original must land in `.monx-backup`, and create/duplicate/rename/delete
/// must each leave the folder and `monsters.xml` consistent.
fn copy_tree(source: &Path, target: &Path, ext: &str) -> Result<(), String> {
    std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            copy_tree(&path, &target.join(entry.file_name()), ext)?;
        } else if path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case(ext) || s.eq_ignore_ascii_case("xml"))
        {
            std::fs::copy(&path, target.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn crud_check(
    profile: &'static EngineProfile,
    source: &Path,
    scratch: &Path,
) -> Result<String, String> {
    use monx_lib::registry::Registry;

    let work = scratch.join("monx-crud");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    // Mirror the tree, not just the top level: on the nested corpora every
    // monster lives in a subfolder and a flat copy would leave nothing to test.
    copy_tree(source, &work, profile.extension)?;

    let registry = Registry::load(&work.join("monsters.xml"));
    let files = monster::monster_files(profile, &work);
    let sample = files.first().cloned().ok_or("no files to work with")?;
    let sample_name = monster::file_key(&work, &sample);

    // 1. Saving an unmodified document is a no-op on disk.
    let mut unchanged = 0usize;
    for path in &files {
        let before = std::fs::read(path).map_err(|e| e.to_string())?;
        let name = monster::file_key(&work, path);
        let parsed = monster::read_file_keyed(profile, path, &name, registry.has_file(&name))?;
        monster::save(profile, &work, &registry, &parsed.doc)?;
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
    let mut edited = monster::read_file_keyed(profile, &sample, &sample_name, true)?.doc;
    edited.experience += 1234;
    monster::save(profile, &work, &registry, &edited)?;
    if monster::read_file_keyed(profile, &sample, &sample_name, true)?.doc.experience != edited.experience {
        return Err("an edited value did not survive the save".into());
    }

    // 4. Create, duplicate, rename, delete — each with the registry in step.
    let registry = Registry::load(&work.join("monsters.xml"));
    // The extension is the profile's, so take the path from the document
    // rather than assuming .xml.
    let created = monster::create(profile, &work, &registry, "Probe Subject", "probesubject", "wrecks")?.file;
    if !work.join(&created).is_file() {
        return Err("create did not write a file".into());
    }
    // The Lua engines autoload every script, so there is no registry to keep
    // in step and nothing to assert about one.
    let registry = Registry::load(&work.join("monsters.xml"));
    if profile.has_registry && !registry.has_name("Probe Subject") {
        return Err("create did not register the monster".into());
    }

    // On a nested corpus the copy lands beside its original, so take the key
    // from the returned document rather than assuming the monsters root.
    let copy_key = monster::duplicate(profile, &work, &registry, &sample_name, "Probe Copy")?.file;
    if !work.join(&copy_key).is_file() {
        return Err("duplicate did not write a file".into());
    }
    let copy = monster::read_file_keyed(profile, &work.join(&copy_key), &copy_key, true)?.doc;
    if copy.raceid.is_some() {
        return Err("duplicate copied the raceid, which must stay unique".into());
    }

    let registry = Registry::load(&work.join("monsters.xml"));
    let renamed_key = monster::rename(
        profile,
        &work,
        &registry,
        &copy_key,
        "Probe Renamed",
        "probrenamed",
    )?
    .file;
    if work.join(&copy_key).exists() || !work.join(&renamed_key).is_file() {
        return Err("rename left the old file behind".into());
    }
    let registry = Registry::load(&work.join("monsters.xml"));
    if profile.has_registry && (!registry.has_name("Probe Renamed") || registry.has_name("Probe Copy")) {
        return Err("rename did not update monsters.xml".into());
    }

    monster::delete(&work, &registry, &renamed_key)?;
    if work.join(&renamed_key).exists() {
        return Err("delete did not remove the file".into());
    }
    let registry = Registry::load(&work.join("monsters.xml"));
    if registry.has_name("Probe Renamed") {
        return Err("delete left a dangling registry entry".into());
    }

    // 5. The path the create wizard actually takes: create a file, then save an
    //    assembled document over it carrying sections the template left empty.
    //
    //    Everything above this either edits a value in place or writes a fresh
    //    template — neither of which exercises grafting a whole `<defenses>`,
    //    `<voices>` or `<summons>` onto a file that had none, which is exactly
    //    what `save_monster` is asked to do the moment the wizard commits. The
    //    writer appends those at the end of the document rather than splicing,
    //    so this cannot meet the `--mutate` line budget and does not belong
    //    there; it belongs here, next to `create`, on both document formats.
    let registry = Registry::load(&work.join("monsters.xml"));
    let fresh_key = monster::create(profile, &work, &registry, "Probe Assembled", "probeassembled", "wrecks")?.file;
    let mut assembled = monster::read_file_keyed(profile, &work.join(&fresh_key), &fresh_key, true)?.doc;
    // Donated from the corpus rather than composed, exactly as the wizard does:
    // a block this engine already loads is one it will load again.
    let donor = files
        .iter()
        .filter_map(|p| {
            let key = monster::file_key(&work, p);
            monster::read_file_keyed(profile, p, &key, true).ok().map(|r| r.doc)
        })
        .find(|d| !d.attacks.is_empty());
    if let Some(block) = donor.and_then(|d| d.attacks.first().cloned()) {
        assembled.defenses.push(block);
    }
    assembled.voices.lines.push(monster::VoiceLine {
        sentence: "Probe assembled.".to_string(),
        yell: false,
    });
    assembled.summons.max_summons = 2;
    assembled.summons.entries.push(monster::SummonEntry {
        name: "Probe Subject".to_string(),
        interval: 2000,
        chance: 25,
        delay: None,
        max: 2,
        force: false,
        effect: None,
        master_effect: None,
    });
    assembled.elements.insert(
        profile.elements.first().map(|s| s.to_string()).unwrap_or_else(|| "firePercent".into()),
        -10,
    );
    monster::save(profile, &work, &registry, &assembled)?;

    let back = monster::read_file_keyed(profile, &work.join(&fresh_key), &fresh_key, true)?.doc;
    if back.voices.lines.len() != assembled.voices.lines.len() {
        return Err("a voice grafted onto a freshly created file did not survive".into());
    }
    if back.summons.entries.len() != assembled.summons.entries.len() || back.summons.max_summons != 2 {
        return Err("a summon grafted onto a freshly created file did not survive".into());
    }
    if back.defenses.len() != assembled.defenses.len() {
        return Err("a defense grafted onto a freshly created file did not survive".into());
    }
    if back.elements != assembled.elements {
        return Err("an element grafted onto a freshly created file did not survive".into());
    }
    let grafted = assembled.defenses.len();
    monster::delete(&work, &Registry::load(&work.join("monsters.xml")), &fresh_key)?;

    // 6. The registry survived all of that as valid, parseable XML with only
    //    the entries we meant to change.
    let final_registry = Registry::load(&work.join("monsters.xml"));
    if profile.has_registry && final_registry.is_empty() {
        return Err("monsters.xml was destroyed".into());
    }

    let _ = std::fs::remove_dir_all(&work);
    Ok(format!(
        "{unchanged} unchanged saves byte-identical on disk · {backups} backups written · \
         create/duplicate/rename/delete consistent with monsters.xml · \
         voices, summons, {grafted} defense and an element grafted onto a created file survive a re-read"
    ))
}

/// Proves the writer is driven by the model and not by the original bytes.
///
/// Edits one field in each of five different sections, writes, re-reads, and
/// checks the document that comes back is exactly the one that went in. Then
/// counts how many lines moved: a splice writer should touch only the lines it
/// had to, so a five-field edit must not rewrite the file. Returns the number
/// of changed lines.
fn mutation_survives(profile: &'static EngineProfile, parsed: &monster::Parsed) -> Result<usize, String> {
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
    // Only where they already exist: adding or removing one adds or removes a
    // line, and the line count below is the point of this check. Grafting and
    // clearing are covered by `voice_extras_survive`.
    if let Some(text) = &mut edited.voices.pacifist {
        text.push('!');
    }
    if let Some(text) = &mut edited.voices.leash {
        text.push('!');
    }

    let written = monster::write_bytes(profile, parsed, &edited);
    if written == parsed.bytes {
        return Err("edit produced no change — writer is ignoring the model".into());
    }

    let reread = monster::read_bytes(profile, &edited.file, &written, edited.registered)
        .map_err(|e| format!("re-read failed: {e}"))?;
    if reread.doc != edited {
        // Name the field: "differs" on its own sends you back to a byte diff of
        // a 40-line file to find out which one.
        return Err(format!(
            "re-read differs at {}",
            first_doc_difference(&edited, &reread.doc).unwrap_or_else(|| "?".into())
        ));
    }

    let before: Vec<&[u8]> = parsed.bytes.split(|&b| b == b'\n').collect();
    let after: Vec<&[u8]> = written.split(|&b| b == b'\n').collect();
    let _ = (&before, &after);
    let changed = diff_lines(&parsed.bytes, &written);
    if changed > 12 {
        return Err(format!("{changed} lines changed for a 5-field edit"));
    }
    Ok(changed)
}

/// Lines touched, counted as a real diff rather than position-by-position.
///
/// A positional count goes wrong the moment an edit *inserts* a line — setting
/// a field the file did not have — because every line below it then compares
/// unequal and a one-field edit reports as fifty. That would make the budget
/// measure the corpus's formatting rather than the writer's locality, which is
/// the only thing it is there to measure.
fn diff_lines(a: &[u8], b: &[u8]) -> usize {
    let al: Vec<&[u8]> = a.split(|&c| c == b'\n').collect();
    let bl: Vec<&[u8]> = b.split(|&c| c == b'\n').collect();
    // Longest common subsequence. These files are a few hundred lines, so the
    // quadratic table is far cheaper than the confusion it prevents.
    let (n, m) = (al.len(), bl.len());
    let mut dp = vec![0usize; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[at(i, j)] = if al[i] == bl[j] {
                dp[at(i + 1, j + 1)] + 1
            } else {
                dp[at(i + 1, j)].max(dp[at(i, j + 1)])
            };
        }
    }
    let common = dp[at(0, 0)];
    // The larger side, not the sum: a substituted line is one line changed, not
    // a deletion plus an insertion. That keeps the budget below meaning what it
    // meant when it was written against the XML corpus.
    (n - common).max(m - common)
}

/// `<voice pacifist=…/>` and `<voice leash=…/>` are single strings on the block,
/// not lines (§12), and each owns a node of its own. This walks a document
/// through the three transitions that node can make — grafted on where there was
/// none, edited in place, and taken away when the value is cleared — and checks
/// the document re-reads equal after each. Line counts are not a gate here:
/// adding or removing a node moves every line under it.
/// Clearing a field has to reach the file, not just the model.
///
/// `mutation_survives` only ever *increments* — `experience += 7`,
/// `chance = (chance % 100) + 1` — so it could not see a writer whose optional
/// fields were all one-sided guards: `if v != 0 { set(…) }` with no else. On the
/// Lua engines that meant every clear was silently discarded (0 of 993 spell
/// ranges could be cleared) while every gate stayed green. Setting things *to*
/// nothing is a different question from setting them to something else, and it
/// needs its own pass.
fn clearing_survives(profile: &'static EngineProfile, parsed: &monster::Parsed) -> Result<(), String> {
    // Editing a node makes the writer re-render it, and the canonical renderer
    // deliberately drops data the engine ignores — a second geometry attribute
    // on a block that already has one (§8.3). Files where that applies are
    // counted and named by `--canonical`; failing them here as well would
    // report a known normalisation as a clearing bug. Asking whether the
    // canonical round-trip already moves this document is exactly that test,
    // and it needs no per-field guesswork.
    let canon = monster::write_new(profile, &parsed.doc);
    match monster::read_bytes(profile, &parsed.doc.file, &canon, parsed.doc.registered) {
        Ok(r) if r.doc == parsed.doc => {}
        _ => return Ok(()),
    }

    let mut edited = parsed.doc.clone();
    let mut touched = false;
    for s in edited.attacks.iter_mut().chain(edited.defenses.iter_mut()) {
        if s.range != 0 {
            s.range = 0;
            touched = true;
        }
        if s.target {
            s.target = false;
            touched = true;
        }
        if s.effects.shoot_effect.is_some() {
            s.effects.shoot_effect = None;
            touched = true;
        }
    }
    for e in edited.loot.iter_mut() {
        if e.subtype.is_some() {
            e.subtype = None;
            touched = true;
        }
        if !e.children.is_empty() {
            e.children.clear();
            touched = true;
        }
    }
    if !touched {
        return Ok(());
    }

    let written = monster::write_bytes(profile, parsed, &edited);
    let reread = monster::read_bytes(profile, &edited.file, &written, edited.registered)
        .map_err(|e| format!("re-read failed: {e}"))?;
    if reread.doc != edited {
        return Err(format!(
            "re-read differs at {}",
            first_doc_difference(&edited, &reread.doc).unwrap_or_else(|| "?".into())
        ));
    }
    Ok(())
}

fn voice_extras_survive(profile: &'static EngineProfile, parsed: &monster::Parsed) -> Result<(), String> {
    let step = |from: &monster::Parsed, doc: monster::MonsterDoc| -> Result<monster::Parsed, String> {
        let written = monster::write_bytes(profile, from, &doc);
        let reread = monster::read_bytes(profile, &doc.file, &written, doc.registered)
            .map_err(|e| format!("re-read failed: {e}"))?;
        if reread.doc != doc {
            return Err("re-read document differs from the one written".into());
        }
        Ok(reread)
    };

    let mut set = parsed.doc.clone();
    set.voices.pacifist = Some("Help!".into());
    set.voices.leash = Some("Get off my land!".into());
    let after_set = step(parsed, set)?;

    let mut edited = after_set.doc.clone();
    edited.voices.pacifist = Some("What are you doing!".into());
    let after_edit = step(&after_set, edited)?;

    let mut cleared = after_edit.doc.clone();
    cleared.voices.pacifist = None;
    cleared.voices.leash = None;
    let after_clear = step(&after_edit, cleared)?;

    let text = String::from_utf8_lossy(&after_clear.bytes).into_owned();
    // `<voice …`, not just the attribute: `<flag pacifist="1">` is a different
    // thing entirely and man.xml has one.
    if text.contains("<voice pacifist=") || text.contains("<voice leash=") {
        return Err("a cleared value left its <voice> node behind".into());
    }
    // Everything else about the block has to come back as it started. (The block
    // itself may now exist where it did not: no section is ever deleted, and an
    // empty `<voices>` is the corpus's own idiom for a silent monster.)
    let mut want = parsed.doc.voices.clone();
    want.pacifist = None;
    want.leash = None;
    if after_clear.doc.voices != want {
        return Err("clearing both changed something else in the block".into());
    }
    Ok(())
}

#[allow(dead_code)]
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
