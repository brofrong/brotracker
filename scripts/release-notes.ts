import { readdirSync, readFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";

export type NoteType = "feature" | "fix" | "breaking";
export type BumpKind = "patch" | "minor" | "major";

export type ParsedNote = {
	file: string;
	type: NoteType;
	body: string;
};

const TYPE_RE = /^---\s*\ntype:\s*(feature|fix|breaking)\s*\n---\s*\n([\s\S]*)$/;

export function parseNoteFile(file: string, raw: string): ParsedNote {
	const m = raw.trim().match(TYPE_RE);
	if (!m) {
		throw new Error(`Invalid note frontmatter in ${file} (expected type: feature|fix|breaking)`);
	}
	const type = m[1] as NoteType;
	const body = m[2].trim();
	if (!body) throw new Error(`Empty body in ${file}`);
	return { file, type, body };
}

export function suggestBump(notes: ParsedNote[]): BumpKind {
	if (notes.some((n) => n.type === "breaking")) return "major";
	if (notes.some((n) => n.type === "feature")) return "minor";
	return "patch";
}

const SECTION: { type: NoteType; heading: string }[] = [
	{ type: "breaking", heading: "### Breaking" },
	{ type: "feature", heading: "### Features" },
	{ type: "fix", heading: "### Fixes" },
];

export function renderReleaseNotes(notes: ParsedNote[]): string {
	const parts: string[] = [];
	for (const { type, heading } of SECTION) {
		const items = notes.filter((n) => n.type === type);
		if (items.length === 0) continue;
		parts.push(heading, "");
		for (const n of items) {
			const line = n.body.includes("\n")
				? n.body
				: `- ${n.body.replace(/^\s*-\s*/, "")}`;
			parts.push(line);
		}
		parts.push("");
	}
	return parts.join("\n").trim() + "\n";
}

export function loadUnreleasedNotes(unreleasedDir: string): ParsedNote[] {
	if (!existsSync(unreleasedDir)) return [];
	const files = readdirSync(unreleasedDir)
		.filter((f) => f.endsWith(".md"))
		.sort();
	return files.map((f) =>
		parseNoteFile(f, readFileSync(join(unreleasedDir, f), "utf8")),
	);
}

export function archiveNotes(
	unreleasedDir: string,
	archiveDir: string,
): string[] {
	mkdirSync(archiveDir, { recursive: true });
	if (!existsSync(unreleasedDir)) return [];
	const files = readdirSync(unreleasedDir).filter((f) => f.endsWith(".md"));
	for (const f of files) {
		renameSync(join(unreleasedDir, f), join(archiveDir, f));
	}
	return files;
}
