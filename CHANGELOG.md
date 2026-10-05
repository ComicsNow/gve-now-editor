# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-05

### Security
- Validate the HTTP Host header and reject untrusted hosts with 403 to prevent
  DNS-rebinding against loopback/LAN; add `GVE_NOW_ALLOWED_HOSTS` for custom hostnames (#1)
- Docker image now runs as the unprivileged `node` user instead of root (#1)
- Document running behind a reverse proxy / private network (#1)

  > ⚠️ **Behavior change:** if you reach the app via a custom hostname (e.g. a reverse
  > proxy), set `GVE_NOW_ALLOWED_HOSTS=yourhost` or requests get a 403.

### Fixed
- Library prefix match no longer leaks preferences across sibling libraries
  (`/comics` vs `/comics2`) (#2)
- Malformed `config.json` now fails loudly instead of silently using defaults, and is
  no longer overwritten on save (#3)
- Library search escapes `%` and `_` so they match literally (#4)
- Guided-view database writes retry on `SQLITE_BUSY` with async backoff and a low
  `busy_timeout`, so lock contention no longer blocks the event loop (#6)

### Performance
- Page dimensions are cached by file + mtime; re-opening a comic no longer re-unzips
  every page (#5)

### CI / tooling
- Add CI (`npm test` + web-bundle-drift check) on pushes and pull requests (#7)
- Release workflow tags Docker images by `{major}.{minor}` instead of a hardcoded `1.0` (#7)

## [1.0.0] - 2026-10-05

- Initial public release: GVE Now!, a guided-view editor for comics-now.
