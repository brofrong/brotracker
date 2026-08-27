import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { FileStore, StoredCookie } from "../../storage/file-store";
import {
	DEFAULT_CF_SOLVER_URL,
	normalizeSolverUrl,
	toStoredCookie,
} from "../rutracker/cf";
import { KINOZAL_MIRRORS } from "./constants";
import { resolveKinozalMirror } from "./hosts";

const CHALLENGE_TIMEOUT_MS = 120_000;

const solverCookieSchema = z.object({
	name: z.string(),
	value: z.string(),
	domain: z.string().optional(),
	path: z.string().optional(),
	expires: z.number().optional(),
	httpOnly: z.boolean().optional(),
	secure: z.boolean().optional(),
});

const solverResponseSchema = z.object({
	status: z.string(),
	message: z.string().optional(),
	solution: z
		.object({
			cookies: z.array(solverCookieSchema).default([]),
			userAgent: z.string().optional(),
			user_agent: z.string().optional(),
		})
		.optional(),
});

export type KinozalCfClearanceOptions = {
	fileStore: FileStore;
	solverUrl?: string | undefined;
	timeoutMs?: number;
	challengeUrl?: string;
	/** Mirror base URL; used to derive the default challenge URL. */
	baseUrl?: string | undefined;
};

function isKinozalCookieDomain(domain: string | undefined): boolean {
	if (!domain) return false;
	const d = domain.replace(/^\./, "").toLowerCase();
	return KINOZAL_MIRRORS.some((mirror) => {
		const base = new URL(mirror.url).hostname;
		return d === base || d.endsWith(`.${base}`);
	});
}

export function extractKinozalCfClearance(
	cookies: z.infer<typeof solverCookieSchema>[],
): StoredCookie | null {
	const candidates = cookies.filter((c) => c.name === "cf_clearance" && c.value);
	const forSite =
		candidates.find((c) => isKinozalCookieDomain(c.domain)) ??
		candidates.find((c) => !c.domain?.toLowerCase().includes("cloudflare"));
	return forSite ? toStoredCookie(forSite) : null;
}

/**
 * Asks Byparr to open Kinozal and solve Cloudflare when a challenge is present.
 * Call only after detecting a CF challenge — Kinozal often works without one.
 */
export async function acquireKinozalCfClearance(
	options: KinozalCfClearanceOptions,
): Promise<Result<{ cfClearance: StoredCookie; userAgent: string }, Error>> {
	const solverUrl = normalizeSolverUrl(
		options.solverUrl ?? DEFAULT_CF_SOLVER_URL,
	);
	const timeoutMs = options.timeoutMs ?? CHALLENGE_TIMEOUT_MS;
	const challengeUrl =
		options.challengeUrl ?? `${resolveKinozalMirror(options.baseUrl).url}/`;
	const maxTimeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

	try {
		console.log(
			`[kinozal] Acquiring cf_clearance via solver ${solverUrl}…`,
		);

		const response = await axios.post(
			solverUrl,
			{
				cmd: "request.get",
				url: challengeUrl,
				max_timeout: maxTimeoutSec,
				maxTimeout: timeoutMs,
				returnOnlyCookies: true,
			},
			{
				timeout: timeoutMs + 15_000,
				validateStatus: () => true,
				headers: { "Content-Type": "application/json" },
			},
		);

		if (response.status === 408) {
			return err(
				new Error(
					`CF solver timed out after ${maxTimeoutSec}s. Check Byparr logs / shm_size.`,
				),
			);
		}

		if (response.status >= 400) {
			const detail =
				typeof response.data === "object" &&
				response.data &&
				"detail" in response.data
					? String((response.data as { detail: unknown }).detail)
					: `HTTP ${response.status}`;
			return err(new Error(`CF solver request failed: ${detail}`));
		}

		const parsed = solverResponseSchema.safeParse(response.data);
		if (!parsed.success) {
			return err(
				new Error(
					`CF solver returned unexpected payload: ${parsed.error.message}`,
				),
			);
		}

		const body = parsed.data;
		if (body.status !== "ok" || !body.solution) {
			return err(
				new Error(
					`CF solver failed: ${body.message ?? body.status ?? "unknown error"}`,
				),
			);
		}

		const userAgent =
			body.solution.userAgent ??
			body.solution.user_agent ??
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

		const cfClearance = extractKinozalCfClearance(body.solution.cookies);
		if (!cfClearance) {
			return err(
				new Error(
					"CF solver did not return cf_clearance cookie. Challenge may not have been solved.",
				),
			);
		}

		const current = await options.fileStore.read();
		if (current.isErr()) {
			return err(current.error);
		}

		const saved = await options.fileStore.update({
			cfClearance,
			userAgent,
			sessionCookies: current.value.sessionCookies,
		});

		if (saved.isErr()) {
			return err(saved.error);
		}

		console.log("[kinozal] cf_clearance saved to", options.fileStore.path);
		return ok({ cfClearance, userAgent });
	} catch (error) {
		return err(
			new Error(
				`Failed to acquire cf_clearance via solver: ${error}. Is Byparr running at the solver URL?`,
			),
		);
	}
}
