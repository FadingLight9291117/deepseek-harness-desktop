# Agent Note：桌面标题栏跟随应用主题

状态：已实现

[English](2026-08-16-desktop-title-bar-theme-sync.md) | 中文

## 问题

桌面应用的原生窗口标题栏只跟随操作系统外观，而应用自身带有独立的浅色/深色/系统主题偏好（设置"常规"页的外观行，持久化在 `$DSH_HOME/settings.yaml` 的 `ui-theme.preference`）。当应用设为深色而系统为浅色（或相反）时，标题栏与内容错配。此前的沉浸式标题栏尝试（自绘拖拽条，随后被回退）因难看被否决；保留系统原生标题栏，让它跟随应用自身主题。

## 决策

宿主侧同步，零 renderer/preload/IPC 改动：

- 主题偏好已在宿主 settings 服务上流通：renderer 通过 `api.settings.mutate` 写入 `ui-theme.preference`，settings provider 落盘并发出 `settings/updated`。
- 桌面 bundle 插件（`@deepseek-ai/dsh-desktop-app`）消费可选的 `desktopThemeSync` 服务：激活时应用已持久化的偏好，此后每次针对 `ui-theme` 命名空间的 `settings/updated` 都重新应用。headless 启动不提供该服务，插件在无服务时跳过同步并照常提供 `desktopRuntime`。
- Electron 主进程提供该服务：`createDesktopNativeRuntime`（`apps/desktop/src/main/native.ts`）写入 `nativeTheme.themeSource`；host-boot 的 prepare 阶段仅在 Electron 下把它提供为 `desktopThemeSync`。
- 转发的是**原始偏好**（`'light' | 'dark' | 'system'`），绝不是解析后的配色。Electron 会把 `nativeTheme.themeSource` 传播进 renderer 的 `prefers-color-scheme`；钉死解析值会让 `ThemeRuntime` 的 `matchMedia` 永远镜像这个钉子，把 `system` 偏好冻结在当前 OS 配色上。转发偏好则保持 `themeSource='system'` 完好，原生 OS 跟踪不受破坏。
- 用 `settings/updated` 而非 `settings/document-updated`：前者是消费者事件、deep-equal 门控、直接携带解析值。
- 同进程类型化边界不再校验：`ThemeSettingsSchema` 已在 settings 边界约束枚举，`nativeTheme.themeSource` 接受同一联合类型。

## 后果

- 原生标题栏（含 macOS 红绿灯）立即跟随应用的浅色/深色/系统设置，包括 renderer 加载前的启动阶段：出厂 profile 分层保证 ui-theme 命名空间（web-app 层）先于 desktop 层挂载注册，插件的激活读取必然看到已持久化文档。
- headless 启动保持 electron-free：`options.native` 为 undefined，服务不被提供，插件同步块跳过。
- `themeSource` 是进程级的；v1 单窗口外壳无感知（桌面 README 已注明）。
- 唯一理论缺口——某组合中 ui-theme 命名空间在插件激活之后才注册且此后再无提交——在出厂分层 profile 中不可能发生。单层平铺 include 的组合会错过初始值直到首次提交；真实组合测试因此镜像出厂分层。

## 备选方案

- **renderer→main IPC 转发解析后配色** — preload 方法加 `ipcMain` 处理器，转发 `ThemePresenter` 解析出的 light/dark。否决：把 `themeSource` 钉死在解析值上，反哺 renderer 的 `prefers-color-scheme`，冻结 `system` 用户（见决策）。
- **只跟随 OS 主题（`nativeTheme.shouldUseDarkColors`）** — 被回退的沉浸式条的做法。否决：跟踪的是 OS 而非应用自身设置，两者不一致时标题栏必然错配。
- **窗口级 `setBackgroundColor` 再同步** — 防缩放闪色的装饰性处理；renderer 主体铺满窗口时无必要。
