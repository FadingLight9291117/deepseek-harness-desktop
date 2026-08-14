# @deepseek-ai/dsh-host-directory-picker-electron

[English](README.md) | 中文

[目录选择能力 seam](../directory-picker/README.md) 的 Electron Service Provider。`ElectronDirectoryPicker` 在 `ctx.directoryPicker` 上注册稳定的 `{ kind: 'native', pick(signal) }` 能力，并把每次选择委托给应用持有的 `ctx.electronDirectoryPickerRuntime`。Desktop main process 在 Electron 的 `dialog.showOpenDialog` 外提供该 runtime；本包不导入 Electron 代码，因此单元测试与 plain-Node profile 校验都不需要 GUI 二进制。所选路径保持原样跨越调用，包括 Windows 驱动器路径与 UNC 路径。Desktop 组合包另行挂载与传输无关的 [`dsh-client-ui-directory-picker-native`](../../client/ui-directory-picker-native/README.md) 流程。

该 provider 可以在没有应用 runtime 时加载，使构建后的 Desktop 入口能够执行 plain-Node headless smoke。在此模式下调用 `pick` 会以明确的不可用错误失败；真实窗口启动会在 Cordis 加载 profile 前提供 runtime。

## 模型体验

无。该 provider 服务于 GUI 宿主的目录选择；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- Electron 没有提供以编程方式关闭已显示 `showOpenDialog` 面板的 API。调用方中止会立即结算请求并忽略最终结果；原生面板会一直保留，直到操作者关闭它或其父窗口关闭。
