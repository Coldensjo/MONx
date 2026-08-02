use super::*;

use std::ops::Range;

use quick_xml::events::Event;
use quick_xml::Reader;

/// One `key="value"` as written. The key keeps its original casing, which the
/// silent-data-loss lints depend on: `raceId` and `raceid` are different
/// attributes to the engine even though it compares most keys case-insensitively.
/// Values are entity-decoded; an untouched node is re-emitted from its raw span,
/// so nothing here has to round-trip the original text.
#[derive(Debug, Clone)]
pub struct Attr {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone)]
pub enum Child {
    Element(Node),
    Comment { text: String, span: Range<usize> },
    Text { span: Range<usize> },
}

#[derive(Debug, Clone)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<Attr>,
    pub children: Vec<Child>,
    /// Whole element, `<foo …>` through `</foo>` (or the self-closing tag),
    /// **plus** a same-line trailing comment when one is attached (§13 loot).
    pub span: Range<usize>,
    /// The element itself, without the absorbed trailing comment.
    pub element_span: Range<usize>,
    pub self_closed: bool,
    /// A `<!-- … -->` on the same line, immediately after this node.
    pub trailing_comment: Option<String>,
}

impl Node {
    /// Case-insensitive attribute lookup — the loader uses `strcasecmp` for
    /// keys nearly everywhere, and the corpus relies on it (`isBoss`).
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|a| a.key.eq_ignore_ascii_case(key))
            .map(|a| a.value.as_str())
    }

    /// Exact-case lookup, for the attributes where casing is load-bearing:
    /// `raceid`, `maxSummons`, `actionId` (§24 silent data loss).
    pub fn attr_exact(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|a| a.key == key)
            .map(|a| a.value.as_str())
    }

    pub fn has_attr_exact(&self, key: &str) -> bool {
        self.attrs.iter().any(|a| a.key == key)
    }

    pub(crate) fn num(&self, key: &str) -> Option<i64> {
        parse_num(self.attr(key)?)
    }

    pub(crate) fn num_exact(&self, key: &str) -> Option<i64> {
        parse_num(self.attr_exact(key)?)
    }

    pub(crate) fn bool_attr(&self, key: &str) -> Option<bool> {
        self.attr(key).map(|v| truthy(v))
    }

    /// `interval`, falling back to the legacy `speed` alias (§25).
    pub(crate) fn interval(&self) -> Option<i64> {
        self.num("interval").or_else(|| self.num("speed"))
    }

    pub fn elements(&self) -> impl Iterator<Item = &Node> {
        self.children.iter().filter_map(|c| match c {
            Child::Element(n) => Some(n),
            _ => None,
        })
    }

    pub(crate) fn child(&self, name: &str) -> Option<&Node> {
        self.elements().find(|n| n.name.eq_ignore_ascii_case(name))
    }
}

/// The engine treats any non-zero, non-"false" string as true; the corpus only
/// ever writes `0`/`1`.
pub(crate) fn truthy(v: &str) -> bool {
    let v = v.trim();
    !(v.is_empty() || v == "0" || v.eq_ignore_ascii_case("false"))
}

/// Lenient numeric parse matching pugixml's `as_int`: leading sign, digits,
/// stop at the first non-digit. `"12abc"` is 12, `"abc"` is None.
pub(crate) fn parse_num(v: &str) -> Option<i64> {
    let s = v.trim();
    let (neg, rest) = match s.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits
        .parse::<i64>()
        .ok()
        .map(|n| if neg { -n } else { n })
}

/// Text encoding declared by the XML prolog. Three corpus files are
/// `iso-8859-1`; decoding those as UTF-8 would mangle their bytes and break
/// round-trip, so they are decoded and re-encoded as latin-1.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Encoding {
    Utf8,
    Latin1,
}

impl Encoding {
    fn decode(self, bytes: &[u8]) -> String {
        match self {
            Encoding::Utf8 => String::from_utf8_lossy(bytes).into_owned(),
            Encoding::Latin1 => bytes.iter().map(|&b| b as char).collect(),
        }
    }

    pub(crate) fn encode(self, s: &str) -> Vec<u8> {
        match self {
            Encoding::Utf8 => s.as_bytes().to_vec(),
            Encoding::Latin1 => s
                .chars()
                .map(|c| if (c as u32) < 256 { c as u8 } else { b'?' })
                .collect(),
        }
    }
}

