/**
 * Browser half: registers the ghost overlay and feeds it from the local
 * `dsh-next-step` prediction service. No Remote, no harness runtime imports.
 *
 * @module dsh-next-step/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Ghost } from './Ghost.tsx'

/** Browser services the overlay entry needs. */
export const inject = ['slots']

/**
 * Register the overlay entry on the composer.
 * @param ctx - browser Context carrying `slots`.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'next-step-ghost',
    order: 5,
    inject: (sessionId: SessionId) => ({ sessionId: String(sessionId) }),
  }, Ghost))
}
