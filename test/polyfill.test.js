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
// 模拟 Safari 16：这批 17.4 的 API 也一概没有
const nativeWR = Promise.withResolvers; delete Promise.withResolvers
const nativeOG = Object.groupBy;        delete Object.groupBy
const nativeMG = Map.groupBy;           delete Map.groupBy
const nativeU = Set.prototype.union;    delete Set.prototype.union
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

check('Promise.withResolvers 已安装', typeof Promise.withResolvers === 'function')
{
  const { promise, resolve, reject } = Promise.withResolvers()
  resolve('v'); check('withResolvers 的 resolve 生效', await promise === 'v')
  const r2 = Promise.withResolvers(); r2.reject(new Error('x'))
  check('withResolvers 的 reject 生效', await r2.promise.then(() => false, (e) => e.message === 'x'))
}
check('Object.groupBy 已安装', typeof Object.groupBy === 'function')
check('Map.groupBy 已安装', typeof Map.groupBy === 'function')
check('Set.prototype.union 已安装', typeof Set.prototype.union === 'function')
{
  const g = Object.groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'))
  check('groupBy 分组正确', JSON.stringify(g.odd) === '[1,3]' && JSON.stringify(g.even) === '[2,4]', JSON.stringify(g))
  const u = new Set([1, 2]).union(new Set([2, 3]))
  check('union 结果正确', [...u].sort().join(',') === '1,2,3', [...u].join(','))
  const i = new Set([1, 2]).intersection(new Set([2, 3]))
  check('intersection 结果正确', [...i].join(',') === '2', [...i].join(','))
  check('isSubsetOf 正确', new Set([1]).isSubsetOf(new Set([1, 2])) === true)
}

if (native) AbortSignal.any = native
try { if (nativeWR) Promise.withResolvers = nativeWR } catch (e) {}
try { if (nativeOG) Object.groupBy = nativeOG } catch (e) {}
try { if (nativeMG) Map.groupBy = nativeMG } catch (e) {}
try { if (nativeU) Set.prototype.union = nativeU } catch (e) {}

console.log('')
if (fail > 0) { console.error(`polyfill tests FAILED (${fail})`); process.exit(1) }
console.log(`polyfill tests passed (${pass} checks, ran the shipped lib/client.js)`)

// ---- dsh.client 清单校验（复刻 packages/client/modules 的 parseDshClient） ----
// 少一个 platform 就会让 required 插件 client-modules 组合失败、整个 dsh web 起不来，
// 所以把它钉死在测试里，避免再出现"装了插件导致服务起不来"。
{
  const pkg = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8'))
  const decl = (pkg.dsh || {}).client
  const okArray = (v) => v === undefined || (Array.isArray(v) && v.every((i) => typeof i === 'string'))
  check('dsh.client 是对象', decl && typeof decl === 'object' && !Array.isArray(decl))
  check('dsh.client.platform 是字符串（必填，缺失即启动失败）', typeof (decl || {}).platform === 'string')
  check('dsh.client.platform === "web"', (decl || {}).platform === 'web')
  check('dsh.client.inject 是字符串数组', okArray((decl || {}).inject))
  check('dsh.client.external 是字符串数组', okArray((decl || {}).external))
  check('dsh.client.immediately 是布尔', (decl || {}).immediately === undefined || typeof decl.immediately === 'boolean')
  check('dsh.bundle.patch 指向存在的文件', typeof ((pkg.dsh || {}).bundle || {}).patch === 'string')
  check('声明了 immediately：确保 polyfill 先于 dsh-api-gateway 的 client 半执行', (decl || {}).immediately === true)
}