/// Everything about a file's physical layout that the writer has to reproduce.
#[derive(Debug, Clone)]
pub struct Layout {
    pub eol: Vec<u8>,
    /// One indent level, inferred from the first indented line: a tab for most
    /// of the corpus, four spaces for twelve files.
    pub indent: Vec<u8>,
    pub encoding: Encoding,
}

impl Default for Layout {
    fn default() -> Self {
        Layout {
            eol: b"\r\n".to_vec(),
            indent: b"\t".to_vec(),
            encoding: Encoding::Utf8,
        }
    }
}

/// A parsed file: the model, plus everything needed to write it back exactly.
/// The format-specific half of a parsed document. Everything above this — the
/// model, the lints, the editor — is shared across all six engines; only the
/// bytes are read and written two different ways.
pub enum Body {
    Xml {
        layout: Layout,
        root: Node,
        /// Byte offset of the root element's start, so the prolog can be copied.
        root_start: usize,
    },
    /// Canary and BlackTek. See `luadoc.rs` for the span model and
    /// `monster_lua.rs` for the field mapping.
    Lua(crate::luadoc::LuaDoc),
}

pub struct Parsed {
    pub doc: MonsterDoc,
    pub bytes: Vec<u8>,
    pub body: Body,
}

impl Parsed {
    /// The XML tree, or None for a Lua document. Callers that only make sense
    /// for XML — `lint_source`'s presence rules, chiefly — ask for it and do
    /// nothing when it is absent, rather than assuming.
    pub fn xml(&self) -> Option<(&Layout, &Node, usize)> {
        match &self.body {
            Body::Xml {
                layout,
                root,
                root_start,
            } => Some((layout, root, *root_start)),
            Body::Lua(_) => None,
        }
    }

    pub fn lua(&self) -> Option<&crate::luadoc::LuaDoc> {
        match &self.body {
            Body::Lua(d) => Some(d),
            Body::Xml { .. } => None,
        }
    }
}

// ---------- Tokenising ----------

pub(crate) fn detect_layout(bytes: &[u8]) -> Layout {
    let eol = if bytes.windows(2).any(|w| w == b"\r\n") {
        b"\r\n".to_vec()
    } else {
        b"\n".to_vec()
    };

    // First line that starts with whitespace tells us the indent unit.
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

    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(120)]).to_lowercase();
    let encoding = if head.contains("iso-8859-1") || head.contains("windows-1252") {
        Encoding::Latin1
    } else {
        Encoding::Utf8
    };

    Layout {
        eol,
        indent,
        encoding,
    }
}

