window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-next-step",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/Ghost.tsx
		/**
		* Ghost suggestion for the composer, fed by the local prediction service.
		* No harness package is imported at runtime, so the plugin installs from the
		* Plugins panel like any client-only bundle.
		*
		* @module dsh-next-step/Ghost
		*/
		/** Where the local predictor listens. */
		const ENDPOINT = "http://127.0.0.1:61760/suggest";
		/**
		* Renders the suggested next message as ghost text above an empty composer.
		* @param props - session id, draft reader, and the draft writer.
		* @returns the ghost, or nothing while the draft has text.
		*/
		function Ghost({ sessionId, useInput, inputActions }) {
			const draft = useInput((state) => state.draft);
			const [suggestion, setSuggestion] = (0, react.useState)(null);
			const [placement, setPlacement] = (0, react.useState)(null);
			const visible = suggestion !== null && draft === "";
			(0, react.useEffect)(() => {
				let alive = true;
				const ask = () => {
					fetch(ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId })
					}).then((response) => response.json()).then((payload) => {
						if (alive) setSuggestion(payload.suggestions?.[0] ?? null);
					}).catch(() => {});
				};
				ask();
				const timer = setInterval(ask, 15e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [sessionId]);
			(0, react.useLayoutEffect)(() => {
				if (!visible) {
					setPlacement(null);
					return;
				}
				const measure = () => {
					const element = document.querySelector("[data-composer-input]");
					if (!(element instanceof HTMLElement)) return;
					const rect = element.getBoundingClientRect();
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
		/** Browser services the overlay entry needs. */
		const inject = ["slots"];
		/**
		* Register the overlay entry on the composer.
		* @param ctx - browser Context carrying `slots`.
		*/
		function apply(ctx) {
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "next-step-ghost",
				order: 5,
				inject: (sessionId) => ({ sessionId: String(sessionId) })
			}, Ghost));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map