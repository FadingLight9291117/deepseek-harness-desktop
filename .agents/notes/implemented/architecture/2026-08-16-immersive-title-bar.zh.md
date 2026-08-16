# Agent Note: 桌面壳的沉浸式标题栏

Status: implemented

[English](2026-08-16-immersive-title-bar.md) | 中文

## 问题

桌面窗口在 Web UI 上方显示操作系统系统标题栏，浪费纵向空间，也在视觉上把应用表面与窗口 chrome 分隔开。桌面壳应当使用沉浸式标题栏：UI 延伸到窗口顶部边缘，macOS 红绿灯悬浮在内容之上，Windows 保留其窗口控制覆盖层——不再有系统单独绘制的标题栏。

## 决策

桌面壳按平台隐藏系统标题栏，并在 renderer 中渲染一条 38px 的拖拽条，同时充当窗口的拖拽表面：

- **主进程** —— `desktopWindowChrome(platform, dark)`（`apps/desktop/src/main/window-boot.ts`）返回窗口 chrome 子集：macOS 使用 `titleBarStyle: 'hiddenInset'` 与 `trafficLightPosition: { x: 12, y: 12 }`，使红绿灯在条上居中；Windows 使用 `titleBarStyle: 'hidden'` + `titleBarOverlay`，并配以随主题匹配的 `color`/`symbolColor` 与条高；两者都获得随主题匹配的 `backgroundColor`，使缩放时不闪色。其他平台保留系统标题栏。窗口订阅 `nativeTheme` 更新，在系统主题切换时重新应用覆盖层/底色。
- **Preload 桥** —— 在 `subscribeStream` 旁暴露 `platform`（Node `process.platform`）；`dsh-client-connection-ipc` 在全局 `dshDesktop` 类型上声明它。
- **Renderer** —— `apps/desktop/src/renderer/main.ts` 读取桥的 platform 并在 `<html>` 上设置 `data-dsh-platform`；随后 `titlebar.css` 将 `#dsh-titlebar`（index.html）渲染为固定 38px 的 `-webkit-app-region: drag` 条，带主题底色，并把 `body` 垫高同样高度。Web 入口从不设置该属性，因此浏览器表面保持不变。

条本身是空的：macOS 在它上面绘制红绿灯，Windows 在它上面绘制覆盖层控制按钮；DOM 条只提供拖拽区域与融入底色。

## 后果

- 桌面 UI 获得约 38px 的可用高度与原生质感窗口；从顶部条的任意位置都可拖拽窗口。
- 窗口 chrome 的颜色决策集中在一个带单元测试覆盖的纯函数中；renderer 的平台武装只是读取一个属性。
- 条高是共享常量（window-boot.ts 的 `TITLE_BAR_HEIGHT`），必须与 `titlebar.css` 的 38px 保持同步；只改其一会使拖拽表面错位。
- 已知局限：条在三列上方使用单一主题底色；侧边栏的独立填充色从条下方才开始。未来如需按列的背景条，需要布局层的配合。

## 备选方案

- **完全自定义标题栏（每个平台都绘制控制按钮）** —— 跨平台一致，但需要第二套控制实现（最小化/最大化/关闭 IPC、悬停态、贴边提示），且没有原生集成。已否决：macOS/Windows 已原生提供各自的控制，pre-release 范围倾向最小化壳 chrome。
- **仅在现有顶部行做 CSS 拖拽** —— 复用侧边栏 logo 行作为拖拽表面可以避免独立条，但会把窗口 chrome 耦合到布局组件，并在会话列上方没有拖拽区域。已否决：固定条与布局无关，在加载页与 settle 后表现一致。
