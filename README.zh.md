# DeepSeek Harness Desktop

[English](README.md) | 中文

DeepSeek Harness Desktop 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）agent harness 的 macOS 桌面发行版。它在 Electron 壳中运行完整的 harness UI，带沉浸式标题栏——无需 Node.js 或命令行。

它采用**一切皆插件**的架构，由 [Cordis](https://github.com/cordiverse/cordis) 驱动。本 fork 以桌面应用为主要分发形态。

## 开发者预览

项目目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 安装

### 桌面应用（macOS）

通过 npm 安装（将 `DeepSeek.app` 安装到 `~/Applications`；下载不携带隔离属性，首次启动不会触发 Gatekeeper 拦截）：

```sh
npm install -g deepseek-desktop
```

安装也会将 `dsh` 添加到 PATH；使用 `dsh desktop` 启动已安装的应用。桌面壳不打开 HTTP 端口：它通过本地 `dsh://` 协议提供同一套 UI，并从与 CLI 相同的 harness home 启动共享的 `desktop` profile。参见 [apps/desktop](apps/desktop/README.md)。

### 通过 CLI 运行 Web UI

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.md)。

## 从源码运行

```sh
git clone https://github.com/FadingLight9291117/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 反馈与支持

通过 [GitHub Issues](https://github.com/FadingLight9291117/deepseek-harness-desktop/issues) 提交 bug 报告与功能请求。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
