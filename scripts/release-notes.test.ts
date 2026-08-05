import { describe, expect, test } from "bun:test";
import {
	parseNoteFile,
	suggestBump,
	renderReleaseNotes,
	type ParsedNote,
} from "./release-notes";

describe("parseNoteFile", () => {
	test("parses type and body", () => {
		const raw = `---
type: feature
---

Search page shows latest cached releases.
`;
		expect(parseNoteFile("x.md", raw)).toEqual({
			file: "x.md",
			type: "feature",
			body: "Search page shows latest cached releases.",
		});
	});

	test("rejects unknown type", () => {
		expect(() =>
			parseNoteFile(
				"x.md",
				`---
type: chore
---

Nope.
`,
			),
		).toThrow(/type/);
	});
});

describe("suggestBump", () => {
	const note = (type: ParsedNote["type"]): ParsedNote => ({
		file: "a.md",
		type,
		body: "x",
	});

	test("breaking wins", () => {
		expect(suggestBump([note("fix"), note("breaking")])).toBe("major");
	});

	test("feature without breaking → minor", () => {
		expect(suggestBump([note("fix"), note("feature")])).toBe("minor");
	});

	test("only fixes → patch", () => {
		expect(suggestBump([note("fix")])).toBe("patch");
	});
});

describe("renderReleaseNotes", () => {
	test("groups breaking, feature, fix", () => {
		const md = renderReleaseNotes([
			{ file: "a.md", type: "fix", body: "Fix login redirect." },
			{ file: "b.md", type: "feature", body: "Add worker log viewer." },
			{ file: "c.md", type: "breaking", body: "Drop legacy env var FOO." },
		]);
		expect(md).toContain("### Breaking");
		expect(md).toContain("### Features");
		expect(md).toContain("### Fixes");
		expect(md.indexOf("Drop legacy")).toBeLessThan(md.indexOf("Add worker"));
		expect(md.indexOf("Add worker")).toBeLessThan(md.indexOf("Fix login"));
	});
});
