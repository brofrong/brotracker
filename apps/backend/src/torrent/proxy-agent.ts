import type { ProxyAgent } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

/** Build an axios-compatible agent from a proxy URL, or null if unset. */
export function createProxyAgent(proxyUrl: string | null | undefined): ProxyAgent {
	const trimmed = proxyUrl?.trim();
	if (!trimmed) {
		return null;
	}

	const url = new URL(trimmed);
	if (url.protocol === "socks5:") {
		return new SocksProxyAgent(trimmed) as ProxyAgent;
	}
	if (url.protocol === "http:" || url.protocol === "https:") {
		return new HttpsProxyAgent(trimmed) as ProxyAgent;
	}

	throw new Error(`Unsupported proxy protocol: ${url.protocol}`);
}
