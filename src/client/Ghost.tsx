/**
 * Ghost suggestion for the composer, fed by the local prediction service.
 * No harness package is imported at runtime, so the plugin installs from the
 * Plugins panel like any client-only bundle.
 *
 * @module dsh-next-step/Ghost
 */

import { useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Where the local predictor listens. */
const ENDPOINT = 'http://127.0.0.1:61760/suggest'

/** Props of the overlay entry. */
export interface GhostProps {
  /** Session whose log the predictor reads. */
  sessionId: string
  useInput: (selector: (state: InputState) => string) => string
  inputActions: { setDraft: (text: string) => void }
}

/** One measured position over the editor. */
interface Placement {
  top: number
  left: number
  width: number
}

/**
 * Renders the suggested next message as ghost text above an empty composer.
 * @param props - session id, draft reader, and the draft writer.
 * @returns the ghost, or nothing while the draft has text.
 */
export function Ghost({ sessionId, useInput, inputActions }: GhostProps): ReactNode {
  const draft = useInput((state: InputState) => state.draft)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const visible = suggestion !== null && draft === ''

  useEffect(() => {
    let alive = true
    const ask = (): void => {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).then(response => response.json() as Promise<{ suggestions?: string[] }>)
        .then((payload) => { if (alive) setSuggestion(payload.suggestions?.[0] ?? null) })
        .catch(() => {})
    }
    ask()
    const timer = setInterval(ask, 15_000)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId])

  useLayoutEffect(() => {
    if (!visible) {
      setPlacement(null)
      return
    }
    const measure = (): void => {
      const element = document.querySelector('[data-composer-input]')
      if (!(element instanceof HTMLElement)) return
      const rect = element.getBoundingClientRect()
      setPlacement({ top: rect.top + 4, left: rect.left + 14, width: Math.max(0, rect.width - 22) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure) }
  }, [visible])

  useEffect(() => {
    if (!visible || suggestion === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-composer-input]') === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      inputActions.setDraft(suggestion)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [visible, suggestion, inputActions])

  if (!visible || placement === null) return null
  return (
    <div aria-hidden data-next-step-ghost style={{
      position: 'fixed', top: placement.top, left: placement.left, width: placement.width,
      color: 'var(--dsw-alias-label-caption)', whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis', pointerEvents: 'none', userSelect: 'none', zIndex: 5,
    }}>{suggestion}</div>
  )
}
