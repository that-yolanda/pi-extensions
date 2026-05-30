/**
 * Questionnaire Tool - Unified tool for asking single or multiple questions
 *
 * Single question: simple options list
 * Multiple questions: tab bar navigation between questions
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// Types
interface QuestionOption {
	value: string;
	label: string;
	description?: string;
}

type RenderOption = QuestionOption & { isOther?: boolean };

interface Question {
	id: string;
	label: string;
	prompt: string;
	options: QuestionOption[];
	allowOther: boolean;
	multiSelect: boolean;
}

interface Answer {
	id: string;
	value: string;
	label: string;
	wasCustom: boolean;
	index?: number;
	selections?: {
		value: string;
		label: string;
		wasCustom: boolean;
		index?: number;
	}[];
}

interface QuestionnaireResult {
	questions: Question[];
	answers: Answer[];
	cancelled: boolean;
}

// Schema
const QuestionOptionSchema = Type.Object({
	value: Type.String({ description: "The value returned when selected" }),
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(
		Type.String({ description: "Optional description shown below label" }),
	),
});

const QuestionSchema = Type.Object({
	id: Type.String({ description: "Unique identifier for this question" }),
	label: Type.Optional(
		Type.String({
			description:
				"Short contextual label for tab bar, e.g. 'Scope', 'Priority' (defaults to Q1, Q2)",
		}),
	),
	prompt: Type.String({ description: "The full question text to display" }),
	options: Type.Array(QuestionOptionSchema, {
		description: "Available options to choose from",
	}),
	allowOther: Type.Optional(
		Type.Boolean({
			description: "Allow 'Type something' option (default: true)",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Allow multiple selections (default: false)" }),
	),
});

const QuestionnaireParams = Type.Object({
	questions: Type.Array(QuestionSchema, {
		description: "Questions to ask the user",
	}),
});

function errorResult(
	message: string,
	questions: Question[] = [],
): { content: { type: "text"; text: string }[]; details: QuestionnaireResult } {
	return {
		content: [{ type: "text", text: message }],
		details: { questions, answers: [], cancelled: true },
	};
}

export default function questionnaire(pi: ExtensionAPI) {
	pi.registerTool({
		name: "questionnaire",
		label: "Questionnaire",
		description:
			"Ask the user one or more questions. Use for clarifying requirements, getting preferences, or confirming decisions. For single questions, shows a simple option list. For multiple questions, shows a tab-based interface.",
		promptSnippet:
			"Ask the user structured single/multi-choice questions via interactive TUI",
		promptGuidelines: [
			"Use questionnaire when you need to clarify requirements, gather preferences, or confirm decisions with the user interactively.",
		],
		parameters: QuestionnaireParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return errorResult(
					"Error: UI not available (running in non-interactive mode)",
				);
			}
			if (params.questions.length === 0) {
				return errorResult("Error: No questions provided");
			}

			// Normalize questions with defaults
			const questions: Question[] = params.questions.map((q, i) => ({
				...q,
				label: q.label || `Q${i + 1}`,
				allowOther: q.allowOther !== false,
				multiSelect: q.multiSelect === true,
			}));

			const isMulti = questions.length > 1;
			const totalTabs = questions.length + 1; // questions + Submit

			const result = await ctx.ui.custom<QuestionnaireResult>(
				(tui, theme, _kb, done) => {
					// State
					let currentTab = 0;
					let optionIndex = 0;
					let inputMode = false;
					let inputQuestionId: string | null = null;
					let cachedLines: string[] | undefined;
					const answers = new Map<string, Answer>();
					const multiSelections = new Map<string, Set<number>>();
					const multiCustomInputs = new Map<
						string,
						{ value: string; label: string }[]
					>();

					// Editor for "Type something" option
					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(tui, editorTheme);

					// Helpers
					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function submit(cancelled: boolean) {
						done({
							questions,
							answers: Array.from(answers.values()),
							cancelled,
						});
					}

					function currentQuestion(): Question | undefined {
						return questions[currentTab];
					}

					function currentOptions(): RenderOption[] {
						const q = currentQuestion();
						if (!q) return [];
						const opts: RenderOption[] = [...q.options];
						if (q.allowOther) {
							opts.push({
								value: "__other__",
								label: "Type something.",
								isOther: true,
							});
						}
						return opts;
					}

					function allAnswered(): boolean {
						return questions.every((q) => answers.has(q.id));
					}

					function advanceAfterAnswer() {
						if (!isMulti) {
							submit(false);
							return;
						}
						if (currentTab < questions.length - 1) {
							currentTab++;
						} else {
							currentTab = questions.length; // Submit tab
						}
						optionIndex = 0;
						refresh();
					}

					function saveAnswer(
						questionId: string,
						value: string,
						label: string,
						wasCustom: boolean,
						index?: number,
					) {
						answers.set(questionId, {
							id: questionId,
							value,
							label,
							wasCustom,
							index,
						});
					}

					function saveMultiAnswer(
						questionId: string,
						selections: {
							value: string;
							label: string;
							wasCustom: boolean;
							index?: number;
						}[],
					) {
						answers.set(questionId, {
							id: questionId,
							value: selections.map((s) => s.value).join(", "),
							label: selections.map((s) => s.label).join(", "),
							wasCustom: selections.some((s) => s.wasCustom),
							selections,
						});
					}

					// Editor submit callback
					editor.onSubmit = (value) => {
						if (!inputQuestionId) return;
						const trimmed = value.trim() || "(no response)";
						const q = questions.find((qq) => qq.id === inputQuestionId);
						if (q?.multiSelect) {
							if (!multiCustomInputs.has(q.id)) multiCustomInputs.set(q.id, []);
							multiCustomInputs
								.get(q.id)
								?.push({ value: trimmed, label: trimmed });
							inputMode = false;
							inputQuestionId = null;
							editor.setText("");
							refresh();
						} else {
							saveAnswer(inputQuestionId, trimmed, trimmed, true);
							inputMode = false;
							inputQuestionId = null;
							editor.setText("");
							advanceAfterAnswer();
						}
					};

					function handleInput(data: string) {
						// Input mode: route to editor
						if (inputMode) {
							if (matchesKey(data, Key.escape)) {
								inputMode = false;
								inputQuestionId = null;
								editor.setText("");
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}

						const q = currentQuestion();
						const opts = currentOptions();

						// Tab navigation (multi-question only)
						if (isMulti) {
							if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
								currentTab = (currentTab + 1) % totalTabs;
								optionIndex = 0;
								refresh();
								return;
							}
							if (
								matchesKey(data, Key.shift("tab")) ||
								matchesKey(data, Key.left)
							) {
								currentTab = (currentTab - 1 + totalTabs) % totalTabs;
								optionIndex = 0;
								refresh();
								return;
							}
						}

						// Submit tab
						if (currentTab === questions.length) {
							if (matchesKey(data, Key.enter) && allAnswered()) {
								submit(false);
							} else if (matchesKey(data, Key.escape)) {
								submit(true);
							}
							return;
						}

						// Option navigation
						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(opts.length - 1, optionIndex + 1);
							refresh();
							return;
						}

						if (!q) return;

						// Multi-select mode
						if (q.multiSelect) {
							if (matchesKey(data, Key.space)) {
								const opt = opts[optionIndex];
								if (opt.isOther) {
									inputMode = true;
									inputQuestionId = q.id;
									editor.setText("");
									refresh();
									return;
								}
								const selected = multiSelections.get(q.id) || new Set<number>();
								if (selected.has(optionIndex)) {
									selected.delete(optionIndex);
								} else {
									selected.add(optionIndex);
								}
								multiSelections.set(q.id, new Set(selected));
								refresh();
								return;
							}
							if (matchesKey(data, Key.enter)) {
								const opt = opts[optionIndex];
								if (opt.isOther) {
									inputMode = true;
									inputQuestionId = q.id;
									editor.setText("");
									refresh();
									return;
								}
								const selected = multiSelections.get(q.id) || new Set<number>();
								const customs = multiCustomInputs.get(q.id) || [];
								if (selected.size === 0 && customs.length === 0) return;
								const selections: {
									value: string;
									label: string;
									wasCustom: boolean;
									index?: number;
								}[] = [];
								for (const idx of selected) {
									const o = opts[idx];
									if (!o.isOther) {
										selections.push({
											value: o.value,
											label: o.label,
											wasCustom: false,
											index: idx + 1,
										});
									}
								}
								for (const c of customs) {
									selections.push({
										value: c.value,
										label: c.label,
										wasCustom: true,
									});
								}
								saveMultiAnswer(q.id, selections);
								advanceAfterAnswer();
								return;
							}
							if (matchesKey(data, Key.escape)) {
								submit(true);
							}
							return;
						}

						// Single-select (existing behavior)
						if (matchesKey(data, Key.enter)) {
							const opt = opts[optionIndex];
							if (opt.isOther) {
								inputMode = true;
								inputQuestionId = q.id;
								const existing = answers.get(q.id);
								editor.setText(existing?.wasCustom ? existing.label : "");
								refresh();
								return;
							}
							saveAnswer(q.id, opt.value, opt.label, false, optionIndex + 1);
							advanceAfterAnswer();
							return;
						}

						// Cancel
						if (matchesKey(data, Key.escape)) {
							submit(true);
						}
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;

						const lines: string[] = [];
						const q = currentQuestion();
						const opts = currentOptions();

						// Helper to add truncated line
						const add = (s: string) => lines.push(truncateToWidth(s, width));

						add(theme.fg("accent", "─".repeat(width)));

						// Tab bar (multi-question only)
						if (isMulti) {
							const tabs: string[] = ["← "];
							for (let i = 0; i < questions.length; i++) {
								const isActive = i === currentTab;
								const isAnswered = answers.has(questions[i].id);
								const lbl = questions[i].label;
								const box = isAnswered ? "■" : "□";
								const color = isAnswered ? "success" : "muted";
								const text = ` ${box} ${lbl} `;
								const styled = isActive
									? theme.bg("selectedBg", theme.fg("text", text))
									: theme.fg(color, text);
								tabs.push(`${styled} `);
							}
							const canSubmit = allAnswered();
							const isSubmitTab = currentTab === questions.length;
							const submitText = " ✓ Submit ";
							const submitStyled = isSubmitTab
								? theme.bg("selectedBg", theme.fg("text", submitText))
								: theme.fg(canSubmit ? "success" : "dim", submitText);
							tabs.push(`${submitStyled} →`);
							add(` ${tabs.join("")}`);
							lines.push("");
						}

						// Helper to render options list
						function renderOptions() {
							const mq = currentQuestion();
							const isMultiSel = mq?.multiSelect === true;
							const toggled =
								isMultiSel && mq
									? multiSelections.get(mq.id) || new Set<number>()
									: null;
							const customs =
								isMultiSel && mq ? multiCustomInputs.get(mq.id) || [] : [];
							const existingAnswer = mq ? answers.get(mq.id) : null;

							for (let i = 0; i < opts.length; i++) {
								const opt = opts[i];
								const focused = i === optionIndex;
								const isOther = opt.isOther === true;
								const prefix = focused ? theme.fg("accent", "> ") : "  ";

								if (isMultiSel) {
									const isChecked = isOther
										? customs.length > 0
										: toggled?.has(i);
									const check = isChecked ? "■" : "☐";
									if (isOther && inputMode) {
										add(prefix + theme.fg("accent", `${check} ${opt.label} ✎`));
									} else {
										const color = focused ? "accent" : "text";
										add(
											prefix +
												theme.fg(color, `${check} ${i + 1}. ${opt.label}`),
										);
										if (isOther && customs.length > 0 && !inputMode) {
											for (const c of customs) {
												add(`     ${theme.fg("muted", `→ ${c.label}`)}`);
											}
										}
									}
								} else {
									const color = focused ? "accent" : "text";
									const isSelected =
										!isOther &&
										existingAnswer &&
										!existingAnswer.wasCustom &&
										existingAnswer.value === opt.value;
									if (isOther && inputMode) {
										add(
											prefix + theme.fg("accent", `${i + 1}. ${opt.label} ✎`),
										);
									} else if (isOther && existingAnswer?.wasCustom) {
										add(prefix + theme.fg(color, `${i + 1}. ${opt.label} ✓`));
										add(
											`     ${theme.fg("muted", `→ ${existingAnswer.label}`)}`,
										);
									} else {
										const check = isSelected ? " ✓" : "";
										add(
											prefix +
												theme.fg(color, `${i + 1}. ${opt.label}${check}`),
										);
									}
								}
								if (opt.description) {
									add(`     ${theme.fg("muted", opt.description)}`);
								}
							}
						}

						// Content
						if (inputMode && q) {
							add(theme.fg("text", ` ${q.prompt}`));
							lines.push("");
							// Show options for reference
							renderOptions();
							lines.push("");
							add(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) {
								add(` ${line}`);
							}
							lines.push("");
							add(theme.fg("dim", " Enter to submit • Esc to cancel"));
						} else if (currentTab === questions.length) {
							add(theme.fg("accent", theme.bold(" Ready to submit")));
							lines.push("");
							for (const question of questions) {
								const answer = answers.get(question.id);
								if (answer) {
									if (answer.selections) {
										const items = answer.selections
											.map((s) =>
												s.wasCustom ? `(wrote) ${s.label}` : s.label,
											)
											.join(", ");
										add(
											`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("text", items)}`,
										);
									} else {
										const prefix = answer.wasCustom ? "(wrote) " : "";
										add(
											`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("text", prefix + answer.label)}`,
										);
									}
								}
							}
							lines.push("");
							if (allAnswered()) {
								add(theme.fg("success", " Press Enter to submit"));
							} else {
								const missing = questions
									.filter((q) => !answers.has(q.id))
									.map((q) => q.label)
									.join(", ");
								add(theme.fg("warning", ` Unanswered: ${missing}`));
							}
						} else if (q) {
							add(theme.fg("text", ` ${q.prompt}`));
							lines.push("");
							renderOptions();
						}

						lines.push("");
						if (!inputMode) {
							const mq = currentQuestion();
							if (mq?.multiSelect) {
								const help = isMulti
									? " Space toggle • ↑↓ select • Enter confirm • Tab/←→ navigate • Esc cancel"
									: " Space toggle • ↑↓ select • Enter confirm • Esc cancel";
								add(theme.fg("dim", help));
							} else {
								const help = isMulti
									? " Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel"
									: " ↑↓ navigate • Enter select • Esc cancel";
								add(theme.fg("dim", help));
							}
						}
						add(theme.fg("accent", "─".repeat(width)));

						cachedLines = lines;
						return lines;
					}

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				},
			);

			if (result.cancelled) {
				return {
					content: [{ type: "text", text: "User cancelled the questionnaire" }],
					details: result,
				};
			}

			const answerLines = result.answers.map((a) => {
				const qLabel = questions.find((q) => q.id === a.id)?.label || a.id;
				if (a.selections && a.selections.length > 0) {
					const items = a.selections
						.map((s) =>
							s.wasCustom ? `(wrote) ${s.label}` : `${s.index}. ${s.label}`,
						)
						.join(", ");
					return `${qLabel}: user selected: ${items}`;
				}
				if (a.wasCustom) {
					return `${qLabel}: user wrote: ${a.label}`;
				}
				return `${qLabel}: user selected: ${a.index}. ${a.label}`;
			});

			return {
				content: [{ type: "text", text: answerLines.join("\n") }],
				details: result,
			};
		},

		renderCall(args, theme, _context) {
			const qs = (args.questions as Question[]) || [];
			const count = qs.length;
			const labels = qs.map((q) => q.label || q.id).join(", ");
			let text = theme.fg("toolTitle", theme.bold("questionnaire "));
			text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
			if (labels) {
				text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as QuestionnaireResult | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}
			const lines = details.answers.map((a) => {
				if (a.selections && a.selections.length > 0) {
					const items = a.selections
						.map((s) =>
							s.wasCustom
								? `${theme.fg("muted", "(wrote) ")}${s.label}`
								: `${s.index}. ${s.label}`,
						)
						.join(", ");
					return `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${items}`;
				}
				if (a.wasCustom) {
					return `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${theme.fg("muted", "(wrote) ")}${a.label}`;
				}
				const display = a.index ? `${a.index}. ${a.label}` : a.label;
				return `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${display}`;
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
