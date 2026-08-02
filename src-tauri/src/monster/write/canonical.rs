use super::*;

impl<'a> Writer<'a> {
    // ---------- canonical whole-document render ----------

    pub(super) fn canonical_root(&self, out: &mut Vec<u8>) {
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
    pub(super) fn section(&self, name: &str, canonical: bool, out: &mut Vec<u8>) {
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
