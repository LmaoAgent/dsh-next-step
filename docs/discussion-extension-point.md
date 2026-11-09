# Community plugins cannot reach the model or the composer

## What I was building

A community plugin (`dsh-next-step`) that shows the human's likely next message as grey ghost text in the composer after each turn, like Claude Code's prompt suggestions: one small extra model call per finished turn, never entering the conversation history, accepted with `Tab`.

## What blocks it

Two independent gaps, both reproducible on a stock install:

1. **A third-party bundle cannot import harness packages.** Installing any bundle from the Plugins panel and enabling a Host row fails at activation with
   `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-llm'`, imported from the profile's copy of the plugin.
   `profile.ts` documents two resolution anchors — pnpm entries in the profile first, then the runtime resolution — but for a profile-installed package the runtime anchor did not supply `@deepseek-ai/dsh-llm` / `@deepseek-ai/dsh-typert-protocol`. So a community plugin cannot call `ctx.llm`, and cannot register a Typert Remote.
2. **The composer has no plugin insertion point for text.** There is no API for a client plugin to read the conversation or to place a suggestion over the input; client plugins get `useInput` (draft only) and `inputActions`, not the messages.

Together they mean every community suggestion feature is pushed to one of two degraded shapes: client-only, with no conversation access (so nothing to predict from), or an MCP tool the model must call (tokens in the main context, no ghost text).

## What I built as a reference

In a fork: a `ctx.composerSuggestions` seam on `ui-conversation` (stage one suggestion per Session; the composer renders it on the placeholder layer, `Tab` accepts, deleting the draft brings it back) plus an experimental host package that calls `ctx.llm.stream` once per `turn/end` and streams through a Typert Remote. It works end to end in a source build.

## Questions

- Is there a supported way for a profile-installed bundle's Host half to resolve harness packages (an import map, a provided module table, or a declared dependency form)?
- If not, would the project consider either exposing a plugin-facing module for host plugins, or a first-party composer suggestion seam? Community plugins are the documented contribution path, and both gaps sit directly in it.

Happy to share the patch and reproduction steps.
