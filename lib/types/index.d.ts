/**
 * Experimental next-step predictor: after every finished turn it asks one
 * small model call for the human's likely next message and streams the result
 * to a subscribed client, which stages it as composer ghost text. The call is
 * independent of the conversation: a short digest, its own budget, and no
 * session identity, so it never enters the main request or the replay cursor.
 *
 * @module @deepseek-ai/dsh-experimental-next-step
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SuggestionSnapshot } from './types.ts';
export type * from './types.ts';
/** Plugin configuration. */
export interface Config {
    /** Provider route for the prediction call. */
    provider?: string;
    /** Model that writes the suggestions. */
    model?: string;
    /** Completion cap. */
    maxTokens?: number;
    /** One provider call may run this long. */
    timeoutMs?: number;
    /** Longest digest forwarded to the model. */
    maxInputChars?: number;
}
/** Validated plugin configuration. */
export declare const Config: z<Config>;
/** The Session facts one prediction reads. */
export interface PredictionSource {
    /** Session identity carrying the rolling exchange text. */
    readonly id: import('@deepseek-ai/dsh-session').SessionId;
    /** Model route of the Session's latest request. */
    requestHeader(): {
        config: {
            provider?: string;
            model?: string;
        };
    } | undefined;
}
/**
 * The `nextStep` Remote service: one latest suggestion per Session, streamed
 * to whichever client watches it.
 */
export declare class NextStep extends TypertRemoteService {
    /** The prediction call needs the model runtime; sessions arrive by event. */
    static inject: string[];
    private readonly values;
    private readonly listeners;
    /** Rolling exchange text per Session, maintained from delivered events. */
    private readonly recent;
    /**
     * @param ctx - owning Host Context.
     * @param config - provider route and call limits.
     */
    constructor(ctx: Context, config?: Config);
    /**
     * Stream one Session's staged suggestion; finishes with its abort signal.
     * @param agent - the Session's agent, resolved by the Gateway.
     * @param signal - the caller's cancellation.
     * @returns the current suggestion followed by every replacement.
     */
    watch(agent: Agent, signal: AbortSignal): AsyncIterable<SuggestionSnapshot>;
    /** Publishes one Session's suggestion to its watchers. */
    private publish;
    /** Keeps the last few exchange texts for one Session. */
    private remember;
    /** One live stream: current value, then each replacement until abort. */
    private follow;
    /** Runs one prediction turn and publishes its first usable line. */
    private predict;
    /** Clips the rolling exchange text to the model digest budget. */
    private digest;
}
export default NextStep;
//# sourceMappingURL=index.d.ts.map