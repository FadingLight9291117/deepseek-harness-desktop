# Agent Note: 桌面打包工具链(desktop-packaging-toolchain)

Status: implemented

[English](2026-08-15-desktop-packaging-toolchain.md) | 中文

## 问题

Electron 桌面壳只能从源码或构建产物运行,没有产出可安装 macOS 应用的方式。在这个 workspace 上裸跑 `@electron/packager` 必然失败:`prune=true` 被 workspace 符号链接的 devDependencies 卡死(galactus),`prune=false` 因循环嵌套符号链接链(cordis ↔ cordis-plugin-include)触发 ENAMETOOLONG。打包应用还必须以真实文件携带完整生产闭包——Loader 解析 profile 行、`/plugins/<id>/client.js` 路由在运行时都从磁盘读取它们。

## 决策

### 先 staging,再打包

`scripts/package-desktop.ts` 先执行 `pnpm --filter @deepseek-ai/dsh-desktop deploy --legacy --prod`,staging 到 `.artifacts/desktop/staging`(hoisted 布局),再用 `@electron/packager`(程序化 API,`prune: false`,`asar: false`)打包 staging 树。staging 机制经 `scripts/deploy-staging.ts` 与 Python SDK 单文件可执行构建共享(自 `scripts/build-exe-for-python-sdk.ts` 提取)。

staging 在打包器运行前修复 deploy 的三类缺口:

- **符号链接**:legacy deploy 留下包符号链接与 `.bin` 垫片目录,全部物化为文件副本(打包载荷必须无链接,zip 也不能携带指向 workspace 的绝对链接)。
- **被遗漏的闭包成员**:`pnpm deploy` 不跟随传递依赖的 `link:` workspace override(`@deepseek-ai/cosmokit` 是 vendored cordis 的依赖,cordis 急切导入它,deploy 却漏掉),也漏掉部分嵌套真实 npm 依赖。`restoreOmittedClosureDeps` 对已部署 manifest 做 BFS(与 `healProfilesModuleFallback` 启动时同一次遍历),把每个缺失成员从 workspace 镜像或 pnpm store 补回;到处都不存在的名字(ws 的 bufferutil 等 optional 依赖)跳过,完整性由打包冒烟兜底。
- **manifest 归一化**:staged manifest 得到 X.Y.Z 版本号(CFBundleShortVersionString)并剥离 devDependencies;依赖名字保持完整(heal 只读名字)。

打包器输出 `<out>/<name>-<platform>-<arch>/<name>.app`;脚本随后 ad-hoc 签名(`codesign --force --deep --sign -`)、headless 冒烟(`--headless-boot --port 0`,等启动标记、SIGTERM、退出 0),再用 `ditto -c -k --keepParent` 打 zip。`--install` 用 `ditto` 拷到 `~/Applications`(fs.cp 会解引用框架符号链接而损坏 bundle)并 `open`。

实现过程中发现并被脚本固化的两个陷阱:

- 打包冒烟可能在一条路径通过、另一条路径失败:解析会从锚点沿目录链向上走,位于仓库下方的 bundle 能逃逸进仓库自身的 node_modules,掩盖缺失的闭包成员。安装位置的启动才是真正的检查。
- `pnpm deploy` 的 legacy hoisting 会改动主 workspace 中部署源包的 node_modules,导致后续 `pnpm run` 的 deps-status 检查失败;管线在 staging 后补一次普通 `pnpm install` 恢复规范状态。

### 产物立场

macOS `.app` 打成 zip(`.artifacts/desktop/` 下 `dsh-desktop-darwin-<arch>.zip`),ad-hoc 签名。无 dmg、无 Developer ID 签名、无公证、无自动更新——与[桌面壳选型 note](../architecture/2026-08-14-desktop-shell-tech-selection.md)记录的发行范围一致。将来 Homebrew cask 可以直接消费 release zip,无需改动工具链。v1 使用默认 Electron 图标;图标资产与 Developer ID 签名留作后续。

### CI

`.github/workflows/package-desktop.yml` 镜像 Python 单文件可执行 lane:`workflow_call` + `workflow_dispatch` + PR 标签 `build-desktop`,每个 target 一个矩阵 job(darwin-arm64 跑 macos-latest,darwin-x64 跑 macos-13),install → build → package(脚本内置冒烟即 lane 的验证)→ `upload-artifact@v7`(保留 7 天)。它是 artifact lane,不进 `all-checks-passed`。

## 后果

- `pnpm run package:desktop [--targets=...] [--skip-build] [--install] [--dry-run]` 产出并可安装应用;首次运行下载 Electron dist zip(github.com 不可达时设 `ELECTRON_MIRROR`)。
- 打包应用与窗口开发模式启动同一棵 profile 树;headless 冒烟证明 bundle 完整性(profile 解析、healed 回退、宿主树)。
- node-pty 按 workspace 中已安装的预编译 addon 随包(与 dev 行为一致);针对 Electron ABI 的 rebuild 不在范围内。
- 浏览器下载的 zip 带 quarantine 属性;`xattr -dr com.apple.quarantine dsh-desktop.app` 清除。

## 备选方案

**electron-builder**。生态标准工具,自带 dmg 与签名钩子,但配置面更大、在 pnpm staged 树上的行为未知;dmg 与公证都在 v1 范围外,其优势用不上。

**直接打包 workspace 目录**。两种 prune 模式在 workspace 布局上都会失败(见问题);无论用哪个打包器,staging 都不可省。

**dmg 产物**。属于安装器形态的发行物,与记录的 v1 范围相悖。

**现在就建 Homebrew cask**。需要公开的 tagged release 与稳定下载 URL;首个 tag 前无外部消费者的预发布立场排除了它。
