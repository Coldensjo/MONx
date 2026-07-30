//! Span-preserving Lua monster documents — the Lua half of what `monster.rs`
//! does for XML.
//!
//! Canary and BlackTek define monsters as Lua rather than XML: a file is
//! `Game.createMonsterType(name)`, a run of top-level `monster.KEY = VALUE`
//! assignments, and `mType:register(monster)`. The editing contract is the same
//! one the XML side keeps — **edit one field, rewrite one field** — so this
//! module records a byte span for every assignment and the writer splices,
//! copying everything it did not change out of the original bytes.
//!
//! # Why an assignment list and not a Lua parser
//!
//! Measured across both shipped corpora — 1,656 Canary files and 740 BlackTek
//! files — every one of the 48,208 `monster.KEY =` assignments starts at column
//! zero, and not one is nested inside anything. Files that contain real Lua
//! (Canary has ~45 with `if`/`for`, and some with trailing `mType.onSpawn =
//! function…` callbacks) carry it *after* the data, never inside it.
//!
//! So a document is three parts: a prologue, an ordered list of assignments,
//! and an epilogue. Anything this module cannot model — a value built by
//! concatenation, a callback, a comment between two assignments — falls into
//! one of the raw regions and survives untouched. That is the same bargain
//! `monster.rs` strikes with `<strategy>` and `<personalloot>`, and it is what
//! keeps an unrecognised construct from being data loss.
//!
//! # What is deliberately *not* here
//!
//! No evaluation. `monster.health = 100 + 50` is kept as `Raw("100 + 50")` and
//! reported, never folded to 150 — MONx does not decide what a value means when
//! the server would decide differently.

use std::ops::Range;

// =====================================================================
// Values
// =====================================================================

/// A Lua value as written. `Ident` and `Raw` are the escape hatches that keep
/// this honest: an identifier like `COMBAT_FIREDAMAGE` is a name the engine
/// resolves, and anything else unrecognised is preserved verbatim rather than
/// guessed at.
#[derive(Debug, Clone, PartialEq)]
pub enum LuaValue {
    Nil,
    Bool(bool),
    /// Kept as written (`-10`, `0.5`, `100`) so a round-trip cannot renormalise
    /// `1.0` into `1` or lose a sign.
    Num(String),
    /// Decoded contents; the quote style is restored from the span on write.
    Str(String),
    /// A bare identifier — `COMBAT_FIREDAMAGE`, `BESTY_RACE_AMPHIBIC`, `true`
    /// is handled above but constants are not.
    Ident(String),
    Table(LuaTable),
    /// An expression this module does not model: concatenation, arithmetic, a
    /// call. Held as source text and written back byte-for-byte.
    Raw(String),
}

impl LuaValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            LuaValue::Str(s) => Some(s),
            _ => None,
        }
    }

    /// A name, whether it was written as a string or a bare constant.
    pub fn as_name(&self) -> Option<&str> {
        match self {
            LuaValue::Str(s) | LuaValue::Ident(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            LuaValue::Num(n) => n
                .parse::<i64>()
                .ok()
                .or_else(|| n.parse::<f64>().ok().map(|f| f as i64)),
            LuaValue::Bool(b) => Some(i64::from(*b)),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            LuaValue::Bool(b) => Some(*b),
            // The corpora write `0`/`1` in a few places the loader coerces.
            LuaValue::Num(n) => Some(n != "0"),
            _ => None,
        }
    }

    pub fn as_table(&self) -> Option<&LuaTable> {
        match self {
            LuaValue::Table(t) => Some(t),
            _ => None,
        }
    }
}

/// A table constructor, keeping both halves in **file order** — round-trip
/// depends on it, and so does not reshuffling a hand-ordered loot list.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LuaTable {
    /// Positional entries: `{ 1, 2 }`, or a list of sub-tables.
    pub array: Vec<LuaValue>,
    /// `key = value` entries, in the order written.
    pub map: Vec<(String, LuaValue)>,
}

