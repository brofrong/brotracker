import { join } from "node:path";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createTracker } from "../../src/tracker/tracker";
import { createFileStore } from "../../src/tracker/storage/file-store";
import { env } from "../../src/utils/env";

/**
 * Example: tracker through HTTP(S) proxy (+ file store for cf_clearance / session).
 * Set RUTRACKER_PROXY to a working proxy URL.
 */
const proxy = process.env.RUTRACKER_PROXY ?? "http://user:pass@host:port";

const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.username,
		password: env.password,
	},
	fileStore: createFileStore(
		join(import.meta.dir, "../../.data/rutracker-store.json"),
	),
	proxyAgent: new HttpsProxyAgent(proxy),
});

const results = await tracker.search("Интерстеллар", { category: "films" });
if (results.isErr()) {
	console.error(results.error.message);
	process.exit(1);
}
console.log(`found ${results.value.results.length} / total ${results.value.totalResults}`);
console.log(results.value.results[0]);
