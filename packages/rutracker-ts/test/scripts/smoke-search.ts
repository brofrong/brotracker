import { join } from "node:path";
import { createTracker } from "../../src/tracker/tracker";
import { createFileStore } from "../../src/tracker/storage/file-store";
import { env } from "../../src/utils/env";

const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.username,
		password: env.password,
	},
	fileStore: createFileStore(
		join(import.meta.dir, "../../.data/rutracker-store.json"),
	),
	proxyAgent: null,
});

const search = "Интерстеллар";

console.log("start search");
const results = await tracker.search(search, { category: "films" });
if (results.isErr()) {
	console.error(results.error.message);
	throw results.error;
}
console.log(`found ${results.value.results.length} / total ${results.value.totalResults}`);
console.log(results.value.results[0]);