impl LuaTable {
    pub fn get(&self, key: &str) -> Option<&LuaValue> {
        self.map.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Case-insensitive lookup. Canary spells one key `Bestiary` and another
    /// `bosstiary`; the loaders are inconsistent enough that asking exactly is
    /// a bug waiting to happen — where casing *is* load-bearing, use `get`.
    pub fn get_ci(&self, key: &str) -> Option<&LuaValue> {
        self.map
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v)
    }

    pub fn num(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(LuaValue::as_i64)
    }

    pub fn boolean(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(LuaValue::as_bool)
    }

    pub fn string(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(LuaValue::as_str)
    }

    pub fn name(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(LuaValue::as_name)
    }

    pub fn table(&self, key: &str) -> Option<&LuaTable> {
        self.get(key).and_then(LuaValue::as_table)
    }

    pub fn has(&self, key: &str) -> bool {
        self.get(key).is_some()
    }
}

// =====================================================================
// Document
// =====================================================================

/// One `monster.KEY = VALUE` at the top level.
#[derive(Debug, Clone)]
pub struct Assignment {
    pub key: String,
    pub value: LuaValue,
    /// The value alone — what the writer replaces when only the value changed.
    pub value_span: Range<usize>,
    /// `monster.key = value`, from the `m` to the last byte of the value.
    pub span: Range<usize>,
}

/// Everything about a file's physical layout the writer has to reproduce.
#[derive(Debug, Clone)]
pub struct LuaLayout {
    pub eol: Vec<u8>,
    /// One indent level, inferred from the first indented line. Both corpora
    /// use a tab; a file that uses spaces keeps them.
    pub indent: Vec<u8>,
}

impl Default for LuaLayout {
    fn default() -> Self {
        LuaLayout {
            eol: b"\n".to_vec(),
            indent: b"\t".to_vec(),
        }
    }
}

/// A parsed Lua monster file: the assignments, plus the byte ranges around them
/// that are copied through untouched.
#[derive(Debug, Clone)]
pub struct LuaDoc {
    pub bytes: Vec<u8>,
    pub layout: LuaLayout,
    pub assignments: Vec<Assignment>,
    /// The name passed to `Game.createMonsterType("…")`, which is the monster's
    /// real name — `monster.name` is absent in most of the Canary corpus.
    pub type_name: Option<String>,
    /// Span of the string literal inside `createMonsterType(…)`, so a rename
    /// can splice it.
    pub type_name_span: Option<Range<usize>>,
}

impl LuaDoc {
    pub fn get(&self, key: &str) -> Option<&LuaValue> {
        self.assignments
            .iter()
            .find(|a| a.key == key)
            .map(|a| &a.value)
    }

    pub fn has(&self, key: &str) -> bool {
        self.assignments.iter().any(|a| a.key == key)
    }

    pub fn num(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(LuaValue::as_i64)
    }

    pub fn boolean(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(LuaValue::as_bool)
    }

    pub fn string(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(LuaValue::as_str)
    }

    pub fn table(&self, key: &str) -> Option<&LuaTable> {
        self.get(key).and_then(LuaValue::as_table)
    }
}

// =====================================================================
// Scanner
// =====================================================================

/// Byte scanner that knows where it is: inside a string, inside a comment, or
/// in code. Every brace-matching decision in this module goes through it,
/// because a `}` inside `"a } b"` is not a close and a corpus this size
/// certainly contains one.
struct Scan<'a> {
    b: &'a [u8],
}

