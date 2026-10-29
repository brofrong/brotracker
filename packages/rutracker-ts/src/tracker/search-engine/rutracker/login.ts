import axios, { type AxiosResponse } from "axios";
import { err, ok, type Result } from "neverthrow";

import { sharedResult } from "../../single-flight";
import {
	cookiesToHeader,
	type FileStore,
	type StoredCookie,
} from "../../storage/file-store";
import type { RutrackerOptions } from "../../tracker-interface";
import { acquireCfClearance } from "./cf";
import { RUTRACKER_URL } from "./constants";
import type { ProxyAgent } from "./http";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";

const DEFAULT_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type LoginResult = Result<{ cookies: string; userAgent: string }, Error>;

/** A fresh login is reused by requests that were rejected with the old session meanwhile. */
const RELOGIN_REUSE_MS = 15_000;

function hasValidCfClearance(cookie: StoredCookie | null | undefined): boolean {
	if (!cookie?.value) return false;
	if (cookie.expires == null || cookie.expires <= 0) return true;
	const expiresMs =
		cookie.expires < 1e12 ? cookie.expires * 1000 : cookie.expires;
	return expiresMs > Date.now();
}

async function ensureCfClearance(
	fileStore: FileStore,
	forceRefresh: boolean,
	solverUrl?: string,
): Promise<Result<{ userAgent: string }, Error>> {
	const stored = await fileStore.read();
	if (stored.isErr()) {
		return err(stored.error);
	}

	if (!forceRefresh && hasValidCfClearance(stored.value.cfClearance)) {
		return ok({ userAgent: stored.value.userAgent ?? DEFAULT_UA });
	}

	const acquired = await acquireCfClearance({ fileStore, solverUrl });
	if (acquired.isErr()) {
		return err(acquired.error);
	}
	return ok({ userAgent: acquired.value.userAgent });
}

function parseSetCookieHeaders(headers: string[]): StoredCookie[] {
	const result: StoredCookie[] = [];
	for (const header of headers) {
		const parts = header.split(";").map((p) => p.trim());
		const [nameValue, ...attrs] = parts;
		if (!nameValue) continue;
		const eq = nameValue.indexOf("=");
		if (eq <= 0) continue;
		const name = nameValue.slice(0, eq);
		const value = nameValue.slice(eq + 1);
		if (name === "cf_clearance") continue;

		let expires: number | null = null;
		let domain: string | undefined;
		let path: string | undefined;
		let httpOnly = false;
		let secure = false;

		for (const attr of attrs) {
			const lower = attr.toLowerCase();
			if (lower.startsWith("expires=")) {
				const d = new Date(attr.slice(8));
				if (!Number.isNaN(d.getTime())) {
					expires = Math.floor(d.getTime() / 1000);
				}
			} else if (lower.startsWith("max-age=")) {
				const seconds = Number.parseInt(attr.slice(8), 10);
				if (!Number.isNaN(seconds)) {
					expires = Math.floor(Date.now() / 1000) + seconds;
				}
			} else if (lower.startsWith("domain=")) {
				domain = attr.slice(7);
			} else if (lower.startsWith("path=")) {
				path = attr.slice(5);
			} else if (lower === "httponly") {
				httpOnly = true;
			} else if (lower === "secure") {
				secure = true;
			}
		}

		result.push({ name, value, domain, path, expires, httpOnly, secure });
	}
	return result;
}

async function buildCookieHeader(
	fileStore: FileStore,
): Promise<Result<string, Error>> {
	return fileStore.getCookieHeader();
}

