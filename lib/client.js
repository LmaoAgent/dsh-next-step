window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-next-step",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let zod = require("zod");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		//#region src/client/Ghost.tsx
		/**
		* Fallback ghost text on the composer overlay: positions itself over the
		* editor's first line, hides while a draft exists, and accepts with Tab
		* through the standard `inputActions.setDraft` seat. It exists because
		* released DSH builds do not carry the `composerSuggestions` seam yet.
		*
		* @module @deepseek-ai/dsh-experimental-client-ui-next-step/Ghost
		*/
		/** Finds the resident composer editor of the current page. */
		function composerInput() {
			const element = document.querySelector("[data-composer-input]");
			return element instanceof HTMLElement ? element : null;
		}
		/**
		* Renders the staged suggestion as fixed-position ghost text.
		* @param props - standard input seats and the suggestion hook.
		* @returns the ghost text, or nothing while the draft is non-empty.
		*/
		function Ghost({ useSuggestion, useInput, inputActions }) {
			const suggestion = useSuggestion((value) => value);
			const draft = useInput((state) => state.draft);
			const [placement, setPlacement] = (0, react.useState)(null);
			const visible = suggestion !== null && draft === "";
			(0, react.useLayoutEffect)(() => {
				if (!visible) {
					setPlacement(null);
					return;
				}
				const measure = () => {
					const input = composerInput();
					if (input === null) return;
					const rect = input.getBoundingClientRect();
					setPlacement({
						top: rect.top + 4,
						left: rect.left + 14,
						width: Math.max(0, rect.width - 22)
					});
				};
				measure();
				window.addEventListener("resize", measure);
				return () => {
					window.removeEventListener("resize", measure);
				};
			}, [visible]);
			(0, react.useEffect)(() => {
				if (!visible || suggestion === null) return;
				const onKeyDown = (event) => {
					if (event.key !== "Tab" || event.defaultPrevented) return;
					const target = event.target;
					if (!(target instanceof Element) || target.closest("[data-composer-input]") === null) return;
					event.preventDefault();
					event.stopImmediatePropagation();
					inputActions.setDraft(suggestion);
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => {
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [
				visible,
				suggestion,
				inputActions
			]);
			if (!visible || placement === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"aria-hidden": true,
				"data-next-step-ghost": true,
				style: {
					position: "fixed",
					top: placement.top,
					left: placement.left,
					width: placement.width,
					color: "var(--dsw-alias-label-caption)",
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
					pointerEvents: "none",
					userSelect: "none",
					zIndex: 5
				},
				children: suggestion
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Browser services: the Remote namespace, the Session list, and the composer slots. */
		const inject = [
			"remote",
			"sessions",
			"slots"
		];
		/** One observable cell per Session, fed by that Session's Remote stream. */
		var SuggestionStore = class {
			snapshot = null;
			listeners = /* @__PURE__ */ new Set();
			/** Current staged suggestion. */
			getSnapshot = () => this.snapshot;
			/**
			* Subscribe to staged changes.
			* @param listener - called after every replacement.
			* @returns the unsubscribe disposer.
			*/
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/**
			* Replace the staged suggestion.
			* @param value - suggestion body, or null to withdraw it.
			*/
			set(value) {
				if (value === this.snapshot) return;
				this.snapshot = value;
				for (const listener of [...this.listeners]) listener();
			}
		};
		/**
		* Feed one store per listed Session and register the ghost overlay.
		* The Remote namespace exists only after `$mount`, so this runs inside
		* `ctx.inject(['remote.nextStep', …])`.
		* @param ctx - Context carrying `remote.nextStep`, `sessions`, and `slots`.
		*/
		function registerGhost(ctx) {
			const stores = /* @__PURE__ */ new Map();
			const watches = /* @__PURE__ */ new Map();
			const storeOf = (id) => {
				let store = stores.get(id);
				if (store === void 0) {
					store = new SuggestionStore();
					stores.set(id, store);
				}
				return store;
			};
			const close = (id, watch) => {
				watch.controller.abort();
				watch.handle.dispose();
				watches.delete(id);
				stores.delete(id);
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
						for await (const snapshot of handle) storeOf(id).set(snapshot.text === "" ? null : snapshot.text);
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
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "next-step-ghost",
				order: 5,
				inject: (sessionId) => ({ hooks: { suggestion: storeOf(sessionId) } })
			}, Ghost));
		}
		/**
		* Mount the predictor stream and the ghost overlay.
		* @param ctx - browser Context with `remote`, `sessions`, and `slots`.
		* @returns the disposer that closes every watch and unmounts the Remote.
		*/
		async function apply(ctx) {
			const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			const ui = ctx.inject(["remote.nextStep", "slots"], registerGhost);
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