impl<'a> Scan<'a> {
    fn new(b: &'a [u8]) -> Scan<'a> {
        Scan { b }
    }

    fn at(&self, i: usize) -> u8 {
        self.b.get(i).copied().unwrap_or(0)
    }

    fn starts(&self, i: usize, s: &[u8]) -> bool {
        self.b.len() >= i + s.len() && &self.b[i..i + s.len()] == s
    }

    /// A `[[`/`[=[` long bracket at `i`, returning its level.
    fn long_bracket(&self, i: usize) -> Option<usize> {
        if self.at(i) != b'[' {
            return None;
        }
        let mut j = i + 1;
        let mut level = 0;
        while self.at(j) == b'=' {
            level += 1;
            j += 1;
        }
        (self.at(j) == b'[').then_some(level)
    }

    /// Past the end of a long bracket that opens at `i`.
    fn skip_long(&self, i: usize, level: usize) -> usize {
        let mut close = Vec::with_capacity(level + 2);
        close.push(b']');
        close.extend(std::iter::repeat(b'=').take(level));
        close.push(b']');
        let mut j = i + level + 2;
        while j < self.b.len() {
            if self.starts(j, &close) {
                return j + close.len();
            }
            j += 1;
        }
        self.b.len()
    }

    /// Past the end of the comment starting at `i` (which must be `--`).
    fn skip_comment(&self, i: usize) -> usize {
        let after = i + 2;
        if let Some(level) = self.long_bracket(after) {
            return self.skip_long(after, level);
        }
        let mut j = after;
        while j < self.b.len() && self.b[j] != b'\n' {
            j += 1;
        }
        j
    }

    /// Past the end of the quoted string starting at `i`.
    fn skip_quoted(&self, i: usize) -> usize {
        let quote = self.b[i];
        let mut j = i + 1;
        while j < self.b.len() {
            match self.b[j] {
                b'\\' => j += 2,
                c if c == quote => return j + 1,
                b'\n' => return j, // unterminated; don't run off the file
                _ => j += 1,
            }
        }
        self.b.len()
    }

    /// Advances past whatever non-code construct starts at `i`, or returns None
    /// when `i` is ordinary code.
    fn skip_noncode(&self, i: usize) -> Option<usize> {
        if self.starts(i, b"--") {
            return Some(self.skip_comment(i));
        }
        if matches!(self.at(i), b'"' | b'\'') {
            return Some(self.skip_quoted(i));
        }
        if let Some(level) = self.long_bracket(i) {
            return Some(self.skip_long(i, level));
        }
        None
    }

    /// The byte just past the table constructor opening at `i` (`{`).
    fn skip_table(&self, i: usize) -> usize {
        debug_assert_eq!(self.at(i), b'{');
        let mut depth = 0usize;
        let mut j = i;
        while j < self.b.len() {
            if let Some(next) = self.skip_noncode(j) {
                j = next;
                continue;
            }
            match self.b[j] {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return j + 1;
                    }
                }
                _ => {}
            }
            j += 1;
        }
        self.b.len()
    }

    /// The end of a value that starts at `i` and is not a table: it runs to the
    /// end of the line, minus trailing whitespace and any trailing comment.
    fn skip_simple_value(&self, i: usize) -> usize {
        let mut j = i;
        let mut end = i;
        while j < self.b.len() && self.b[j] != b'\n' {
            if self.starts(j, b"--") {
                break;
            }
            if let Some(next) = self.skip_noncode(j) {
                j = next;
                end = j;
                continue;
            }
            j += 1;
            if !self.b[j - 1].is_ascii_whitespace() {
                end = j;
            }
        }
        end
    }
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

// =====================================================================
// Parsing
// =====================================================================

/// Reads a Lua monster file into its assignments. Never fails: a file this
/// module cannot make sense of parses as zero assignments and round-trips as
/// one raw region, which is the honest outcome — better a monster MONx declines
/// to model than one it half-understands.
pub fn parse(bytes: &[u8]) -> LuaDoc {
    let scan = Scan::new(bytes);
    let layout = detect_layout(bytes);
    let mut assignments = Vec::new();

    // Top level only: an assignment must start at column 0, which is true of
    // all 48,208 in the two shipped corpora and is what makes "is this the
    // monster table or something nested inside it" a question with an answer.
    let mut i = 0usize;
    let mut at_line_start = true;
    while i < bytes.len() {
        if let Some(next) = scan.skip_noncode(i) {
            at_line_start = false;
            i = next;
            continue;
        }
        if at_line_start && scan.starts(i, b"monster.") {
            if let Some(a) = parse_assignment(&scan, i) {
                i = a.span.end;
                assignments.push(a);
                at_line_start = false;
                continue;
            }
        }
        at_line_start = bytes[i] == b'\n';
        i += 1;
    }

    let (type_name, type_name_span) = parse_type_name(&scan);

    LuaDoc {
        bytes: bytes.to_vec(),
        layout,
        assignments,
        type_name,
        type_name_span,
    }
}

