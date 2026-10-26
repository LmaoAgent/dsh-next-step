import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { NextStep as NextStepService } from '../src/index.ts'

/** Minimal Host context: the service only needs a fiber, events, and the llm stub. */
function host(): { ctx: Context; emit: (session: unknown, event: unknown) => void } {
  const ctx = new Context()
  return {
    ctx,
    emit: (session, event) => {
      Reflect.apply(Reflect.get(ctx, 'emit') as (...args: unknown[]) => boolean, ctx, ['session/event', session, event])
    },
  }
}

/** Builds one text stream the assembler accepts, optionally behind a reasoning block. */
async function* textStream(text: string, reasoning = false): AsyncIterable<unknown> {
  if (reasoning) {
    yield { type: 'block-start', index: 0, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index: 0, text: 'think' }
    yield { type: 'block-start', index: 1, blockType: 'text' }
    yield { type: 'text-delta', index: 1, text }
    return
  }
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
}

/** One prediction source: session identity and the model route. */
function source(overrides: { provider?: string; model?: string; header?: boolean } = {}) {
  return {
    id: 'session-1',
    requestHeader: () => overrides.header === false
      ? undefined
      : { config: { provider: overrides.provider ?? 'deepseek', model: overrides.model ?? 'deepseek-chat' } },
  }
}

/** Seeds the rolling exchange text the way delivered messages do. */
function seed(service: NextStepService, text = '准备'): void {
  Reflect.apply(Reflect.get(service, 'remember') as (id: string, t: string) => void, service, ['session-1', text])
}

/** Runs the private prediction path. */
async function predict(
  service: NextStepService,
  ctx: Context,
  input: ReturnType<typeof source>,
  config: { provider?: string; model?: string } = {},
  limits: { maxTokens: number; timeoutMs: number; maxInputChars: number } = { maxTokens: 80, timeoutMs: 1000, maxInputChars: 1200 },
): Promise<void> {
  seed(service)
  const run = Reflect.get(service, 'predict') as (...args: unknown[]) => Promise<void>
  await Reflect.apply(run, service, [ctx, input, config, limits])
}

/** Opens one watch stream. */
function watch(service: NextStepService, signal: AbortSignal): AsyncIterable<{ text: string }> {
  return Reflect.apply(Reflect.get(service, 'watch') as (...args: unknown[]) => AsyncIterable<{ text: string }>, service, [
    { session: { id: 'session-1' } },
    signal,
  ])
}

describe('next-step host', () => {
  it('publishes the model text after a turn', async () => {
    const { ctx } = host()
    const stream = vi.fn(() => textStream('核对 #966 的差异'))
    ctx.provide('llm', { stream })
    const service = new NextStepService(ctx)
    await predict(service, ctx, source())
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-chat',
      maxTokens: 80,
      temperature: 0.2,
    }))
    const iterator = watch(service, new AbortController().signal)[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ text: '核对 #966 的差异' })
  })

  it('skips an empty exchange, a missing route, and an empty model', async () => {
    const { ctx } = host()
    const stream = vi.fn(() => textStream('x'))
    ctx.provide('llm', { stream })
    const service = new NextStepService(ctx)
    const run = Reflect.get(service, 'predict') as (...args: unknown[]) => Promise<void>
    await Reflect.apply(run, service, [ctx, source(), {}, { maxTokens: 80, timeoutMs: 1000, maxInputChars: 1200 }])
    await predict(service, ctx, source({ header: false }))
    await predict(service, ctx, source({ model: '' }))
    expect(stream).not.toHaveBeenCalled()
  })

  it('uses the configured route over the session route', async () => {
    const { ctx } = host()
    const stream = vi.fn(() => textStream('ok'))
    ctx.provide('llm', { stream })
    const service = new NextStepService(ctx, { provider: 'custom', model: 'custom-model' })
    await predict(service, ctx, source(), { provider: 'custom', model: 'custom-model' })
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ provider: 'custom', model: 'custom-model' }))
  })

  it('drops a completion with no text', async () => {
    const { ctx } = host()
    ctx.provide('llm', { stream: () => textStream('') })
    const service = new NextStepService(ctx)
    await predict(service, ctx, source())
    const controller = new AbortController()
    controller.abort()
    const iterator = watch(service, controller.signal)[Symbol.asyncIterator]()
    expect((await iterator.next()).done).toBe(true)
  })

  it('rejects when the provider stream fails', async () => {
    const { ctx } = host()
    ctx.provide('llm', { stream: () => { throw new Error('down') } })
    const service = new NextStepService(ctx)
    await expect(predict(service, ctx, source())).rejects.toThrow('down')
  })

  it('predicts once on a root turn end and ignores other events', async () => {
    const { ctx, emit } = host()
    const stream = vi.fn(() => textStream('下一步'))
    ctx.provide('llm', { stream })
    const service = new NextStepService(ctx)
    const opened = Reflect.apply(Reflect.get(service, 'follow') as (...args: unknown[]) => AsyncIterable<{ text: string }>, service, ['s', new AbortController().signal])
    void opened[Symbol.asyncIterator]().next()
    const session = { id: 's', header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }
    emit(session, { type: 'turn/start' })
    emit({ ...session, header: { parentSession: 'parent' } }, { type: 'turn/end' })
    emit(session, { type: 'user/message', data: { content: [{ type: 'text', text: '继续' }], source: { kind: 'user' } } })
    emit(session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完成' }] } } })
    emit(session, { type: 'turn/end' })
    await vi.waitFor(() => { expect(stream).toHaveBeenCalledTimes(1) })
  })

  it('logs a failed prediction instead of rejecting', async () => {
    const { ctx, emit } = host()
    ctx.provide('llm', { stream: () => { throw 'boom' } })
    const warn = vi.fn()
    Reflect.set(ctx, 'logger', { warn })
    const service = new NextStepService(ctx)
    const opened = Reflect.apply(Reflect.get(service, 'follow') as (...args: unknown[]) => AsyncIterable<{ text: string }>, service, ['s', new AbortController().signal])
    void opened[Symbol.asyncIterator]().next()
    const session = { id: 's', header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }
    emit(session, { type: 'user/message', data: { content: [{ type: 'text', text: '继续' }], source: { kind: 'user' } } })
    emit(session, { type: 'turn/end' })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom')) })
  })
})

