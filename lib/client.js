window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-next-step",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let zod = require("zod");
		//#region ../../typert/protocol/src/remote-info.ts
		/**
		* Retain one generated definition per endpoint without constructing parsers or projections.
		* The class instance builds its shared descriptor/method index on first access;
		* input schemas and JSON Schema projections are cached only when requested.
		* @param spec - compiler-produced method facts and Zod factories.
		* @param zod - the generated artifact's Zod runtime for named-input parsers.
		* @returns a lazy, mountable info instance with no registration or transport effects.
		*/
		function createTypertRemoteInfo(spec, zod) {
			return new RemoteInfo(spec, zod);
		}
		var RemoteInfo = class {
			spec;
			zod;
			index;
			constructor(spec, zod) {
				this.spec = spec;
				this.zod = zod;
			}
			get package() {
				return this.spec.package;
			}
			get descriptors() {
				return this.resolve().descriptors;
			}
			get methods() {
				return this.resolve().methods;
			}
			resolve() {
				if (this.index !== void 0) return this.index;
				const zod = this.zod;
				const descriptors = [];
				const methods = Object.create(null);
				for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
					const separator = endpoint.indexOf("/");
					const namespace = endpoint.slice(0, separator);
					const method = endpoint.slice(separator + 1);
					const parameters = definition.parameters.map((parameter) => ({
						...parameter,
						wire: parameter.wire ?? parameter.name
					}));
					const descriptor = {
						...definition,
						id: `${this.spec.package}#${endpoint}`,
						namespace,
						method,
						parameters,
						result: definition.result.description === void 0 ? definition.result : new ResultValue(definition.result)
					};
					if (definition.invocation.kind === "direct") {
						const inputs = [];
						methods[endpoint] = Object.assign(descriptor, {
							input(options) {
								const strict = options?.strict === true;
								return inputs[strict ? 1 : 0] ??= new NamedInput(parameters, strict, zod);
							},
							invoke(remote, input, signal) {
								const named = input;
								const values = parameters.map((parameter) => named[parameter.wire]);
								if (definition.cancellation !== void 0) values.push(signal);
								const receiver = Reflect.get(remote, namespace);
								return Reflect.get(receiver, method).apply(receiver, values);
							}
						});
					}
					descriptors.push(descriptor);
				}
				return this.index = {
					descriptors,
					methods
				};
			}
		};
		function optional(parameter) {
			return parameter.source === "json" && parameter.acceptsUndefined === true;
		}
		var NamedInput = class {
			parameters;
			strict;
			zod;
			schema;
			projection;
			constructor(parameters, strict, zod) {
				this.parameters = parameters;
				this.strict = strict;
				this.zod = zod;
			}
			codec(parameter) {
				return this.strict ? parameter.strictCodec : parameter.codec;
			}
			create = () => this.schema ??= this.zod.strictObject(Object.fromEntries(this.parameters.map((parameter) => {
				const value = this.codec(parameter).create();
				return [parameter.wire, optional(parameter) ? value.optional() : value.nonoptional()];
			})));
			get jsonSchema() {
				return this.project().jsonSchema;
			}
			get jsonSchemaError() {
				return this.project().jsonSchemaError;
			}
			project() {
				if (this.projection !== void 0) return this.projection;
				const unavailable = this.parameters.find((parameter) => this.codec(parameter).jsonSchema === void 0);
				if (unavailable !== void 0) return this.projection = { jsonSchemaError: this.codec(unavailable).jsonSchemaError ?? `No JSON Schema for parameter ${unavailable.wire}` };
				return this.projection = { jsonSchema: {
					type: "object",
					properties: Object.fromEntries(this.parameters.map((parameter) => [parameter.wire, {
						...this.codec(parameter).jsonSchema,
						...parameter.description === void 0 ? {} : { description: parameter.description }
					}])),
					required: this.parameters.filter((parameter) => !optional(parameter)).map((parameter) => parameter.wire),
					additionalProperties: false
				} };
			}
		};
		var ResultValue = class {
			spec;
			projection;
			constructor(spec) {
				this.spec = spec;
			}
			get mode() {
				return this.spec.mode;
			}
			get typeSymbol() {
				return this.spec.typeSymbol;
			}
			get create() {
				return this.spec.create;
			}
			get decode() {
				return this.spec.decode;
			}
			get encode() {
				return this.spec.encode;
			}
			get description() {
				return this.spec.description;
			}
			get jsonSchemaError() {
				return this.spec.jsonSchemaError;
			}
			get jsonSchema() {
				if (this.projection === void 0) {
					const schema = this.spec.jsonSchema;
					this.projection = { value: schema === void 0 ? void 0 : {
						...schema,
						description: this.spec.description
					} };
				}
				return this.projection.value;
			}
		};
		//#endregion
		//#region ../next-step/lib/typert.remote-client.js
		let _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0$schema$value;
		const _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0$schema = () => _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0$schema$value ??= zod.z.string();
		let _deepseek_ai_dsh_experimental_next_step_nextStep_watch_result$schema$value;
		const _deepseek_ai_dsh_experimental_next_step_nextStep_watch_result$schema = () => _deepseek_ai_dsh_experimental_next_step_nextStep_watch_result$schema$value ??= zod.z.object({ "text": zod.z.string().readonly().describe("Suggestion body the composer shows while its draft is empty.") });
		let _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0_strict$schema$value;
		const _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0_strict$schema = () => _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0_strict$schema$value ??= zod.z.string();
		const TYPERT_REMOTE = createTypertRemoteInfo({
			package: "@deepseek-ai/dsh-experimental-next-step",
			methods: { "nextStep/watch": {
				service: "nextStep",
				description: "Stream one Session's staged suggestion; finishes with its abort signal.",
				mode: "stream",
				invocation: { kind: "direct" },
				scope: {
					context: "agent",
					wire: "agentId"
				},
				parameters: [{
					name: "agent",
					wire: "agentId",
					description: "the Session's agent, resolved by the Gateway.",
					source: "lookup",
					lookup: "agent",
					codec: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
						create: _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0$schema,
						jsonSchema: { "type": "string" }
					},
					strictCodec: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
						create: _deepseek_ai_dsh_experimental_next_step_nextStep_watch_parameter_0_strict$schema,
						jsonSchema: { "type": "string" }
					}
				}],
				cancellation: { parameter: "signal" },
				result: {
					mode: "strict",
					typeSymbol: "@deepseek-ai/dsh-experimental-next-step/types#SuggestionSnapshot",
					create: _deepseek_ai_dsh_experimental_next_step_nextStep_watch_result$schema,
					description: "the current suggestion followed by every replacement.",
					jsonSchema: {
						"type": "object",
						"properties": { "text": {
							"type": "string",
							"description": "Suggestion body the composer shows while its draft is empty."
						} },
						"required": ["text"],
						"additionalProperties": true
					}
				},
				sourceLocation: {
					"file": "packages/experimental/next-step/src/index.ts",
					"line": 124,
					"column": 3
				}
			} }
		}, zod.z);
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Browser half: mounts the predictor's Remote stream once, watches every
		* Session in the list, and stages each snapshot as composer ghost text through
		* the Conversation-owned `composerSuggestions` face.
		*
		* @module @deepseek-ai/dsh-experimental-client-ui-next-step/client
		*/
		/** Browser services mounted before the Remote namespace exists. */
		const inject = ["remote", "sessions"];
		/**
		* Keep one watch per listed Session and stage every snapshot it yields.
		* The Remote namespace exists only after `$mount`, so this body runs inside
		* `ctx.inject(['remote.nextStep', …])`.
		* @param ctx - Context carrying `remote.nextStep`, `sessions`, and `composerSuggestions`.
		*/
		function registerWatches(ctx) {
			const watches = /* @__PURE__ */ new Map();
			const close = (id, watch) => {
				watch.controller.abort();
				watch.handle.dispose();
				watches.delete(id);
			};
			const watch = (id) => {
				if (watches.has(id)) return;
				const controller = new AbortController();
				const handle = ctx.remote.nextStep.watch(id, controller.signal);
				watches.set(id, {
					controller,
					handle
				});
				(async () => {
					try {
						for await (const snapshot of handle) ctx.composerSuggestions.set(id, snapshot.text === "" ? null : snapshot.text);
					} catch (error) {
						if (!controller.signal.aborted) ctx.logger.warn(`next-step: watch of ${id} ended: ${error instanceof Error ? error.message : String(error)}`);
					}
				})();
			};
			const sync = () => {
				const listed = new Set(ctx.sessions.list.getSnapshot().ids);
				for (const id of listed) watch(id);
				for (const [id, watch] of [...watches]) if (!listed.has(id)) close(id, watch);
			};
			const off = ctx.sessions.list.subscribe(sync);
			sync();
			ctx.effect(() => () => {
				off();
				for (const [id, watch] of [...watches]) close(id, watch);
			}, "next-step: session watches");
		}
		/**
		* Mount the predictor stream and feed the composer.
		* @param ctx - browser Context with `remote` and `sessions`.
		* @returns the disposer that closes every watch and unmounts the Remote.
		*/
		async function apply(ctx) {
			const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			const ui = ctx.inject([
				"remote.nextStep",
				"sessions",
				"composerSuggestions"
			], registerWatches);
			try {
				await ui;
			} catch (error) {
				await ui.dispose();
				await disposeRemote();
				throw error;
			}
			return async () => {
				await ui.dispose();
				await disposeRemote();
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map