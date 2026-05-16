import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

// --- Gruvbox Dark palette (RGB tuples) ---

type RGB = readonly [number, number, number];

const C = {
	fg0: [251, 241, 199] as RGB, // '#fbf1c7'
	fg1: [151, 138, 128] as RGB, // '#978A80'
	bg1: [102, 92, 84] as RGB, // '#665c54'
	bg2: [60, 56, 54] as RGB, // '#3c3836'
	blue: [69, 133, 136] as RGB, // '#458588'
	aqua: [104, 157, 106] as RGB, // '#689d6a'
	green: [152, 151, 26] as RGB, // '#98971a'
	orange: [214, 93, 14] as RGB, // '#d65d0e'
	purple: [177, 98, 134] as RGB, // '#b16286'
	red: [204, 36, 29] as RGB, // '#cc241d'
	yellow: [215, 153, 33] as RGB, // '#d79921'
};

// --- Theme configuration (color role mapping) ---
const THEME = {
	/** Text foreground inside capsules */
	fg: C.fg0,
	/** Line 1 segment color cycle */
	line1: [C.orange, C.yellow, C.aqua, C.blue, C.bg1, C.bg2] as const,
	/** Line 2 session consumption segment */
	session: C.bg1,
	/** Line 2 context bar background */
	contextBar: C.bg2,
	/** Context bar: used block color */
	barUsed: C.bg1,
	/** Context bar: free block color */
	barFree: C.fg1,
} as const;

function line1Color(idx: number): RGB {
	return THEME.line1[idx % THEME.line1.length];
}

const R = "\x1b[0m";

function fg(c: RGB): string {
	return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
}

