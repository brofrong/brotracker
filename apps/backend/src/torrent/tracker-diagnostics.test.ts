import { describe, expect, test } from "bun:test";
import {
	createTrackerDiagnostics,
	type ProbeResult,
	type TrackerDiagnosticsDeps,
} from "./tracker-diagnostics";

const EGRESS = "https://egress.test/trace";

function deps(
	overrides: Partial<TrackerDiagnosticsDeps> & {
		probes?: Record<string, ProbeResult>;
	} = {},
): TrackerDiagnosticsDeps {
	const probes = overrides.probes ?? {};
	return {
		egressUrl: EGRESS,
		loadTarget: async () => ({
			proxyUrl: null,
			hosts: [{ url: "https://tracker.test/", label: "tracker.test" }],
		}),
		probe: async (url) => probes[url] ?? { ok: true, latencyMs: 50 },
		checkLogin: async () => ({ ok: true }),
		...overrides,
	};
}

describe("trackerDiagnostics.diagnose", () => {
	test("all steps pass", async () => {
		const result = await createTrackerDiagnostics(deps()).diagnose("rutracker");

		expect(result.ok).toBe(true);
		expect(result.steps.map((step) => [step.id, step.status])).toEqual([
			["egress", "ok"],
			["tracker", "ok"],
			["login", "ok"],
		]);
	});

	test("tracker host unreachable while internet works: stops before login", async () => {
		let loginCalled = false;
		const result = await createTrackerDiagnostics(
			deps({
				probes: {
					"https://tracker.test/": {
						ok: false,
						code: "timeout",
						detail: "The operation timed out.",
					},
				},
				checkLogin: async () => {
					loginCalled = true;
					return { ok: true };
				},
			}),
		).diagnose("rutracker");

		expect(result.ok).toBe(false);
		expect(loginCalled).toBe(false);
		expect(result.steps[1]).toMatchObject({
			id: "tracker",
			status: "failed",
			code: "timeout",
			detail: "The operation timed out.",
		});
		expect(result.steps[2]).toMatchObject({ id: "login", status: "skipped" });
	});

	test("egress failure through a proxy is reported as a proxy problem", async () => {
		const result = await createTrackerDiagnostics(
			deps({
				loadTarget: async () => ({
					proxyUrl: "socks5://127.0.0.1:1",
					hosts: [{ url: "https://tracker.test/", label: "tracker.test" }],
				}),
				probes: {
					[EGRESS]: { ok: false, code: "unreachable", detail: "ECONNREFUSED" },
				},
			}),
		).diagnose("rutracker");

		expect(result.steps[0]).toMatchObject({
			id: "egress",
			status: "failed",
			code: "proxy",
			viaProxy: true,
		});
		expect(result.steps.slice(1).map((step) => step.status)).toEqual([
			"skipped",
			"skipped",
		]);
	});

	test("multiple mirrors: passes when at least one responds, lists each", async () => {
		const result = await createTrackerDiagnostics(
			deps({
				loadTarget: async () => ({
					proxyUrl: null,
					hosts: [
						{ url: "https://a.test/", label: "a.test" },
						{ url: "https://b.test/", label: "b.test" },
					],
				}),
				probes: {
					"https://a.test/": {
						ok: false,
						code: "unreachable",
						detail: "refused",
					},
					"https://b.test/": { ok: true, latencyMs: 120 },
				},
			}),
		).diagnose("kinozal");

		expect(result.steps[1]).toMatchObject({
			id: "tracker",
			status: "ok",
			latencyMs: 120,
			targets: [
				{ label: "a.test", ok: false, code: "unreachable" },
				{ label: "b.test", ok: true, latencyMs: 120 },
			],
		});
	});

	test("login error is classified", async () => {
		const result = await createTrackerDiagnostics(
			deps({
				checkLogin: async () => ({
					ok: false,
					message: "Login failed: uid/pass cookies not returned",
				}),
			}),
		).diagnose("kinozal");

		expect(result.ok).toBe(false);
		expect(result.steps[2]).toMatchObject({
			id: "login",
			status: "failed",
			code: "auth",
			detail: "Login failed: uid/pass cookies not returned",
		});
	});
});