/// `Game.createMonsterType("Demon")` — the real name. Most of the Canary corpus
/// never sets `monster.name`, so this is the only place it appears.
fn parse_type_name(scan: &Scan) -> (Option<String>, Option<Range<usize>>) {
    let needle = b"createMonsterType(";
    let mut i = 0;
    while i + needle.len() < scan.b.len() {
        if scan.starts(i, needle) {
            let mut j = i + needle.len();
            while j < scan.b.len() && scan.b[j].is_ascii_whitespace() {
                j += 1;
            }
            if matches!(scan.at(j), b'"' | b'\'') {
                let end = scan.skip_quoted(j);
                let raw = &scan.b[j + 1..end.saturating_sub(1)];
                return (
                    Some(unescape(&String::from_utf8_lossy(raw))),
                    Some(j..end),
                );
            }
            return (None, None);
        }
        i += 1;
    }
    (None, None)
}

fn parse_assignment(scan: &Scan, start: usize) -> Option<Assignment> {
    let mut j = start + b"monster.".len();
    let key_start = j;
    while j < scan.b.len() && is_ident_byte(scan.at(j)) {
        j += 1;
    }
    if j == key_start {
        return None;
    }
    let key = String::from_utf8_lossy(&scan.b[key_start..j]).into_owned();

    while j < scan.b.len() && matches!(scan.at(j), b' ' | b'\t') {
        j += 1;
    }
    // `monster.foo.bar = …` and `monster.foo[1] = …` are not simple
    // assignments; leave them raw rather than model half of one.
    if scan.at(j) != b'=' || scan.at(j + 1) == b'=' {
        return None;
    }
    j += 1;
    while j < scan.b.len() && matches!(scan.at(j), b' ' | b'\t') {
        j += 1;
    }

    let value_start = j;
    let value_end = if scan.at(j) == b'{' {
        scan.skip_table(j)
    } else {
        scan.skip_simple_value(j)
    };
    if value_end <= value_start {
        return None;
    }

    let value = parse_value(scan, value_start..value_end);
    Some(Assignment {
        key,
        value,
        value_span: value_start..value_end,
        span: start..value_end,
    })
}

fn parse_value(scan: &Scan, span: Range<usize>) -> LuaValue {
    let text = String::from_utf8_lossy(&scan.b[span.clone()]).into_owned();
    let trimmed = text.trim();

    if scan.at(span.start) == b'{' {
        return LuaValue::Table(parse_table(scan, span));
    }
    match trimmed {
        "nil" => return LuaValue::Nil,
        "true" => return LuaValue::Bool(true),
        "false" => return LuaValue::Bool(false),
        _ => {}
    }
    if matches!(scan.at(span.start), b'"' | b'\'') {
        // Only a bare string literal counts; `"a" .. b` is an expression.
        if scan.skip_quoted(span.start) == span.end {
            let inner = &scan.b[span.start + 1..span.end - 1];
            return LuaValue::Str(unescape(&String::from_utf8_lossy(inner)));
        }
        return LuaValue::Raw(text);
    }
    if is_number(trimmed) {
        return LuaValue::Num(trimmed.to_string());
    }
    if !trimmed.is_empty() && trimmed.bytes().all(is_ident_byte) && !trimmed.as_bytes()[0].is_ascii_digit()
    {
        return LuaValue::Ident(trimmed.to_string());
    }
    LuaValue::Raw(text)
}

fn is_number(s: &str) -> bool {
    let t = s.strip_prefix('-').unwrap_or(s);
    !t.is_empty() && t.parse::<f64>().is_ok()
}

