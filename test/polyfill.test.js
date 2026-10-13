// Runs the SHIPPED client half (lib/client.js) with a stubbed window, so the
// test covers the exact file the browser loads — no duplicated implementation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(dir, '..', 'lib', 'client.js'), 'utf8')

let loaded = null
const fakeWindow = { __ModuleLoader__: { load(def) { loaded = def } } }

// Simulate an old WebKit: no AbortSignal.any at all.
const native = AbortSignal.any
delete AbortSignal.any
assert.equal(typeof AbortSignal.any, 'undefined', 'test setup: AbortSignal.any must be absent')

new Function('window', source)(fakeWindow)   // installs the polyfill + registers the plugin

let pass = 0, fail = 0
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log('  [ok]   ' + name) }
  else { fail += 1; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')) }
}

check('client.js 注册了插件行', loaded && loaded.id === 'dsh-abort-polyfill')
check('factory 返回带 apply 的插件', typeof loaded.factory().apply === 'function')
check('AbortSignal.any 已被安装', typeof AbortSignal.any === 'function')

// 语义：任一输入 abort → 合成信号 abort，且携带第一个 reason
{
  const a = new AbortController(); const b = new AbortController()
  const any = AbortSignal.any([a.signal, b.signal])
  check('初始未 abort', any.aborted === false)
  const reason = new Error('caller cancelled')
  b.abort(reason)
  check('输入 abort 后合成信号 abort', any.aborted === true)
  check('reason 透传', any.reason === reason)
  check('a 未受影响', a.signal.aborted === false)
}
// 已 abort 的输入 → 立刻返回已 abort 的信号
{
  const a = new AbortController(); a.abort(new Error('already'))
  const any = AbortSignal.any([a.signal, new AbortController().signal])
  check('已 abort 的输入 → 返回已 abort', any.aborted === true)
  check('已 abort 的 reason 透传', String(any.reason && any.reason.message) === 'already')
}
// 空列表 → 不 abort
check('空列表不 abort', AbortSignal.any([]).aborted === false)
// 容错：undefined 条目被跳过（真实场景里 token.abort.signal 可能缺失）
{
  const c = new AbortController()
  const any = AbortSignal.any([undefined, c.signal])
  check('undefined 条目被跳过', any.aborted === false)
  c.abort(); check('跳过 undefined 后仍能正常 abort', any.aborted === true)
}
// 监听器移除：abort 后不应再触发第二次
{
  const a = new AbortController()
  const any = AbortSignal.any([a.signal])
  let n = 0; any.addEventListener('abort', () => { n += 1 })
  a.abort(); a.abort()
  check('重复 abort 不会重复派发', n <= 1)
}

if (native) AbortSignal.any = native   // restore for the process

console.log('')
if (fail > 0) { console.error(`polyfill tests FAILED (${fail})`); process.exit(1) }
console.log(`polyfill tests passed (${pass} checks, ran the shipped lib/client.js)`)
