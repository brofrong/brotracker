# Agent release notes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agents append short English user-facing notes under `changes/unreleased/`; a release flow assembles them into a GitHub Release, bumps/tags via `scripts/release.ts`, and archives the notes.

**Architecture:** Pure helpers in `scripts/release-notes.ts` (parse, group, suggest bump, render markdown, archive paths) are unit-tested. `scripts/release.ts` stays the orchestrator for git/tag/`gh`. Agent behavior lives in a release skill + thin Cursor rule + `docs/agents/release-notes.md`.

**Tech Stack:** Bun, TypeScript, `gh` CLI, existing `scripts/release.ts`, Cursor skills/rules.

**Design:** `docs/plans/2026-08-05-agent-release-notes-design.md`

---

### Task 1: Scaffold `changes/` + note helpers (tests first)

**Files:**
- Create: `changes/unreleased/.gitkeep`
- Create: `scripts/release-notes.ts`
- Create: `scripts/release-notes.test.ts`

**Step 1: Write failing tests for parse / bump / render**

Create `scripts/release-notes.test.ts`:

```ts
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
```

**Step 2: Run tests — expect FAIL**

```bash
bun test scripts/release-notes.test.ts
```

Expected: module / exports missing.

**Step 3: Implement minimal `scripts/release-notes.ts`**

```ts
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
```

**Step 4: Run tests — expect PASS**

```bash
bun test scripts/release-notes.test.ts
```

**Step 5: Add `changes/unreleased/.gitkeep` and commit**

```bash
mkdir -p changes/unreleased
touch changes/unreleased/.gitkeep
git add changes/unreleased/.gitkeep scripts/release-notes.ts scripts/release-notes.test.ts
git commit -m "$(cat <<'EOF'
feat: add release-notes helpers and unreleased changes dir

EOF
)"
```

---

### Task 2: Wire notes into `scripts/release.ts`

**Files:**
- Modify: `scripts/release.ts`
- Modify: `README.md` (release section only)
- Test: extend `scripts/release-notes.test.ts` if needed; manual dry-run for orchestration

**Step 1: Extend CLI**

Support:

- Existing: `bun run release [patch|minor|major|x.y.z] [--dry-run] [--yes]`
- New: `--notes-file <path>` — use this body for `gh release create` (agent-edited draft).
- If `--notes-file` omitted: load + render from `changes/unreleased/`.
- If no notes and not dry-run: exit 1 with clear message.
- After successful tag push: `gh release create`, then `archiveNotes`, second commit + push.

Sketch of new tail (replace current post-tag success path):

```ts
import {
	loadUnreleasedNotes,
	renderReleaseNotes,
	archiveNotes,
} from "./release-notes";
import { writeFileSync, unlinkSync } from "node:fs";

const CHANGES_UNRELEASED = resolve(ROOT, "changes/unreleased");
const notesFromFlag = /* parse --notes-file */;
let notesBody: string;
if (notesFromFlag) {
	notesBody = readFileSync(notesFromFlag, "utf8");
} else {
	const notes = loadUnreleasedNotes(CHANGES_UNRELEASED);
	if (notes.length === 0) {
		console.error("No files in changes/unreleased/. Add release notes first.");
		process.exit(1);
	}
	notesBody = renderReleaseNotes(notes);
}

// after tag push:
const notesPath = resolve(ROOT, "changes/.release-notes.md");
writeFileSync(notesPath, notesBody);
await run([
	"gh", "release", "create", tag,
	"--title", tag,
	"--notes-file", notesPath,
]);
const archived = archiveNotes(
	CHANGES_UNRELEASED,
	resolve(ROOT, `changes/${tag}`),
);
await run(["git", "add", "changes"]);
await run([
	"git", "commit", "-m", `chore: archive release notes for ${tag}`,
]);
await run(["git", "push", "origin", "HEAD"]);
unlinkSync(notesPath); // if not committed; or gitignore changes/.release-notes.md
```

Also print assembled notes in the “Release plan” block and in `--dry-run`.

**Step 2: Dry-run verification**

```bash
# create a sample note, then:
bun run release patch --dry-run
```

Expected: prints `current → next`, rendered notes, “Dry run only”.

**Step 3: Gitignore temp notes file**

Add to `.gitignore` (if not already covered):

```
changes/.release-notes.md
```

**Step 4: Update README release bullets**

Document that release requires notes in `changes/unreleased/` and creates a GitHub Release.

**Step 5: Commit**