/// Splits a table constructor into its positional and keyed halves, in order.
fn parse_table(scan: &Scan, span: Range<usize>) -> LuaTable {
    let mut table = LuaTable::default();
    let inner_end = span.end.saturating_sub(1); // drop the closing brace
    let mut i = span.start + 1;

    while i < inner_end {
        // Skip separators and anything that is not an entry.
        while i < inner_end
            && (scan.b[i].is_ascii_whitespace() || scan.b[i] == b',' || scan.b[i] == b';')
        {
            i += 1;
        }
        if i >= inner_end {
            break;
        }
        if scan.starts(i, b"--") {
            i = scan.skip_comment(i);
            continue;
        }

        // `key = value`, `["key"] = value`, or a positional value.
        let key = read_entry_key(scan, &mut i, inner_end);
        let value_start = i;
        let value_end = entry_value_end(scan, value_start, inner_end);
        if value_end <= value_start {
            break;
        }
        let value = parse_value(scan, value_start..value_end);
        match key {
            Some(k) => table.map.push((k, value)),
            None => table.array.push(value),
        }
        i = value_end;
    }
    table
}

/// Consumes `key =` or `["key"] =` at `*i` and returns the key, leaving `*i` on
/// the value. Returns None (and does not move) for a positional entry.
fn read_entry_key(scan: &Scan, i: &mut usize, end: usize) -> Option<String> {
    let start = *i;
    let mut j = start;

    let key = if scan.at(j) == b'[' {
        j += 1;
        while j < end && scan.b[j].is_ascii_whitespace() {
            j += 1;
        }
        if !matches!(scan.at(j), b'"' | b'\'') {
            return None;
        }
        let q_end = scan.skip_quoted(j);
        let inner = &scan.b[j + 1..q_end.saturating_sub(1)];
        let k = unescape(&String::from_utf8_lossy(inner));
        j = q_end;
        while j < end && scan.b[j].is_ascii_whitespace() {
            j += 1;
        }
        if scan.at(j) != b']' {
            return None;
        }
        j += 1;
        k
    } else {
        let ks = j;
        while j < end && is_ident_byte(scan.at(j)) {
            j += 1;
        }
        if j == ks {
            return None;
        }
        String::from_utf8_lossy(&scan.b[ks..j]).into_owned()
    };

    while j < end && matches!(scan.at(j), b' ' | b'\t' | b'\n' | b'\r') {
        j += 1;
    }
    if scan.at(j) != b'=' || scan.at(j + 1) == b'=' {
        return None;
    }
    j += 1;
    while j < end && matches!(scan.at(j), b' ' | b'\t' | b'\n' | b'\r') {
        j += 1;
    }
    *i = j;
    Some(key)
}

/// The end of a table entry's value: a nested table runs to its matching brace,
/// anything else to the next top-level comma or the end of the table.
fn entry_value_end(scan: &Scan, start: usize, end: usize) -> usize {
    if scan.at(start) == b'{' {
        return scan.skip_table(start).min(end);
    }
    let mut j = start;
    let mut last = start;
    while j < end {
        if let Some(next) = scan.skip_noncode(j) {
            j = next;
            last = j;
            continue;
        }
        match scan.b[j] {
            b',' | b';' => break,
            b'}' => break,
            c if !c.is_ascii_whitespace() => {
                j += 1;
                last = j;
            }
            _ => j += 1,
        }
    }
    last
}

fn unescape(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

pub fn escape(s: &str, quote: char) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c if c == quote => {
                out.push('\\');
                out.push(c);
            }
            c => out.push(c),
        }
    }
    out
}

fn detect_layout(bytes: &[u8]) -> LuaLayout {
    let eol = if bytes.windows(2).any(|w| w == b"\r\n") {
        b"\r\n".to_vec()
    } else {
        b"\n".to_vec()
    };
    let mut indent = b"\t".to_vec();
    for line in bytes.split(|&b| b == b'\n') {
        let ws: Vec<u8> = line
            .iter()
            .copied()
            .take_while(|&b| b == b'\t' || b == b' ')
            .collect();
        if !ws.is_empty() && ws.len() < line.len() {
            indent = ws;
            break;
        }
    }
    LuaLayout { eol, indent }
}

// =====================================================================
// Rendering
// =====================================================================

/// Renders a value in the corpora's own style: tabs, one entry per line for a
/// table of tables, inline for a short flat one.
pub fn render(value: &LuaValue, layout: &LuaLayout, depth: usize) -> String {
    render_like(value, layout, depth, None)
}

