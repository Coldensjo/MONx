use super::*;

use std::ops::Range;

use crate::catalog;
use crate::engine::{EngineProfile, MeleeKind, SpeedSpell};

/// Serialises `doc` back over the file it was read from. Every node whose model
/// value is unchanged is copied byte-for-byte out of the original; only what
/// changed is re-rendered. Round-trip of an unedited document is therefore
/// byte-identical by construction, including comments, trailing spaces and the
/// nodes the model doesn't cover.
pub fn write_bytes(
    profile: &'static EngineProfile,
    parsed: &Parsed,
    doc: &MonsterDoc,
) -> Vec<u8> {
    let (layout, root, root_start) = match parsed.xml() {
        Some(x) => x,
        None => {
            let lua = parsed.lua().expect("a parsed document is XML or Lua");
            return crate::monster_lua::write(profile, lua, &parsed.doc, doc);
        }
    };
    let mut out = Vec::with_capacity(parsed.bytes.len() + 256);
    let w = Writer {
        profile,
        src: &parsed.bytes,
        layout,
        base: &parsed.doc,
        doc,
    };

    // Prolog: declaration, whitespace, any leading comment — verbatim.
    out.extend_from_slice(&parsed.bytes[..root_start]);
    w.root(root, &mut out);
    out
}

/// Renders a document from nothing, for `create_monster`. Canonical form:
/// tabs, CRLF, the §2 node order, one attribute per flag/immunity/element node.
pub fn write_new(profile: &'static EngineProfile, doc: &MonsterDoc) -> Vec<u8> {
    if profile.format == crate::engine::Format::Lua {
        return crate::monster_lua::write_new(profile, doc);
    }
    let layout = Layout::default();
    let mut out = Vec::new();
    out.extend_from_slice(br#"<?xml version="1.0" encoding="utf-8"?>"#);
    out.extend_from_slice(&layout.eol);
    let w = Writer {
        profile,
        src: &[],
        layout: &layout,
        base: &MonsterDoc::default(),
        doc,
    };
    w.canonical_root(&mut out);
    out
}

struct Writer<'a> {
    profile: &'static EngineProfile,
    src: &'a [u8],
    layout: &'a Layout,
    /// The document as it was read — the baseline every comparison is against.
    base: &'a MonsterDoc,
    doc: &'a MonsterDoc,
}

/// One `key="value"` pair to render.
struct Pair(String, String);

