import { createTracker } from "@brotracker/rutracker-ts/index";
import type { TrackerInterface } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { rutrackerStore } from "../db/rutracker-store/rutracker-store.schema";
import { loadRutrackerConfig } from "../settings/rutracker-config";
import { env } from "../utils/env";
import { createProxyAgent } from "../http/proxy-agent";
import { createRutrackerDbStore } from "./rutracker-db-store";

const STORE_ID = "default";

let trackerPromise: Promise<TrackerInterface> | null = null;

export class RutrackerNotConfiguredError extends Error {
	constructor() {
		super("Rutracker is not configured. Set login and password in Settings.");
		this.name = "RutrackerNotConfiguredError";
	}
}

/** Lazy so migrations run before the first DB-backed session read/write. */
export function getTracker(): Promise<TrackerInterface> {
	if (!trackerPromise) {
		trackerPromise = createTrackerFromDb();
	}
	return trackerPromise;
}

/** Drop cached tracker so the next call reloads credentials/proxy from DB. */
export function invalidateTracker(): void {
	trackerPromise = null;
}

/** Clear CF/session cookies after credential or proxy change. */
export async function clearRutrackerSession(): Promise<void> {
	await db.delete(rutrackerStore).where(eq(rutrackerStore.id, STORE_ID));
}

async function createTrackerFromDb(): Promise<TrackerInterface> {
	const config = await loadRutrackerConfig();
	if (!config) {
		throw new RutrackerNotConfiguredError();
	}

	return createTracker("Rutracker", {
		auth: {
			login: config.login,
			password: config.password,
		},
		fileStore: createRutrackerDbStore(),
		proxyAgent: createProxyAgent(config.proxyUrl),
		cfSolverUrl: env.BYPARR_URL,
	});
}
