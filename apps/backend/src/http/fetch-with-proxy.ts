import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { createProxyAgent } from "../torrent/proxy-agent";

type FetchWithProxyOptions = {
	headers?: Record<string, string>;
	/** http://, https://, or socks5:// — same as Rutracker settings. */
	proxyUrl?: string | null;
};

/**
 * `fetch` that optionally tunnels through a proxy.
 * http(s) proxies use Bun's native `proxy` option; socks5 uses the agent stack.
 */
export async function fetchWithProxy(
	url: string,
	options: FetchWithProxyOptions = {},
): Promise<Response> {
	const proxyUrl = options.proxyUrl?.trim() || null;
	if (!proxyUrl) {
		return fetch(url, { headers: options.headers });
	}

	const protocol = new URL(proxyUrl).protocol;
	if (protocol === "http:" || protocol === "https:") {
		return fetch(url, {
			headers: options.headers,
			proxy: proxyUrl,
		});
	}

	if (protocol === "socks5:") {
		return fetchViaSocksProxy(url, proxyUrl, options.headers);
	}

	throw new Error(`Unsupported proxy protocol: ${protocol}`);
}

function fetchViaSocksProxy(
	urlString: string,
	proxyUrl: string,
	headers?: Record<string, string>,
): Promise<Response> {
	const agent = createProxyAgent(proxyUrl);
	if (!agent) {
		return fetch(urlString, { headers });
	}

	const url = new URL(urlString);
	const request = url.protocol === "http:" ? http.request : https.request;

	return new Promise((resolve, reject) => {
		const req = request(
			url,
			{
				method: "GET",
				headers,
				agent,
			},
			(res: IncomingMessage) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => {
					chunks.push(chunk);
				});
				res.on("end", () => {
					const headerInit: Record<string, string> = {};
					for (const [key, value] of Object.entries(res.headers)) {
						if (value == null) {
							continue;
						}
						headerInit[key] = Array.isArray(value)
							? value.join(", ")
							: value;
					}
					resolve(
						new Response(Buffer.concat(chunks), {
							status: res.statusCode ?? 0,
							statusText: res.statusMessage,
							headers: headerInit,
						}),
					);
				});
			},
		);
		req.on("error", reject);
		req.end();
	});
}
