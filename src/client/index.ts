/**
 * Browser half: mounts the predictor's Remote stream once, watches every
 * Session in the list, and stages each snapshot as composer ghost text through
 * the Conversation-owned `composerSuggestions` face.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-next-step/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-experimental-next-step/remote'
import nextStepRemote from '@deepseek-ai/dsh-experimental-next-step/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Browser services mounted before the Remote namespace exists. */
export const inject = ['remote', 'sessions']

/** One open stream per Session. */
interface Watch {
  readonly controller: AbortController
  readonly handle: { dispose(): void }
}

/**
 * Keep one watch per listed Session and stage every snapshot it yields.
 * The Remote namespace exists only after `$mount`, so this body runs inside
 * `ctx.inject(['remote.nextStep', …])`.
 * @param ctx - Context carrying `remote.nextStep`, `sessions`, and `composerSuggestions`.
 */
function registerWatches(ctx: Context): void {
  const watches = new Map<SessionId, Watch>()
  const close = (id: SessionId, watch: Watch): void => {
    watch.controller.abort()
    watch.handle.dispose()
    watches.delete(id)
  }
  const watch = (id: SessionId): void => {
    if (watches.has(id)) return
    const controller = new AbortController()
    const handle = ctx.remote.nextStep.watch(id, controller.signal)
    watches.set(id, { controller, handle })
    void (async () => {
      try {
        for await (const snapshot of handle) {
          ctx.composerSuggestions.set(id, snapshot.text === '' ? null : snapshot.text)
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
}

/**
 * Mount the predictor stream and feed the composer.
 * @param ctx - browser Context with `remote` and `sessions`.
 * @returns the disposer that closes every watch and unmounts the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(nextStepRemote)
  const ui = ctx.inject(['remote.nextStep', 'sessions', 'composerSuggestions'], registerWatches)
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