/// Renders with the shape of the entry being replaced: an entry the file wrote
/// on one line comes back on one line, however many fields it has. Without
/// this, re-rendering a five-field spell that was inline explodes it to seven
/// lines and the diff stops being about what changed.
pub fn render_like(
    value: &LuaValue,
    layout: &LuaLayout,
    depth: usize,
    inline: Option<bool>,
) -> String {
    match value {
        LuaValue::Nil => "nil".to_string(),
        LuaValue::Bool(b) => b.to_string(),
        LuaValue::Num(n) => n.clone(),
        LuaValue::Str(s) => format!("\"{}\"", escape(s, '"')),
        LuaValue::Ident(s) => s.clone(),
        LuaValue::Raw(s) => s.clone(),
        LuaValue::Table(t) => render_table(t, layout, depth, inline),
    }
}

fn render_table(t: &LuaTable, layout: &LuaLayout, depth: usize, inline: Option<bool>) -> String {
    if t.array.is_empty() && t.map.is_empty() {
        return "{}".to_string();
    }
    let eol = String::from_utf8_lossy(&layout.eol).into_owned();
    let unit = String::from_utf8_lossy(&layout.indent).into_owned();
    let pad = unit.repeat(depth + 1);
    let close_pad = unit.repeat(depth);

    // A flat keyed table with no nesting reads better on one line — that is how
    // both corpora write `{ interval = 5000, chance = 8 }` and an entry inside
    // a list. Anything containing a table gets a line each.
    let nested = t
        .array
        .iter()
        .chain(t.map.iter().map(|(_, v)| v))
        .any(|v| matches!(v, LuaValue::Table(_)));

    let mut parts: Vec<String> = Vec::new();
    for v in &t.array {
        parts.push(render(v, layout, depth + 1));
    }
    for (k, v) in &t.map {
        parts.push(format!("{k} = {}", render(v, layout, depth + 1)));
    }

    let one_line = inline.unwrap_or(!nested && parts.len() <= 4 && parts.iter().all(|p| p.len() < 40));
    if one_line && !nested {
        return format!("{{ {} }}", parts.join(", "));
    }
    let body = parts
        .iter()
        .map(|p| format!("{pad}{p},"))
        .collect::<Vec<_>>()
        .join(&eol);
    format!("{{{eol}{body}{eol}{close_pad}}}")
}

/// One entry of a table constructor, with the span it occupies. Only the writer
/// needs these; the model keeps `LuaTable` free of byte offsets so two tables
/// can be compared for equality without their positions mattering.
struct EntrySpan {
    key: Option<String>,
    /// The whole entry, `key = value` included, without its separator.
    span: Range<usize>,
}

/// Re-walks a table constructor in the original bytes, recording where each
/// entry sits.
fn entry_spans(scan: &Scan, span: Range<usize>) -> Vec<EntrySpan> {
    let mut out = Vec::new();
    let inner_end = span.end.saturating_sub(1);
    let mut i = span.start + 1;

    while i < inner_end {
        while i < inner_end
            && (scan.b[i].is_ascii_whitespace() || scan.b[i] == b',' || scan.b[i] == b';')
        {
            i += 1;
        }
        if i >= inner_end {
            break;
        }
        if scan.starts(i, b"--") {
            i = scan.skip_comment(i);
            continue;
        }
        let entry_start = i;
        let key = read_entry_key(scan, &mut i, inner_end);
        let value_end = entry_value_end(scan, i, inner_end);
        if value_end <= i {
            break;
        }
        out.push(EntrySpan {
            key,
            span: entry_start..value_end,
        });
        i = value_end;
    }
    out
}

