/**
 * Ambient stubs for pi SDK modules.
 *
 * These packages are provided by the pi runtime at extension load time
 * (resolved from pi's own install dir) and are not npm-resolvable from this
 * repo. The stubs exist so `tsc --noEmit` can type-check this extension —
 * catching real bugs like undeclared identifiers — without vendoring the SDK.
 * Shapes are intentionally loose (`any`); accuracy of the SDK surface is
 * verified by the runtime, not by this check.
 */

declare module "@earendil-works/pi-agent-core" {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type AgentMessage = any;
}

declare module "@earendil-works/pi-ai" {
	export interface TextContent {
		type: "text";
		text: string;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type AssistantMessage = any;
}

declare module "@earendil-works/pi-coding-agent" {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type ExtensionAPI = any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type ExtensionContext = any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type BashOperations = any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export function createBashTool(cwd: string, options?: { operations?: any }): any;
}

declare module "@earendil-works/pi-tui" {
	export const Key: {
		ctrlAlt(key: string): string;
	};
	export class Text {
		constructor(text: string, x?: number, y?: number);
	}
}

declare module "typebox" {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export const Type: any;
}