/// Splits a start-tag's raw bytes into ordered attributes, keeping the quote
/// character and the undecoded value so an untouched node round-trips.
fn parse_attrs(raw: &[u8], enc: Encoding) -> Vec<Attr> {
    let mut out = Vec::new();
    let mut i = 0;
    // Skip the element name.
    while i < raw.len() && !raw[i].is_ascii_whitespace() {
        i += 1;
    }
    while i < raw.len() {
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        let key_start = i;
        while i < raw.len() && raw[i] != b'=' && !raw[i].is_ascii_whitespace() && raw[i] != b'/' {
            i += 1;
        }
        if i == key_start {
            break;
        }
        let key = enc.decode(&raw[key_start..i]);
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= raw.len() || raw[i] != b'=' {
            // Valueless attribute — not legal XML, but never drop what we read.
            out.push(Attr {
                key,
                value: String::new(),
            });
            continue;
        }
        i += 1;
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= raw.len() {
            break;
        }
        let quote = raw[i];
        let (quote, val_start) = if quote == b'"' || quote == b'\'' {
            (quote, i + 1)
        } else {
            (b'"', i)
        };
        i = val_start;
        while i < raw.len() && raw[i] != quote {
            i += 1;
        }
        let raw_value = &raw[val_start..i.min(raw.len())];
        i = (i + 1).min(raw.len());
        out.push(Attr {
            key,
            value: decode_entities(&enc.decode(raw_value)),
        });
    }
    out
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

pub(crate) fn encode_entities(s: &str, quote: u8) -> String {
    let mut out = s.replace('&', "&amp;").replace('<', "&lt;");
    if quote == b'"' {
        out = out.replace('"', "&quot;");
    } else {
        out = out.replace('\'', "&apos;");
    }
    out
}

/// Reads the whole file into a span-annotated DOM rooted at `<monster>`.
pub(crate) fn parse_dom(bytes: &[u8], layout: &Layout) -> Result<(Node, usize), String> {
    let mut reader = Reader::from_reader(bytes);
    reader.check_end_names(false);

    // Stack of (node under construction, start offset).
    let mut stack: Vec<Node> = Vec::new();
    let mut root: Option<Node> = None;
    let mut root_start = 0usize;
    let mut buf = Vec::new();
    let mut prev = 0usize;

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("malformed XML at byte {}: {e}", reader.buffer_position()))?;
        let end = reader.buffer_position();
        let span = prev..end;
        prev = end;

        match event {
            Event::Eof => break,
            Event::Start(ref e) | Event::Empty(ref e) => {
                let self_closed = matches!(event, Event::Empty(_));
                let raw = &bytes[span.start..span.end];
                // Strip `<` and the trailing `/>` or `>` before reading attrs.
                let inner_end = raw.len().saturating_sub(if self_closed { 2 } else { 1 });
                let inner = &raw[1.min(raw.len())..inner_end.max(1)];
                let node = Node {
                    name: layout.encoding.decode(e.name().as_ref()),
                    attrs: parse_attrs(inner, layout.encoding),
                    children: Vec::new(),
                    span: span.clone(),
                    element_span: span.clone(),
                    self_closed,
                    trailing_comment: None,
                };
                if stack.is_empty() && root.is_none() && node.name.eq_ignore_ascii_case("monster") {
                    root_start = span.start;
                }
                if self_closed {
                    push_child(&mut stack, &mut root, node);
                } else {
                    stack.push(node);
                }
            }
            Event::End(_) => {
                if let Some(mut node) = stack.pop() {
                    node.span.end = end;
                    node.element_span.end = end;
                    push_child(&mut stack, &mut root, node);
                }
            }
            Event::Comment(ref e) => {
                let text = layout.encoding.decode(e.as_ref());
                // A comment on the same line as the node just before it belongs
                // to that node — `<item … /> <!-- hand axe -->` in orc.xml.
                let absorbed = absorb_trailing_comment(&mut stack, &mut root, &text, &span, bytes);
                if !absorbed {
                    let child = Child::Comment { text, span };
                    match stack.last_mut() {
                        Some(parent) => parent.children.push(child),
                        None => {
                            if let Some(r) = root.as_mut() {
                                r.children.push(child)
                            }
                        }
                    }
                }
            }
            Event::Text(_) | Event::CData(_) => {
                let child = Child::Text { span };
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(child);
                }
            }
            // Declaration, DOCTYPE and PIs all sit in the prolog, which the
            // writer copies verbatim from `root_start`.
            _ => {}
        }
        buf.clear();
    }

    root.ok_or_else(|| "Missing monster node".to_string())
        .map(|r| (r, root_start))
}

fn push_child(stack: &mut Vec<Node>, root: &mut Option<Node>, node: Node) {
    match stack.last_mut() {
        Some(parent) => parent.children.push(Child::Element(node)),
        None => {
            if node.name.eq_ignore_ascii_case("monster") && root.is_none() {
                *root = Some(node);
            } else if let Some(r) = root.as_mut() {
                r.children.push(Child::Element(node));
            }
        }
    }
}

/// Attaches a comment to the element immediately before it when only spaces
/// separate the two. Returns true when it was absorbed.
fn absorb_trailing_comment(
    stack: &mut [Node],
    root: &mut Option<Node>,
    text: &str,
    span: &Range<usize>,
    bytes: &[u8],
) -> bool {
    let siblings = match stack.last_mut() {
        Some(parent) => &mut parent.children,
        None => match root.as_mut() {
            Some(r) => &mut r.children,
            None => return false,
        },
    };

    // Only whitespace-without-newline may sit between the node and the comment.
    let mut idx = siblings.len();
    while idx > 0 {
        match &siblings[idx - 1] {
            Child::Text { span: t } => {
                let gap = &bytes[t.start..t.end];
                if gap.contains(&b'\n') || !gap.iter().all(|b| b.is_ascii_whitespace()) {
                    return false;
                }
                idx -= 1;
            }
            Child::Element(_) => break,
            _ => return false,
        }
    }
    if idx == 0 {
        return false;
    }
    let Child::Element(node) = &mut siblings[idx - 1] else {
        return false;
    };
    if node.trailing_comment.is_some() {
        return false;
    }
    node.trailing_comment = Some(text.trim().to_string());
    node.span.end = span.end;
    // The whitespace between node and comment is now inside the node's span;
    // drop the sibling text entries so it isn't emitted twice.
    siblings.truncate(idx);
    true
}

