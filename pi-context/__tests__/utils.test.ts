import { describe, expect, test } from "vitest";
import { formatTokens } from "../utils.js";

describe("formatTokens", () => {
	test("returns N/A for null", () => {
		expect(formatTokens(null)).toBe("N/A");
	});

	test("returns N/A for undefined", () => {
		expect(formatTokens(undefined)).toBe("N/A");
	});

	test("formats millions with one decimal", () => {
		expect(formatTokens(1_500_000)).toBe("1.5M");
	});

	test("formats exactly 1 million", () => {
		expect(formatTokens(1_000_000)).toBe("1.0M");
	});

	test("formats thousands with rounding", () => {
		expect(formatTokens(1_500)).toBe("2k");
		expect(formatTokens(1_499)).toBe("1k");
		expect(formatTokens(1_000)).toBe("1k");
	});

	test("formats large thousands", () => {
		expect(formatTokens(999_499)).toBe("999k");
	});

	test("returns plain numbers as-is", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(42)).toBe("42");
		expect(formatTokens(999)).toBe("999");
	});
});
