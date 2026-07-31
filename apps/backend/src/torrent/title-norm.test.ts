import { describe, expect, test } from "bun:test";
import { normalizeTitle } from "./title-norm";

describe("normalizeTitle", () => {
	test("lowercases and maps ё→е", () => {
		expect(normalizeTitle("Ёлки")).toBe("елки");
	});

	test("strips punctuation noise and collapses spaces", () => {
		expect(normalizeTitle("Матрица: Перезагрузка!!!")).toBe(
			"матрица перезагрузка",
		);
	});

	test("applies simple cyrillic↔latin lookalike map for common letters", () => {
		// m,a,t,c → м,а,т,с; r/i have no lookalike so stay latin
		expect(normalizeTitle("Matrica")).toBe("матriса");
	});
});
