# DeepSeek Harness Desktop

English | [中文](README.zh.md)

DeepSeek Harness Desktop is a macOS desktop distribution of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) agent harness. It runs the full harness UI in an Electron shell with an immersive title bar — no Node.js or command line needed.

The harness uses an architecture where **everything is a plugin**, powered by [Cordis](https://github.com/cordiverse/cordis). This fork ships the desktop app as its primary distribution.

## Developer preview

The project is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Install

### Desktop app (macOS)

Install it with npm (installs `DeepSeek.app` into `~/Applications`; the download skips the quarantine attribute, so Gatekeeper does not block first launch):

```sh
npm install -g deepseek-desktop
```

The desktop shell opens no HTTP port: it serves the same UI over the local `dsh://` protocol and boots the shared `desktop` profile from the same harness home as the CLI. See [apps/desktop](apps/desktop/README.md).

### Web UI via CLI

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

## Run from source

```sh
git clone https://github.com/FadingLight9291117/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm run build
pnpm dsh web
```

## Feedback and support

Report bugs and request features through [GitHub Issues](https://github.com/FadingLight9291117/deepseek-harness-desktop/issues).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