async function authorizeOnce(
	login: string,
	password: string,
	fileStore: FileStore,
	proxyAgent: ProxyAgent,
	userAgent: string,
): Promise<LoginResult> {
	const cookieHeader = await buildCookieHeader(fileStore);
	if (cookieHeader.isErr()) {
		return err(cookieHeader.error);
	}

	const body = {
		login_username: login,
		login_password: password,
		login: "Вход",
	};

	let response: AxiosResponse;
	try {
		response = await axios.post(`${RUTRACKER_URL}/forum/login.php`, body, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": userAgent,
				...(cookieHeader.value ? { Cookie: cookieHeader.value } : {}),
			},
			maxRedirects: 0,
			timeout: 30 * 1000,
			validateStatus: () => true,
			...axiosAgentConfig(proxyAgent),
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return err(new Error(`Login request failed: ${detail}`));
	}

	if (isCloudflareChallenge(response)) {
		return err(new Error("CF_CHALLENGE"));
	}

	const setCookies = response.headers["set-cookie"];
	if (!setCookies?.length) {
		return err(
			new Error(`Login failed: no session cookies (HTTP ${response.status})`),
		);
	}

	const sessionCookies = parseSetCookieHeaders(setCookies);
	if (!sessionCookies.some((c) => c.name === "bb_session")) {
		return err(
			new Error(
				`Login failed: RuTracker did not return bb_session (HTTP ${response.status}). Check login/password or solve the captcha in a browser.`,
			),
		);
	}
	const updated = await fileStore.update({ sessionCookies, userAgent });
	if (updated.isErr()) {
		return err(updated.error);
	}

	const header = await buildCookieHeader(fileStore);
	if (header.isErr()) {
		return err(header.error);
	}

	return ok({ cookies: header.value, userAgent });
}

/** RuTracker serves its login form instead of the page when the session is rejected. */
export function isRutrackerLoggedOutPage(html: string): boolean {
	return /name=["']?login_username/i.test(html) && !/logout/i.test(html);
}

/** Drop the stored session (keeping cf_clearance) and log in again. */
export function rutrackerRelogin(
	options: RutrackerOptions,
): Promise<LoginResult> {
	return sharedResult(
		options.fileStore,
		"relogin",
		() => relogin(options),
		RELOGIN_REUSE_MS,
	);
}

async function relogin(options: RutrackerOptions): Promise<LoginResult> {
	const cleared = await options.fileStore.update({ sessionCookies: [] });
	if (cleared.isErr()) {
		return err(cleared.error);
	}
	return rutrackerGetCookies(
		options.auth.login,
		options.auth.password,
		options.fileStore,
		options.proxyAgent,
		options.cfSolverUrl,
	);
}

/**
 * Ensures cf_clearance + session cookies.
 * - no cf_clearance → acquire via Byparr / CF solver
 * - has cf_clearance → try login; on CF fail → refresh clearance and retry once
 */
export function rutrackerGetCookies(
	login: string,
	password: string,
	fileStore: FileStore,
	proxyAgent: ProxyAgent = null,
	cfSolverUrl?: string,
): Promise<LoginResult> {
	return sharedResult(fileStore, "login", () =>
		getCookies(login, password, fileStore, proxyAgent, cfSolverUrl),
	);
}

async function getCookies(
	login: string,
	password: string,
	fileStore: FileStore,
	proxyAgent: ProxyAgent,
	cfSolverUrl?: string,
): Promise<LoginResult> {
	const stored = await fileStore.read();
	if (stored.isErr()) {
		return err(stored.error);
	}

	// Reuse valid session if present
	const existingHeader = cookiesToHeader([
		...(stored.value.cfClearance &&
		hasValidCfClearance(stored.value.cfClearance)
			? [stored.value.cfClearance]
			: []),
		...stored.value.sessionCookies,
	]);
	const hasSession = stored.value.sessionCookies.some(
		(c) => c.name.startsWith("bb_") || c.name.includes("session"),
	);
	if (
		hasValidCfClearance(stored.value.cfClearance) &&
		hasSession &&
		existingHeader
	) {
		return ok({
			cookies: existingHeader,
			userAgent: stored.value.userAgent ?? DEFAULT_UA,
		});
	}

	const cf = await ensureCfClearance(
		fileStore,
		!hasValidCfClearance(stored.value.cfClearance),
		cfSolverUrl,
	);
	if (cf.isErr()) {
		return err(cf.error);
	}

	let attempt = await authorizeOnce(
		login,
		password,
		fileStore,
		proxyAgent,
		cf.value.userAgent,
	);

	if (attempt.isErr() && attempt.error.message === "CF_CHALLENGE") {
		const refreshed = await ensureCfClearance(fileStore, true, cfSolverUrl);
		if (refreshed.isErr()) {
			return err(refreshed.error);
		}
		attempt = await authorizeOnce(
			login,
			password,
			fileStore,
			proxyAgent,
			refreshed.value.userAgent,
		);
	}

	if (attempt.isErr()) {
		if (attempt.error.message === "CF_CHALLENGE") {
			return err(cloudflareBypassFailedError("login"));
		}
		return err(attempt.error);
	}

	return attempt;
}
