/**
 * Browser half: mounts the predictor's Remote stream once, watches every
 * Session in the list, and renders the staged suggestion as composer ghost
 * text. It deliberately avoids the `composerSuggestions` seam so the plugin
 * works on released DSH builds too: the ghost is an overlay entry that
 * measures the editor and accepts with Tab through `inputActions.setDraft`.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-next-step/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-experimental-next-step/remote'
import nextStepRemote from '@deepseek-ai/dsh-experimental-next-step/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Ghost } from './Ghost.tsx'

/** Browser services: the Remote namespace, the Session list, and the composer slots. */
export const inject = ['remote', 'sessions', 'slots']

/** One observable cell per Session, fed by that Session's Remote stream. */
class SuggestionStore {
  private snapshot: string | null = null
  private readonly listeners = new Set<() => void>()

  /** Current staged suggestion. */
  getSnapshot = (): string | null => this.snapshot

  /**
   * Subscribe to staged changes.
   * @param listener - called after every replacement.
   * @returns the unsubscribe disposer.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Replace the staged suggestion.
   * @param value - suggestion body, or null to withdraw it.
   */
  set(value: string | null): void {
    if (value === this.snapshot) return
    this.snapshot = value
    for (const listener of [...this.listeners]) listener()
  }
}

/** One open stream per Session. */
interface Watch {
  readonly controller: AbortController
  readonly handle: { dispose(): void }
}

/**
 * Feed one store per listed Session and register the ghost overlay.
 * The Remote namespace exists only after `$mount`, so this runs inside
 * `ctx.inject(['remote.nextStep', …])`.
 * @param ctx - Context carrying `remote.nextStep`, `sessions`, and `slots`.
 */
function registerGhost(ctx: Context): void {
  const stores = new Map<SessionId, SuggestionStore>()
  const watches = new Map<SessionId, Watch>()
  const storeOf = (id: SessionId): SuggestionStore => {
    let store = stores.get(id)
    if (store === undefined) {
      store = new SuggestionStore()
      stores.set(id, store)
    }
    return store
  }
  const close = (id: SessionId, watch: Watch): void => {
    watch.controller.abort()
    watch.handle.dispose()
    watches.delete(id)
    stores.delete(id)
  }
  const watch = (id: SessionId): void => {
    if (watches.has(id)) return
    const controller = new AbortController()
    const handle = ctx.remote.nextStep.watch(id, controller.signal)
    watches.set(id, { controller, handle })
    void (async () => {
      try {
        for await (const snapshot of handle) {
          storeOf(id).set(snapshot.text === '' ? null : snapshot.text)
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          ctx.logger.warn(`next-step: watch of ${id} ended: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })()
  }
  const sync = (): void => {
    const listed = new Set<SessionId>(ctx.sessions.list.getSnapshot().ids)
    for (const id of listed) watch(id)
    for (const [id, watch] of [...watches]) if (!listed.has(id)) close(id, watch)
  }
  const off = ctx.sessions.list.subscribe(sync)
  sync()
  ctx.effect(() => () => {
    off()
    for (const [id, watch] of [...watches]) close(id, watch)
  }, 'next-step: session watches')
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'next-step-ghost',
    order: 5,
    inject: (sessionId: SessionId) => ({ hooks: { suggestion: storeOf(sessionId) } }),
  }, Ghost))
}

/**
 * Mount the predictor stream and the ghost overlay.
 * @param ctx - browser Context with `remote`, `sessions`, and `slots`.
 * @returns the disposer that closes every watch and unmounts the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(nextStepRemote)
  const ui = ctx.inject(['remote.nextStep', 'slots'], registerGhost)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
