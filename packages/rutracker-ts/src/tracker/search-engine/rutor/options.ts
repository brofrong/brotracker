import type { ProxyAgent } from "../rutracker/http";

/** RuTor is public: no login, no Cloudflare; it only needs a way out (often a proxy). */
export type RutorOptions = {
	proxyAgent: ProxyAgent;
};
