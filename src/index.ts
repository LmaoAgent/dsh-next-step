/**
 * Host half is intentionally empty: the prediction runs in the standalone
 * `dsh-next-step` service, and the browser half talks to it over loopback.
 *
 * @module dsh-next-step
 */

/** No host contributions. */
export function apply(): void {}
