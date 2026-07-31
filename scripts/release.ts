#!/usr/bin/env bun
/**
 * Bump version, commit, tag, and push to trigger Docker Hub publish.
 *
 * Usage:
 *   bun run release              # interactive: patch / minor / major
 *   bun run release patch
 *   bun run release minor
 *   bun run release major
 *   bun run release 1.2.3
 *   bun run release patch --dry-run
 *   bun run release patch --yes   # skip confirmation
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PKG_PATH = resolve(ROOT, "package.json");

type BumpKind = "patch" | "minor" | "major";

function usage(): never {
	console.log(`Usage:
  bun run release [patch|minor|major|x.y.z] [--dry-run] [--yes]

Examples:
  bun run release patch
  bun run release 1.4.0 --yes
`);
	process.exit(1);
}

function parseArgs(argv: string[]) {
	const flags = new Set(argv.filter((a) => a.startsWith("-")));
	const positional = argv.filter((a) => !a.startsWith("-"));
	const bump = positional[0];
	return {
		bump,
		dryRun: flags.has("--dry-run") || flags.has("-n"),
		yes: flags.has("--yes") || flags.has("-y"),
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
	process.stdout.write(question);
	const reader = Bun.stdin.stream().getReader();
	const decoder = new TextDecoder();
	let buf = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value);
		if (buf.includes("\n")) break;
	}
	reader.releaseLock();
	return buf.split("\n")[0]?.trim() ?? "";
}

async function main() {
	const { bump, dryRun, yes } = parseArgs(Bun.argv.slice(2));

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
	const { stdout: branch } = await run(["git", "branch", "--show-current"]);
	const { stdout: status } = await run(["git", "status", "--porcelain"]);

	console.log("");
	console.log(`Release plan`);
	console.log(`  package:  ${pkg.name}`);
	console.log(`  version:  ${current} → ${next}`);
	console.log(`  tag:      ${tag}`);
	console.log(`  branch:   ${branch || "(detached)"}`);
	console.log(`  dry-run:  ${dryRun}`);
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

	console.log("");
	console.log(`Released ${tag}`);
	console.log("CI will build and push Docker image for this tag.");
	console.log(`  https://hub.docker.com/r/brofrong/brotracker`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
