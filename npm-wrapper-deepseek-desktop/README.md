# deepseek-desktop

Installer for the **DeepSeek desktop app** (macOS arm64). Downloads the release zip from GitHub Releases and installs `DeepSeek.app` into `~/Applications`. Installing also brings the **`dsh` CLI** (`@deepseek-ai/dsh`) — the full DeepSeek Harness command-line tool — so both the desktop app and the CLI land together.

## Install

```sh
npm install -g deepseek-desktop
```

The `postinstall` hook downloads `DeepSeek-darwin-arm64.zip`, verifies its SHA-256, and installs the app. Downloads prefer **aria2c** (multi-connection), then **wget**, then **curl** — whichever is available on PATH. Progress stays visible even when npm captures script output.

> **Note**: the zip is served from GitHub Releases; if your network cannot reach GitHub directly, enable your proxy before installing (`export https_proxy=http://127.0.0.1:1095` or your local proxy port).

## Usage

The installer also exposes a CLI:

```sh
deepseek-desktop
```

## Overrides

| Env | Default | Purpose |
|---|---|---|
| `DEEPSEEK_DOWNLOAD_URL` | release zip URL | Alternative download source |
| `DEEPSEEK_SHA256` | release zip hash | Expected SHA-256 |
| `DEEPSEEK_APP_DIR` | `~/Applications` | Install directory |

## Requirements

- macOS (darwin), arm64 (Apple Silicon)
- `shasum`, `ditto` (both ship with macOS)
- One of `aria2c` / `wget` / `curl` for downloading (curl always present)
