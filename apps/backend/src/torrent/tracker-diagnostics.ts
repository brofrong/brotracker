import type { TrackerSource } from "@brotracker/rutracker-ts/tracker/torrent-id";
import { classifyTrackerError, type TrackerErrorCode } from "./tracker-error";

export type DiagnosticStepId = "egress" | "tracker" | "login";

export type DiagnosticTarget = {
	label: string;
	ok: boolean;
	latencyMs?: number;
	code?: TrackerErrorCode;
	detail?: string;
};

export type DiagnosticStep = {
	id: DiagnosticStepId;
	status: "ok" | "failed" | "skipped";
	code?: TrackerErrorCode;
	detail?: string;
	latencyMs?: number;
	/** Egress step only: whether traffic went through the configured proxy. */
	viaProxy?: boolean;
	/** Tracker step only: per-host probe results (Kinozal has several mirrors). */
	targets?: DiagnosticTarget[];
};

export type TrackerDiagnosticsResult = {
	ok: boolean;
	steps: DiagnosticStep[];
};

export type ProbeResult =
	| { ok: true; latencyMs: number }
	| { ok: false; code: TrackerErrorCode; detail: string };

export type DiagnosticHost = { url: string; label: string };

export type TrackerDiagnosticsDeps = {
	/** Neutral URL used to tell "no internet / broken proxy" from "tracker blocked". */
	egressUrl: string;
	loadTarget: (source: TrackerSource) => Promise<{
		proxyUrl: string | null;
		hosts: DiagnosticHost[];
	}>;
	/** Any HTTP response counts as reachable (Cloudflare 403 included). */
	probe: (url: string, proxyUrl: string | null) => Promise<ProbeResult>;
	/** Full login + search round-trip through the real tracker client. */
	checkLogin: (
		source: TrackerSource,
	) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const STEP_ORDER: DiagnosticStepId[] = ["egress", "tracker", "login"];

export function createTrackerDiagnostics(deps: TrackerDiagnosticsDeps) {
	async function egressStep(proxyUrl: string | null): Promise<DiagnosticStep> {
		const viaProxy = proxyUrl !== null;
		const probe = await deps.probe(deps.egressUrl, proxyUrl);
		if (probe.ok) {
			return {
				id: "egress",
				status: "ok",
				latencyMs: probe.latencyMs,
				viaProxy,
			};
		}
		return {
			id: "egress",
			status: "failed",
			code: viaProxy ? "proxy" : probe.code,
			detail: probe.detail,
			viaProxy,
		};
	}

	async function trackerStep(
		hosts: DiagnosticHost[],
		proxyUrl: string | null,
	): Promise<DiagnosticStep> {
		const targets: DiagnosticTarget[] = await Promise.all(
			hosts.map(async ({ url, label }) => {
				const probe = await deps.probe(url, proxyUrl);
				return probe.ok
					? { label, ok: true, latencyMs: probe.latencyMs }
					: { label, ok: false, code: probe.code, detail: probe.detail };
			}),
		);

		const fastest = targets
			.filter((target) => target.ok)
			.sort((a, b) => (a.latencyMs ?? 0) - (b.latencyMs ?? 0))[0];
		if (fastest) {
			return {
				id: "tracker",
				status: "ok",
				latencyMs: fastest.latencyMs,
				targets,
			};
		}
		return {
			id: "tracker",
			status: "failed",
			code: targets[0]?.code ?? "unknown",
			detail: targets[0]?.detail,
			targets,
		};
	}

	async function loginStep(source: TrackerSource): Promise<DiagnosticStep> {
		const startedAt = Date.now();
		const result = await deps.checkLogin(source);
		if (result.ok) {
			return { id: "login", status: "ok", latencyMs: Date.now() - startedAt };
		}
		return {
			id: "login",
			status: "failed",
			code: classifyTrackerError(result.message),
			detail: result.message,
		};
	}

	return {
		/** Run checks in order and stop at the first failure. */
		diagnose: async (
			source: TrackerSource,
		): Promise<TrackerDiagnosticsResult> => {
			const { proxyUrl, hosts } = await deps.loadTarget(source);
			const runners: Record<DiagnosticStepId, () => Promise<DiagnosticStep>> = {
				egress: () => egressStep(proxyUrl),
				tracker: () => trackerStep(hosts, proxyUrl),
				login: () => loginStep(source),
			};

			const steps: DiagnosticStep[] = [];
			let failed = false;
			for (const id of STEP_ORDER) {
				if (failed) {
					steps.push({ id, status: "skipped" });
					continue;
				}
				const step = await runners[id]();
				failed = step.status === "failed";
				steps.push(step);
			}

			return { ok: !failed, steps };
		},
	};
}

export type TrackerDiagnostics = ReturnType<typeof createTrackerDiagnostics>;
