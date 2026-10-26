import z from "@deepseek-ai/schemastery";
import { BlockAssembler, ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
/**
* Experimental next-step predictor: after every finished turn it asks one
* small model call for the human's likely next message and streams the result
* to a subscribed client, which stages it as composer ghost text. The call is
* independent of the conversation: a short digest, its own budget, and no
* session identity, so it never enters the main request or the replay cursor.
*
* @module @deepseek-ai/dsh-experimental-next-step
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** One-line instruction; the digest carries the exchange. */
const SYSTEM = `You predict what the human types next in a coding-agent session.
Return at most two suggestions, one per line, imperative, at most 10 words each.
No numbering, quotes, prefixes, or explanation. Match the session language.
Prefer the most useful continuation and never repeat work already reported finished.`;
/** Validated plugin configuration. */
const Config = z.object({
	provider: z.string().default(""),
	model: z.string().default(""),
	maxTokens: z.natural().default(160),
	timeoutMs: z.natural().default(8e3),
	maxInputChars: z.natural().default(1200)
});
/** Joins one message's text blocks. */
function textOf(content) {
	return content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}
/**
* The `nextStep` Remote service: one latest suggestion per Session, streamed
* to whichever client watches it.
*/
let NextStep = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _watch_decorators;
	return class NextStep extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_watch_decorators = [Remote({ mode: "stream" })];
			__esDecorate(this, null, _watch_decorators, {
				kind: "method",
				name: "watch",
				static: false,
				private: false,
				access: {
					has: (obj) => "watch" in obj,
					get: (obj) => obj.watch
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		/** The prediction call needs the model runtime; sessions arrive by event. */
		static inject = ["llm"];
		values = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
		listeners = /* @__PURE__ */ new Map();
		/** Rolling exchange text per Session, maintained from delivered events. */
		recent = /* @__PURE__ */ new Map();
		/**
		* @param ctx - owning Host Context.
		* @param config - provider route and call limits.
		*/
		constructor(ctx, config = Config({})) {
			super(ctx, "nextStep", { namespace: "nextStep" });
			const limits = {
				maxTokens: config.maxTokens ?? 80,
				timeoutMs: config.timeoutMs ?? 8e3,
				maxInputChars: config.maxInputChars ?? 1200
			};
			ctx.on("session/event", (session, event) => {
				if (event.type === "user/message") {
					if (event.data.source.kind !== "user") return;
					this.remember(String(session.id), textOf(event.data.content));
					return;
				}
				if (event.type === "assistant/message") {
					this.remember(String(session.id), textOf(event.data.message.content));
					return;
				}
				if (event.type !== "turn/end") return;
				if (session.header.parentSession !== void 0) return;
				if ((this.listeners.get(String(session.id))?.size ?? 0) === 0) return;
				this.predict(ctx, session, config, limits).catch((error) => {
					ctx.logger.warn(`next-step: prediction failed: ${error instanceof Error ? error.message : String(error)}`);
				});
			});
		}
		/**
		* Stream one Session's staged suggestion; finishes with its abort signal.
		* @param agent - the Session's agent, resolved by the Gateway.
		* @param signal - the caller's cancellation.
		* @returns the current suggestion followed by every replacement.
		*/
		watch(agent, signal) {
			return this.follow(String(agent.session.id), signal);
		}
		/** Publishes one Session's suggestion to its watchers. */
		publish(id, text) {
			this.values.set(id, text);
			for (const listener of this.listeners.get(id) ?? []) listener(text);
		}
		/** Keeps the last few exchange texts for one Session. */
		remember(id, text) {
			if (text === "") return;
			const prior = this.recent.get(id) ?? [];
			this.recent.set(id, [...prior, text].slice(-4));
		}
		/** One live stream: current value, then each replacement until abort. */
		async *follow(id, signal) {
			const queue = [];
			let waiters = [];
			const resume = () => {
				const pending = waiters;
				waiters = [];
				for (const resolve of pending) resolve();
			};
			const listener = (text) => {
				queue.push(text);
				resume();
			};
			const listeners = this.listeners.get(id) ?? /* @__PURE__ */ new Set();
			listeners.add(listener);
			this.listeners.set(id, listeners);
			signal.addEventListener("abort", resume, { once: true });
			try {
				const current = this.values.get(id);
				if (current !== void 0) yield { text: current };
				while (!signal.aborted) {
					if (queue.length === 0) await new Promise((resolve) => {
						waiters.push(resolve);
					});
					for (const text of queue.splice(0)) if (text !== "") yield { text };
				}
			} finally {
				signal.removeEventListener("abort", resume);
				listeners.delete(listener);
			}
		}
		/** Runs one prediction turn and publishes its first usable line. */
		async predict(ctx, session, config, limits) {
			const digest = this.digest(String(session.id), limits.maxInputChars);
			if (digest === "") return;
			const route = session.requestHeader()?.config;
			const provider = config.provider === void 0 || config.provider === "" ? route?.provider ?? "" : config.provider;
			const model = config.model === void 0 || config.model === "" ? route?.model ?? "" : config.model;
			if (provider === "" || model === "") return;
			const assembler = new BlockAssembler();
			for await (const chunk of ctx.llm.stream({
				provider,
				model,
				system: SYSTEM,
				maxTokens: limits.maxTokens,
				temperature: .2,
				reasoningEffort: ReasoningEffortId("off"),
				messages: [createUserMessage({
					content: [{
						type: "text",
						text: digest
					}],
					source: { kind: "user" }
				})],
				signal: AbortSignal.timeout(limits.timeoutMs)
			})) assembler.push(chunk);
			const text = assembler.blocks().flatMap((block) => block.type === "text" ? [block.text] : []).join("\n").trim();
			if (text !== "") this.publish(String(session.id), text);
		}
		/** Clips the rolling exchange text to the model digest budget. */
		digest(id, limit) {
			const exchange = this.recent.get(id)?.join("\n") ?? "";
			return exchange.length <= limit ? exchange : exchange.slice(-limit);
		}
	};
})();
//#endregion
export { Config, NextStep, NextStep as default };
