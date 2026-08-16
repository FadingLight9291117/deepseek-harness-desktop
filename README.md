# DeepSeek Harness Desktop

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

The project ships two surfaces: a **desktop app** (the primary distribution for macOS) and a browser-based Web UI.

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Desktop app (macOS)

The packaged desktop app (`DeepSeek.app`) runs the full harness UI in an Electron shell with an immersive title bar — no Node.js or command line needed.

Install it with Homebrew:

```sh
brew tap FadingLight9291117/deepseek
brew install --cask deepseek
```

or with npm (installs `DeepSeek.app` into `~/Applications`; the download skips the quarantine attribute, so Gatekeeper does not block first launch):

```sh
npm install -g deepseek-desktop
```

or download the latest `DeepSeek-darwin-<arch>.zip` from the repository's Releases page, unzip, and (for browser-downloaded zips) clear the quarantine attribute:

```sh
xattr -dr com.apple.quarantine DeepSeek.app
```

The desktop shell opens no HTTP port: it serves the same UI over the local `dsh://` protocol and boots the shared `desktop` profile from the same harness home as the CLI. See [apps/desktop](apps/desktop/README.md).

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
