import { join } from "node:path";
import { createFileStore, createTracker } from "@brotracker/rutracker-ts/index";
import { env } from "../utils/env";

export const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.RUTRACKER_LOGIN,
		password: env.RUTRACKER_PASSWORD,
	},
	fileStore: createFileStore(
		join(import.meta.dir, "../../.data/rutracker-store.json"),
	),
	proxyAgent: null,
});
