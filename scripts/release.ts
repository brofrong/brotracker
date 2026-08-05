#!/usr/bin/env bun
/**
 * Bump version, commit, tag, push, create GitHub Release, and archive notes.
 *
 * Usage:
 *   bun run release              # interactive: patch / minor / major
 *   bun run release patch
 *   bun run release minor
 *   bun run release major
 *   bun run release 1.2.3
 *   bun run release patch --dry-run
 *   bun run release patch --yes   # skip confirmation
 *   bun run release patch --notes-file path/to/notes.md
 */

import {
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
	archiveNotes,
	loadUnreleasedNotes,
	renderReleaseNotes,
	type BumpKind,
} from "./release-notes";

const ROOT = resolve(import.meta.dir, "..");
const PKG_PATH = resolve(ROOT, "package.json");
const UNRELEASED_DIR = resolve(ROOT, "changes/unreleased");
const GH_NOTES_PATH = resolve(ROOT, "changes/.release-notes.md");

function usage(): never {
	console.log(`Usage:
  bun run release [patch|minor|major|x.y.z] [--dry-run] [--yes] [--notes-file <path>]

Examples:
  bun run release patch
  bun run release 1.4.0 --yes
  bun run release patch --notes-file /tmp/draft-notes.md
`);
	process.exit(1);
}

function parseArgs(argv: string[]) {
	const dryRun = argv.includes("--dry-run") || argv.includes("-n");
	const yes = argv.includes("--yes") || argv.includes("-y");
	let notesFile: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--notes-file") {
			notesFile = argv[++i];
			if (!notesFile) usage();
		} else if (arg === "--dry-run" || arg === "-n" || arg === "--yes" || arg === "-y") {
			continue;
		} else if (arg.startsWith("-")) {
			console.error(`Unknown flag: ${arg}`);
			usage();
		} else {
			positional.push(arg);
		}
	}

	return {
		bump: positional[0],
		dryRun,
		yes,
		notesFile: notesFile ? resolve(notesFile) : undefined,
	};
}

function isSemver(value: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(value);
}

