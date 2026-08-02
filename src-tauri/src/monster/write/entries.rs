use super::*;

impl<'a> Writer<'a> {
    // ---------- voices, summons, loot ----------

    pub(super) fn voices(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn voice_body(&self, depth: usize, lines: &[VoiceLine], skip: usize, out: &mut Vec<u8>) {
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
    pub(super) fn voice_extras(&self, from: usize, want_pacifist: bool, want_leash: bool) -> Vec<(String, Vec<Pair>)> {
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

    pub(super) fn emit_voice_extras(&self, depth: usize, extras: &[(String, Vec<Pair>)], out: &mut Vec<u8>) {
        for (path, pairs) in extras {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("voice", pairs, path, out);
        }
    }

    pub(super) fn voice_pairs(&self, v: &VoiceLine) -> Vec<Pair> {
        let mut p = vec![Pair("sentence".into(), v.sentence.clone())];
        if v.yell {
            p.push(Pair("yell".into(), "1".into()));
        }
        p
    }

    pub(super) fn summons(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn summon_body(&self, depth: usize, entries: &[SummonEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in entries.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.summon_tag(e, &format!("summons.entries[{i}]"), depth + 1, out);
        }
    }

    pub(super) fn summon_tag(&self, e: &SummonEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
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

    pub(super) fn loot(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn loot_body(&self, depth: usize, path: &str, new: &[LootEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in new.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.loot_tag(e, &format!("{path}[{i}]"), depth + 1, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn loot_children(
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

    pub(super) fn loot_tag(&self, e: &LootEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn script(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn event_body(&self, depth: usize, events: &[String], skip: usize, out: &mut Vec<u8>) {
        for e in events.iter().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("event", &[Pair("name".into(), e.clone())], "", out);
        }
    }

}
