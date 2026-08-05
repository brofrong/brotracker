# Release Notes

After shipping **user-facing** work, add a short note to `changes/unreleased/` so the release agent can assemble a GitHub Release. One note per visible change — not a dump of every commit.

## File format

Path: `changes/unreleased/YYYYMMDD-HHMMSS-<short-slug>.md`

```markdown
---
type: feature
---

Short user-facing bullet.
```

Frontmatter `type` is one of:

- `feature` — new capability or meaningful UX improvement
- `fix` — user-visible bug fix
- `breaking` — existing behavior, API, or config stops working

Body: one or two English sentences describing what the user sees or can do differently.

## When to write

Write a note after any meaningful user-facing work that will land on `main`: new UI, API changes, behavior fixes, breaking changes.

## What not to write

Skip internal-only work unless the user or operator sees the effect:

- Refactors, type-only changes, CI, ADRs, docs for agents
- Test-only or chore commits with no user impact

Use `breaking` sparingly — only when something that worked before no longer does.

## Cutting a release

For assembling notes, bumping the version, and publishing a GitHub Release, use the release skill (`.agents/skills/release/SKILL.md`).
