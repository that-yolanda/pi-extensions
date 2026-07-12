import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";

const { ensureSessionMock, getHandlesMock } = vi.hoisted(() => ({
	ensureSessionMock: vi.fn(),
	getHandlesMock: vi.fn(),
}));

vi.mock("../client.js", () => ({
	ensureSession: ensureSessionMock,
	getHandles: getHandlesMock,
}));

import { registerTools } from "../tools.js";

describe("honcho_context", () => {
	test("passes the ensured session to primary dialectic chat", async () => {
		const session = { id: "test-session" };
		const chat = vi.fn().mockResolvedValue("relevant context");
		const handles = {
			aiPeer: { chat },
			userPeer: { id: "user" },
			linked: [],
			config: {
				dialecticMaxInputChars: 10_000,
				dialecticMaxChars: 600,
				reasoningLevel: "low",
				dialecticDynamic: false,
				reasoningLevelCap: null,
			},
		};
		getHandlesMock.mockReturnValue(handles);
		ensureSessionMock.mockResolvedValue(session);

		const tools = new Map<
			string,
			{ execute: (...args: unknown[]) => unknown }
		>();
		const pi = {
			registerTool(tool: {
				name: string;
				execute: (...args: unknown[]) => unknown;
			}) {
				tools.set(tool.name, tool);
			},
		} as unknown as ExtensionAPI;
		registerTools(pi);

		const tool = tools.get("honcho_context");
		expect(tool).toBeDefined();
		const result = await tool?.execute(
			"call-id",
			{ query: "What matters?" },
			new AbortController().signal,
			undefined,
			{},
		);

		expect(ensureSessionMock).toHaveBeenCalledWith(handles);
		expect(chat).toHaveBeenCalledWith("What matters?", {
			target: handles.userPeer,
			session,
			reasoningLevel: "low",
		});
		expect(result).toMatchObject({
			content: [{ type: "text", text: "=== [pi] ===\nrelevant context" }],
		});
	});
});