```bash
git add scripts/release.ts README.md .gitignore
git commit -m "$(cat <<'EOF'
feat: create GitHub Release from changes/unreleased notes

EOF
)"
```

---

### Task 3: Agent docs — `docs/agents/release-notes.md` + AGENTS pointer

**Files:**
- Create: `docs/agents/release-notes.md`
- Modify: `AGENTS.md`

**Step 1: Write `docs/agents/release-notes.md`**

Content must cover:

- Path + filename pattern `changes/unreleased/YYYYMMDD-HHMMSS-<slug>.md`
- Frontmatter `type: feature | fix | breaking`
- When to write (after user-facing work)
- What not to write (internal-only)
- Language: English
- Pointer: for cutting a release, use the release skill

**Step 2: Add AGENTS.md section**

Under Agent skills:

```markdown
### Release notes

User-facing change notes live in `changes/unreleased/`. See `docs/agents/release-notes.md`. For cutting a release, use the release skill.
```

**Step 3: Commit**

```bash
git add docs/agents/release-notes.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: document agent release-notes workflow

EOF
)"
```

---

### Task 4: Release skill

**Files:**
- Create: `.agents/skills/release/SKILL.md`

**Step 1: Write skill**

Frontmatter description must match triggers: release, cut a release, GitHub release, bump version with notes.

Body checklist:

1. `ls changes/unreleased/*.md` — abort if none (unless human asks to draft from git log).
2. Read notes; assemble draft (or `bun -e` / dry-run to preview).
3. Propose bump via same rules as `suggestBump`; show `package.json` version → next.
4. Show full release body; wait for confirm / edits.
5. If human edits body, write `changes/.release-notes.md` and pass `--notes-file`.
6. Ensure clean git status (except intentional note edits already committed).
7. `bun run release <bump> --yes` [`--notes-file changes/.release-notes.md`].
8. Verify: `gh release view vX.Y.Z` and that `changes/vX.Y.Z/` exists, `unreleased/` empty aside from `.gitkeep`.
9. On `gh` failure after tag push: do not delete tag; retry `gh release create` with notes file.

Do not invent notes. Do not force-push. Do not delete remote tags.

**Step 2: Commit**

```bash
git add .agents/skills/release/SKILL.md
git commit -m "$(cat <<'EOF'
docs: add release agent skill

EOF
)"
```

---

### Task 5: Thin Cursor rule

**Files:**
- Create: `.cursor/rules/release-notes.mdc`

**Step 1: Write rule** (`alwaysApply: true` or globs on app code — prefer `alwaysApply: true` but keep body short)

```markdown
---
description: Write user-facing release notes; use release skill to cut releases
alwaysApply: true
---

# Release notes

- After shipping **user-facing** work, add `changes/unreleased/YYYYMMDD-HHMMSS-<slug>.md` (`type: feature|fix|breaking`, English body). Details: `docs/agents/release-notes.md`.
- Skip notes for internal-only changes (refactors, types, CI, docs-only ADRs).
- When the user asks to **release**, read and follow `.agents/skills/release/SKILL.md`. Do not hand-roll tag/`gh` steps outside that skill + `bun run release`.
```

**Step 2: Commit**

```bash
git add .cursor/rules/release-notes.mdc
git commit -m "$(cat <<'EOF'
chore: add Cursor rule for release notes

EOF
)"
```

---

### Task 6: Smoke-check helpers + docs consistency

**Files:** none new (verification only)

**Step 1: Re-run unit tests**

```bash
bun test scripts/release-notes.test.ts
```

Expected: PASS.

**Step 2: Dry-run with a temporary note**

```bash
cat > changes/unreleased/20990101-000000-smoke-test.md <<'EOF'
---
type: fix
---

Smoke-test release notes wiring.
EOF
bun run release patch --dry-run
rm changes/unreleased/20990101-000000-smoke-test.md
```

Expected: plan shows bump and “### Fixes” section; no git changes.

**Step 3: Confirm design/plan pointers**

- `AGENTS.md` links to `docs/agents/release-notes.md`
- Skill path exists
- Rule exists

No commit unless smoke left debris — clean up if so.

---

## Done when

- [ ] `bun test scripts/release-notes.test.ts` passes
- [ ] `bun run release … --dry-run` shows assembled notes
- [ ] Real release path documented: notes → confirm → script → GitHub Release → archive commit
- [ ] Agents have skill + rule + docs so they write notes without being reminded in chat
