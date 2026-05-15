import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DynamicBorder,
	type ExtensionAPI,
	type SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatTokens } from "./utils.js";

function getReserveTokens(cwd: string): number {
	const DEFAULT = 16384;
	for (const p of [
		join(cwd, ".pi", "settings.json"),
		join(homedir(), ".pi", "agent", "settings.json"),
	]) {
		if (!existsSync(p)) continue;
		try {
			const reserve = JSON.parse(readFileSync(p, "utf-8"))?.compaction
				?.reserveTokens;
			if (typeof reserve === "number" && reserve > 0) return reserve;
		} catch {
			/* ignore */
		}
	}
	return DEFAULT;
}

interface CategoryConfig {
	label: string;
	color: "muted" | "warning" | "accent" | "dim" | "text";
	symbol: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
	systemPrompt: { label: "System Prompt", color: "muted", symbol: "⛝" },
	systemTools: { label: "System Tools", color: "muted", symbol: "⛝" },
	toolCall: { label: "Tool Call", color: "warning", symbol: "⛝" },
	messages: { label: "Messages", color: "accent", symbol: "⛝" },
	other: { label: "Other", color: "dim", symbol: "⛝" },
	available: { label: "Available", color: "text", symbol: "⛶" },
	autoCompact: { label: "Auto Compact", color: "dim", symbol: "⛝" },
};

