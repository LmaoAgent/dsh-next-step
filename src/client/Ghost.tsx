/**
 * Ghost suggestion for the composer. It portals into the placeholder's own
 * parent and copies that layer's absolute placement, because a fixed-position
 * overlay is clipped by the composer card's stacking context.
 *
 * @module dsh-next-step/Ghost
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Renders the suggested next message over the composer's placeholder layer.
 * @param props - session id, draft reader, and the draft writer.
 * @returns the ghost layer, or nothing while the draft has text.
 */
export function Ghost({ sessionId, useInput, inputActions }: GhostProps): ReactNode {
  const draft = useInput((state: InputState) => state.draft)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [layer, setLayer] = useState<HTMLElement | null>(null)
  const visible = suggestion !== null && draft === ''

  useEffect(() => {
    const hostOf = (): HTMLElement | null => document.querySelector('[data-composer-placeholder]')?.parentElement ?? null
    setLayer(hostOf())
    const timer = setInterval(() => { if (hostOf() !== null) { setLayer(hostOf()); clearInterval(timer) } }, 500)
    return () => { clearInterval(timer) }
  }, [])

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

  useEffect(() => {
    const placeholder = document.querySelector<HTMLElement>('[data-composer-placeholder]')
    if (placeholder === null) return
    placeholder.style.visibility = visible ? 'hidden' : ''
    return () => { placeholder.style.visibility = '' }
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

  if (!visible || suggestion === null || layer === null) return null
  return createPortal((
    <div aria-hidden data-next-step-ghost style={{
      position: 'absolute', top: 4, left: 14, right: 8,
      color: 'var(--dsw-alias-label-caption)', whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis', pointerEvents: 'none', userSelect: 'none',
    }}>{suggestion}</div>
  ), layer)
}
