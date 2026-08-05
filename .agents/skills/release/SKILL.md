---
name: release
description: Cut a release — assemble notes from changes/unreleased/, propose a semver bump, publish a GitHub release, and archive notes. Use when the user wants to release, cut a release, create a GitHub release, or bump the version with release notes.
---

# Release

Cut a semver release: assemble user-facing notes, bump `package.json`, tag, push, create a GitHub Release, and archive notes under `changes/vX.Y.Z/`.

## Reference docs

- [docs/agents/release-notes.md](../../../docs/agents/release-notes.md) — how to write notes in `changes/unreleased/`

## Rules

- **Do not invent notes.** Only use content from `changes/unreleased/*.md` (or a human-edited draft they approve). If there are no notes, abort — unless the human explicitly asks to draft from git log.
- **Do not force-push.**
- **Do not delete remote tags.**
- Notes are **English** and **user-facing only** — see [docs/agents/release-notes.md](../../../docs/agents/release-notes.md) for what belongs in a note.
- Prefer `bun run release <bump> --dry-run` to preview the release plan and assembled notes before committing anything.

## Workflow

1. **Check for notes.** Run `ls changes/unreleased/*.md`. If none, stop and tell the human — do not proceed unless they explicitly ask to draft notes from git log.

2. **Assemble the draft.** Read every file in `changes/unreleased/`. Build the release body from those notes only. To preview programmatically:

   ```bash
   bun -e "
   import { loadUnreleasedNotes, renderReleaseNotes, suggestBump } from './scripts/release-notes.ts';
   const notes = loadUnreleasedNotes('changes/unreleased');
   console.log(renderReleaseNotes(notes));
   console.log('Suggested bump:', suggestBump(notes));
   "
   ```

   Or preview the full release plan:

   ```bash
   bun run release patch --dry-run   # substitute the proposed bump
   ```

3. **Propose the bump.** Apply the same rules as `suggestBump` in `scripts/release-notes.ts`:
   - any `breaking` note → **major**
   - else any `feature` note → **minor**
   - else → **patch**

   Show the human `package.json` version → next (e.g. `0.7.1 → 0.8.0`). They can override the bump kind.

4. **Confirm the release body.** Show the full assembled release notes. Wait for the human to confirm or edit.

5. **Persist human edits.** If the human edits the body, write their version to `changes/.release-notes.md` and pass `--notes-file changes/.release-notes.md` when releasing. Do not overwrite their edits.

6. **Ensure a clean working tree.** Run `git status --porcelain`. The tree must be clean before releasing — except intentional note edits the human already committed. Commit or stash anything else first.

7. **Run the release.**

   ```bash
   bun run release <bump> --yes [--notes-file changes/.release-notes.md]
   ```

   Omit `--notes-file` when notes come straight from `changes/unreleased/` and the human did not edit the body.

   When `changes/unreleased/*.md` existed at release time, the script makes **two commits**:
   1. `chore: release vX.Y.Z` — bumps `package.json`, tags, pushes
   2. `chore: archive release notes for vX.Y.Z` — moves unreleased notes into `changes/vX.Y.Z/`

   A release from `--notes-file` or a git-log draft with an empty `changes/unreleased/` produces only the first commit.

8. **Verify.**

   ```bash
   gh release view vX.Y.Z
   ```

   **If unreleased `.md` files existed at release time** (notes were not solely from `--notes-file` / git-log draft):

   ```bash
   ls changes/vX.Y.Z/          # archived note files
   ls changes/unreleased/      # only .gitkeep should remain
   ```

   Skip the archive checks when notes came only from `--notes-file` or a git-log draft and `changes/unreleased/` had no `.md` files.

9. **Recover from `gh` failure.** If `git push` and the tag succeeded but `gh release create` failed, **do not delete the tag**. The script preserves notes at `changes/.release-notes.md`. Retry:

   ```bash
   gh release create vX.Y.Z --title vX.Y.Z --notes-file changes/.release-notes.md
   ```

   After a successful retry, finish archiving **if unreleased `.md` files still remain** (the release script exited before that step):

   ```bash
   bun -e "
   import { archiveNotes } from './scripts/release-notes.ts';
   const moved = archiveNotes('changes/unreleased', 'changes/vX.Y.Z');
   console.log('Archived:', moved);
   "
   git add changes
   git commit -m 'chore: archive release notes for vX.Y.Z'
   git push origin HEAD
   ```
