//! `data/monster/monsters.xml` — the registry that decides which files the
//! server can actually see (reference §1).
//!
//! A `.xml` in the folder that isn't listed here is completely inert, which is
//! why "orphan file" and "entry pointing at a missing file" are two distinct
//! lints and not one. Names are lower-cased on load and are the lookup key;
//! the file's own casing is preserved on write.
//!
//! The registry is also comment-structured — `<!-- bosses -->`, `<!-- spells
//! -->`, `<!-- ironcore monsters -->`, `<!-- rare spawns -->`, `<!-- original
//! -->` — and those groups populate the new-monster dialog's Group dropdown.
//! One entry in the live file is itself commented out; a comment is never an
//! entry.

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    /// Name as written in the file.
    pub name: String,
    /// File name as written, e.g. "demon.xml".
    pub file: String,
    /// The `<!-- … -->` group heading this entry sits under, if any.
    pub group: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Registry {
    pub entries: Vec<RegistryEntry>,
    /// Byte range of each entry's `<monster … />` tag, parallel to `entries`.
    ///
    /// Editing used to work by searching the whole document for
    /// `file="demon.xml"` and taking the first hit. That finds a commented-out
    /// entry naming the same file before the live one, and the rename fallback
    /// used `String::replace`, which rewrites *every* occurrence — so renaming
    /// one of two entries that share a name rewrote both. A span is the entry;
    /// a substring is a guess.
    spans: Vec<(usize, usize)>,
    /// Group headings in file order, for the new-monster dialog.
    pub groups: Vec<String>,
    /// Raw bytes, so `add`/`rename` can splice rather than reformat.
    pub bytes: Vec<u8>,
    pub present: bool,
}

/// `&`, `<` and `"` in a name would produce XML the server's parser rejects —
/// and MONx's own parser would then read the file as having fewer entries,
/// reporting every monster below the broken line as an orphan. Names come
/// straight from the new-monster and rename dialogs, so this is reachable
/// without anyone hand-editing anything.
fn escape_attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

impl Registry {
    pub fn load(monsters_xml: &Path) -> Registry {
        let Ok(bytes) = std::fs::read(monsters_xml) else {
            return Registry::default();
        };
        let mut reg = parse(&bytes);
        reg.bytes = bytes;
        reg.present = true;
        reg
    }

    /// Case-insensitive: `monsters.xml` lower-cases names on load (§1).
    pub fn has_name(&self, name: &str) -> bool {
        self.entries
            .iter()
            .any(|e| e.name.eq_ignore_ascii_case(name))
    }

    pub fn has_file(&self, file: &str) -> bool {
        self.entries
            .iter()
            .any(|e| e.file.eq_ignore_ascii_case(file))
    }

    pub fn entry_for_file(&self, file: &str) -> Option<&RegistryEntry> {
        self.index_for_file(file).map(|i| &self.entries[i])
    }

    fn index_for_file(&self, file: &str) -> Option<usize> {
        self.entries
            .iter()
            .position(|e| e.file.eq_ignore_ascii_case(file))
    }