export default function (pi: ExtensionAPI) {
	pi.registerCommand("context", {
		description: "Show context usage visualization",
		handler: async (_args, ctx) => {
			const usage = await ctx.getContextUsage();
			const totalActual = usage?.tokens ?? null;
			const limit = usage?.contextWindow ?? 0;
			const percent = usage?.percent ?? null;
			const reserveTokens =
				totalActual != null && totalActual > 0 ? getReserveTokens(ctx.cwd) : 0;

			const sm = ctx.sessionManager as SessionManager;
			const branch = sm.getBranch();
			const systemPrompt = ctx.getSystemPrompt();
			const tools = pi.getActiveTools();
			const allTools = pi.getAllTools();
			const activeToolDefs = allTools.filter((t) => tools.includes(t.name));

			const estimateTokens = (text: string) => Math.ceil(text.length / 4);

			let msgTokensRaw = 0;
			let toolUseTokensRaw = 0;
			let toolResultTokensRaw = 0;
			let sessionInput = 0;
			let sessionOutput = 0;
			let sessionCacheRead = 0;
			let _sessionCacheWrite = 0;

			for (const entry of branch) {
				if (entry.type === "message") {
					const m = entry.message;
					if (m.role === "user") {
						if (typeof m.content === "string")
							msgTokensRaw += estimateTokens(m.content);
						else if (Array.isArray(m.content)) {
							for (const p of m.content)
								if (p.type === "text") msgTokensRaw += estimateTokens(p.text);
						}
					} else if (m.role === "assistant") {
						if (typeof m.content === "string")
							msgTokensRaw += estimateTokens(m.content);
						else if (Array.isArray(m.content)) {
							for (const p of m.content) {
								if (p.type === "text") msgTokensRaw += estimateTokens(p.text);
								if (p.type === "toolCall")
									toolUseTokensRaw += estimateTokens(JSON.stringify(p));
							}
						}
						if (m.usage) {
							sessionInput += m.usage.input;
							sessionOutput += m.usage.output;
							sessionCacheRead += m.usage.cacheRead;
							_sessionCacheWrite += m.usage.cacheWrite;
						}
					} else if (m.role === "toolResult") {
						if (Array.isArray(m.content)) {
							for (const p of m.content)
								if (p.type === "text")
									toolResultTokensRaw += estimateTokens(p.text);
						}
					} else if (m.role === "bashExecution") {
						toolUseTokensRaw += estimateTokens(m.command || "");
					}
				} else if (
					entry.type === "branch_summary" ||
					entry.type === "compaction"
				) {
					msgTokensRaw += estimateTokens(entry.summary || "");
				}
			}

			const systemTokensRaw = estimateTokens(systemPrompt);
			const toolDefTokensRaw = estimateTokens(JSON.stringify(activeToolDefs));

			const totalRaw =
				systemTokensRaw +
				toolDefTokensRaw +
				msgTokensRaw +
				toolUseTokensRaw +
				toolResultTokensRaw;
			const ratio =
				totalActual != null && totalRaw > 0 ? totalActual / totalRaw : 1;

			const systemTokens = Math.round(systemTokensRaw * ratio);
			const toolDefTokens = Math.round(toolDefTokensRaw * ratio);
			const msgTokens = Math.round(msgTokensRaw * ratio);
			const toolUseTokens = Math.round(toolUseTokensRaw * ratio);
			const toolResultTokens = Math.round(toolResultTokensRaw * ratio);

			await ctx.ui.custom(
				(_tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(
						new DynamicBorder((s: string) => theme.fg("accent", s)),
					);
					container.addChild(
						new Text(theme.fg("accent", theme.bold(" Context Usage")), 1, 0),
					);
					container.addChild(new Spacer(1));

					if (totalActual == null || percent == null) {
						container.addChild(
							new Text(
								theme.fg("dim", " Context data not available yet"),
								1,
								0,
							),
						);
						container.addChild(
							new Text(
								theme.fg("dim", " Start a conversation to see usage"),
								1,
								0,
							),
						);
					} else {
						type CategoryKey = keyof typeof CATEGORY_CONFIG;
						const categories: {
							key: CategoryKey;
							value: number;
						}[] = [
							{
								key: "systemPrompt",
								value: systemTokens,
							},
							{
								key: "systemTools",
								value: toolDefTokens,
							},
							{
								key: "toolCall",
								value: toolUseTokens + toolResultTokens,
							},
							{ key: "messages", value: msgTokens },
						];

						const otherTokens = Math.max(
							0,
							totalActual -
								(systemTokens +
									toolDefTokens +
									msgTokens +
									toolUseTokens +
									toolResultTokens),
						);
						if (otherTokens > 10)
							categories.push({
								key: "other",
								value: otherTokens,
							});

						categories.push({
							key: "available",
							value: Math.max(0, limit - reserveTokens - totalActual),
						});
						categories.push({
							key: "autoCompact",
							value: reserveTokens,
						});

						const gridWidth = 10;
						const gridHeight = 5;
						const totalBlocks = gridWidth * gridHeight;

						const blocks: {
							color: string;
							symbol: string;
						}[] = [];
						categories.forEach((cat) => {
							const cfg = CATEGORY_CONFIG[cat.key];
							let count = Math.round((cat.value / limit) * totalBlocks);
							if (count === 0 && cat.value > 0) count = 1;
							for (let i = 0; i < count && blocks.length < totalBlocks; i++) {
								blocks.push({
									color: cfg.color,
									symbol: `${cfg.symbol} `,
								});
							}
						});

						while (blocks.length < totalBlocks) {
							blocks.push({
								color: CATEGORY_CONFIG.available.color,
								symbol: `${CATEGORY_CONFIG.available.symbol} `,
							});
						}

						const gridLines: string[] = [];
						for (let r = 0; r < gridHeight; r++) {
							let rowStr = "";
							for (let c = 0; c < gridWidth; c++) {
								const b = blocks[r * gridWidth + c];
								rowStr += theme.fg(b.color, b.symbol);
							}
							gridLines.push(rowStr.trimEnd());
						}

						const totalUsageTitle = `${theme.fg("text", theme.bold("Total Usage".padEnd(16)))} ${theme.fg("text", theme.bold(formatTokens(totalActual).padStart(7)))} ${theme.fg("text", theme.bold(`(${percent?.toFixed(1).padStart(5)}%)`))}`;

						const catDetailLines = categories.map((cat) => {
							const cfg = CATEGORY_CONFIG[cat.key];
							const labelStr = cfg.label.padEnd(19);
							const valStr = formatTokens(cat.value).padStart(7);
							const rowPercent = ((cat.value / limit) * 100)
								.toFixed(1)
								.padStart(5);
							return `${theme.fg(cfg.color, cfg.symbol)} ${theme.fg("text", labelStr)} ${theme.fg("accent", valStr)} (${rowPercent}%)`;
						});

						const allDetailLines = [totalUsageTitle, "", ...catDetailLines];

						const leftSideWidth = 20;
						const maxH = Math.max(gridLines.length, allDetailLines.length);
						for (let i = 0; i < maxH; i++) {
							const left = (gridLines[i] || "").padEnd(leftSideWidth);
							const right = allDetailLines[i] || "";
							container.addChild(new Text(`    ${left}      ${right}`, 1, 0));
						}

						// Session token usage breakdown
						if (sessionInput > 0 || sessionOutput > 0 || sessionCacheRead > 0) {
							const totalIn = sessionInput + sessionCacheRead;
							const cacheRate =
								totalIn > 0
									? ((sessionCacheRead / totalIn) * 100).toFixed(1)
									: "0";

							container.addChild(new Spacer(1));
							container.addChild(
								new Text(
									theme.fg("accent", theme.bold(" Session Token Usage")),
									1,
									0,
								),
							);
							container.addChild(
								new Text(
									`  ${theme.fg("dim", "Input".padEnd(12))} ${theme.fg("text", formatTokens(totalIn).padStart(8))}`,
									1,
									0,
								),
							);
							container.addChild(
								new Text(
									`  ${theme.fg("dim", "  miss".padEnd(12))} ${theme.fg("text", formatTokens(sessionInput).padStart(8))}`,
									1,
									0,
								),
							);
							if (sessionCacheRead > 0) {
								container.addChild(
									new Text(
										`  ${theme.fg("dim", "  hit".padEnd(12))} ${theme.fg("accent", formatTokens(sessionCacheRead).padStart(8))} ${theme.fg("accent", `(${cacheRate}%)`)}`,
										1,
										0,
									),
								);
							}
							container.addChild(
								new Text(
									`  ${theme.fg("dim", "Output".padEnd(12))} ${theme.fg("text", formatTokens(sessionOutput).padStart(8))}`,
									1,
									0,
								),
							);
						}
					}

					container.addChild(new Spacer(1));
					container.addChild(
						new Text(theme.fg("dim", " Press any key to close"), 1, 0),
					);
					container.addChild(
						new DynamicBorder((s: string) => theme.fg("accent", s)),
					);

					return {
						render: (w) => container.render(w),
						invalidate: () => container.invalidate(),
						handleInput: (_data) => done(undefined),
					};
				},
				{ overlay: true },
			);
		},
	});
}
