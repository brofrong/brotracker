import { createTracker } from "./tracker/tracker";
import { createMemoryStore } from "./tracker/utils/memory-store";
import { env } from "./utils/env";

const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.username,
		password: env.password,
	},
	store: createMemoryStore(),
	proxyAgent: null,
});

const results = await tracker.search("pluribus");
results.isOk() ? console.log(results.value) : console.error(results.error);
