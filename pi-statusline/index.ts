import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

// --- Gruvbox Dark palette (RGB tuples) ---

type RGB = readonly [number, number, number];

const C = {
	fg0: [251, 241, 199] as RGB, // '#fbf1c7'
	bg1: [60, 56, 54] as RGB, // '#3c3836'
	bg3: [102, 92, 84] as RGB, // '#665c54'
	blue: [69, 133, 136] as RGB, // '#458588'
	aqua: [104, 157, 106] as RGB, // '#689d6a'
	green: [152, 151, 26] as RGB, // '#98971a'
	orange: [214, 93, 14] as RGB, // '#d65d0e'
	purple: [177, 98, 134] as RGB, // '#b16286'
	red: [204, 36, 29] as RGB, // '#cc241d'
	yellow: [215, 153, 33] as RGB, // '#d79921'
};

const R = "\x1b[0m";

function fg(c: RGB): string {
	return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
}

function bg(c: RGB): string {
	return `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
}

// --- Capsule builders (Powerline style) ---

function pillOpen(c: RGB): string {
	return `${fg(c)}${R}`;
}

function pillClose(c: RGB): string {
	return `${fg(c)}${R}`;
}

function pillBody(c: RGB, text: string): string {
	return `${bg(c)}${fg(C.fg0)} ${text} ${R}`;
}

function pillArrow(prev: RGB, next: RGB): string {
	return `${bg(next)}${fg(prev)}${R}`;
}

interface Segment {
	bg: RGB;
	text: string;
}

function buildPill(segments: Segment[]): string {
	if (segments.length === 0) return "";
	let out = pillOpen(segments[0].bg) + pillBody(segments[0].bg, segments[0].text);
	for (let i = 1; i < segments.length; i++) {
		out += pillArrow(segments[i - 1].bg, segments[i].bg);
		out += pillBody(segments[i].bg, segments[i].text);
	}
	out += pillClose(segments[segments.length - 1].bg);
	return out;
}

// Merge adjacent same-color segments with " · " separator
function mergeSegments(segments: Segment[]): Segment[] {
	if (segments.length <= 1) return segments;
	const result: Segment[] = [{ ...segments[0] }];
	for (let i = 1; i < segments.length; i++) {
		const prev = result[result.length - 1];
		const cur = segments[i];
		if (
			prev.bg[0] === cur.bg[0] &&
			prev.bg[1] === cur.bg[1] &&
			prev.bg[2] === cur.bg[2]
		) {
			prev.text += ` · ${cur.text}`;
		} else {
			result.push({ ...cur });
		}
	}
	return result;
}

// --- Data helpers ---

function shortenPath(cwd: string): string {
	const home = process.env.HOME || "";
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
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

function thinkingLabel(raw: string | undefined): string {
	if (!raw) return "";
	const map: Record<string, string> = {
		off: "",
		minimal: "min",
		low: "low",
		medium: "med",
		high: "high",
		extended: "xhigh",
	};
	return map[raw.toLowerCase()] || raw;
}

function extractThinking(model: unknown): string {
	const cfg = (model as { config?: Record<string, unknown> })?.config;
	if (!cfg) return "";
	if (typeof cfg.thinkingLevel === "string")
		return thinkingLabel(cfg.thinkingLevel);
	if (cfg.thinking) {
		const t = cfg.thinking;
		return thinkingLabel(
			typeof t === "string" ? t : (t as { level?: string })?.level,
		);
	}
	return "";
}

// --- State ---

interface StatusState {
	model: string;
	thinkingLevel: string;
	contextPercent: number | null;
	contextTokens: number | null;
	contextWindow: number;
	gitBranch: string | null;
	gitAdded: number;
	gitRemoved: number;
	cwd: string;
}

// --- Render ---

function buildLines(width: number, s: StatusState): string[] {
	// Line 1: session info capsules
	const line1Segs: Segment[] = [];

	if (s.model)
		line1Segs.push({ bg: C.orange, text: `❖ ${s.model}` });
	if (s.thinkingLevel)
		line1Segs.push({ bg: C.purple, text: `○ ${s.thinkingLevel}` });
	if (s.gitBranch)
		line1Segs.push({ bg: C.aqua, text: ` ${s.gitBranch}` });
	if (s.gitAdded > 0 || s.gitRemoved > 0) {
		const parts: string[] = [];
		if (s.gitAdded > 0) parts.push(`+${s.gitAdded}`);
		if (s.gitRemoved > 0) parts.push(`-${s.gitRemoved}`);
		line1Segs.push({ bg: C.blue, text: parts.join(" ") });
	}
	if (s.cwd) line1Segs.push({ bg: C.yellow, text: shortenPath(s.cwd) });

	const line1 =
		truncateToWidth(buildPill(mergeSegments(line1Segs)), width) + R;

	// Line 2: context usage capsules
	let line2: string;
	if (s.contextPercent != null && s.contextWindow > 0) {
		const pct = s.contextPercent;
		const remain = Math.max(0, 100 - pct);
		const usageColor =
			pct < 50 ? C.green : pct < 80 ? C.yellow : C.red;

		const barW = 10;
		const filled = Math.max(0, Math.round((pct / 100) * barW));
		const empty = barW - filled;
		const bar = "█".repeat(filled) + "░".repeat(empty);

		const line2Segs: Segment[] = [
			{
				bg: usageColor,
				text: `${pct.toFixed(1)}% ${bar}`,
			},
			{
				bg: C.bg3,
				text: `${fmtTokens(s.contextTokens ?? 0)}/${fmtTokens(s.contextWindow)}`,
			},
			{
				bg: C.bg3,
				text: `${remain.toFixed(1)}% free`,
			},
		];

		line2 =
			truncateToWidth(buildPill(mergeSegments(line2Segs)), width) + R;
	} else {
		line2 = `${fg(C.bg3)}Context data not available yet${R}`;
	}

	return [line1, line2];
}

// --- Extension ---

export default function (pi: ExtensionAPI) {
	const state: StatusState = {
		model: "",
		thinkingLevel: "",
		contextPercent: null,
		contextTokens: null,
		contextWindow: 200_000,
		gitBranch: null,
		gitAdded: 0,
		gitRemoved: 0,
		cwd: "",
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

	function requestRender() {
		tui?.requestRender();
	}

	pi.on("session_start", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.model = ctx.model?.id || "";
		state.thinkingLevel = extractThinking(ctx.model);
		refreshGit(ctx.cwd);
		await refreshContext(ctx);

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

	pi.on("model_select", async (event) => {
		state.model = event.model?.id || "";
		state.thinkingLevel = extractThinking(event.model);
		requestRender();
	});

	pi.on("turn_start", async (_event, ctx) => {
		await refreshContext(ctx);
		requestRender();
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshContext(ctx);
		refreshGit(ctx.cwd);
		requestRender();
	});
}
