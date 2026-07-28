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
    /// Group headings in file order, for the new-monster dialog.
    pub groups: Vec<String>,
    /// Raw bytes, so `add`/`rename` can splice rather than reformat.
    pub bytes: Vec<u8>,
    pub present: bool,
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
        self.entries
            .iter()
            .find(|e| e.file.eq_ignore_ascii_case(file))
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
        let entry_line = format!("<monster name=\"{name}\" file=\"{file}\" />");

        // Insert after the last entry of the requested group, so the file's
        // comment structure keeps its meaning.
        let anchor = group.and_then(|g| {
            self.entries
                .iter()
                .rposition(|e| e.group.as_deref() == Some(g))
                .and_then(|i| self.entries.get(i))
                .and_then(|e| {
                    let needle = format!("file=\"{}\"", e.file);
                    text.find(&needle)
                        .and_then(|p| text[p..].find('\n').map(|nl| p + nl + 1))
                })
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
        let Some(entry) = self.entry_for_file(file) else {
            return self.bytes.clone();
        };
        let old = format!("name=\"{}\" file=\"{}\"", entry.name, entry.file);
        let new = format!("name=\"{new_name}\" file=\"{new_file}\"");
        if let Some(pos) = text.find(&old) {
            let mut out = String::with_capacity(text.len());
            out.push_str(&text[..pos]);
            out.push_str(&new);
            out.push_str(&text[pos + old.len()..]);
            return out.into_bytes();
        }
        // Attribute order differs on this line — fall back to replacing just
        // the two values in place.
        text.replace(&format!("file=\"{}\"", entry.file), &format!("file=\"{new_file}\""))
            .replace(&format!("name=\"{}\"", entry.name), &format!("name=\"{new_name}\""))
            .into_bytes()
    }

    /// Removes the entry pointing at `file`, and the whole line it sits on.
    pub fn with_removed(&self, file: &str) -> Vec<u8> {
        let text = String::from_utf8_lossy(&self.bytes).into_owned();
        let Some(entry) = self.entry_for_file(file) else {
            return self.bytes.clone();
        };
        let needle = format!("file=\"{}\"", entry.file);
        let Some(pos) = text.find(&needle) else {
            return self.bytes.clone();
        };
        let start = text[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let end = text[pos..].find('\n').map(|i| pos + i + 1).unwrap_or(text.len());
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

fn parse(bytes: &[u8]) -> Registry {
    let mut reader = quick_xml::Reader::from_reader(bytes);
    reader.check_end_names(false);
    let mut buf = Vec::new();
    let mut entries = Vec::new();
    let mut groups: Vec<String> = Vec::new();
    let mut current: Option<String> = None;

    loop {
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
                        // `file` is resolved relative to data/monster/ (§1).
                        file = value.rsplit(['/', '\\']).next().unwrap_or(&value).to_string();
                    }
                }
                if !name.is_empty() || !file.is_empty() {
                    entries.push(RegistryEntry {
                        name,
                        file,
                        group: current.clone(),
                    });
                }
            }
            _ => {}
        }
        buf.clear();
    }

    Registry {
        entries,
        groups,
        bytes: Vec::new(),
        present: false,
    }
}