function bg(c: RGB): string {
	return `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
}

// --- Capsule builders (Powerline style) ---

function pillOpen(c: RGB): string {
	return `${fg(c)}\u{E0B6}${R}`;
}

function pillClose(c: RGB): string {
	return `${fg(c)}\u{E0B4}${R}`;
}

function pillBody(c: RGB, text: string): string {
	return `${bg(c)}${fg(THEME.fg)} ${text} ${R}`;
}

function pillArrow(prev: RGB, next: RGB): string {
	return `${bg(next)}${fg(prev)}\u{E0B0}${R}`;
}

interface Segment {
	bg: RGB;
	text: string;
}

function buildPill(segments: Segment[]): string {
	if (segments.length === 0) return "";
	let out =
		pillOpen(segments[0].bg) + pillBody(segments[0].bg, segments[0].text);
	for (let i = 1; i < segments.length; i++) {
		out += pillArrow(segments[i - 1].bg, segments[i].bg);
		out += pillBody(segments[i].bg, segments[i].text);
	}
	out += pillClose(segments[segments.length - 1].bg);
	return out;
}

// --- Data helpers ---

function shortenPath(cwd: string): string {
	const home = process.env.HOME || "";
	const p = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	const segs = p.split("/").filter(Boolean);
	if (segs.length > 3) {
		const keep = segs.slice(-3).join("/");
		return p.startsWith("~/") ? `~/.../${keep}` : `.../${keep}`;
	}
	return p;
}

function collectGitStats(cwd: string): { added: number; removed: number } {
	try {
		const out = execSync("git diff --shortstat HEAD", {
			cwd,
			encoding: "utf-8",
			timeout: 2000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const ins = out.match(/(\d+) insertion/);
		const dels = out.match(/(\d+) deletion/);
		return {
			added: ins ? Number.parseInt(ins[1], 10) : 0,
			removed: dels ? Number.parseInt(dels[1], 10) : 0,
		};
	} catch {
		return { added: 0, removed: 0 };
	}
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

// --- State ---

interface StatusState {
	provider: string;
	model: string;
	thinkingLevel: string;
	contextPercent: number | null;
	contextTokens: number | null;
	contextWindow: number;
	gitBranch: string | null;
	gitAdded: number;
	gitRemoved: number;
	cwd: string;
	totalInput: number;
	totalOutput: number;
	totalCacheRead: number;
	totalCacheWrite: number;
}

// --- Render ---

function buildLines(width: number, s: StatusState): string[] {
	// Line 1: session info — orange / yellow / aqua / blue / bg1 / bg2
	const line1Segs: Segment[] = [];
	let ci = 0;

	if (s.model) {
		line1Segs.push({
			bg: line1Color(ci++),
			text: s.provider ? `❖ ${s.provider}/${s.model}` : `❖ ${s.model}`,
		});
	}
	if (s.thinkingLevel) {
		line1Segs.push({
			bg: line1Color(ci++),
			text: `  ${s.thinkingLevel}`,
		});
	}
	if (s.gitBranch || s.gitAdded > 0 || s.gitRemoved > 0) {
		const parts: string[] = [];
		if (s.gitBranch) parts.push(` ${s.gitBranch}`);
		if (s.gitAdded > 0) parts.push(`+${s.gitAdded}`);
		if (s.gitRemoved > 0) parts.push(`-${s.gitRemoved}`);
		line1Segs.push({ bg: line1Color(ci++), text: parts.join(" ") });
	}
	if (s.cwd) {
		line1Segs.push({
			bg: line1Color(ci++),
			text: `  ${shortenPath(s.cwd)}`,
		});
	}

	const line1 = truncateToWidth(buildPill(line1Segs), width) + R;

	// Line 2: session consumption + context state
	let line2: string;
	if (s.contextPercent != null && s.contextWindow > 0) {
		const pct = s.contextPercent;
		const remain = Math.max(0, 100 - pct);

		const barW = 10;
		const usedBlocks = Math.max(0, Math.round((pct / 100) * barW));
		const freeBlocks = barW - usedBlocks;

		const line2Segs: Segment[] = [];

		// Segment 1 (orange): session token consumption
		if (s.totalInput > 0 || s.totalOutput > 0 || s.totalCacheRead > 0) {
			const totalInput = s.totalInput + s.totalCacheRead;
			const hitRate =
				totalInput > 0
					? ((s.totalCacheRead / totalInput) * 100).toFixed(0)
					: "0";
			line2Segs.push({
				bg: THEME.session,
				text: ` in:${fmtTokens(s.totalInput)} out:${fmtTokens(s.totalOutput)} cached:${fmtTokens(s.totalCacheRead)} hit:${hitRate}%`,
			});
		}

		// Segment 2: context bar + used / window + free %
		const usedText = s.contextTokens != null ? fmtTokens(s.contextTokens) : "?";
		line2Segs.push({
			bg: THEME.contextBar,
			text: `${fg(THEME.barUsed)}${"█".repeat(usedBlocks)}${fg(THEME.barFree)}${"░".repeat(freeBlocks)}${fg(THEME.fg)} ${usedText}/${fmtTokens(s.contextWindow)} free:${remain.toFixed(1)}%`,
		});

		line2 = truncateToWidth(buildPill(line2Segs), width) + R;
	} else {
		line2 = `${fg(THEME.contextBar)}Context data not available yet${R}`;
	}

	return [line1, line2];
}

// --- Extension ---

export default function (pi: ExtensionAPI) {
	const state: StatusState = {
		provider: "",
		model: "",
		thinkingLevel: "",
		contextPercent: null,
		contextTokens: null,
		contextWindow: 200_000,
		gitBranch: null,
		gitAdded: 0,
		gitRemoved: 0,
		cwd: "",
		totalInput: 0,
		totalOutput: 0,
		totalCacheRead: 0,
		totalCacheWrite: 0,
	};

	let tui: { requestRender(): void } | null = null;

	async function refreshContext(ctx: {
		getContextUsage(): Promise<
			| {
					tokens: number | null;
					contextWindow: number;
					percent: number | null;
			  }
			| undefined
		>;
	}) {
		try {
			const usage = await ctx.getContextUsage();
			if (usage) {
				state.contextTokens = usage.tokens;
				state.contextWindow = usage.contextWindow;
				state.contextPercent = usage.percent;
			}
		} catch {
			// Data may not be available yet
		}
	}

	function refreshGit(cwd: string) {
		const stats = collectGitStats(cwd);
		state.gitAdded = stats.added;
		state.gitRemoved = stats.removed;
	}

	function refreshUsage(ctx: {
		sessionManager: {
			getBranch(): Array<{
				type: string;
				thinkingLevel?: string;
				message?: {
					role: string;
					usage?: {
						input: number;
						output: number;
						cacheRead: number;
						cacheWrite: number;
					};
				};
			}>;
		};
	}) {
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let lastThinking = "";
		for (const e of ctx.sessionManager.getBranch()) {
			if (e.type === "message" && e.message?.role === "assistant") {
				const u = e.message.usage;
				if (u) {
					input += u.input;
					output += u.output;
					cacheRead += u.cacheRead;
					cacheWrite += u.cacheWrite;
				}
			}
			if (e.type === "thinking_level_change") {
				lastThinking = e.thinkingLevel || "";
			}
		}
		state.totalInput = input;
		state.totalOutput = output;
		state.totalCacheRead = cacheRead;
		state.totalCacheWrite = cacheWrite;
		if (lastThinking) {
			state.thinkingLevel = lastThinking;
		}
	}

	function requestRender() {
		tui?.requestRender();
	}

	pi.on("session_start", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.provider =
			(ctx.model as { provider?: string } | undefined)?.provider || "";
		state.model = ctx.model?.id || "";
		state.thinkingLevel = "";
		refreshGit(ctx.cwd);
		await refreshContext(ctx);
		refreshUsage(ctx);

		ctx.ui.setFooter((_tui, _theme, footerData) => {
			tui = _tui;
			state.gitBranch = footerData.getGitBranch();

			const unsub = footerData.onBranchChange(() => {
				state.gitBranch = footerData.getGitBranch();
				requestRender();
			});

			return {
				dispose: () => {
					unsub();
					tui = null;
				},
				invalidate() {},
				render(width: number): string[] {
					return buildLines(width, state);
				},
			};
		});
	});

	pi.on("model_select", async (event, ctx) => {
		state.provider = event.model.provider || "";
		state.model = event.model?.id || "";
		await refreshContext(ctx);
		requestRender();
	});

	pi.on("thinking_level_select", async (event) => {
		state.thinkingLevel = event.level;
		requestRender();
	});

	pi.on("turn_start", async (_event, ctx) => {
		await refreshContext(ctx);
		requestRender();
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshContext(ctx);
		refreshGit(ctx.cwd);
		refreshUsage(ctx);
		requestRender();
	});
}
