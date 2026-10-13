# dsh-abort-polyfill

给 DSH（DeepSeek Harness）的**客户端插件**：在其它客户端插件加载之前补上 `AbortSignal.any`，
用于内核较老的 iOS。

## 解决什么问题

`AbortSignal.any` 的支持门槛是 **Safari / iOS WebKit 17.4**、Chrome 116、Firefox 124。
iOS 上所有浏览器都用系统 WebKit，所以**升级浏览器没用，只有升级系统**才换得到新内核。

DSH 0.2.1 的浏览器端 RPC 客户端会用这个 API：

- `packages/api/gateway/src/client/index.ts:531` → `AbortSignal.any([token.abort.signal, callerSignal])`
- `packages/api/gateway/src/client/index.ts:480` → `AbortSignal.any([prepared.signal, generation.signal])`

在老 iOS 上它抛 `TypeError: AbortSignal.any is not a function`，于是**工作区一直"重新连接中"出不来**，
而设置 / 插件 / 定时任务这些不走该 API 的页面正常。

## 为什么用插件能修

客户端插件半是在**客户端模块表构建阶段**被 `window.__ModuleLoader__.load(...)` 执行的，
比任何插件的 factory 都早，也比工作区这类懒加载视图早。所以 polyfill 写在
`lib/client.js` **文件体里（factory 之外）** 就一定先于 gateway client 的第一次调用 —— 这是本插件的全部要点。

## 安装

```bash
dsh plugin --profile web add @chenkai114/dsh-abort-polyfill
# 然后硬刷新浏览器（Cmd/Ctrl+Shift+R）
```

验证：在设备上用 Safari 打开 DSH 页面，地址栏输入 `javascript:typeof AbortSignal.any` —— 返回 `function` 即可。
（或者装之前先看一眼：返回 `undefined` 说明这台设备就是缺这个 API。）

## 局限

- **只覆盖主线程**。Worker 有独立全局，页面里的 polyfill 够不着。
  例如 `packages/experimental/webworker-runtime/lib/worker.js` 也用了该 API；若启用那个 worker，
  需要在它的入口单独补一次 polyfill。
- 这是**兜底**，不是替代上游修复：更合适的做法是 DSH 在 web shell 的引导处（kernel 层）装一次 polyfill，
  或在 `packages/api/gateway` 里改用一个本地 `anySignal()` helper。两种情况都需重建 client 产物。

## 许可

MIT
