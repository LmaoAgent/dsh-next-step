/**
 * Browser half: mounts the predictor's Remote stream once, watches every
 * Session in the list, and stages each snapshot as composer ghost text through
 * the Conversation-owned `composerSuggestions` face.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-next-step/client
 */
import type { Context } from '@deepseek-ai/cordis';
/** Browser services mounted before the Remote namespace exists. */
export declare const inject: string[];
/**
 * Mount the predictor stream and feed the composer.
 * @param ctx - browser Context with `remote` and `sessions`.
 * @returns the disposer that closes every watch and unmounts the Remote.
 */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map