describe('next-step stream edges', () => {
  it('replaces the value, skips empty publications, and ends on abort', async () => {
    const { ctx } = host()
    ctx.provide('llm', { stream: () => textStream('好', true) })
    const service = new NextStepService(ctx)
    await predict(service, ctx, source())
    const controller = new AbortController()
    const iterator = watch(service, controller.signal)[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ text: '好' })
    const publish = Reflect.get(service, 'publish') as (id: string, text: string) => void
    Reflect.apply(publish, service, ['session-1', '预'])
    expect((await iterator.next()).value).toEqual({ text: '预' })
    const waiting = iterator.next()
    Reflect.apply(publish, service, ['session-1', ''])
    Reflect.apply(publish, service, ['session-1', '再来'])
    expect((await waiting).value).toEqual({ text: '再来' })
    const pending = iterator.next()
    controller.abort()
    expect((await pending).done).toBe(true)
  })

  it('clips an oversized exchange and accepts explicitly empty route fields', async () => {
    const { ctx } = host()
    const stream = vi.fn(() => textStream('ok'))
    ctx.provide('llm', { stream })
    const service = new NextStepService(ctx)
    const run = Reflect.get(service, 'predict') as (...args: unknown[]) => Promise<void>
    seed(service, 'x'.repeat(5000))
    await Reflect.apply(run, service, [ctx, source(), {}, { maxTokens: 80, timeoutMs: 1000, maxInputChars: 1200 }])
    await predict(service, ctx, source(), { provider: '', model: '' })
    expect(stream).toHaveBeenCalledTimes(2)
  })
})

describe('next-step message shapes', () => {
  it('ignores non-text blocks and empty messages, and logs an Error failure', async () => {
    const { ctx, emit } = host()
    ctx.provide('llm', { stream: () => { throw new Error('down') } })
    const warn = vi.fn()
    Reflect.set(ctx, 'logger', { warn })
    const service = new NextStepService(ctx)
    const opened = Reflect.apply(Reflect.get(service, 'follow') as (...args: unknown[]) => AsyncIterable<{ text: string }>, service, ['s', new AbortController().signal])
    void opened[Symbol.asyncIterator]().next()
    const session = { id: 's', header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }
    emit(session, { type: 'user/message', data: { content: [{ type: 'reasoning', text: 'think' }], source: { kind: 'user' } } })
    emit(session, { type: 'assistant/message', data: { message: { content: [] } } })
    emit(session, { type: 'user/message', data: { content: [{ type: 'text', text: '继续' }], source: { kind: 'user' } } })
    emit(session, { type: 'turn/end' })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith(expect.stringContaining('down')) })
  })
})

describe('next-step guards', () => {
  it('ignores injected context and skipped unwatched turns', async () => {
    const { ctx, emit } = host()
    const stream = vi.fn(() => textStream('x'))
    ctx.provide('llm', { stream })
    new NextStepService(ctx)
    const session = { id: 'guarded', header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }
    emit(session, { type: 'user/message', data: { content: [{ type: 'text', text: 'AGENTS.md 内容' }], source: { kind: 'runtime-context' } } })
    emit(session, { type: 'turn/end' })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(stream).not.toHaveBeenCalled()
  })
})