/// Rewrites one table constructor in place, entry by entry.
///
/// This is what makes "edit one field, rewrite one field" true for Lua as well
/// as XML: changing a single loot entry's chance would otherwise re-render the
/// whole `monster.loot` table, which on a boss is eighty lines. Entries that
/// compare equal are copied out of the original bytes with their own spacing
/// and comments; only the ones that differ are rendered afresh.
///
/// Falls back to rendering the whole table when the shape changed enough that
/// entry-by-entry matching would be guessing — a different number of keyed
/// entries, or a key that moved.
fn splice_table(
    src: &[u8],
    span: Range<usize>,
    base: &LuaTable,
    new: &LuaTable,
    layout: &LuaLayout,
    depth: usize,
) -> Option<Vec<u8>> {
    let scan = Scan::new(src);
    let spans = entry_spans(&scan, span.clone());

    // The parsed halves have to line up with the spans, or the mapping between
    // them is a guess. `map` entries carry a key, `array` entries do not.
    let keyed: Vec<&EntrySpan> = spans.iter().filter(|e| e.key.is_some()).collect();
    let positional: Vec<&EntrySpan> = spans.iter().filter(|e| e.key.is_none()).collect();
    if keyed.len() != base.map.len() || positional.len() != base.array.len() {
        return None;
    }
    // Only same-shape edits can be spliced; anything else re-renders.
    if new.map.len() != base.map.len() || new.array.len() != base.array.len() {
        return None;
    }
    for (i, (k, _)) in new.map.iter().enumerate() {
        if base.map[i].0 != *k {
            return None;
        }
    }

    let mut replacements: Vec<(Range<usize>, String)> = Vec::new();
    let mut ki = 0usize;
    let mut ai = 0usize;
    for e in &spans {
        match &e.key {
            Some(k) => {
                if base.map[ki].1 != new.map[ki].1 {
                    let rendered = match (&base.map[ki].1, &new.map[ki].1) {
                        (LuaValue::Table(b), LuaValue::Table(n)) => {
                            // Recurse so a nested change stays local too.
                            let vspan = value_span_of(&scan, e.span.clone());
                            splice_table(src, vspan.clone(), b, n, layout, depth + 1)
                                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                                .map(|v| format!("{k} = {v}"))
                        }
                        _ => None,
                    }
                    .unwrap_or_else(|| {
                        let inline = Some(!src[e.span.clone()].contains(&b'\n'));
                        format!(
                            "{k} = {}",
                            render_like(&new.map[ki].1, layout, depth + 1, inline)
                        )
                    });
                    replacements.push((e.span.clone(), rendered));
                }
                ki += 1;
            }
            None => {
                if base.array[ai] != new.array[ai] {
                    let rendered = match (&base.array[ai], &new.array[ai]) {
                        (LuaValue::Table(b), LuaValue::Table(n)) => {
                            splice_table(src, e.span.clone(), b, n, layout, depth + 1)
                                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                        }
                        _ => None,
                    }
                    .unwrap_or_else(|| {
                        // An entry the file wrote on one line comes back on one line.
                        let inline = Some(!src[e.span.clone()].contains(&b'\n'));
                        render_like(&new.array[ai], layout, depth + 1, inline)
                    });
                    replacements.push((e.span.clone(), rendered));
                }
                ai += 1;
            }
        }
    }

    let mut out = Vec::with_capacity(span.len() + 64);
    let mut cursor = span.start;
    for (r, text) in replacements {
        out.extend_from_slice(&src[cursor..r.start]);
        out.extend_from_slice(text.as_bytes());
        cursor = r.end;
    }
    out.extend_from_slice(&src[cursor..span.end]);
    Some(out)
}

/// The value half of a `key = value` entry span.
fn value_span_of(scan: &Scan, entry: Range<usize>) -> Range<usize> {
    let mut i = entry.start;
    match read_entry_key(scan, &mut i, entry.end) {
        Some(_) => i..entry.end,
        None => entry,
    }
}

