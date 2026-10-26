/**
 * Wire types of the next-step predictor.
 *
 * @module @deepseek-ai/dsh-experimental-next-step/types
 */

/** One staged suggestion; an empty text withdraws the ghost. */
export interface SuggestionSnapshot {
  /** Suggestion body the composer shows while its draft is empty. */
  readonly text: string
}
