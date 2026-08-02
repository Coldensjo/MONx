use super::*;

impl<'a> Writer<'a> {
    // ---------- spells ----------

    pub(super) fn defenses(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn attacks(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn spells(
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
    pub(super) fn spell_body(
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
    pub(super) fn spell_children(
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
    pub(super) fn spell_tag(&self, tag: &str, s: &SpellBlock, path: &str, depth: usize, out: &mut Vec<u8>) {
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

}
