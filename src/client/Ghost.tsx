/**
 * Fallback ghost text on the composer overlay: positions itself over the
 * editor's first line, hides while a draft exists, and accepts with Tab
 * through the standard `inputActions.setDraft` seat. It exists because
 * released DSH builds do not carry the `composerSuggestions` seam yet.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-next-step/Ghost
 */

import { useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Props of the overlay entry: the standard Session seats plus the staged store. */
export type GhostProps = PropsRuntime<'conversation.input.overlay'> & {
  /** Reads the Remote-backed suggestion for this Session. */
  useSuggestion: <T>(selector: (value: string | null) => T) => T
}

/** One measured position over the editor. */
interface Placement {
  readonly top: number
  readonly left: number
  readonly width: number
}

/** Finds the resident composer editor of the current page. */
function composerInput(): HTMLElement | null {
  const element = document.querySelector('[data-composer-input]')
  return element instanceof HTMLElement ? element : null
}

/**
 * Renders the staged suggestion as fixed-position ghost text.
 * @param props - standard input seats and the suggestion hook.
 * @returns the ghost text, or nothing while the draft is non-empty.
 */
export function Ghost({ useSuggestion, useInput, inputActions }: GhostProps): ReactNode {
  const suggestion = useSuggestion(value => value)
  const draft = useInput((state: InputState) => state.draft)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const visible = suggestion !== null && draft === ''

  useLayoutEffect(() => {
    if (!visible) {
      setPlacement(null)
      return
    }
    const measure = (): void => {
      const input = composerInput()
      if (input === null) return
      const rect = input.getBoundingClientRect()
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
    <div
      aria-hidden
      data-next-step-ghost
      style={{
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        width: placement.width,
        color: 'var(--dsw-alias-label-caption)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 5,
      }}
    >
      {suggestion}
    </div>
  )
}