/// Writes `doc` back over the bytes it was read from, splicing: every
/// assignment whose value is unchanged is copied byte-for-byte, and only the
/// ones that differ are re-rendered. Assignments in `edits` that the file did
/// not have are appended after the last one; a key set to None is removed with
/// its line.
///
/// `edits` is keyed by assignment name and holds the *new* value, so the caller
/// (the monster reader/writer in `monster.rs`) decides what changed and this
/// module only decides where the bytes go.
pub fn write_with(doc: &LuaDoc, edits: &[(String, Option<LuaValue>)]) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::with_capacity(doc.bytes.len() + 256);
    let eol = &doc.layout.eol;
    let mut cursor = 0usize;

    let find = |key: &str| edits.iter().find(|(k, _)| k == key).map(|(_, v)| v);

    for a in &doc.assignments {
        out.extend_from_slice(&doc.bytes[cursor..a.span.start]);
        match find(&a.key) {
            // Untouched: copy the original bytes, comments and spacing included.
            None => out.extend_from_slice(&doc.bytes[a.span.clone()]),
            Some(None) => {
                // Removed. Take the indentation already written back off, and
                // swallow the line's own newline so no blank line is left.
                let keep = out
                    .iter()
                    .rposition(|b| *b == b'\n')
                    .map_or(0, |i| i + 1);
                out.truncate(keep);
                cursor = a.span.end;
                if doc.bytes[cursor..].starts_with(b"\r\n") {
                    cursor += 2;
                } else if doc.bytes.get(cursor) == Some(&b'\n') {
                    cursor += 1;
                }
                continue;
            }
            Some(Some(v)) if *v == a.value => {
                out.extend_from_slice(&doc.bytes[a.span.clone()])
            }
            // A changed table is spliced entry by entry where the shape allows
            // it, so editing one loot line rewrites one loot line rather than
            // the whole eighty-line table.
            Some(Some(v)) => {
                let spliced = match (&a.value, v) {
                    (LuaValue::Table(base), LuaValue::Table(next)) => splice_table(
                        &doc.bytes,
                        a.value_span.clone(),
                        base,
                        next,
                        &doc.layout,
                        0,
                    ),
                    _ => None,
                };
                match spliced {
                    Some(bytes) => {
                        out.extend_from_slice(&doc.bytes[a.span.start..a.value_span.start]);
                        out.extend_from_slice(&bytes);
                    }
                    None => {
                        out.extend_from_slice(format!("monster.{} = ", a.key).as_bytes());
                        out.extend_from_slice(render(v, &doc.layout, 0).as_bytes());
                    }
                }
            }
        }
        cursor = a.span.end;
    }
    out.extend_from_slice(&doc.bytes[cursor..]);

    // Keys the model gained that the file never had. They go in after the last
    // existing assignment rather than at the end of the file, which would put
    // them below `mType:register(monster)` where the server would never see them.
    let added: Vec<&(String, Option<LuaValue>)> = edits
        .iter()
        .filter(|(k, v)| v.is_some() && !doc.has(k))
        .collect();
    if added.is_empty() {
        return out;
    }
    let anchor = match doc.assignments.last() {
        Some(a) => a.span.end,
        None => return out,
    };
    // Recompute the tail offset in `out`, which may have shifted.
    let shift = out.len() as i64 - doc.bytes.len() as i64;
    let at = (anchor as i64 + shift).max(0) as usize;
    let at = at.min(out.len());

    let mut insert: Vec<u8> = Vec::new();
    for (k, v) in added {
        let Some(v) = v else { continue };
        insert.extend_from_slice(eol);
        insert.extend_from_slice(format!("monster.{k} = ").as_bytes());
        insert.extend_from_slice(render(v, &doc.layout, 0).as_bytes());
    }
    let mut result = Vec::with_capacity(out.len() + insert.len());
    result.extend_from_slice(&out[..at]);
    result.extend_from_slice(&insert);
    result.extend_from_slice(&out[at..]);
    result
}

/// Renders a whole document from nothing, for `create_monster`.
pub fn write_new(name: &str, entries: &[(String, LuaValue)], layout: &LuaLayout) -> Vec<u8> {
    let eol = String::from_utf8_lossy(&layout.eol).into_owned();
    let mut s = String::new();
    s.push_str(&format!(
        "local mType = Game.createMonsterType(\"{}\"){eol}local monster = {{}}{eol}{eol}",
        escape(name, '"')
    ));
    for (k, v) in entries {
        s.push_str(&format!("monster.{k} = {}{eol}", render(v, layout, 0)));
    }
    s.push_str(&format!("{eol}mType:register(monster){eol}"));
    s.into_bytes()
}
