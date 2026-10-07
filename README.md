# GVE Now!

Guided-view editor companion app for [Comics Now!](https://github.com/ComicsNow/comics-now). Serves a web UI and REST API
(port 3100 by default) for authoring guided-view data, and hosts the full-res
WebP page cache shared with the comics-now reader.

> New here? The [docs/WIKI.md](docs/WIKI.md) is a full instructional guide —
> concepts, the editor, import/export, the data model, the API, and
> troubleshooting. This README is the install/ops reference.

## Requirements

- Node.js ≥ 20
- A comics-now install anywhere on disk — the app needs its database and
  library, not a specific path
- `ffmpeg` on PATH for page transcoding (default `ffmpegBin`)

## Install

```bash
git clone <repo-url> /opt/gve-now
cd /opt/gve-now
npm ci
```

Create `config.json` pointing at your comics-now install (see
`config.example.json`). Every path key is optional — they all derive from
`comicsNowRoot`, which may be any path:

```json
{
  "comicsNowRoot": "/media/comics/comics-now",
  "bind": "127.0.0.1"
}
```

Check the setup before starting, then run:

```bash
node bin/gve-now.js check
npm start
```

The web UI bundle is committed (`public/app.js`), so no build step is needed
for a fresh install. After changing anything under `src/web`, rebuild with
`npm run build:web` (the server warns at startup if the bundle is missing).

## Configuration

`config.json` (in the app root, or wherever `GVE_NOW_CONFIG` points):

| Key | Default | Meaning |
| --- | --- | --- |
| `comicsNowRoot` | `/opt/comics-now` | Where comics-now is installed. `dbPath`, `guidedViewDir`, `backupDir` and `pageCacheDir` all derive from it |
| `port` | `3100` | HTTP port. If it's already in use the server exits with an error — change this value |
| `bind` | `127.0.0.1` | Bind address. Non-loopback requires `GVE_NOW_ALLOW_REMOTE=1` |
| `ffmpegBin` | `ffmpeg` | ffmpeg executable for WebP transcoding |
| `prefsUserId` | `default-user` | comics-now preferences user id |
| `dbPath`, `guidedViewDir`, `backupDir`, `pageCacheDir` | derived from `comicsNowRoot` | Optional pins for custom locations. Prefer letting them derive — the settings UI refuses to change `comicsNowRoot` while a custom pin is present, and drops stale ones automatically |

Environment variables (override `config.json`):

| Variable | Overrides |
| --- | --- |
| `GVE_NOW_CONFIG` | Path of the config file |
| `COMICS_NOW_ROOT` | `comicsNowRoot` |
| `GVE_NOW_PORT`, `GVE_NOW_BIND` | `port`, `bind` |

## Systemd

Copy `systemd/gve-now.service` to `/etc/systemd/system/`, adjust `User` and
`WorkingDirectory`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gve-now
```

Restart after saving settings (`sudo systemctl restart gve-now`). The unit
binds `0.0.0.0` via `GVE_NOW_ALLOW_REMOTE=1` — see below.

## Security

The app has **no built-in authentication** and can rewrite reader content; it refuses to
bind non-loopback addresses unless `GVE_NOW_ALLOW_REMOTE=1` is set. Remote
binding is a deliberate LAN-trust decision: anyone who can reach the port can
read and change the guided-view data and the config. Don't expose it directly to the
public internet — always run containerized or remote deployments behind a secure
reverse proxy (such as Caddy, Nginx, or Traefik with authentication and TLS) or
within a private network/VPN.

The server enforces Host header validation to prevent DNS rebinding attacks on loopback
and LAN interfaces. To allow additional custom domain names or hostnames, set `GVE_NOW_ALLOWED_HOSTS=myhost.local,comics.example.com`.

The official Docker image runs as the unprivileged `node` user.

## Development

```bash
npm test                  # full suite
npm run build:web         # rebuild the frontend bundle
npm run build:web:watch   # rebuild on change
```

## License

AGPL-3.0-or-later. GVE Now! is a companion to — and ports code from —
[comics-now](https://github.com/ComicsNow/comics-now), which is AGPL-3.0, so it
carries the same license. See [LICENSE](LICENSE).

Copyright (C) 2026 comicsnowdev
