#!/usr/bin/env node
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
//#region lib/types/config.js
/**
* Environment-driven configuration for the stdio server.
*
* @module @deepseek-ai/dsh-mcp-next-step/config
*/
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_MAX_TOKENS = 96;
const DEFAULT_TIMEOUT_MS = 8e3;
const DEFAULT_CACHE_TTL_MS = 3e5;
const DEFAULT_MAX_SUGGESTIONS = 2;
/** Reads a bounded integer, ignoring unparsable values. */
function readInt(raw, fallback, min, max) {
	const value = raw === void 0 ? NaN : Number.parseInt(raw, 10);
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}
/**
* Reads the predictor configuration from the environment.
* @param env - Process environment; `NEXT_STEP_*` overrides and `DEEPSEEK_API_KEY` are honored.
* @returns A configuration that runs the heuristic whenever no key is present.
*/
function readConfig(env) {
	const key = env.NEXT_STEP_API_KEY ?? env.DEEPSEEK_API_KEY;
	const apiKey = key === void 0 || key.trim() === "" ? void 0 : key.trim();
	const language = env.NEXT_STEP_LANGUAGE === "zh" || env.NEXT_STEP_LANGUAGE === "en" ? env.NEXT_STEP_LANGUAGE : void 0;
	return {
		baseUrl: env.NEXT_STEP_BASE_URL ?? DEFAULT_BASE_URL,
		model: env.NEXT_STEP_MODEL ?? DEFAULT_MODEL,
		maxTokens: readInt(env.NEXT_STEP_MAX_TOKENS, DEFAULT_MAX_TOKENS, 16, 512),
		timeoutMs: readInt(env.NEXT_STEP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 100, 6e4),
		cacheTtlMs: readInt(env.NEXT_STEP_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, 0, 864e5),
		maxSuggestions: readInt(env.NEXT_STEP_MAX_SUGGESTIONS, DEFAULT_MAX_SUGGESTIONS, 1, 3),
		localOnly: env.NEXT_STEP_LOCAL_ONLY === "1" || apiKey === void 0,
		...apiKey === void 0 ? {} : { apiKey },
		...language === void 0 ? {} : { language }
	};
}
//#endregion
//#region lib/types/heuristic.js
/**
* Zero-token suggestions derived from the latest reply and the working tree.
* This is the fallback when no provider is configured or a call fails.
*
* @module @deepseek-ai/dsh-mcp-next-step/heuristic
*/
const PULL_REQUEST = /(?:pr\s*#\d+|pull request|合并请求)/iu;
const TESTS = /\btests?\b|测试/iu;
const REMAINING = /\btodo\b|\bfixme\b|待办|下一步/iu;
/**
* Suggests one-line continuations without calling a model.
* @param input - Assistant tail and output language.
* @param signals - Working-tree facts, or `NO_SIGNALS` when unknown.
* @param limit - Maximum suggestions to return.
* @returns At least one suggestion, most specific first.
*/
function heuristicSuggestions(input, signals, limit) {
	const zh = input.language === "zh";
	const candidates = [];
	if (PULL_REQUEST.test(input.assistant)) candidates.push(zh ? "查看 PR 的检查与合并状态" : "Check the pull request status");
	if (signals.dirtyFiles > 0) candidates.push(zh ? "检查未提交的改动" : "Review the uncommitted changes");
	if (signals.ahead > 0) candidates.push(zh ? "推送分支并发起 PR" : "Push the branch and open a pull request");
	if (REMAINING.test(input.assistant)) candidates.push(zh ? "继续处理剩下的待办" : "Continue with the remaining work");
	if (TESTS.test(input.assistant)) candidates.push(zh ? "运行测试确认全部通过" : "Run the tests and confirm they pass");
	candidates.push(zh ? "继续完成下一步" : "Continue with the next step");
	return candidates.slice(0, Math.max(1, limit)).map((text) => ({ text }));
}
//#endregion
//#region lib/types/text.js
/**
* Text clipping, language detection, duplicate folding, and cache identities
* shared by the digest, parser, and predictor.
*
* @module @deepseek-ai/dsh-mcp-next-step/text
*/
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;
/**
* Cuts text to a character budget.
* @param value - Source text, or nothing.
* @param limit - Maximum retained characters.
* @param fromEnd - Keeps the tail instead of the head.
* @returns Trimmed text no longer than `limit`.
*/
function clip(value, limit, fromEnd = false) {
	const text = value?.trim() ?? "";
	if (text.length <= limit) return text;
	return fromEnd ? text.slice(-limit) : text.slice(0, limit);
}
/**
* Picks the output language from the text a prediction was given.
* @param values - Candidate texts, most authoritative first.
* @returns `zh` when CJK text appears, otherwise `en`.
*/
function detectLanguage(...values) {
	for (const value of values) if (value !== void 0 && CJK.test(value)) return "zh";
	return "en";
}
/**
* Folds text for duplicate detection.
* @param value - Text to normalize.
* @returns Lowercased text without whitespace, punctuation, or symbols.
*/
function normalize(value) {
	return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
/**
* Hashes a cache identity.
* @param parts - Components that must all match for a cache hit.
* @returns Lowercase hex digest.
*/
function cacheKey(...parts) {
	return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}
const LIST_MARKER = /^(?:[-*•·]|\d+[.)、]|[（(]\d+[)）])\s*/u;
const EDGES = /^["'`“”‘’「」『』\s]+|["'`“”‘’「」『』\s]+$/gu;
const TRAILING = /[。．.;；:：!！?？]+$/u;
/** One parsed suggestion, or nothing when the line carries no text. */
function parseLine(raw, exclude) {
	const stripped = raw.trim().replace(LIST_MARKER, "").replace(EDGES, "").replace(TRAILING, "").trim();
	if (stripped === "") return void 0;
	if (normalize(stripped) === exclude) return void 0;
	return { text: clip(stripped, 96) };
}
/**
* Parses completion lines into unique suggestions.
* @param text - Raw completion text, one suggestion per line.
* @param options - How many to keep and which text to reject as a repeat.
* @returns Distinct suggestions in completion order, capped at `options.limit`.
*/
function parseSuggestions(text, options) {
	const exclude = normalize(options.exclude ?? "");
	const seen = /* @__PURE__ */ new Set();
	const suggestions = [];
	for (const line of text.split("\n")) {
		if (suggestions.length >= options.limit) break;
		const suggestion = parseLine(line, exclude);
		if (suggestion === void 0) continue;
		const key = normalize(suggestion.text);
		if (seen.has(key)) continue;
		seen.add(key);
		suggestions.push(suggestion);
	}
	return suggestions;
}
/** Longest assistant tail forwarded to the prediction model. */
const ASSISTANT_CLIP = 1e3;
const SYSTEM = {
	en: (count) => `You predict the human's next message in a coding-agent session.
Return at most ${count} suggestions, one per line, imperative, at most 10 words each.
No numbering, quotes, prefixes, or explanation. Match the session language.
Prefer the single most useful continuation and never repeat work already reported finished.`,
	zh: (count) => `你在预测一次编程协作中人类的下一条消息。
最多输出 ${count} 条建议，每行一条，用祈使句，每条不超过 10 个词。
不要编号、引号、前缀或解释。使用与对话相同的语言。
优先给出最有用的下一步，不要重复已经完成的工作。`
};
/**
* Builds the provider messages for one digest.
* @param input - Clipped-or-raw exchange fields and the output language.
* @param maxSuggestions - Number of suggestions the system prompt asks for.
* @returns System prompt followed by the digest.
*/
function buildMessages(input, maxSuggestions) {
	const digest = [`Human: ${clip(input.user, 600)}`, `Assistant tail: ${clip(input.assistant, ASSISTANT_CLIP, true)}`].join("\n");
	return [{
		role: "system",
		content: SYSTEM[input.language](maxSuggestions)
	}, {
		role: "user",
		content: digest
	}];
}
//#endregion
//#region lib/types/provider.js
/**
* OpenAI-compatible chat completions for the prediction model.
*
* @module @deepseek-ai/dsh-mcp-next-step/provider
*/
/** A provider call that did not produce usable text. */
var ProviderError = class extends Error {
	code;
	/**
	* @param message - Actionable description naming the status or missing field.
	* @param code - Stable category callers branch on.
	*/
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "ProviderError";
	}
};
/** Narrows a JSON value to an object with string keys. */
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Reads provider usage, ignoring malformed or absent counters. */
function readUsage(value) {
	if (!isRecord$1(value)) return void 0;
	const input = value.prompt_tokens;
	const output = value.completion_tokens;
	if (typeof input !== "number" || typeof output !== "number") return void 0;
	return {
		input,
		output
	};
}
/** Validates one chat-completion payload and extracts its first message. */
function readCompletion(payload) {
	if (!isRecord$1(payload)) throw new ProviderError("response is not a JSON object", "payload");
	const choices = payload.choices;
	if (!Array.isArray(choices) || choices.length === 0) throw new ProviderError("response has no choices", "payload");
	const choice = choices[0];
	const message = isRecord$1(choice) ? choice.message : void 0;
	if (!isRecord$1(message) || typeof message.content !== "string") throw new ProviderError("response choice has no text content", "payload");
	const usage = readUsage(payload.usage);
	return usage === void 0 ? { text: message.content } : {
		text: message.content,
		usage
	};
}
/**
* Builds a completion that posts to an OpenAI-compatible `/chat/completions`.
* @param endpoint - Provider root, credentials, sampling temperature, and transport.
* @returns A completion safe to call once per prediction.
*/
function createCompletion(endpoint) {
	const target = `${endpoint.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
	const send = endpoint.fetch ?? fetch;
	const temperature = endpoint.temperature ?? .2;
	return async (request, signal) => {
		let response;
		try {
			response = await send(target, {
				method: "POST",
				headers: {
					authorization: `Bearer ${endpoint.apiKey}`,
					"content-type": "application/json"
				},
				body: JSON.stringify({
					model: request.model,
					messages: request.messages,
					max_tokens: request.maxTokens,
					temperature,
					stream: false
				}),
				signal
			});
		} catch (error) {
			throw new ProviderError(`request failed: ${error instanceof Error ? error.message : String(error)}`, "network");
		}
		if (!response.ok) {
			const detail = (await response.text().catch(() => "")).replace(/\s+/gu, " ").trim().slice(0, 200);
			throw new ProviderError(`HTTP ${response.status}: ${detail === "" ? "no detail" : detail}`, "http");
		}
		let payload;
		try {
			payload = await response.json();
		} catch {
			throw new ProviderError("response body is not JSON", "payload");
		}
		return readCompletion(payload);
	};
}
//#endregion
//#region lib/types/signals.js
/**
* Working-tree facts that let the zero-token path suggest something specific
* without calling a model.
*
* @module @deepseek-ai/dsh-mcp-next-step/signals
*/
const run = promisify(execFile);
/** Signals for an absent workspace or one that is not a repository. */
const NO_SIGNALS = {
	dirtyFiles: 0,
	ahead: 0
};
/**
* Parses `git status --porcelain=v2 --branch` output.
* @param stdout - Full git status output.
* @returns Changed-file count and commits ahead of the upstream.
*/
function parseStatus(stdout) {
	let dirtyFiles = 0;
	let ahead = 0;
	for (const line of stdout.split("\n")) {
		if (line.startsWith("# branch.ab ")) {
			const match = /\+(\d+) -\d+$/u.exec(line);
			if (match?.[1] !== void 0) ahead = Number(match[1]);
			continue;
		}
		if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ") || line.startsWith("? ")) dirtyFiles += 1;
	}
	return {
		dirtyFiles,
		ahead
	};
}
/**
* Reads local signals without failing the prediction path.
* @param workspace - Workspace root, or nothing to skip git entirely.
* @param timeoutMs - Upper bound on the git process.
* @returns Parsed signals, or `NO_SIGNALS` when git cannot run.
*/
async function readLocalSignals(workspace, timeoutMs = 800) {
	if (workspace === void 0) return NO_SIGNALS;
	try {
		const { stdout } = await run("git", [
			"status",
			"--porcelain=v2",
			"--branch"
		], {
			cwd: workspace,
			timeout: timeoutMs,
			maxBuffer: 1 << 20
		});
		return parseStatus(stdout);
	} catch {
		return NO_SIGNALS;
	}
}
//#endregion
//#region lib/types/predict.js
/**
* The predictor: one cheap provider call per distinct exchange, a cached result
* per digest, and a zero-token heuristic whenever the provider cannot answer.
*
* @module @deepseek-ai/dsh-mcp-next-step/predict
*/
/** Cache entries kept before the oldest is evicted. */
const MAX_CACHE_ENTRIES = 64;
/** Digest caps, matching the prompt module's own clipping. */
const USER_LIMIT = 600;
const ASSISTANT_LIMIT = 1e3;
/** Chooses the provider call the configuration allows. */
function resolveCompletion(config) {
	if (config.localOnly === true) return void 0;
	if (config.complete !== void 0) return config.complete;
	if (config.apiKey === void 0) return void 0;
	return createCompletion({
		baseUrl: config.baseUrl,
		apiKey: config.apiKey
	});
}
/**
* Builds a predictor for one configuration.
* @param config - Provider, limits, and clock overrides.
* @returns A predictor that never rejects; a failed provider call falls back to the heuristic.
*/
function createPredictor(config) {
	const now = config.now ?? Date.now;
	const limit = Math.max(1, Math.trunc(config.maxSuggestions));
	const complete = resolveCompletion(config);
	const cache = /* @__PURE__ */ new Map();
	/** Records a digest's suggestions, evicting the oldest entry at capacity. */
	function remember(key, suggestions) {
		while (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
		cache.set(key, {
			at: now(),
			suggestions
		});
	}
	return { async predict(input) {
		const user = clip(input.user, USER_LIMIT);
		const assistant = clip(input.assistant, ASSISTANT_LIMIT, true);
		const language = config.language ?? input.language ?? detectLanguage(user, assistant);
		const key = cacheKey(user, assistant, language, String(limit));
		const hit = cache.get(key);
		if (hit !== void 0 && now() - hit.at < config.cacheTtlMs) return {
			suggestions: hit.suggestions,
			source: "cache"
		};
		const heuristic = async () => {
			const signals = await readLocalSignals(input.workspace);
			const suggestions = heuristicSuggestions({
				assistant,
				language
			}, signals, limit);
			remember(key, suggestions);
			return {
				suggestions,
				source: "heuristic"
			};
		};
		if (complete === void 0) return await heuristic();
		try {
			const result = await complete({
				model: config.model,
				messages: buildMessages({
					user,
					assistant,
					language
				}, limit),
				maxTokens: config.maxTokens
			}, AbortSignal.timeout(config.timeoutMs));
			const suggestions = parseSuggestions(result.text, {
				limit,
				exclude: user
			});
			if (suggestions.length === 0) return await heuristic();
			remember(key, suggestions);
			return result.usage === void 0 ? {
				suggestions,
				source: "model"
			} : {
				suggestions,
				source: "model",
				usage: result.usage
			};
		} catch (error) {
			config.onError?.(error);
			return await heuristic();
		}
	} };
}
//#endregion
//#region lib/types/tool.js
/**
* The single MCP tool this server publishes.
*
* @module @deepseek-ai/dsh-mcp-next-step/tool
*/
/** Model-facing tool definition for `tools/list`. */
const NEXT_STEP_TOOL = {
	name: "suggest_next_step",
	description: "Predict the human's most likely next messages from the turn you just finished. Call once at the end of a turn. A separate cheap model call writes at most two short lines from the snippets you pass, so the conversation is not replayed.",
	inputSchema: {
		type: "object",
		properties: {
			user: {
				type: "string",
				description: "Latest human message; clipped to 600 characters."
			},
			assistant: {
				type: "string",
				description: "Tail of your latest reply; clipped to 1000 characters."
			},
			workspace: {
				type: "string",
				description: "Optional workspace root for zero-token git signals."
			},
			language: {
				type: "string",
				enum: ["zh", "en"],
				description: "Output language; inferred from the text when omitted."
			}
		},
		additionalProperties: false
	}
};
//#endregion
//#region lib/types/server.js
/**
* The MCP stdio transport: newline-delimited JSON-RPC 2.0 covering
* `initialize`, `ping`, `tools/list`, and `tools/call`.
*
* @module @deepseek-ai/dsh-mcp-next-step/server
*/
/** Protocol revision reported when a client does not ask for one. */
const PROTOCOL_VERSION = "2025-06-18";
/** Server name reported in `initialize`. */
const SERVER_NAME = "dsh-next-step";
/** Longest accepted tool argument, in characters. */
const MAX_ARGUMENT_CHARS = 4e3;
/** One JSON-RPC response, success or failure. */
function reply(id, result) {
	return {
		jsonrpc: "2.0",
		id,
		result
	};
}
/** One JSON-RPC error response. */
function failure(id, code, message) {
	return {
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message
		}
	};
}
/** Narrows a JSON value to an object with string keys. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Reads a request id, treating anything else as a notification id. */
function readId(message) {
	const id = message.id;
	return typeof id === "string" || typeof id === "number" ? id : null;
}
/** Reads one optional tool argument, rejecting blanks. */
function readText(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : clip(trimmed, MAX_ARGUMENT_CHARS);
}
/** Builds predictor input from MCP tool arguments. */
function readInput(value) {
	const args = isRecord(value) ? value : {};
	const user = readText(args.user);
	const assistant = readText(args.assistant);
	const workspace = readText(args.workspace);
	const language = args.language === "zh" || args.language === "en" ? args.language : void 0;
	return {
		...user === void 0 ? {} : { user },
		...assistant === void 0 ? {} : { assistant },
		...workspace === void 0 ? {} : { workspace },
		...language === void 0 ? {} : { language }
	};
}
/** Runs one `tools/call`, reporting unknown tools as a tool error. */
async function callTool(id, params, predictor) {
	const name = typeof params.name === "string" ? params.name : "";
	if (name !== NEXT_STEP_TOOL.name) return reply(id, {
		content: [{
			type: "text",
			text: `unknown tool: ${name}`
		}],
		isError: true
	});
	try {
		return reply(id, { content: [{
			type: "text",
			text: (await predictor.predict(readInput(params.arguments))).suggestions.map((suggestion) => suggestion.text).join("\n")
		}] });
	} catch (error) {
		return failure(id, -32603, error instanceof Error ? error.message : "prediction failed");
	}
}
/**
* Builds the JSON-RPC dispatcher.
* @param options - Predictor, version, and optional name.
* @returns A dispatcher that answers requests and ignores notifications.
*/
function createMcpServer(options) {
	const name = options.name ?? SERVER_NAME;
	return { async handle(message) {
		if (!isRecord(message) || typeof message.method !== "string") return failure(null, -32600, "invalid request");
		const id = readId(message);
		const params = isRecord(message.params) ? message.params : {};
		switch (message.method) {
			case "initialize": return reply(id, {
				protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: {
					name,
					version: options.version
				}
			});
			case "ping": return reply(id, {});
			case "tools/list": return reply(id, { tools: [NEXT_STEP_TOOL] });
			case "tools/call": return callTool(id, params, options.predictor);
			default: return Object.hasOwn(message, "id") ? failure(id, -32601, `unknown method: ${message.method}`) : void 0;
		}
	} };
}
/**
* Reads newline-delimited JSON-RPC messages and writes one line per response.
* @param lines - Decoded lines, typically a readline interface over stdin.
* @param write - Sink for one serialized response line.
* @param server - Dispatcher built by `createMcpServer`.
* @returns Completion after the input closes.
*/
async function serveLines(lines, write, server) {
	for await (const line of lines) {
		const message = line.trim();
		if (message === "") continue;
		let parsed;
		try {
			parsed = JSON.parse(message);
		} catch {
			write(JSON.stringify(failure(null, -32700, "parse error")));
			continue;
		}
		const response = await server.handle(parsed);
		if (response !== void 0) write(JSON.stringify(response));
	}
}
//#endregion
//#region lib/types/session-digest.js
/**
* Reads the tail of a local Session log so the HTTP face can predict without
* the browser sending any conversation text.
*
* @module @deepseek-ai/dsh-mcp-next-step/session-digest
*/
/** Source kind of injected context, excluded from the digest. */
const RUNTIME_CONTEXT = "runtime-context";
/** Joins one message's text blocks. */
function textOf(content) {
	if (content === void 0) return "";
	return content.flatMap((block) => block.type === "text" && typeof block.text === "string" ? [block.text] : []).join("\n");
}
/**
* Locates one Session's JSONL log under `~/.dsh/sessions`.
* @param sessionId - Session identity.
* @returns the log path, or undefined when no directory carries that id.
*/
function sessionFileOf(sessionId) {
	if (!/^[0-9a-f-]{8,}$/u.test(sessionId)) return void 0;
	const root = join(homedir(), ".dsh", "sessions");
	if (!existsSync(root)) return void 0;
	for (const workspace of readdirSync(root)) {
		const dir = join(root, workspace);
		for (const name of readdirSync(dir)) {
			if (!name.includes(sessionId)) continue;
			for (const candidate of ["session.v4.jsonl.zstd", "session.v4.jsonl"]) {
				const file = join(dir, name, candidate);
				if (existsSync(file)) return file;
			}
		}
	}
}
/**
* Reads a log the writer appends as concatenated zstd frames: the `zstd` CLI
* decodes every frame, while Node's single-shot decoder stops after the first.
* @param file - compressed log path.
* @returns the decompressed JSONL text.
*/
function readCompressed(file) {
	try {
		return execFileSync("zstd", ["-dc", file], {
			encoding: "utf8",
			maxBuffer: 1 << 26
		});
	} catch {
		return zstdDecompressSync(readFileSync(file)).toString("utf8");
	}
}
/**
* Builds the digest from the last few human and assistant texts.
* @param file - Session log path.
* @param limit - Maximum characters kept.
* @returns the digest, empty when the tail holds no dialogue.
*/
function digestOf(file, limit = 1200) {
	if (file === void 0) return "";
	const lines = (file.endsWith(".zstd") ? readCompressed(file) : readFileSync(file, "utf8")).trim().split("\n").slice(-40);
	const parts = [];
	for (const line of lines) {
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		const data = event.data;
		if (event.type === "user/message" && data !== void 0 && data.source?.kind !== RUNTIME_CONTEXT) {
			const text = textOf(data.content);
			if (text !== "") parts.push(`Human: ${text}`);
		}
		if (event.type === "assistant/message") {
			const text = textOf(data?.message?.content);
			if (text !== "") parts.push(`Assistant: ${text}`);
		}
	}
	const joined = parts.join("\n");
	return joined.length <= limit ? joined : joined.slice(-limit);
}
//#endregion
//#region lib/types/http.js
/**
* Local HTTP face for the predictor: the browser plugin cannot import harness
* packages, so it asks this process for suggestions instead.
*
* @module @deepseek-ai/dsh-mcp-next-step/http
*/
/** Reads a whole request body. */
async function bodyOf(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}
/** Writes one JSON response. */
function send(response, status, payload) {
	const text = JSON.stringify(payload);
	response.writeHead(status, {
		"content-type": "application/json",
		"access-control-allow-origin": "*"
	});
	response.end(text);
}
/**
* Serve `POST /suggest` over loopback.
* @param predictor - shared predictor instance.
* @param port - listening port; `0` picks a free one.
* @returns the bound server, with its actual port in `address()`.
*/
async function startHttp(predictor, port) {
	const server = createServer((request, response) => {
		process.stderr.write(`next-step: ${request.method ?? "?"} ${request.url ?? "/"}\n`);
		(async () => {
			if (request.method === "OPTIONS") {
				response.writeHead(204, {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "POST, OPTIONS",
					"access-control-allow-headers": "content-type",
					"access-control-max-age": "86400"
				});
				response.end();
				return;
			}
			if (request.method !== "POST" || request.url !== "/suggest") {
				send(response, 404, { error: "not found" });
				return;
			}
			let body;
			try {
				body = JSON.parse(await bodyOf(request));
			} catch {
				send(response, 400, { error: "invalid json" });
				return;
			}
			const transcript = typeof body.sessionId === "string" ? digestOf(sessionFileOf(body.sessionId)) : body.user ?? "";
			const prediction = await predictor.predict({
				user: transcript,
				...typeof body.assistant === "string" ? { assistant: body.assistant } : {}
			});
			send(response, 200, {
				suggestions: prediction.suggestions.map((item) => item.text),
				source: prediction.source
			});
		})();
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			resolve();
		});
	});
	return server;
}
//#endregion
//#region lib/types/version.js
/**
* The published version, read from the nearest package manifest.
*
* @module @deepseek-ai/dsh-mcp-next-step/version
*/
/**
* Reads a manifest version without failing server startup.
* @param manifest - Manifest location.
* @returns The manifest version, or `0.0.0` when it cannot be read.
*/
function readVersion(manifest) {
	try {
		const parsed = JSON.parse(readFileSync(manifest, "utf8"));
		if (typeof parsed === "object" && parsed !== null && "version" in parsed && typeof parsed.version === "string") return parsed.version;
	} catch {}
	return "0.0.0";
}
//#endregion
//#region lib/types/bin.js
/**
* `dsh-next-step-mcp`: serves next-step predictions over MCP stdio.
*
* @module @deepseek-ai/dsh-mcp-next-step/bin
*/
const config = readConfig(process.env);
const predictor = createPredictor({
	...config,
	onError: (error) => {
		process.stderr.write(`dsh-next-step-mcp: provider call failed, using local suggestions (${String(error)})\n`);
	}
});
const server = createMcpServer({
	predictor,
	version: readVersion(new URL("../package.json", import.meta.url))
});
process.stderr.write(config.localOnly === true ? "dsh-next-step-mcp: zero-token mode (set DEEPSEEK_API_KEY for model suggestions)\n" : `dsh-next-step-mcp: model ${config.model}\n`);
const httpPort = process.env.NEXT_STEP_HTTP_PORT;
if (httpPort !== void 0) {
	const address = (await startHttp(predictor, Number(httpPort))).address();
	process.stderr.write(`next-step: http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : httpPort}\n`);
}
await serveLines(createInterface({
	input: process.stdin,
	crlfDelay: Number.POSITIVE_INFINITY
}), (line) => {
	process.stdout.write(`${line}\n`);
}, server);
//#endregion
export {};
