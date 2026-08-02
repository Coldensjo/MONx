use super::*;

impl<'a> Writer<'a> {
    // ---------- root ----------

    pub(super) fn root(&self, root: &Node, out: &mut Vec<u8>) {
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
    pub(super) fn open_tag_end(&self, node: &Node) -> usize {
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

    pub(super) fn root_attrs_unchanged(&self) -> bool {
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
    pub(super) fn root_open_tag(&self, root: &Node, out: &mut Vec<u8>) {
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

    pub(super) fn root_child(&self, n: &Node, out: &mut Vec<u8>) {
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
    pub(super) fn leaf(&self, n: &Node, path: &str, pairs: Vec<Pair>, unchanged: bool, out: &mut Vec<u8>) {
        if unchanged && self.unknown_same(path) {
            self.raw(&n.span, out);
        } else {
            self.tag(&n.name, &pairs, path, out);
        }
    }

    pub(super) fn unknown_same(&self, path: &str) -> bool {
        self.base.unknown_attributes.get(path) == self.doc.unknown_attributes.get(path)
    }

    pub(super) fn health_pairs(&self) -> Vec<Pair> {
        vec![
            Pair("now".into(), self.doc.health.now.to_string()),
            Pair("max".into(), self.doc.health.max.to_string()),
        ]
    }

    pub(super) fn look_pairs(&self) -> Vec<Pair> {
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

    pub(super) fn target_strategy_pairs(&self) -> Vec<Pair> {
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

    pub(super) fn bestiary_pairs(&self) -> Vec<Pair> {
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
    pub(super) fn interval_key(&self, n: &Node) -> String {
        if n.attr_exact("interval").is_none() && n.attr("speed").is_some() {
            "speed".to_string()
        } else {
            "interval".to_string()
        }
    }

    pub(super) fn targetchange_pairs(&self, n: &Node) -> Vec<Pair> {
        vec![
            Pair(self.interval_key(n), self.doc.targetchange.interval.to_string()),
            Pair("chance".into(), self.doc.targetchange.chance.to_string()),
        ]
    }

}
