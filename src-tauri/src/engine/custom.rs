use super::*;


/// One effect a server has added that no stock table could know about.
///
/// The tables above are each read out of a shipped engine's source, which is
/// exactly what makes them trustworthy — and exactly why they cannot cover a
/// fork somebody made last week. A server that adds magic effect 105 has a
/// value MONx would otherwise call unknown, hide from the picker, and warn was
/// "dropped" by a loader that in fact handles it perfectly well.
///
/// So the catalogue is the engine's table *plus* whatever the user declares.
/// This is the declared part: it never replaces a stock entry, and it is the
/// user's word rather than a source file, which is why it lives in settings and
/// not in `ME_IRONCORE`.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEffect {
    /// The wire value, written verbatim — `CONST_ME_PRISMATICBLUE`, or `105`.
    pub name: String,
    /// The client id to preview it with. Zero means "no sprite", which is
    /// legitimate: a name can be declared before the sprite exists.
    pub id: u16,
    /// What to call it in the picker. Empty falls back to the name.
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEffects {
    pub magic: Vec<CustomEffect>,
    pub shoot: Vec<CustomEffect>,
}

impl CustomEffects {
    /// Matched the same way the engine matches its own names: Ironcore compares
    /// `CONST_ME_*` case-sensitively, so a declared name is held to that too —
    /// declaring one must not make MONx laxer than the loader it models.
    fn has(list: &[CustomEffect], naming: EffectNaming, value: &str) -> bool {
        match naming {
            EffectNaming::ConstMe => list.iter().any(|e| e.name == value),
            EffectNaming::ShortName => list.iter().any(|e| e.name.eq_ignore_ascii_case(value)),
        }
    }

    pub fn is_magic(&self, naming: EffectNaming, value: &str) -> bool {
        Self::has(&self.magic, naming, value)
    }

    pub fn is_shoot(&self, naming: EffectNaming, value: &str) -> bool {
        Self::has(&self.shoot, naming, value)
    }
}

