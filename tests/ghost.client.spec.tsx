// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Ghost } from '../src/client/Ghost.tsx'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('portals the suggestion into the placeholder layer and accepts it with Tab', async () => {
  document.body.innerHTML = '<div class="grow"><div data-composer-input></div><div data-composer-placeholder>placeholder</div></div>'
  const setDraft = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: ['核对差异'] }))))
  const useInput = (selector: (state: InputState) => string): string => selector({ draft: '' } as InputState)

  render(<Ghost sessionId="s" useInput={useInput} inputActions={{ setDraft }} />)
  await vi.waitFor(() => { expect(document.querySelector('[data-next-step-ghost]')?.textContent).toBe('核对差异') })
  expect(document.querySelector('[data-composer-placeholder]')?.getAttribute('style')).toContain('hidden')

  const input = document.querySelector('[data-composer-input]')!
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(setDraft).toHaveBeenCalledWith('核对差异')
})
