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
