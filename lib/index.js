/**
 * dsh-abort-polyfill — host half.
 *
 * Deliberately a no-op: the fix lives in the browser half (./client.js), which
 * installs `AbortSignal.any` while the client module table is being built — that
 * happens before any client plugin factory runs, so the polyfill is in place
 * before the gateway client (packages/api/gateway/src/client) ever calls it.
 *
 * A row needs a resolvable host half even when all the work is client-side.
 */
export const name = 'dsh-abort-polyfill'

export function apply() {
  // nothing to do on the host side
}
