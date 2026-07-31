import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import type { ProxyAgent } from "./http";
import {
	axiosAgentConfig,
	cloudflareBypassFailedError,
	isCloudflareChallenge,
} from "./http";
import { acquireCfClearance } from "./cf";
import { RUTRACKER_URL } from "./constants";
import {
	cookiesToHeader,
	type FileStore,
	type StoredCookie,
} from "../../storage/file-store";

const DEFAULT_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type LoginResult = Result<{ cookies: string; userAgent: string }, Error>;

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

	const response = await axios.post(`${RUTRACKER_URL}/forum/login.php`, body, {
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

	if (isCloudflareChallenge(response)) {
		return err(new Error("CF_CHALLENGE"));
	}

	const setCookies = response.headers["set-cookie"];
	if (!setCookies?.length) {
		return err(
			new Error(
				`Login failed: no session cookies (HTTP ${response.status})`,
			),
		);
	}

	const sessionCookies = parseSetCookieHeaders(setCookies);
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

/**
 * Ensures cf_clearance + session cookies.
 * - no cf_clearance → acquire via Byparr / CF solver
 * - has cf_clearance → try login; on CF fail → refresh clearance and retry once
 */
export async function rutrackerGetCookies(
	login: string,
	password: string,
	fileStore: FileStore,
	proxyAgent: ProxyAgent = null,
	cfSolverUrl?: string,
): Promise<LoginResult> {
	const stored = await fileStore.read();
	if (stored.isErr()) {
		return err(stored.error);
	}

	// Reuse valid session if present
	const existingHeader = cookiesToHeader([
		...(stored.value.cfClearance && hasValidCfClearance(stored.value.cfClearance)
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
