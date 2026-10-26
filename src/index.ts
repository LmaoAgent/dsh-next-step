/**
 * Experimental next-step predictor: after every finished turn it asks one
 * small model call for the human's likely next message and streams the result
 * to a subscribed client, which stages it as composer ghost text. The call is
 * independent of the conversation: a short digest, its own budget, and no
 * session identity, so it never enters the main request or the replay cursor.
 *
 * @module @deepseek-ai/dsh-experimental-next-step
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BlockAssembler, ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SuggestionSnapshot } from './types.ts'

export type * from './types.ts'

/** One-line instruction; the digest carries the exchange. */
const SYSTEM = `You predict what the human types next in a coding-agent session.
Return at most two suggestions, one per line, imperative, at most 10 words each.
No numbering, quotes, prefixes, or explanation. Match the session language.
Prefer the most useful continuation and never repeat work already reported finished.`

/** Plugin configuration. */
export interface Config {
  /** Provider route for the prediction call. */
  provider?: string
  /** Model that writes the suggestions. */
  model?: string
  /** Completion cap. */
  maxTokens?: number
  /** One provider call may run this long. */
  timeoutMs?: number
  /** Longest digest forwarded to the model. */
  maxInputChars?: number
}

/** Validated plugin configuration. */
export const Config: z<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  maxTokens: z.natural().default(160),
  timeoutMs: z.natural().default(8000),
  maxInputChars: z.natural().default(1200),
})

/** The Session facts one prediction reads. */
export interface PredictionSource {
  /** Session identity carrying the rolling exchange text. */
  readonly id: import('@deepseek-ai/dsh-session').SessionId
  /** Model route of the Session's latest request. */
  requestHeader(): { config: { provider?: string; model?: string } } | undefined
}

/** Joins one message's text blocks. */
function textOf(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

/** Resolved limits used by one prediction. */
interface Limits {
  readonly maxTokens: number
  readonly timeoutMs: number
  readonly maxInputChars: number
}

/**
 * The `nextStep` Remote service: one latest suggestion per Session, streamed
 * to whichever client watches it.
 */
export class NextStep extends TypertRemoteService {
  /** The prediction call needs the model runtime; sessions arrive by event. */
  static inject = ['llm']

  private readonly values = new Map<string, string>()
  private readonly listeners = new Map<string, Set<(text: string) => void>>()
  /** Rolling exchange text per Session, maintained from delivered events. */
  private readonly recent = new Map<string, string[]>()

  /**
   * @param ctx - owning Host Context.
   * @param config - provider route and call limits.
   */
  constructor(ctx: Context, config: Config = Config({})) {
    super(ctx, 'nextStep', { namespace: 'nextStep' })
    const limits: Limits = {
      maxTokens: config.maxTokens ?? 80,
      timeoutMs: config.timeoutMs ?? 8000,
      maxInputChars: config.maxInputChars ?? 1200,
    }
    ctx.on('session/event', (session, event) => {
      if (event.type === 'user/message') {
        // Injected context (AGENTS.md, skill text, notices) arrives as a user
        // message too; only the human's own words belong in the digest.
        const kind: string = event.data.source.kind
        if (kind !== 'user') return
        this.remember(String(session.id), textOf(event.data.content))
        return
      }
      if (event.type === 'assistant/message') {
        this.remember(String(session.id), textOf(event.data.message.content))
        return
      }
      if (event.type !== 'turn/end') return
      if (session.header.parentSession !== undefined) return
      // Nobody is watching this Session: a prediction would be billed and dropped.
      if ((this.listeners.get(String(session.id))?.size ?? 0) === 0) return
      void this.predict(ctx, session, config, limits).catch((error: unknown) => {
        ctx.logger.warn(`next-step: prediction failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    })
  }

  /**
   * Stream one Session's staged suggestion; finishes with its abort signal.
   * @param agent - the Session's agent, resolved by the Gateway.
   * @param signal - the caller's cancellation.
   * @returns the current suggestion followed by every replacement.
   */
  @Remote({ mode: 'stream' })
  watch(agent: Agent, signal: AbortSignal): AsyncIterable<SuggestionSnapshot> {
    return this.follow(String(agent.session.id), signal)
  }

  /** Publishes one Session's suggestion to its watchers. */
  private publish(id: string, text: string): void {
    this.values.set(id, text)
    for (const listener of this.listeners.get(id) ?? []) listener(text)
  }

  /** Keeps the last few exchange texts for one Session. */
  private remember(id: string, text: string): void {
    if (text === '') return
    const prior = this.recent.get(id) ?? []
    this.recent.set(id, [...prior, text].slice(-4))
  }

  /** One live stream: current value, then each replacement until abort. */
  private async *follow(id: string, signal: AbortSignal): AsyncIterable<SuggestionSnapshot> {
    const queue: string[] = []
    let waiters: (() => void)[] = []
    const resume = (): void => {
      const pending = waiters
      waiters = []
      for (const resolve of pending) resolve()
    }
    const listener = (text: string): void => {
      queue.push(text)
      resume()
    }
    const listeners = this.listeners.get(id) ?? new Set<(text: string) => void>()
    listeners.add(listener)
    this.listeners.set(id, listeners)
    signal.addEventListener('abort', resume, { once: true })
    try {
      const current = this.values.get(id)
      if (current !== undefined) yield { text: current }
      while (!signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            waiters.push(resolve)
          })
        }
        for (const text of queue.splice(0)) {
          if (text !== '') yield { text }
        }
      }
    } finally {
      signal.removeEventListener('abort', resume)
      listeners.delete(listener)
    }
  }

  /** Runs one prediction turn and publishes its first usable line. */
  private async predict(ctx: Context, session: PredictionSource, config: Config, limits: Limits): Promise<void> {
    const digest = this.digest(String(session.id), limits.maxInputChars)
    if (digest === '') return
    const route = session.requestHeader()?.config
    const provider = config.provider === undefined || config.provider === '' ? route?.provider ?? '' : config.provider
    const model = config.model === undefined || config.model === '' ? route?.model ?? '' : config.model
    if (provider === '' || model === '') return
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({
      provider,
      model,
      system: SYSTEM,
      maxTokens: limits.maxTokens,
      temperature: 0.2,
      reasoningEffort: ReasoningEffortId('off'),
      messages: [createUserMessage({
        content: [{ type: 'text', text: digest }],
        source: { kind: 'user' },
      })],
      signal: AbortSignal.timeout(limits.timeoutMs),
    })) {
      assembler.push(chunk)
    }
    const text = assembler.blocks()
      .flatMap(block => block.type === 'text' ? [block.text] : [])
      .join('\n')
      .trim()
    if (text !== '') this.publish(String(session.id), text)
  }

  /** Clips the rolling exchange text to the model digest budget. */
  private digest(id: string, limit: number): string {
    const exchange = this.recent.get(id)?.join('\n') ?? ''
    return exchange.length <= limit ? exchange : exchange.slice(-limit)
  }
}

export default NextStep
