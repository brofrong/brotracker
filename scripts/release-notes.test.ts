import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	parseNoteFile,
	suggestBump,
	renderReleaseNotes,
	loadUnreleasedNotes,
	archiveNotes,
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

describe("loadUnreleasedNotes", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `release-notes-${Date.now()}-${Math.random()}`);
		mkdirSync(dir, { recursive: true });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns empty when directory missing", () => {
		expect(loadUnreleasedNotes(join(dir, "missing"))).toEqual([]);
	});

	test("loads and sorts markdown files", () => {
		writeFileSync(
			join(dir, "b-fix.md"),
			`---
type: fix
---

Second fix.
`,
		);
		writeFileSync(
			join(dir, "a-feature.md"),
			`---
type: feature
---

First feature.
`,
		);
		const notes = loadUnreleasedNotes(dir);
		expect(notes.map((n) => n.file)).toEqual(["a-feature.md", "b-fix.md"]);
		expect(notes[0]?.type).toBe("feature");
	});
});

describe("archiveNotes", () => {
	let unreleased: string;
	let archive: string;

	beforeEach(() => {
		const base = join(tmpdir(), `release-archive-${Date.now()}-${Math.random()}`);
		unreleased = join(base, "unreleased");
		archive = join(base, "v1.0.0");
		mkdirSync(unreleased, { recursive: true });
	});

	afterEach(() => {
		rmSync(join(unreleased, ".."), { recursive: true, force: true });
	});

	test("moves markdown files into archive directory", () => {
		writeFileSync(
			join(unreleased, "note.md"),
			`---
type: fix
---

Archived note.
`,
		);
		const moved = archiveNotes(unreleased, archive);
		expect(moved).toEqual(["note.md"]);
		expect(existsSync(join(archive, "note.md"))).toBe(true);
		expect(readdirSync(unreleased).filter((f) => f.endsWith(".md"))).toEqual([]);
	});
});
