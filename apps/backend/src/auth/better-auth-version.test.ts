import { describe, expect, test } from "bun:test";

describe("better-auth production pin", () => {
	test("backend and frontend pin the same exact better-auth version", async () => {
		const backend = await Bun.file(
			`${import.meta.dir}/../../package.json`,
		).json();
		const frontend = await Bun.file(
			`${import.meta.dir}/../../../frontend/package.json`,
		).json();

		const backendAuth = backend.dependencies["better-auth"];
		const adapter = backend.dependencies["@better-auth/drizzle-adapter"];
		const frontendAuth = frontend.dependencies["better-auth"];

		expect(backendAuth).toMatch(/^1\.7\.\d+$/);
		expect(adapter).toMatch(/^1\.7\.\d+$/);
		expect(frontendAuth).toBe(backendAuth);
		expect(adapter).toBe(backendAuth);
	});

	test("Docker prod-deps keeps bun.lock so better-auth cannot float", async () => {
		const dockerfile = await Bun.file(
			`${import.meta.dir}/../../../../Dockerfile`,
		).text();

		expect(dockerfile).not.toContain("rm -f bun.lock");
		expect(dockerfile).toContain("bun install --frozen-lockfile");
	});
});
