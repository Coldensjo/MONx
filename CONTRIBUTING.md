# Contributing

Thanks for taking an interest in MONx.

## Getting set up

See [README.md](README.md) for prerequisites and the build. In short:

```sh
bun install
bun run tauri:dev
```

MONx needs a monster corpus to do anything useful. The `assets/` and `sources/`
folders are gitignored — populate them locally with your own server data.

## Before you open a pull request

- **Frontend**: `bun run build` (runs `tsc`, then Vite).
- **Backend**: `cargo check` in `src-tauri/`.
- **Behaviour**: `cargo run --release --example probe_monster -- <monsters-dir>`
  reads and rewrites a whole corpus and diffs the bytes. If you touched the
  reader, the writer or an engine profile, run it against every engine you can
  — see [AGENTS.md](AGENTS.md) for the full list of gates.

There is no test suite and no linter beyond TypeScript strict mode.

## House rules

- **Round-trip is sacred.** Saving a monster must not reorder, normalise or
  drop anything — unknown attributes and comments included. A value the server
  would reject gets linted, not silently rewritten.
- **MONx never writes client files.** `items.otb`, `.spr` and `.dat` are read
  only, and none of them belong in a commit.
- **Ask the engine profile, never hard-code a spelling.** Six servers are
  supported and they disagree about nearly every attribute name.
- **Keep it small.** No new abstraction until the pattern has repeated three
  times.

[AGENTS.md](AGENTS.md) has the architecture and conventions in full;
[ENGINES.md](ENGINES.md) covers what each supported server does differently.

## Bugs and ideas

Open an issue. For anything about a specific monster file, include the file
itself (or the few lines that matter) and which server it came from — most
misbehaviour turns out to be engine-specific.
