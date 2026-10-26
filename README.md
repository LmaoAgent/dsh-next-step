# dsh-next-step

Grey-text next-step suggestions for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) composer: after each finished turn the plugin predicts what you are likely to type next, shows it as ghost text above the empty input, and accepts it with `Tab`.

```
┌──────────────────────────────────────────────┐
│ 帮我看看当前项目的结构                          │
└──────────────────────────────────────────────┘
        grey until you press Tab
```

## How it works

- **Host half** (`dsh-next-step`): on `turn/end` of a root Session it keeps the last few human/assistant texts (injected context such as AGENTS.md or skill text is excluded), sends one independent completion with reasoning off (`reasoningEffort: 'off'`, `maxTokens: 160`), and streams the answer through a Typert Remote `nextStep.watch(agent, signal)`.
- **Browser half** (`dsh-next-step/client`): mounts the generated Remote contribution, watches the Session list, and stages each snapshot through the Conversation-owned `ctx.composerSuggestions.set(sessionId, text)`.
- **Composer**: renders the staged text on the placeholder layer with a `Tab` keycap. `Tab` accepts it into the draft, deleting the draft brings it back, typing hides it, sending clears it.

The prediction never enters the conversation: no `sessionId`, no history replay, no later request carries it.

## Cost

One extra completion per finished root turn, and only while a browser is subscribed:

| | |
|---|---|
| input | fixed system prompt + up to 1200 characters of recent exchange (roughly 400–700 tokens) |
| output | at most 160 tokens, thinking disabled |
| frequency | once per root turn end; skipped when no client watches that Session |

It does **not** grow the main context, so later turns are not more expensive.

## Requirements

- DeepSeek Harness with the composer suggestion seam (`ctx.composerSuggestions`), the `composerSuggestions` browser service, and `@deepseek-ai/dsh-typert-protocol`. That seam is not in a published release yet; until it lands, this plugin runs against a harness built from source.
- Model credentials already configured in the harness (the plugin reuses the Session's provider/model unless you pin `provider`/`model`).

## Install

Install it from the Plugins panel (package name, repository URL, or a local
directory) and enable it; the package declares `dsh.bundle.patch`, so the panel
mounts the row below for you. For a source profile, the same row also works in
a `--patch` overlay.

```yaml
- insert:
    - name: dsh-next-step
```

```sh
dsh --profile web --patch ./dsh-next-step.overlay.yml
```

Optional host configuration:

| key | default | meaning |
|---|---|---|
| `provider` | the Session's route | provider route for the prediction call |
| `model` | the Session's route | model that writes the suggestion |
| `maxTokens` | `160` | completion cap |
| `timeoutMs` | `8000` | one call may run this long |
| `maxInputChars` | `1200` | digest length forwarded to the model |

## Build

`lib/` ships prebuilt so the package is usable from this repository as-is (`lib/index.js`, `lib/client.js`, the generated `lib/typert.*` pair, and declarations). Rebuilding requires the DeepSeek Harness workspace: its TypeScript project graph plus `scripts/generate-typert.ts` produce `lib/typert.host.*` and `lib/typert.remote-client.*`, and the client bundle is built with the workspace's `clientBundle` preset. Source lives in `src/index.ts` (Host) and `src/client/index.ts` (browser).

## Limitations

- Root Sessions only; child Sessions never predict.
- One completion per turn, no caching, no batching.
- No dismissal gesture yet: the suggestion stays until the next prediction, a send, or a Session switch.
- Quality depends on the digest: four recent messages clipped to 1200 characters.

## License

MIT
