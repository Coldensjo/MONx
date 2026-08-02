use super::*;

impl<'a> Writer<'a> {
    // ---------- flags / immunities / elements ----------
    //
    // All three are "one attribute per node" lists (§5, §10, §11) driven by a
    // BTreeMap in the model. Emission follows the *file's* node order so an
    // untouched list stays untouched; keys the file didn't have are appended.

    pub(super) fn flags(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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

    pub(super) fn immunities(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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

    pub(super) fn elements(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
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
    pub(super) fn attr_list(
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

}