impl<'a> Writer<'a> {
    fn raw(&self, span: &Range<usize>, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.src[span.start..span.end]);
    }

    fn eol(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.layout.eol);
    }

    fn indent(&self, depth: usize, out: &mut Vec<u8>) {
        for _ in 0..depth {
            out.extend_from_slice(&self.layout.indent);
        }
    }

    /// Discards the indentation already written in front of a node that is
    /// being dropped, so a deleted entry doesn't leave its own blank line behind.
    fn drop_pending_ws(&self, out: &mut Vec<u8>) {
        self.split_pending_ws(out);
    }

    /// Takes the whitespace already written at the end of `out` back off it.
    /// The last child of a container is the indentation in front of its closing
    /// tag; appended nodes have to land *before* that run, or the closing tag
    /// ends up glued to the last new node and a stray indent line is left where
    /// the append started.
    fn split_pending_ws(&self, out: &mut Vec<u8>) -> Vec<u8> {
        let keep = out
            .iter()
            .rposition(|b| !b.is_ascii_whitespace())
            .map_or(0, |i| i + 1);
        out.split_off(keep)
    }

    /// Re-emits a self-closing start tag as an opening one: `<loot />` becomes
    /// `<loot>`, attributes and all, so a block that gained children can hold
    /// them without losing anything the tag already carried.
    fn reopen(&self, n: &Node, out: &mut Vec<u8>) {
        let raw = &self.src[n.element_span.start..n.element_span.end];
        let mut head = raw[..raw.len().saturating_sub(2)].to_vec();
        while head.last().is_some_and(|b| b.is_ascii_whitespace()) {
            head.pop();
        }
        out.extend_from_slice(&head);
        out.push(b'>');
    }

    fn enc(&self, s: &str) -> Vec<u8> {
        self.layout.encoding.encode(s)
    }

    /// `<name a="1" b="2" />`, with `unknownAttributes` for this path replayed
    /// after the modelled ones so nothing is lost.
    fn tag(&self, name: &str, pairs: &[Pair], path: &str, out: &mut Vec<u8>) {
        out.push(b'<');
        out.extend_from_slice(self.enc(name).as_slice());
        for Pair(k, v) in pairs {
            out.push(b' ');
            out.extend_from_slice(self.enc(k).as_slice());
            out.extend_from_slice(b"=\"");
            out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
            out.push(b'"');
        }
        if let Some(extra) = self.doc.unknown_attributes.get(path) {
            for (k, v) in extra {
                out.push(b' ');
                out.extend_from_slice(self.enc(k).as_slice());
                out.extend_from_slice(b"=\"");
                out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
                out.push(b'"');
            }
        }
        out.extend_from_slice(b" />");
    }

    // ---------- root ----------

    fn root(&self, root: &Node, out: &mut Vec<u8>) {
        // The open tag holds every root attribute; rebuild it only if one moved.
        let open_end = self.open_tag_end(root);
        if self.root_attrs_unchanged() {
            out.extend_from_slice(&self.src[root.span.start..open_end]);
        } else {
            self.root_open_tag(root, out);
        }
        if root.self_closed {
            return;
        }

        let mut cursor = open_end;
        // pugixml's `child()` returns the *first* match, so a file with two
        // `<immunities>` blocks — scarab.xml has exactly that — is read from
        // the first and the rest are dead weight the server ignores. The writer
        // has to agree, or it rewrites a dead block against a model that never
        // came from it.
        let mut handled: Vec<String> = Vec::new();
        for child in &root.children {
            match child {
                Child::Element(n) => {
                    // Gap before the node — indentation and any standalone
                    // comment — is copied as-is.
                    out.extend_from_slice(&self.src[cursor..n.span.start]);
                    let key = n.name.to_ascii_lowercase();
                    if handled.contains(&key) {
                        self.raw(&n.span, out);
                    } else {
                        handled.push(key);
                        self.root_child(n, out);
                    }
                    cursor = n.span.end;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        // A block the file never had — `<voices>` on a freshly created monster —
        // has nowhere to be edited in place, so it is grafted on at the end.
        // Nothing that was already there moves.
        let ws = self.split_pending_ws(out);
        for name in SECTIONS {
            if !handled.iter().any(|h| h == name) {
                self.section(name, false, out);
            }
        }
        out.extend_from_slice(&ws);

        // `</monster>` and anything after it.
        out.extend_from_slice(&self.src[cursor..root.span.end]);
        out.extend_from_slice(&self.src[root.span.end..]);
    }

    /// Byte offset just past the element's own start tag.
    fn open_tag_end(&self, node: &Node) -> usize {
        if node.self_closed {
            return node.element_span.end;
        }
        match node.children.first() {
            Some(Child::Element(n)) => n.span.start,
            Some(Child::Comment { span, .. }) | Some(Child::Text { span }) => span.start,
            None => {
                // No children: find the '>' that closes the start tag.
                let s = node.element_span.start;
                self.src[s..node.element_span.end]
                    .iter()
                    .position(|&b| b == b'>')
                    .map(|i| s + i + 1)
                    .unwrap_or(node.element_span.end)
            }
        }
    }

    fn root_attrs_unchanged(&self) -> bool {
        let (b, d) = (self.base, self.doc);
        b.name == d.name
            && b.name_description == d.name_description
            && b.race == d.race
            && b.species == d.species
            && b.experience == d.experience
            && b.speed == d.speed
            && b.manacost == d.manacost
            && b.raceid == d.raceid
            && b.skull == d.skull
            && b.script == d.script
            && b.unknown_attributes.get("") == d.unknown_attributes.get("")
    }

    /// Rewrites `<monster …>` keeping the original attribute order for the
    /// attributes that were already there, appending any that are new.
    fn root_open_tag(&self, root: &Node, out: &mut Vec<u8>) {
        let d = self.doc;
        let mut pairs: Vec<Pair> = Vec::new();
        let mut emitted: Vec<String> = Vec::new();

        let value_for = |key: &str| -> Option<String> {
            Some(match key {
                "name" => d.name.clone(),
                "nameDescription" => d.name_description.clone()?,
                "race" => d.race.clone()?,
                "species" => d.species.clone()?,
                "experience" => d.experience.to_string(),
                "speed" => d.speed.to_string(),
                "manacost" => d.manacost.to_string(),
                "skull" => d.skull.clone(),
                "script" => d.script.clone()?,
                // Whichever spelling this engine reads — `raceid` on Ironcore,
                // `raceId` on TFS. Comparing against the profile rather than a
                // literal is what keeps the other spelling in
                // `unknownAttributes`, where it round-trips and lints.
                k if Some(k) == self.profile.raceid_attr => d.raceid?.to_string(),
                _ => return None,
            })
        };

        for a in &root.attrs {
            if let Some(v) = value_for(&a.key) {
                pairs.push(Pair(a.key.clone(), v));
                emitted.push(a.key.clone());
            } else if let Some(v) = d.unknown_attributes.get("").and_then(|m| m.get(&a.key)) {
                pairs.push(Pair(a.key.clone(), v.clone()));
                emitted.push(a.key.clone());
            }
        }
        for key in known_attrs(self.profile, "monster") {
            if emitted.iter().any(|e| e == key) {
                continue;
            }
            if let Some(v) = value_for(key) {
                // `skull="none"` is the default; don't add it to files that
                // never had it.
                if key == "skull" && v == "none" {
                    continue;
                }
                pairs.push(Pair((*key).to_string(), v));
            }
        }
        if let Some(extra) = d.unknown_attributes.get("") {
            for (k, v) in extra {
                if !emitted.iter().any(|e| e == k) {
                    pairs.push(Pair(k.clone(), v.clone()));
                }
            }
        }

        out.push(b'<');
        out.extend_from_slice(b"monster");
        for Pair(k, v) in &pairs {
            out.push(b' ');
            out.extend_from_slice(self.enc(k).as_slice());
            out.extend_from_slice(b"=\"");
            out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
            out.push(b'"');
        }
        out.push(b'>');
    }

    // ---------- root children ----------

    fn root_child(&self, n: &Node, out: &mut Vec<u8>) {
        let name = n.name.to_ascii_lowercase();
        let depth = 1;
        match name.as_str() {
            "health" => self.leaf(n, "health", self.health_pairs(), self.base.health == self.doc.health, out),
            "look" => self.leaf(n, "look", self.look_pairs(), self.base.look == self.doc.look, out),
            "targetchange" => self.leaf(
                n,
                "targetchange",
                self.targetchange_pairs(n),
                self.base.targetchange == self.doc.targetchange,
                out,
            ),
            // Only claimed when this engine has the node — Ironcore's
            // `<targetstrategies>` is a different node and stays raw.
            "targetstrategy"
                if self.profile.target_strategy.map(|(nm, _)| nm) == Some("targetstrategy") =>
            {
                self.leaf(
                    n,
                    "targetStrategy",
                    self.target_strategy_pairs(),
                    self.base.target_strategy == self.doc.target_strategy,
                    out,
                )
            }
            "bestiary" if self.profile.has_bestiary => self.leaf(
                n,
                "bestiary",
                self.bestiary_pairs(),
                self.base.bestiary == self.doc.bestiary,
                out,
            ),
            "flags" => self.flags(n, depth, out),
            "immunities" => self.immunities(n, depth, out),
            "elements" => self.elements(n, depth, out),
            "attacks" => self.attacks(n, depth, out),
            "defenses" => self.defenses(n, depth, out),
            "voices" => self.voices(n, depth, out),
            "summons" => self.summons(n, depth, out),
            "loot" => self.loot(n, depth, out),
            "script" => self.script(n, depth, out),
            // `<strategy>`, `<targetstrategies>`, `<personalloot>`
            // and anything else the model doesn't own ride along untouched.
            // `<personalloot>` in particular is *not* `<loot>`: it is one file's
            // own extension, and rewriting it from `doc.loot` would replace its
            // contents with a different node's.
            _ => self.raw(&n.span, out),
        }
    }

    /// A childless node: raw when unchanged, re-rendered when not.
    fn leaf(&self, n: &Node, path: &str, pairs: Vec<Pair>, unchanged: bool, out: &mut Vec<u8>) {
        if unchanged && self.unknown_same(path) {
            self.raw(&n.span, out);
        } else {
            self.tag(&n.name, &pairs, path, out);
        }
    }

    fn unknown_same(&self, path: &str) -> bool {
        self.base.unknown_attributes.get(path) == self.doc.unknown_attributes.get(path)
    }

    fn health_pairs(&self) -> Vec<Pair> {
        vec![
            Pair("now".into(), self.doc.health.now.to_string()),
            Pair("max".into(), self.doc.health.max.to_string()),
        ]
    }

    fn look_pairs(&self) -> Vec<Pair> {
        let l = &self.doc.look;
        let mut p = Vec::new();
        if l.mode == "typeex" {
            p.push(Pair("typeex".into(), l.typeex.unwrap_or(0).to_string()));
        } else {
            p.push(Pair("type".into(), l.type_.unwrap_or(0).to_string()));
            // Colour indices only mean anything under `type` (§7); zeros are
            // the default, so only non-zero values are worth writing.
            for (k, v) in [
                ("head", l.head),
                ("body", l.body),
                ("legs", l.legs),
                ("feet", l.feet),
            ] {
                if v != 0 {
                    p.push(Pair(k.into(), v.to_string()));
                }
            }
            if self.profile.look_addons && l.addons != 0 {
                p.push(Pair("addons".into(), l.addons.to_string()));
            }
        }
        if self.profile.look_mount && l.mount != 0 {
            p.push(Pair("mount".into(), l.mount.to_string()));
        }
        if l.corpse != 0 {
            p.push(Pair("corpse".into(), l.corpse.to_string()));
        }
        if self.profile.look_corpseactionid && l.corpseactionid != 0 {
            p.push(Pair("corpseactionid".into(), l.corpseactionid.to_string()));
        }
        p
    }

    fn target_strategy_pairs(&self) -> Vec<Pair> {
        let s = self.doc.target_strategy.clone().unwrap_or(TargetStrategy {
            nearest: 0,
            weakest: 0,
            mostdamage: 0,
            random: 0,
        });
        vec![
            Pair("nearest".into(), s.nearest.to_string()),
            Pair("weakest".into(), s.weakest.to_string()),
            Pair("mostdamage".into(), s.mostdamage.to_string()),
            Pair("random".into(), s.random.to_string()),
        ]
    }

    fn bestiary_pairs(&self) -> Vec<Pair> {
        let Some(b) = &self.doc.bestiary else {
            return Vec::new();
        };
        let mut p = Vec::new();
        if let Some(c) = &b.class {
            p.push(Pair("class".into(), c.clone()));
        }
        p.push(Pair("prowess".into(), b.prowess.to_string()));
        p.push(Pair("expertise".into(), b.expertise.to_string()));
        p.push(Pair("mastery".into(), b.mastery.to_string()));
        p.push(Pair("charmPoints".into(), b.charm_points.to_string()));
        if let Some(d) = &b.difficulty {
            p.push(Pair("difficulty".into(), d.clone()));
        }
        if let Some(o) = &b.occurrence {
            p.push(Pair("occurrence".into(), o.clone()));
        }
        if let Some(l) = &b.locations {
            p.push(Pair("locations".into(), l.clone()));
        }
        p
    }

    /// Keeps whichever of `interval`/`speed` the file already used, so a file
    /// written with the legacy alias doesn't churn (§25).
    fn interval_key(&self, n: &Node) -> String {
        if n.attr_exact("interval").is_none() && n.attr("speed").is_some() {
            "speed".to_string()
        } else {
            "interval".to_string()
        }
    }

    fn targetchange_pairs(&self, n: &Node) -> Vec<Pair> {
        vec![
            Pair(self.interval_key(n), self.doc.targetchange.interval.to_string()),
            Pair("chance".into(), self.doc.targetchange.chance.to_string()),
        ]
    }

    // ---------- flags / immunities / elements ----------
    //
    // All three are "one attribute per node" lists (§5, §10, §11) driven by a
    // BTreeMap in the model. Emission follows the *file's* node order so an
    // untouched list stays untouched; keys the file didn't have are appended.

    fn flags(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "flag",
            |writer, key| {
                writer.doc.flags.get(key).map(|v| match v {
                    FlagValue::Bool(b) => Pair(key.clone(), if *b { "1" } else { "0" }.to_string()),
                    FlagValue::Num(x) => Pair(key.clone(), x.to_string()),
                })
            },
            |writer, node| node.attrs.first().map(|a| writer.profile.canonical_flag(&a.key)),
            |writer, key| writer.base.flags.get(key) == writer.doc.flags.get(key),
            &self.doc.flags.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    fn immunities(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "immunity",
            |writer, key| {
                writer
                    .doc
                    .immunities
                    .get(key)
                    .map(|v| Pair(key.clone(), if *v { "1" } else { "0" }.to_string()))
            },
            |_writer, node| {
                // Form A (`name=`) is checked before form B (§10).
                Some(if let Some(name) = node.attr("name") {
                    name.to_string()
                } else {
                    node.attrs
                        .iter()
                        .find(|a| _writer.profile.is_immunity_name(&a.key))?
                        .key
                        .to_ascii_lowercase()
                })
            },
            |writer, key| writer.base.immunities.get(key) == writer.doc.immunities.get(key),
            &self.doc.immunities.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    fn elements(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "element",
            |writer, key| {
                writer
                    .doc
                    .elements
                    .get(key)
                    .map(|v| Pair(key.clone(), v.to_string()))
            },
            |_writer, node| {
                Some(catalog::canonical_element_attr(
                    &node
                        .attrs
                        .iter()
                        .find(|a| catalog::is_element_attr(&a.key))?
                        .key,
                ))
            },
            |writer, key| writer.base.elements.get(key) == writer.doc.elements.get(key),
            &self.doc.elements.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    /// Shared body for the three one-attribute-per-node lists.
    #[allow(clippy::too_many_arguments)]
    fn attr_list(
        &self,
        container: &Node,
        depth: usize,
        item_tag: &str,
        pair_for: impl Fn(&Self, &String) -> Option<Pair>,
        key_of: impl Fn(&Self, &Node) -> Option<String>,
        unchanged: impl Fn(&Self, &String) -> bool,
        all_keys: &[String],
        out: &mut Vec<u8>,
    ) {
        if container.self_closed {
            // `<flags />` that gained entries has to grow a body.
            if all_keys.is_empty() {
                self.raw(&container.span, out);
                return;
            }
            self.reopen(container, out);
            for key in all_keys {
                if let Some(pair) = pair_for(self, key) {
                    self.eol(out);
                    self.indent(depth + 1, out);
                    self.tag(item_tag, &[pair], "", out);
                }
            }
            self.eol(out);
            self.indent(depth, out);
            out.extend_from_slice(self.enc(&format!("</{}>", container.name)).as_slice());
            return;
        }

        let open_end = self.open_tag_end(container);
        out.extend_from_slice(&self.src[container.span.start..open_end]);

        let mut seen: Vec<String> = Vec::new();
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(n) => {
                    let Some(key) = key_of(self, n) else {
                        // No attribute the model recognises — an empty node, or
                        // a name the engine itself would reject. Not ours to
                        // rewrite, so it passes through untouched.
                        out.extend_from_slice(&self.src[cursor..n.span.end]);
                        cursor = n.span.end;
                        continue;
                    };
                    match pair_for(self, &key) {
                        // Key removed from the model — drop the node and the
                        // whitespace that introduced it.
                        None => self.drop_pending_ws(out),
                        Some(pair) => {
                            out.extend_from_slice(&self.src[cursor..n.span.start]);
                            if unchanged(self, &key) {
                                self.raw(&n.span, out);
                            } else {
                                self.tag(item_tag, &[pair], "", out);
                            }
                        }
                    }
                    seen.push(key);
                    cursor = n.span.end;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }

        // Keys the model gained since the file was written.
        let added: Vec<&String> = all_keys.iter().filter(|k| !seen.contains(k)).collect();
        if !added.is_empty() {
            let tail = self.src[cursor..container.span.end].to_vec();
            let ws = self.split_pending_ws(out);
            for key in added {
                if let Some(pair) = pair_for(self, key) {
                    self.eol(out);
                    self.indent(depth + 1, out);
                    self.tag(item_tag, &[pair], "", out);
                }
            }
            out.extend_from_slice(&ws);
            out.extend_from_slice(&tail);
        } else {
            out.extend_from_slice(&self.src[cursor..container.span.end]);
        }
    }

    // ---------- spells ----------

    fn defenses(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // `<defenses>` carries armor/defense of its own, so its open tag can
        // change independently of its children.
        // A `<defenses … />` that gained spells has to grow a body.
        let expand = n.self_closed && !self.doc.defenses.is_empty();
        let open_end = self.open_tag_end(n);
        if self.base.defense_stats == self.doc.defense_stats && self.unknown_same("defenses") {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            let d = &self.doc.defense_stats;
            out.extend_from_slice(b"<defenses");
            out.extend_from_slice(format!(" armor=\"{}\"", d.armor).as_bytes());
            out.extend_from_slice(format!(" defense=\"{}\"", d.defense).as_bytes());
            if let Some(extra) = self.doc.unknown_attributes.get("defenses") {
                for (k, v) in extra {
                    out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
                }
            }
            out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });
        }
        if n.self_closed {
            if expand {
                self.spell_body(depth, "defenses", "defense", &self.doc.defenses, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</defenses>");
            }
            return;
        }
        self.spell_children(n, open_end, depth, "defenses", "defense", &self.base.defenses, &self.doc.defenses, out);
    }

    /// `<attacks>`. On Nostalrius the container carries the monster's melee, so
    /// its open tag can change independently of its children exactly as
    /// `<defenses>` does; on every other engine it is a bare wrapper and this
    /// falls straight through to `spells`.
    fn attacks(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        if self.profile.melee != MeleeKind::AttacksNode
            || (self.base.attacks_stats == self.doc.attacks_stats
                && self.unknown_same("attacksStats"))
        {
            self.spells(n, depth, "attacks", "attack", &self.base.attacks, &self.doc.attacks, out);
            return;
        }

        let expand = n.self_closed && !self.doc.attacks.is_empty();
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(b"<attacks");
        if let Some(s) = &self.doc.attacks_stats {
            out.extend_from_slice(format!(" attack=\"{}\"", s.attack).as_bytes());
            out.extend_from_slice(format!(" skill=\"{}\"", s.skill).as_bytes());
            if let Some(p) = s.poison {
                out.extend_from_slice(format!(" poison=\"{p}\"").as_bytes());
            }
        }
        if let Some(extra) = self.doc.unknown_attributes.get("attacksStats") {
            for (k, v) in extra {
                out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
            }
        }
        out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });

        if n.self_closed {
            if expand {
                self.spell_body(depth, "attacks", "attack", &self.doc.attacks, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</attacks>");
            }
            return;
        }
        self.spell_children(
            n,
            open_end,
            depth,
            "attacks",
            "attack",
            &self.base.attacks,
            &self.doc.attacks,
            out,
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn spells(
        &self,
        n: &Node,
        depth: usize,
        path: &str,
        item_tag: &str,
        base: &[SpellBlock],
        new: &[SpellBlock],
        out: &mut Vec<u8>,
    ) {
        if n.self_closed {
            if new.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.spell_body(depth, path, item_tag, new, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(self.enc(&format!("</{}>", n.name)).as_slice());
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);
        self.spell_children(n, open_end, depth, path, item_tag, base, new, out);
    }

    /// The `<attack>`/`<defense>` children from `skip` onwards, each on its own
    /// indented line.
    fn spell_body(
        &self,
        depth: usize,
        path: &str,
        item_tag: &str,
        new: &[SpellBlock],
        skip: usize,
        out: &mut Vec<u8>,
    ) {
        for (i, spell) in new.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.spell_tag(item_tag, spell, &format!("{path}[{i}]"), depth + 1, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn spell_children(
        &self,
        container: &Node,
        open_end: usize,
        depth: usize,
        path: &str,
        item_tag: &str,
        base: &[SpellBlock],
        new: &[SpellBlock],
        out: &mut Vec<u8>,
    ) {
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(n) => {
                    if idx >= new.len() {
                        // Spell deleted — drop it and its leading whitespace.
                        self.drop_pending_ws(out);
                        cursor = n.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..n.span.start]);
                    let p = format!("{path}[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&n.span, out);
                    } else {
                        self.spell_tag(item_tag, &new[idx], &p, depth + 1, out);
                    }
                    cursor = n.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..container.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.spell_body(depth, path, item_tag, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// Canonical spell block: `interval` over `speed`, `min`/`max` in canonical
    /// order, at most one geometry attribute, effects as child `<attribute>`
    /// nodes (§29 serialisation rules).
    fn spell_tag(&self, tag: &str, s: &SpellBlock, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p: Vec<Pair> = Vec::new();
        if let Some(script) = &s.script {
            p.push(Pair("script".into(), script.clone()));
        } else if let Some(name) = &s.name {
            p.push(Pair("name".into(), name.clone()));
        }
        // TVP's speed spell reads its delta from `speed=` — the very attribute
        // the loader checks *first* for the cast cadence. The two cannot coexist
        // on one node, so don't invent an `interval` the engine will never look
        // at; `spell.tvp-speed-attribute-collision` explains it in the editor.
        let speed_collides = self.profile.speed_spell == SpeedSpell::SpeedVariation
            && s.status.as_ref().is_some_and(|st| st.speedchange.is_some());
        if self.profile.has_spell_interval() && !speed_collides {
            p.push(Pair("interval".into(), s.interval.to_string()));
        }
        // `delay` is an *alternative* to `chance` on TVP, not an addition:
        // writing both means the loader silently ignores `delay`.
        match s.delay {
            Some(d) if self.profile.has_spell_delay() => p.push(Pair("delay".into(), d.to_string())),
            _ => p.push(Pair("chance".into(), s.chance.to_string())),
        }
        // Against the profile's default, not against zero. Nostalrius reads an
        // absent `range` as the client viewport (8), so omitting `range="0"`
        // there does not mean "no range" — it means 8, and a user clearing the
        // field got the opposite of what they asked for.
        if s.range != self.profile.spell_range_default {
            p.push(Pair("range".into(), s.range.to_string()));
        }

        if let Some(m) = &s.melee {
            // Written exactly when the file wrote them — zero included. TVP's
            // black sheep really does say `skill="0" attack="0"`, and TFS's
            // fire_overlord really does omit both and state its damage as
            // min/max; conflating the two breaks one or the other.
            if let Some(v) = m.skill {
                p.push(Pair("skill".into(), v.to_string()));
            }
            if let Some(v) = m.attack {
                p.push(Pair("attack".into(), v.to_string()));
            }
            for (key, value) in [
                ("skillfactor", m.skillfactor),
                ("skillnextlevel", m.skillnextlevel),
                ("skilladdcount", m.skilladdcount),
                ("poisoncycles", m.poisoncycles),
            ] {
                if let Some(v) = value {
                    p.push(Pair(key.into(), v.to_string()));
                }
            }
            if let Some(c) = &m.condition {
                p.push(Pair(c.type_.clone(), c.value.to_string()));
                if let Some(default) = self.profile.melee_condition_tick(&c.type_) {
                    if c.tick != default {
                        p.push(Pair("tick".into(), c.tick.to_string()));
                    }
                }
            }
        }
        // Not an `else` on the melee branch: a melee node that omits skill and
        // attack states its damage here instead, and the loader reads it
        // (TFS `monsters.cpp:235` only overwrites min/max when both are given).
        if s.min != 0 || s.max != 0 {
            // As authored. The loader swaps these when `|min| > |max|` (§8.2),
            // but swapping them here would be silently rewriting a value the
            // engine merely reinterprets — the same thing MONx refuses to do for
            // every clamp. `spell.min-max-swapped` reports it instead, and
            // `lintfix.ts` will apply the swap when the user asks for it.
            // TFS's rage_squid and fire_overlord both ship this way.
            p.push(Pair("min".into(), s.min.to_string()));
            p.push(Pair("max".into(), s.max.to_string()));
        }

        if let Some(c) = &s.condition {
            if c.tick != 0 {
                p.push(Pair("tick".into(), c.tick.to_string()));
            }
            if c.start != 0 {
                p.push(Pair("start".into(), c.start.to_string()));
            }
            if let Some(v) = c.cycle {
                p.push(Pair("cycle".into(), v.to_string()));
            }
            if let Some(v) = c.mincycle {
                p.push(Pair("mincycle".into(), v.to_string()));
            }
            if let Some(v) = c.count {
                p.push(Pair("count".into(), v.to_string()));
            }
        }

        if let Some(st) = &s.status {
            // TVP's speed spell takes its delta from `speed=`, which is also the
            // cadence alias — so it is written as `speed`, not `speedchange`.
            let change_key = if self.profile.speed_spell == SpeedSpell::SpeedVariation {
                "speed"
            } else {
                "speedchange"
            };
            if let Some(v) = st.speedchange {
                p.push(Pair(change_key.into(), v.to_string()));
            }
            if let Some(v) = st.minspeedchange {
                p.push(Pair("minspeedchange".into(), v.to_string()));
            }
            if let Some(v) = st.maxspeedchange {
                p.push(Pair("maxspeedchange".into(), v.to_string()));
            }
            if let Some(v) = st.speedvariation {
                p.push(Pair("speedvariation".into(), v.to_string()));
            }
            if let Some(v) = st.variation {
                p.push(Pair("variation".into(), v.to_string()));
            }
            if let Some(v) = &st.outfit_monster {
                p.push(Pair("monster".into(), v.clone()));
            }
            if let Some(v) = st.outfit_item {
                p.push(Pair("item".into(), v.to_string()));
            }
            if let Some(v) = st.drunkenness {
                p.push(Pair("drunkenness".into(), v.to_string()));
            }
            p.push(Pair("duration".into(), st.duration.to_string()));
        }

        // At most one geometry attribute (§8.3) — whichever shape the model says.
        if let Some(a) = &s.area {
            match a.shape.as_str() {
                "ring" => p.push(Pair("ring".into(), a.ring.to_string())),
                "radius" => p.push(Pair("radius".into(), a.radius.to_string())),
                _ => {
                    p.push(Pair("length".into(), a.length.to_string()));
                    p.push(Pair("spread".into(), a.spread.to_string()));
                }
            }
        }
        if s.target {
            p.push(Pair("target".into(), "1".into()));
        }
        if s.direction {
            p.push(Pair("direction".into(), "1".into()));
        }

        let effects = [
            ("areaEffect", s.effects.area_effect.clone()),
            ("shootEffect", s.effects.shoot_effect.clone()),
        ];
        // Only Ironcore implements `aoeShootEffect`; TFS and the 7.x engines log
        // "Effect type does not exist" for anything but the other two.
        let aoe = s.effects.aoe_shoot_effect
            && self.profile.canonical_effect_key("aoeShootEffect").is_some();
        let has_effects = effects.iter().any(|(_, v)| v.is_some()) || aoe;

        if !has_effects {
            self.tag(tag, &p, path, out);
            return;
        }

        // Open form, effects as children.
        out.push(b'<');
        out.extend_from_slice(self.enc(tag).as_slice());
        for Pair(k, v) in &p {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
        }
        if let Some(extra) = self.doc.unknown_attributes.get(path) {
            for (k, v) in extra {
                out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
            }
        }
        out.push(b'>');
        for (key, value) in effects.iter() {
            if let Some(v) = value {
                self.eol(out);
                self.indent(depth + 1, out);
                out.extend_from_slice(
                    self.enc(&format!("<attribute key=\"{key}\" value=\"{v}\" />"))
                        .as_slice(),
                );
            }
        }
        if aoe {
            self.eol(out);
            self.indent(depth + 1, out);
            out.extend_from_slice(br#"<attribute key="aoeShootEffect" value="1" />"#);
        }
        self.eol(out);
        self.indent(depth, out);
        out.extend_from_slice(self.enc(&format!("</{tag}>")).as_slice());
    }

    // ---------- voices, summons, loot ----------

    fn voices(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // A `<voices … />` that gained lines, or a pacifist/leash string, has to
        // grow a body.
        let expand = n.self_closed
            && (!self.doc.voices.lines.is_empty()
                || self.doc.voices.pacifist.is_some()
                || self.doc.voices.leash.is_some());
        let open_end = self.open_tag_end(n);
        let head_same = self.base.voices.interval == self.doc.voices.interval
            && self.base.voices.chance == self.doc.voices.chance
            && self.unknown_same("voices");
        if head_same {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            out.extend_from_slice(b"<voices");
            // TVP has both attributes commented out in its loader and Nostalrius
            // never read them, so writing either would be inventing a cadence
            // the server does not honour.
            if self.profile.voices_interval {
                out.extend_from_slice(
                    format!(
                        " {}=\"{}\"",
                        self.interval_key(n),
                        self.doc.voices.interval
                    )
                    .as_bytes(),
                );
            }
            if self.profile.voices_chance {
                out.extend_from_slice(format!(" chance=\"{}\"", self.doc.voices.chance).as_bytes());
            }
            if let Some(extra) = self.doc.unknown_attributes.get("voices") {
                for (k, v) in extra {
                    out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
                }
            }
            out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });
        }
        if n.self_closed {
            if expand {
                let extras = self.voice_extras(0, true, true);
                self.voice_body(depth, &self.doc.voices.lines, 0, out);
                self.emit_voice_extras(depth, &extras, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</voices>");
            }
            return;
        }

        let base = &self.base.voices.lines;
        let new = &self.doc.voices.lines;
        let mut idx = 0usize;
        let mut extra = 0usize;
        let (mut has_pacifist, mut has_leash) = (false, false);
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(v) => {
                    // `pacifist=`/`leash=` voices carry no `sentence` and are not
                    // model lines (§12) — they are the two single-string fields
                    // on the block, so each is rewritten in place.
                    if v.attr("sentence").is_none() {
                        let path = format!("voices.extra[{extra}]");
                        extra += 1;
                        let key = if v.attr("pacifist").is_some() {
                            has_pacifist = true;
                            Some("pacifist")
                        } else if v.attr("leash").is_some() {
                            has_leash = true;
                            Some("leash")
                        } else {
                            None
                        };
                        let changed = match key {
                            Some("pacifist") => self.doc.voices.pacifist != self.base.voices.pacifist,
                            Some("leash") => self.doc.voices.leash != self.base.voices.leash,
                            // A `<voice>` that names neither is not ours to touch.
                            _ => false,
                        };
                        let now = match key {
                            Some("pacifist") => self.doc.voices.pacifist.as_ref(),
                            Some("leash") => self.doc.voices.leash.as_ref(),
                            _ => None,
                        };
                        if !changed && self.unknown_same(&path) {
                            out.extend_from_slice(&self.src[cursor..v.span.end]);
                        } else if let Some(text) = now {
                            out.extend_from_slice(&self.src[cursor..v.span.start]);
                            let pairs = vec![Pair(key.unwrap().into(), text.clone())];
                            self.tag("voice", &pairs, &path, out);
                        } else {
                            // Cleared: the node goes with it.
                            self.drop_pending_ws(out);
                        }
                        cursor = v.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = v.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..v.span.start]);
                    let p = format!("voices.lines[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&v.span, out);
                    } else {
                        self.tag("voice", &self.voice_pairs(&new[idx]), &p, out);
                    }
                    cursor = v.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        let extras = self.voice_extras(extra, !has_pacifist, !has_leash);
        if idx < new.len() || !extras.is_empty() {
            let ws = self.split_pending_ws(out);
            self.voice_body(depth, new, idx, out);
            self.emit_voice_extras(depth, &extras, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<voice>` lines from `skip` onwards, each on its own indented line.
    fn voice_body(&self, depth: usize, lines: &[VoiceLine], skip: usize, out: &mut Vec<u8>) {
        for (i, line) in lines.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("voice", &self.voice_pairs(line), &format!("voices.lines[{i}]"), out);
        }
    }

    /// The pacifist/leash nodes the block needs but does not already have, as
    /// `(path, pairs)`. `want_*` is false for one the document already carries
    /// somewhere — that node was rewritten in place and must not be duplicated.
    /// `from` continues the `voices.extra[n]` numbering past the existing nodes.
    fn voice_extras(&self, from: usize, want_pacifist: bool, want_leash: bool) -> Vec<(String, Vec<Pair>)> {
        let v = &self.doc.voices;
        let mut out = Vec::new();
        let mut i = from;
        for (key, text) in [
            ("pacifist", if want_pacifist { v.pacifist.as_ref() } else { None }),
            ("leash", if want_leash { v.leash.as_ref() } else { None }),
        ] {
            let Some(text) = text else { continue };
            out.push((format!("voices.extra[{i}]"), vec![Pair(key.into(), text.clone())]));
            i += 1;
        }
        out
    }

    fn emit_voice_extras(&self, depth: usize, extras: &[(String, Vec<Pair>)], out: &mut Vec<u8>) {
        for (path, pairs) in extras {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("voice", pairs, path, out);
        }
    }

    fn voice_pairs(&self, v: &VoiceLine) -> Vec<Pair> {
        let mut p = vec![Pair("sentence".into(), v.sentence.clone())];
        if v.yell {
            p.push(Pair("yell".into(), "1".into()));
        }
        p
    }

    fn summons(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // A `<summons … />` that gained entries has to grow a body.
        let expand = n.self_closed && !self.doc.summons.entries.is_empty();
        let open_end = self.open_tag_end(n);
        if self.base.summons.max_summons == self.doc.summons.max_summons
            && self.unknown_same("summons")
        {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            // Exact casing — any other spelling means the monster never summons.
            out.extend_from_slice(
                format!(
                    "<summons maxSummons=\"{}\"{}",
                    self.doc.summons.max_summons,
                    if n.self_closed && !expand { " />" } else { ">" }
                )
                .as_bytes(),
            );
        }
        if n.self_closed {
            if expand {
                self.summon_body(depth, &self.doc.summons.entries, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</summons>");
            }
            return;
        }

        let base = &self.base.summons.entries;
        let new = &self.doc.summons.entries;
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(s) => {
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = s.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..s.span.start]);
                    let p = format!("summons.entries[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&s.span, out);
                    } else {
                        self.summon_tag(&new[idx], &p, depth + 1, out);
                    }
                    cursor = s.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.summon_body(depth, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<summon>` entries from `skip` onwards, each on its own indented line.
    fn summon_body(&self, depth: usize, entries: &[SummonEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in entries.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.summon_tag(e, &format!("summons.entries[{i}]"), depth + 1, out);
        }
    }

    fn summon_tag(&self, e: &SummonEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p = vec![Pair("name".into(), e.name.clone())];
        if self.profile.summon_interval {
            p.push(Pair("interval".into(), e.interval.to_string()));
        }
        // As on spells, TVP's `delay` replaces `chance` rather than joining it.
        match e.delay {
            Some(d) if self.profile.summon_delay => p.push(Pair("delay".into(), d.to_string())),
            _ => p.push(Pair("chance".into(), e.chance.to_string())),
        }
        p.push(Pair("max".into(), e.max.to_string()));
        if e.force {
            p.push(Pair("force".into(), "1".into()));
        }
        // TVP and Nostalrius never iterate a summon's children.
        let effects: Vec<(&str, &String)> = if self.profile.summon_effect_keys.is_empty() {
            Vec::new()
        } else {
            [("effect", &e.effect), ("masterEffect", &e.master_effect)]
                .into_iter()
                .filter_map(|(k, v)| v.as_ref().map(|v| (k, v)))
                .collect()
        };
        if effects.is_empty() {
            self.tag("summon", &p, path, out);
            return;
        }
        out.extend_from_slice(b"<summon");
        for Pair(k, v) in &p {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{v}\"")).as_slice());
        }
        out.push(b'>');
        for (k, v) in effects {
            self.eol(out);
            self.indent(depth + 1, out);
            out.extend_from_slice(self.enc(&format!("<attribute key=\"{k}\" value=\"{v}\" />")).as_slice());
        }
        self.eol(out);
        self.indent(depth, out);
        out.extend_from_slice(b"</summon>");
    }

    fn loot(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // `create_monster` writes `<loot />`, so every new monster starts with a
        // self-closing block: without this it could never gain a single item.
        if n.self_closed {
            if self.doc.loot.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.loot_body(depth, "loot", &self.doc.loot, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</loot>");
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);
        self.loot_children(n, open_end, depth, "loot", &self.base.loot, &self.doc.loot, out);
    }

    /// The `<item>` entries from `skip` onwards, each on its own indented line.
    fn loot_body(&self, depth: usize, path: &str, new: &[LootEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in new.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.loot_tag(e, &format!("{path}[{i}]"), depth + 1, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn loot_children(
        &self,
        container: &Node,
        open_end: usize,
        depth: usize,
        path: &str,
        base: &[LootEntry],
        new: &[LootEntry],
        out: &mut Vec<u8>,
    ) {
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(item) => {
                    // `<inside>` is a transparent wrapper (§13): its items were
                    // folded into the previous entry's children, so the whole
                    // wrapper is passed through as-is.
                    if item.name.eq_ignore_ascii_case("inside") {
                        out.extend_from_slice(&self.src[cursor..item.span.end]);
                        cursor = item.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = item.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..item.span.start]);
                    let p = format!("{path}[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&item.span, out);
                    } else {
                        self.loot_tag(&new[idx], &p, depth + 1, out);
                    }
                    cursor = item.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..container.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.loot_body(depth, path, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    fn loot_tag(&self, e: &LootEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p = Vec::new();
        // The loader takes `id` and never looks at `name` when both are there
        // (§13), but "the engine ignores it" is not a licence to delete it —
        // the TFS corpus writes both as a matter of course, `id` for the server
        // and `name` for whoever reads the file next.
        if let Some(id) = e.id {
            p.push(Pair("id".into(), id.to_string()));
        }
        if let Some(name) = &e.name {
            p.push(Pair("name".into(), name.clone()));
        }
        p.push(Pair("chance".into(), e.chance.to_string()));
        if e.countmax != 1 {
            p.push(Pair("countmax".into(), e.countmax.to_string()));
        }
        if let Some(v) = e.subtype {
            p.push(Pair("subtype".into(), v.to_string()));
        }
        // camelCase — `actionid` would be silently ignored by the loader (§13).
        if let Some(v) = e.action_id {
            p.push(Pair("actionId".into(), v.to_string()));
        }
        if let Some(v) = &e.text {
            p.push(Pair("text".into(), v.clone()));
        }

        if e.children.is_empty() {
            self.tag("item", &p, path, out);
        } else {
            out.extend_from_slice(b"<item");
            for Pair(k, v) in &p {
                out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
            }
            out.push(b'>');
            for (i, c) in e.children.iter().enumerate() {
                self.eol(out);
                self.indent(depth + 1, out);
                self.loot_tag(c, &format!("{path}.children[{i}]"), depth + 1, out);
            }
            self.eol(out);
            self.indent(depth, out);
            out.extend_from_slice(b"</item>");
        }
        if let Some(comment) = &e.comment {
            out.extend_from_slice(self.enc(&format!(" <!-- {comment} -->")).as_slice());
        }
    }

    /// `<script>` holds the creature events the model owns — the root's own
    /// `script=` attribute is a different thing entirely.
    fn script(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        let new = &self.doc.events;
        if n.self_closed {
            if new.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.event_body(depth, new, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</script>");
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);

        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(e) => {
                    if !e.name.eq_ignore_ascii_case("event") {
                        out.extend_from_slice(&self.src[cursor..e.span.end]);
                        cursor = e.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = e.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..e.span.start]);
                    if e.attr("name") == Some(new[idx].as_str()) {
                        self.raw(&e.span, out);
                    } else {
                        self.tag("event", &[Pair("name".into(), new[idx].clone())], "", out);
                    }
                    cursor = e.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.event_body(depth, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<event>` names from `skip` onwards, each on its own indented line.
    fn event_body(&self, depth: usize, events: &[String], skip: usize, out: &mut Vec<u8>) {
        for e in events.iter().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("event", &[Pair("name".into(), e.clone())], "", out);
        }
    }

    // ---------- canonical whole-document render ----------

    fn canonical_root(&self, out: &mut Vec<u8>) {
        let d = self.doc;
        let mut attrs = vec![Pair("name".into(), d.name.clone())];
        if let Some(v) = &d.name_description {
            attrs.push(Pair("nameDescription".into(), v.clone()));
        }
        if self.profile.has_species {
            if let Some(v) = &d.species {
                attrs.push(Pair("species".into(), v.clone()));
            }
        }
        if let Some(v) = &d.race {
            attrs.push(Pair("race".into(), v.clone()));
        }
        attrs.push(Pair("experience".into(), d.experience.to_string()));
        attrs.push(Pair("speed".into(), d.speed.to_string()));
        attrs.push(Pair("manacost".into(), d.manacost.to_string()));
        if let (Some(key), Some(v)) = (self.profile.raceid_attr, d.raceid) {
            attrs.push(Pair(key.into(), v.to_string()));
        }
        if d.skull != "none" {
            attrs.push(Pair("skull".into(), d.skull.clone()));
        }
        if let Some(v) = &d.script {
            attrs.push(Pair("script".into(), v.clone()));
        }

        out.extend_from_slice(b"<monster");
        for Pair(k, v) in &attrs {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
        }
        out.push(b'>');

        let line = |out: &mut Vec<u8>, depth: usize, s: &str, w: &Self| {
            w.eol(out);
            w.indent(depth, out);
            out.extend_from_slice(s.as_bytes());
        };

        line(out, 1, &format!(r#"<health now="{}" max="{}" />"#, d.health.now, d.health.max), self);
        {
            let mut buf = Vec::new();
            self.tag("look", &self.look_pairs(), "look", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }
        line(
            out,
            1,
            &format!(
                r#"<targetchange interval="{}" chance="{}" />"#,
                d.targetchange.interval, d.targetchange.chance
            ),
            self,
        );
        // TVP warns when `<targetstrategy>` is missing and Nostalrius does too,
        // so a freshly created monster gets one rather than starting life with a
        // guaranteed console warning.
        if let Some((node_name, _)) = self.profile.target_strategy {
            let mut buf = Vec::new();
            self.tag(node_name, &self.target_strategy_pairs(), "targetStrategy", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }
        if self.profile.has_bestiary && d.bestiary.is_some() {
            let mut buf = Vec::new();
            self.tag("bestiary", &self.bestiary_pairs(), "bestiary", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }

        for name in SECTIONS {
            self.section(name, true, out);
        }
        self.eol(out);
        out.extend_from_slice(b"</monster>");
        self.eol(out);
    }

    /// One §2 block rendered from the model alone, at root depth, prefixed by
    /// its own newline and indent. Emits nothing when the model has nothing to
    /// put in it. Used both for a whole new document and to graft a block onto
    /// a file that never had one — `canonical` is the former, where `<defenses>`
    /// and `<loot />` are written even when empty because every file has them.
    fn section(&self, name: &str, canonical: bool, out: &mut Vec<u8>) {
        let d = self.doc;
        let line = |out: &mut Vec<u8>, depth: usize, s: &str, w: &Self| {
            w.eol(out);
            w.indent(depth, out);
            out.extend_from_slice(w.enc(s).as_slice());
        };

        match name {
            "flags" if !d.flags.is_empty() => {
                line(out, 1, "<flags>", self);
                for (k, v) in &d.flags {
                    let value = match v {
                        FlagValue::Bool(b) => if *b { "1" } else { "0" }.to_string(),
                        FlagValue::Num(x) => x.to_string(),
                    };
                    line(out, 2, &format!(r#"<flag {k}="{value}" />"#), self);
                }
                line(out, 1, "</flags>", self);
            }
            "immunities" if !d.immunities.is_empty() => {
                line(out, 1, "<immunities>", self);
                for (k, v) in &d.immunities {
                    line(out, 2, &format!(r#"<immunity {k}="{}" />"#, i32::from(*v)), self);
                }
                line(out, 1, "</immunities>", self);
            }
            "elements" if !d.elements.is_empty() => {
                line(out, 1, "<elements>", self);
                for (k, v) in &d.elements {
                    line(out, 2, &format!(r#"<element {k}="{v}" />"#), self);
                }
                line(out, 1, "</elements>", self);
            }
            "attacks" if !d.attacks.is_empty() || d.attacks_stats.is_some() => {
                // On Nostalrius the container carries the monster's melee.
                let head = match &d.attacks_stats {
                    Some(s) if self.profile.melee == MeleeKind::AttacksNode => {
                        let poison = s
                            .poison
                            .map(|p| format!(r#" poison="{p}""#))
                            .unwrap_or_default();
                        format!(r#"<attacks attack="{}" skill="{}"{poison}"#, s.attack, s.skill)
                    }
                    _ => "<attacks".to_string(),
                };
                if d.attacks.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.spell_body(1, "attacks", "attack", &d.attacks, 0, out);
                    line(out, 1, "</attacks>", self);
                }
            }
            "defenses"
                if canonical
                    || !d.defenses.is_empty()
                    || d.defense_stats.armor != 0
                    || d.defense_stats.defense != 0 =>
            {
                let ds = &d.defense_stats;
                line(out, 1, &format!(r#"<defenses armor="{}" defense="{}">"#, ds.armor, ds.defense), self);
                self.spell_body(1, "defenses", "defense", &d.defenses, 0, out);
                line(out, 1, "</defenses>", self);
            }
            // A block with no children can still carry attributes that matter:
            // `<voices interval chance/>` with every line commented out, and the
            // pacifist-only voices of man.xml, both still set the yell clock.
            // Skipping the node because the child list is empty silently drops them.
            "voices"
                if !d.voices.lines.is_empty()
                    || d.voices.pacifist.is_some()
                    || d.voices.leash.is_some()
                    || d.voices.interval != 0
                    || d.voices.chance != 0 =>
            {
                let mut head = "<voices".to_string();
                if self.profile.voices_interval {
                    head.push_str(&format!(r#" interval="{}""#, d.voices.interval));
                }
                if self.profile.voices_chance {
                    head.push_str(&format!(r#" chance="{}""#, d.voices.chance));
                }
                // Pacifist and leash lead the block, as the corpus writes them.
                let extras = self.voice_extras(0, true, true);
                if d.voices.lines.is_empty() && extras.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.emit_voice_extras(1, &extras, out);
                    self.voice_body(1, &d.voices.lines, 0, out);
                    line(out, 1, "</voices>", self);
                }
            }
            "summons" if !d.summons.entries.is_empty() || d.summons.max_summons != 0 => {
                let head = format!(r#"<summons maxSummons="{}""#, d.summons.max_summons);
                if d.summons.entries.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.summon_body(1, &d.summons.entries, 0, out);
                    line(out, 1, "</summons>", self);
                }
            }
            "loot" if !d.loot.is_empty() => {
                line(out, 1, "<loot>", self);
                self.loot_body(1, "loot", &d.loot, 0, out);
                line(out, 1, "</loot>", self);
            }
            "loot" if canonical => line(out, 1, "<loot />", self),
            "script" if !d.events.is_empty() => {
                line(out, 1, "<script>", self);
                for e in &d.events {
                    line(out, 2, &format!(r#"<event name="{}" />"#, encode_entities(e, b'"')), self);
                }
                line(out, 1, "</script>", self);
            }
            _ => {}
        }
    }
}

/// The root blocks the model owns, in §2 order. A file that is missing one gets
/// it appended on save; the ones it already has are edited in place.
const SECTIONS: [&str; 9] = [
    "flags",
    "immunities",
    "elements",
    "attacks",
    "defenses",
    "voices",
    "summons",
    "loot",
    "script",
];

/// Damage negative and healing positive, with the smaller magnitude in `min` —
/// the order the loader would otherwise swap into (§8.2).
#[allow(dead_code)]
pub fn canonical_min_max(min: i64, max: i64) -> (i64, i64) {
    if min.abs() > max.abs() {
        (max, min)
    } else {
        (min, max)
    }
}

