**What this changes, and why**


**How you verified it**

- [ ] `bun run build`
- [ ] `cargo check` in `src-tauri/`
- [ ] `probe_monster` against the engines this touches (reader, writer or
      profile changes only)

**Checklist**

- [ ] Round-trip still holds — nothing reordered, normalised or dropped on save
- [ ] No hard-coded attribute spellings; the engine profile decides
- [ ] Patch version bumped in `package.json`, `src-tauri/tauri.conf.json` and
      `src-tauri/Cargo.toml`
