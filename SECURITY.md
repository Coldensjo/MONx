# Security Policy

## Supported versions

Only the latest release is supported. Fixes land on `main`.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability**
button under the Security tab, which opens a private advisory visible only to
the maintainers.

Expect an initial reply within a week.

## Scope

MONx is a local desktop tool. It makes no network requests and loads no remote
assets, so the interesting attack surface is the files it parses: monster XML
and Lua, `items.xml`/`.toml`/`.srv`, `items.otb`, `.spr`, `.dat`, and modern
client asset bundles. All of these are parsed by hand-rolled readers.

Worth reporting: a crafted file that crashes MONx, hangs it, reads or writes
outside the workspace folders, or executes anything. A malformed file that
merely produces a wrong preview or a bogus lint is a normal bug — open an
issue for it.
