// dsh-abort-polyfill — client half (self-contained; no imports on purpose).
//
// WHY HERE: `window.__ModuleLoader__.load(...)` runs while the client module
// table is being constructed — earlier than every client plugin factory, and
// therefore earlier than any lazy view (the workspace) that would call
// `AbortSignal.any`. Putting the polyfill in this file's body (outside the
// factory) is what buys that ordering; do not move it inside.
//
// WHY NEEDED: `AbortSignal.any` shipped in Safari/iOS WebKit 17.4, Chrome 116,
// Firefox 124. Older iOS cannot upgrade its engine (every iOS browser is
// WebKit), so the gateway client throws
//   TypeError: AbortSignal.any is not a function
// and the workspace never loads.
(function installAbortSignalAny() {
  if (typeof AbortSignal === 'undefined') return
  if (typeof AbortSignal.any === 'function') return

  AbortSignal.any = function any(signals) {
    var controller = new AbortController()
    var cleanups = []

    function abort(reason) {
      for (var i = 0; i < cleanups.length; i += 1) {
        try { cleanups[i]() } catch (e) { /* ignore */ }
      }
      controller.abort(reason)
    }

    var list = signals == null ? [] : signals
    for (var i = 0; i < list.length; i += 1) {
      var signal = list[i]
      // Slightly more forgiving than the spec: a missing entry is skipped
      // instead of throwing, so an undefined upstream signal cannot break a
      // request that would otherwise work.
      if (signal == null || typeof signal.addEventListener !== 'function') continue
      if (signal.aborted) { abort(signal.reason); return controller.signal }
      var onAbort = (function (s) {
        return function () { abort(s.reason) }
      })(signal)
      signal.addEventListener('abort', onAbort, { once: true })
      cleanups.push((function (s, handler) {
        return function () { s.removeEventListener('abort', handler) }
      })(signal, onAbort))
    }
    return controller.signal
  }
})()

window.__ModuleLoader__.load({
  id: 'dsh-abort-polyfill',
  factory: () => ({
    name: 'dsh-abort-polyfill',
    apply() { /* polyfill already installed above */ },
  }),
})
;

// ---------------------------------------------------------------------------
// Safari 17.4 那一批的其余 API：iOS 16.x（Safari 16）全缺。
// 实测：Promise.withResolvers 缺失会让 session-controller / ui-session 的
// "选工作区"流程静默失败（Promise 永不 settle → 界面转圈后回退，控制台只是
// 一条 TypeError）。逐个 if (!…) 守空，新浏览器完全不受影响。
// ---------------------------------------------------------------------------
;(function installSafari174APIs() {
  if (typeof Promise === 'function' && typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers() {
      var resolve, reject
      var promise = new Promise(function (res, rej) { resolve = res; reject = rej })
      return { promise: promise, resolve: resolve, reject: reject }
    }
  }

  if (typeof Object.groupBy !== 'function') {
    Object.groupBy = function groupBy(items, callback) {
      var out = Object.create(null)
      var i = 0
      for (var item of items) {
        var key = callback(item, i++)
        if (out[key] === undefined) out[key] = []
        out[key].push(item)
      }
      return out
    }
  }

  if (typeof Map.groupBy !== 'function') {
    Map.groupBy = function groupBy(items, callback) {
      var out = new Map()
      var i = 0
      for (var item of items) {
        var key = callback(item, i++)
        var bucket = out.get(key)
        if (bucket === undefined) { bucket = []; out.set(key, bucket) }
        bucket.push(item)
      }
      return out
    }
  }

  if (typeof Set.prototype.union !== 'function') {
    var toSet = function (other) {
      if (other instanceof Set) return other
      try { return new Set(other) } catch (e) { return new Set(other.keys ? other.keys() : other) }
    }
    Object.defineProperties(Set.prototype, {
      union: { writable: true, configurable: true, value: function (other) { var out = new Set(this); for (var v of toSet(other)) out.add(v); return out } },
      intersection: { writable: true, configurable: true, value: function (other) { var out = new Set(); var o = toSet(other); for (var v of this) if (o.has(v)) out.add(v); return out } },
      difference: { writable: true, configurable: true, value: function (other) { var out = new Set(); var o = toSet(other); for (var v of this) if (!o.has(v)) out.add(v); return out } },
      symmetricDifference: { writable: true, configurable: true, value: function (other) { var o = toSet(other); var out = new Set(); for (var v of this) if (!o.has(v)) out.add(v); for (var w of o) if (!this.has(w)) out.add(w); return out } },
      isSubsetOf: { writable: true, configurable: true, value: function (other) { var o = toSet(other); for (var v of this) if (!o.has(v)) return false; return true } },
      isSupersetOf: { writable: true, configurable: true, value: function (other) { for (var v of toSet(other)) if (!this.has(v)) return false; return true } },
      isDisjointFrom: { writable: true, configurable: true, value: function (other) { var o = toSet(other); for (var v of this) if (o.has(v)) return false; return true } },
    })
  }

  if (typeof Array.prototype.toSorted !== 'function') {
    Object.defineProperty(Array.prototype, 'toSorted', { writable: true, configurable: true, value: function (cmp) { return Array.prototype.slice.call(this).sort(cmp) } })
  }
  if (typeof Array.prototype.toReversed !== 'function') {
    Object.defineProperty(Array.prototype, 'toReversed', { writable: true, configurable: true, value: function () { return Array.prototype.slice.call(this).reverse() } })
  }
  if (typeof Array.prototype.with !== 'function') {
    Object.defineProperty(Array.prototype, 'with', { writable: true, configurable: true, value: function (i, v) { var out = Array.prototype.slice.call(this); out[i < 0 ? out.length + i : i] = v; return out } })
  }
  if (typeof String.prototype.isWellFormed !== 'function') {
    Object.defineProperty(String.prototype, 'isWellFormed', { writable: true, configurable: true, value: function () { return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(this) } })
  }
})()