function bumpVersion(current: string, kind: BumpKind): string {
	const parts = current.split(".").map(Number);
	if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
		throw new Error(`Invalid current version: ${current}`);
	}
	const [major, minor, patch] = parts as [number, number, number];
	if (kind === "major") return `${major + 1}.0.0`;
	if (kind === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

function assembleReleaseNotes(notesFile: string | undefined): {
	body: string;
	fromUnreleased: boolean;
} {
	if (notesFile) {
		if (!existsSync(notesFile)) {
			throw new Error(`Notes file not found: ${notesFile}`);
		}
		const body = readFileSync(notesFile, "utf8").trim();
		if (!body) {
			throw new Error(`Notes file is empty: ${notesFile}`);
		}
		return { body: `${body}\n`, fromUnreleased: false };
	}

	const notes = loadUnreleasedNotes(UNRELEASED_DIR);
	if (notes.length === 0) {
		return { body: "", fromUnreleased: true };
	}
	return { body: renderReleaseNotes(notes), fromUnreleased: true };
}

async function run(
	cmd: string[],
	opts: { allowFail?: boolean } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(cmd, {
		cwd: ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0 && !opts.allowFail) {
		throw new Error(
			`Command failed (${exitCode}): ${cmd.join(" ")}\n${stderr || stdout}`,
		);
	}
	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

async function promptLine(question: string): Promise<string> {
	const rl = readline.createInterface({ input, output });
	try {
		const answer = await rl.question(question);
		return answer.trim();
	} finally {
		rl.close();
	}
}

async function main() {
	const { bump, dryRun, yes, notesFile } = parseArgs(Bun.argv.slice(2));

	const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8")) as {
		name: string;
		version: string;
		[key: string]: unknown;
	};
	const current = pkg.version;

	let next: string;
	if (!bump) {
		console.log(`Current version: ${current}`);
		console.log("  1) patch  " + bumpVersion(current, "patch"));
		console.log("  2) minor  " + bumpVersion(current, "minor"));
		console.log("  3) major  " + bumpVersion(current, "major"));
		const choice = await promptLine("Choose bump [1/2/3]: ");
		const map: Record<string, BumpKind> = {
			"1": "patch",
			"2": "minor",
			"3": "major",
			patch: "patch",
			minor: "minor",
			major: "major",
		};
		const kind = map[choice];
		if (!kind) {
			console.error("Invalid choice");
			process.exit(1);
		}
		next = bumpVersion(current, kind);
	} else if (bump === "patch" || bump === "minor" || bump === "major") {
		next = bumpVersion(current, bump);
	} else if (isSemver(bump)) {
		next = bump;
	} else {
		usage();
	}

	if (next === current) {
		console.error(`Version is already ${current}`);
		process.exit(1);
	}

	const tag = `v${next}`;
	const { body: releaseNotes, fromUnreleased } = assembleReleaseNotes(notesFile);
	const notesMissing = !releaseNotes;

	if (notesMissing && !dryRun) {
		console.error(
			"No release notes found. Add markdown files to changes/unreleased/ or pass --notes-file <path>.",
		);
		process.exit(1);
	}

	const { stdout: branch } = await run(["git", "branch", "--show-current"]);
	const { stdout: status } = await run(["git", "status", "--porcelain"]);

	console.log("");
	console.log(`Release plan`);
	console.log(`  package:  ${pkg.name}`);
	console.log(`  version:  ${current} → ${next}`);
	console.log(`  tag:      ${tag}`);
	console.log(`  branch:   ${branch || "(detached)"}`);
	console.log(`  dry-run:  ${dryRun}`);
	if (notesFile) {
		console.log(`  notes:    ${notesFile}`);
	} else if (fromUnreleased) {
		console.log(`  notes:    changes/unreleased/`);
	}
	console.log("");
	if (releaseNotes) {
		console.log("Release notes:");
		console.log(releaseNotes);
	} else {
		console.log("Warning: no release notes (changes/unreleased/ is empty).");
	}
	if (status && !dryRun) {
		console.log("");
		console.log("Working tree is not clean:");
		console.log(status);
		console.error("\nCommit or stash changes before releasing.");
		process.exit(1);
	}
	if (status && dryRun) {
		console.log("");
		console.log("(working tree dirty — ignored in dry-run)");
	}

	if (!yes && !dryRun) {
		const answer = await promptLine(`Proceed with ${tag}? [y/N] `);
		if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
			console.log("Aborted.");
			process.exit(0);
		}
	}

	if (dryRun) {
		console.log("\nDry run only — no files or git refs changed.");
		return;
	}

	pkg.version = next;
	writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);

	await run(["git", "add", "package.json"]);
	await run(["git", "commit", "-m", `chore: release ${tag}`]);
	await run(["git", "tag", "-a", tag, "-m", `Release ${tag}`]);
	await run(["git", "push", "origin", "HEAD"]);
	await run(["git", "push", "origin", tag]);

	writeFileSync(GH_NOTES_PATH, releaseNotes);
	try {
		await run([
			"gh",
			"release",
			"create",
			tag,
			"--title",
			tag,
			"--notes-file",
			GH_NOTES_PATH,
		]);
	} finally {
		if (existsSync(GH_NOTES_PATH)) {
			unlinkSync(GH_NOTES_PATH);
		}
		if (notesFile && existsSync(notesFile)) {
			unlinkSync(notesFile);
		}
	}

	const archiveDir = resolve(ROOT, "changes", tag);
	const archived = archiveNotes(UNRELEASED_DIR, archiveDir);
	if (archived.length > 0) {
		await run(["git", "add", "changes"]);
		await run(["git", "commit", "-m", `chore: archive release notes for ${tag}`]);
		await run(["git", "push", "origin", "HEAD"]);
	}

	console.log("");
	console.log(`Released ${tag}`);
	console.log("GitHub Release created; CI will build and push Docker image for this tag.");
	console.log(`  https://hub.docker.com/r/brofrong/brotracker`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
