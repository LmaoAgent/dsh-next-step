# dsh-next-step

Grey ghost suggestions in the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) composer: after a turn, the plugin shows the message you are likely to send next; `Tab` accepts it, deleting the draft brings it back.

```
┌──────────────────────────────────────────────┐
│ 帮我看看当前项目的结构                          │
└──────────────────────────────────────────────┘
        grey until you press Tab
```

## How it works

The plugin is **client-only** (a `dsh.bundle.patch` package with a browser half), because a bundle installed from the Plugins panel cannot import harness packages on the Host side. Prediction runs in a small local service instead:

- the browser half watches the composer, and while the draft is empty asks the service for a suggestion every 15 seconds;
- the service receives the `sessionId`, reads that Session's own log under `~/.dsh/sessions`, and predicts from the last human and assistant texts (injected context such as AGENTS.md is excluded);
- with `DEEPSEEK_API_KEY` set it makes one small model call (`reasoningEffort: off`, at most 160 output tokens); without it, a zero-token heuristic answers.

The suggestion never enters the conversation history.

## Install

1. Install from the registry:

   ```sh
   npm install -g dsh-next-step   # optional: run the service by hand
   ```

2. In DeepSeek Harness open **Plugins → Add plugin**, enter `dsh-next-step`,
   install, enable, and restart the app. The bundle starts the service through
   the harness MCP client, so nothing has to be launched by hand.

   To run it manually instead: `npx dsh-next-step` (prints `next-step: http://127.0.0.1:61760`).

3. Open a new Session, send a message, and clear the input: the suggestion appears within 15 seconds.

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXT_STEP_HTTP_PORT` | `61760` | service port the browser half calls |
| `DEEPSEEK_API_KEY` | unset | enables model suggestions; otherwise the heuristic answers |
| `NEXT_STEP_MODEL` | `deepseek-chat` | model used for the suggestion |
| `NEXT_STEP_LOCAL_ONLY` | unset | `1` forces the heuristic even with a key |

## Limitations

- **A local service is required.** Third-party bundles cannot call the model host-side yet; the platform gap is tracked in [discussion #12742](https://github.com/deepseek-ai/deepseek-harness/discussions/12742).
- **Polling.** Suggestions refresh every 15 seconds, not exactly at `turn/end`.
- **Overlay positioning.** The ghost is placed by measuring `[data-composer-input]`; multi-line drafts and theme changes may offset it.
- **Heuristic mode is generic.** Without a key the service can only offer continuations like "继续完成下一步".

## License

MIT
