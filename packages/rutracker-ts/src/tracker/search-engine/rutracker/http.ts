import type { Agent } from "node:https";
import type { AxiosRequestConfig, AxiosResponse } from "axios";

export type ProxyAgent = Agent | null;

export function axiosAgentConfig(
	proxyAgent: ProxyAgent | undefined,
): Pick<AxiosRequestConfig, "httpsAgent" | "httpAgent" | "proxy"> {
	if (!proxyAgent) {
		return {};
	}
	return {
		httpsAgent: proxyAgent,
		httpAgent: proxyAgent,
		proxy: false,
	};
}

export function isCloudflareChallenge(
	response: Pick<AxiosResponse, "status" | "headers" | "data">,
): boolean {
	const body =
		typeof response.data === "string"
			? response.data
			: Buffer.isBuffer(response.data)
				? response.data.toString("utf8")
				: "";

	const cfMitigated = response.headers["cf-mitigated"];
	return (
		response.status === 403 &&
		(cfMitigated === "challenge" ||
			body.includes("Just a moment") ||
			body.includes("challenges.cloudflare.com"))
	);
}

export function cloudflareChallengeError(context: string): Error {
	return new Error(
		`Rutracker blocked by Cloudflare (${context}). Trying to refresh cf_clearance…`,
	);
}

export function cloudflareBypassFailedError(context: string): Error {
	return new Error(
		`Cannot bypass Cloudflare protection (${context}). cf_clearance refresh via CF solver failed.`,
	);
}
