# Agent release notes — design

Date: 2026-08-05  
Status: accepted

## Goals

- Every agent that ships **user-facing** work records a short English note for the current (unreleased) version.
- A **release** agent turns those notes into a GitHub Release body, bumps the version/tag via the existing release script, and archives the notes.
- Release notes stay short and useful — not a dump of every commit.

## Decisions

| Topic | Choice |
|---|---|
| Storage | Per-change files under `changes/unreleased/` |
| When to write | After any meaningful user-facing work that will land on main |
| Content | User-facing only (features, UX fixes, breaking behavior) |
| Language | English |
| Bump | Release agent proposes (breaking→major, feature→minor, else patch); human confirms |
| Implementation | Release skill + extend `scripts/release.ts` + thin Cursor rule + `docs/agents/` |
| Git commits | Two: `chore: release vX.Y.Z`, then archive notes |

## Rejected alternatives

- Single `CHANGELOG.md` `## Unreleased` section — merge conflicts under parallel agents.
- Agent-only release (no script changes) — easy to miss `gh release create` / archive steps.
- Full Changesets-style CLI — heavier than needed.

## Note file format

Path: `changes/unreleased/YYYYMMDD-HHMMSS-<short-slug>.md`

```markdown
---
type: feature | fix | breaking
---

Short user-facing bullet (one sentence). Optional second sentence if needed.
```

Rules:

- One note ≈ one user-visible change.
- No internal-only work (refactors, types, CI, ADRs) unless the user/operator sees the effect.
- `breaking` only when existing behavior/API/config stops working.
- Empty `changes/unreleased/` (with `.gitkeep`) is the normal between-release state.
- After release, files move to `changes/vX.Y.Z/`.

## Release agent flow

Trigger phrases: “release”, “сделай релиз”, etc.

1. Read all files in `changes/unreleased/`.
2. If empty → stop (no auto-generation from `git log` unless the human explicitly asks).
3. Draft notes grouped: `breaking` → `feature` → `fix`; dedupe obvious repeats.
4. Propose bump from note types; show `current → next` and full release body.
5. Wait for confirmation or edits (bump and/or body text).
6. Run updated `bun run release <bump> --yes` (notes passed via flag or generated file).

## Release script responsibilities

Extend `scripts/release.ts` (source of truth for git/tag/`gh`):

1. Require a clean working tree (unchanged).
2. Bump `package.json`, commit `chore: release vX.Y.Z`, annotated tag, push branch + tag.
3. `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file …`.
4. Move `changes/unreleased/*.md` → `changes/vX.Y.Z/`, commit `chore: archive release notes for vX.Y.Z`, push.

`--dry-run` prints planned bump + assembled notes without writing.

## Failure handling

| Case | Behavior |
|---|---|
| No unreleased notes | Abort; do not invent changelog |
| Dirty tree | Abort (existing behavior) |
| `gh` fails after tag push | Do not delete tag; report and suggest manual `gh release create` with the same notes file |
| Notes edited at confirm | Edit draft only (temp / `.release-notes.md`); do not rewrite unreleased files after the fact |
| Parallel agents | Distinct timestamp filenames; rare merge conflicts |

## Agent documentation surface

| Artifact | Role |
|---|---|
| `.agents/skills/release/SKILL.md` | Full release checklist |
| `docs/agents/release-notes.md` | When/how to write notes; format |
| `.cursor/rules/release-notes.mdc` | Thin always-on reminder: write note after user-facing work; use release skill on release |
| `AGENTS.md` | Pointer to `docs/agents/release-notes.md` |

## Out of scope

- Auto-publishing notes from commit messages.
- Russian release bodies.
- Keeping a root `CHANGELOG.md` (history lives in `changes/v*` + GitHub Releases).
