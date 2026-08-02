use super::*;

impl<'a> Writer<'a> {
    pub(super) fn raw(&self, span: &Range<usize>, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.src[span.start..span.end]);
    }

    pub(super) fn eol(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.layout.eol);
    }

    pub(super) fn indent(&self, depth: usize, out: &mut Vec<u8>) {
        for _ in 0..depth {
            out.extend_from_slice(&self.layout.indent);
        }
    }

    /// Discards the indentation already written in front of a node that is
    /// being dropped, so a deleted entry doesn't leave its own blank line behind.
    pub(super) fn drop_pending_ws(&self, out: &mut Vec<u8>) {
        self.split_pending_ws(out);
    }

    /// Takes the whitespace already written at the end of `out` back off it.
    /// The last child of a container is the indentation in front of its closing
    /// tag; appended nodes have to land *before* that run, or the closing tag
    /// ends up glued to the last new node and a stray indent line is left where
    /// the append started.
    pub(super) fn split_pending_ws(&self, out: &mut Vec<u8>) -> Vec<u8> {
        let keep = out
            .iter()
            .rposition(|b| !b.is_ascii_whitespace())
            .map_or(0, |i| i + 1);
        out.split_off(keep)
    }

    /// Re-emits a self-closing start tag as an opening one: `<loot />` becomes
    /// `<loot>`, attributes and all, so a block that gained children can hold
    /// them without losing anything the tag already carried.
    pub(super) fn reopen(&self, n: &Node, out: &mut Vec<u8>) {
        let raw = &self.src[n.element_span.start..n.element_span.end];
        let mut head = raw[..raw.len().saturating_sub(2)].to_vec();
        while head.last().is_some_and(|b| b.is_ascii_whitespace()) {
            head.pop();
        }
        out.extend_from_slice(&head);
        out.push(b'>');
    }

    pub(super) fn enc(&self, s: &str) -> Vec<u8> {
        self.layout.encoding.encode(s)
    }

    /// `<name a="1" b="2" />`, with `unknownAttributes` for this path replayed
    /// after the modelled ones so nothing is lost.
    pub(super) fn tag(&self, name: &str, pairs: &[Pair], path: &str, out: &mut Vec<u8>) {
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

}
