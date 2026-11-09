#!/usr/bin/env node
// HTTP entry: the browser half needs the suggestion endpoint, not the MCP stdio
// transport, so a plain `npx` run serves loopback HTTP on this port.
process.env.NEXT_STEP_HTTP_PORT ??= '61760'
await import('./lib/service.mjs')