    /// The whole line an entry sits on, as a byte range including its newline.
    fn line_span(&self, text: &str, index: usize) -> Option<(usize, usize)> {
        let (start, end) = *self.spans.get(index)?;
        if end > text.len() {
            return None;
        }
        let line_start = text[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
        // Only swallow the leading whitespace if nothing else shares the line.
        let start = if text[line_start..start].trim().is_empty() {
            line_start
        } else {
            start
        };
        let line_end = text[end..]
            .find('\n')
            .map(|i| end + i + 1)
            .unwrap_or(text.len());
        let end = if text[end..line_end].trim().is_empty() {
            line_end
        } else {
            end
        };
        Some((start, end))
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Inserts an entry at the end of `group`, or at the end of the document
    /// when the group is unknown. Returns the new file bytes.
    pub fn with_added(&self, name: &str, file: &str, group: Option<&str>) -> Vec<u8> {
        let text = String::from_utf8_lossy(&self.bytes).into_owned();
        let entry_line = format!(
            "<monster name=\"{}\" file=\"{}\" />",
            escape_attr(name),
            escape_attr(file)
        );

        // Insert after the last entry of the requested group, so the file's
        // comment structure keeps its meaning.
        let anchor = group.and_then(|g| {
            self.entries
                .iter()
                .rposition(|e| e.group.as_deref() == Some(g))
                .and_then(|i| self.line_span(&text, i))
                .map(|(_, end)| end)
        });

        let (indent, eol) = self.style(&text);
        match anchor {
            Some(pos) => {
                let mut out = String::with_capacity(text.len() + entry_line.len() + 4);
                out.push_str(&text[..pos]);
                out.push_str(&indent);
                out.push_str(&entry_line);
                out.push_str(&eol);
                out.push_str(&text[pos..]);
                out.into_bytes()
            }
            None => {
                let close = text.rfind("</monsters>").unwrap_or(text.len());
                let mut out = String::with_capacity(text.len() + entry_line.len() + 4);
                out.push_str(&text[..close]);
                out.push_str(&indent);
                out.push_str(&entry_line);
                out.push_str(&eol);
                out.push_str(&text[close..]);
                out.into_bytes()
            }
        }
    }

    /// Rewrites the entry pointing at `file` with a new name and file name.
    /// Only the two attribute values are touched — the surrounding line, its
    /// indentation and any trailing comment stay as they are.
    pub fn with_renamed(&self, file: &str, new_name: &str, new_file: &str) -> Vec<u8> {
        let text = String::from_utf8_lossy(&self.bytes).into_owned();
        let Some(index) = self.index_for_file(file) else {
            return self.bytes.clone();
        };
        let Some(&(start, end)) = self.spans.get(index) else {
            return self.bytes.clone();
        };
        if end > text.len() {
            return self.bytes.clone();
        }
        // Rewrite the two attribute values *inside this tag only*. Any other
        // attribute, the spacing and any trailing comment stay exactly as they
        // are, and no other line in the document is touched.
        let tag = replace_attr(
            &replace_attr(&text[start..end], "name", &escape_attr(new_name)),
            "file",
            &escape_attr(new_file),
        );
        let mut out = String::with_capacity(text.len());
        out.push_str(&text[..start]);
        out.push_str(&tag);
        out.push_str(&text[end..]);
        out.into_bytes()
    }

    /// Removes the entry pointing at `file`, and the whole line it sits on.
    pub fn with_removed(&self, file: &str) -> Vec<u8> {
        let text = String::from_utf8_lossy(&self.bytes).into_owned();
        let Some(index) = self.index_for_file(file) else {
            return self.bytes.clone();
        };
        let Some((start, end)) = self.line_span(&text, index) else {
            return self.bytes.clone();
        };
        let mut out = String::with_capacity(text.len());
        out.push_str(&text[..start]);
        out.push_str(&text[end..]);
        out.into_bytes()
    }

    /// Indentation and line ending used by the entries already in the file.
    fn style(&self, text: &str) -> (String, String) {
        let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
        let indent = text
            .lines()
            .find(|l| l.trim_start().starts_with("<monster "))
            .map(|l| l[..l.len() - l.trim_start().len()].to_string())
            .unwrap_or_else(|| "\t".to_string());
        (indent, eol.to_string())
    }
}

/// Replaces one attribute's value within a single tag, leaving everything else
/// alone. Returns the tag unchanged when the attribute is not on it.
fn replace_attr(tag: &str, key: &str, value: &str) -> String {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{}=\"", key.to_ascii_lowercase());
    let Some(at) = lower.find(&needle) else {
        return tag.to_string();
    };
    let open = at + needle.len();
    let Some(close) = tag[open..].find('"').map(|i| open + i) else {
        return tag.to_string();
    };
    format!("{}{}{}", &tag[..open], value, &tag[close..])
}

/// Exposed for the probes: parse without touching the filesystem.
pub fn parse_bytes(bytes: &[u8]) -> Registry {
    let mut reg = parse(bytes);
    reg.bytes = bytes.to_vec();
    reg.present = true;
    reg
}

fn parse(bytes: &[u8]) -> Registry {
    let mut reader = quick_xml::Reader::from_reader(bytes);
    reader.check_end_names(false);
    let mut buf = Vec::new();
    let mut entries = Vec::new();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut groups: Vec<String> = Vec::new();
    let mut current: Option<String> = None;

    loop {
        // Events tile the document, so the position before a read is where this
        // event starts and the position after is where it ends.
        let start = reader.buffer_position();
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Eof) | Err(_) => break,
            Ok(quick_xml::events::Event::Comment(e)) => {
                let text = String::from_utf8_lossy(e.as_ref()).trim().to_string();
                // A commented-out entry is not a group heading — and it is not
                // an entry either. `monsters.xml` has one today.
                if text.contains("<monster") || text.is_empty() {
                    continue;
                }
                if !groups.contains(&text) {
                    groups.push(text.clone());
                }
                current = Some(text);
            }
            Ok(quick_xml::events::Event::Empty(e)) | Ok(quick_xml::events::Event::Start(e)) => {
                if !e.name().as_ref().eq_ignore_ascii_case(b"monster") {
                    continue;
                }
                let mut name = String::new();
                let mut file = String::new();
                for attr in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let value = String::from_utf8_lossy(&attr.value).to_string();
                    if key.eq_ignore_ascii_case("name") {
                        name = value;
                    } else if key.eq_ignore_ascii_case("file") {
                        // `file` is resolved relative to data/monster/ (§1) and
                        // is kept whole: on TFS, TVP and Nostalrius it names a
                        // subfolder (`monsters/demon.xml`, `raids/orc.xml`), and
                        // reducing it to the basename made two monsters in
                        // different subtrees look like the same entry. Slashes
                        // are normalised so it compares equal to `file_key`.
                        file = value.replace('\\', "/");
                    }
                }
                if !name.is_empty() || !file.is_empty() {
                    entries.push(RegistryEntry {
                        name,
                        file,
                        group: current.clone(),
                    });
                    spans.push((start, reader.buffer_position()));
                }
            }
            _ => {}
        }
        buf.clear();
    }

    Registry {
        entries,
        spans,
        groups,
        bytes: Vec::new(),
        present: false,
    }
}
