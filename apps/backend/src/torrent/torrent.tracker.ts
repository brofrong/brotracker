import { createTracker } from "@brotracker/rutracker-ts/index";
import type { Tracker } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import type { TrackerInterface } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import {
	parseTorrentId,
	type TrackerSource,
} from "@brotracker/rutracker-ts/tracker/torrent-id";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { kinozalStore } from "../db/kinozal-store/kinozal-store.schema";
import { rutrackerStore } from "../db/rutracker-store/rutracker-store.schema";
import {
	loadKinozalConfig,
	loadRutrackerConfig,
} from "../settings/provider-config.live";
import { env } from "../utils/env";
import { createProxyAgent } from "../http/proxy-agent";
import { createKinozalDbStore } from "./kinozal-db-store";
import { createRutrackerDbStore } from "./rutracker-db-store";

const STORE_ID = "default";

const trackerPromises = new Map<TrackerSource, Promise<TrackerInterface>>();

export class TrackerNotConfiguredError extends Error {
	constructor(source: TrackerSource) {
		super(
			`${sourceLabel(source)} is not configured. Set login and password in Settings.`,
		);
		this.name = "TrackerNotConfiguredError";
	}
}

/** @deprecated Use TrackerNotConfiguredError */
export class RutrackerNotConfiguredError extends TrackerNotConfiguredError {
	constructor() {
		super("rutracker");
		this.name = "RutrackerNotConfiguredError";
	}
}

function sourceLabel(source: TrackerSource): string {
	return source === "rutracker" ? "RuTracker" : "Kinozal";
}

function sourceToTracker(source: TrackerSource): Tracker {
	return source === "rutracker" ? "Rutracker" : "Kinozal";
}

async function loadConfig(source: TrackerSource) {
	return source === "rutracker"
		? loadRutrackerConfig()
		: loadKinozalConfig();
}

function createDbStore(source: TrackerSource) {
	return source === "rutracker"
		? createRutrackerDbStore()
		: createKinozalDbStore();
}

async function createTrackerForSource(
	source: TrackerSource,
): Promise<TrackerInterface> {
	const config = await loadConfig(source);
	if (!config) {
		throw new TrackerNotConfiguredError(source);
	}

	return createTracker(sourceToTracker(source), {
		auth: {
			login: config.login,
			password: config.password,
		},
		fileStore: createDbStore(source),
		proxyAgent: createProxyAgent(config.proxyUrl),
		cfSolverUrl: env.BYPARR_URL,
	});
}

/** Lazy tracker client per source; migrations run before first DB session read/write. */
export function getTracker(
	source: TrackerSource = "rutracker",
): Promise<TrackerInterface> {
	let promise = trackerPromises.get(source);
	if (!promise) {
		promise = createTrackerForSource(source);
		trackerPromises.set(source, promise);
	}
	return promise;
}

export function getTrackerForTorrentId(
	torrentId: string,
): Promise<TrackerInterface> {
	const { source } = parseTorrentId(torrentId);
	return getTracker(source);
}

/** Enabled providers with login + password configured. */
export async function listEnabledTrackers(): Promise<TrackerSource[]> {
	const sources: TrackerSource[] = [];
	const rutracker = await loadRutrackerConfig();
	if (rutracker?.enabled) {
		sources.push("rutracker");
	}
	const kinozal = await loadKinozalConfig();
	if (kinozal?.enabled) {
		sources.push("kinozal");
	}
	return sources;
}

/** Drop cached tracker client(s) so the next call reloads credentials/proxy from DB. */
export function invalidateTracker(source?: TrackerSource): void {
	if (source) {
		trackerPromises.delete(source);
		return;
	}
	trackerPromises.clear();
}

/** Clear CF/session cookies after credential or proxy change. */
export async function clearTrackerSession(source: TrackerSource): Promise<void> {
	const table = source === "rutracker" ? rutrackerStore : kinozalStore;
	await db.delete(table).where(eq(table.id, STORE_ID));
}

/** @deprecated Use clearTrackerSession("rutracker") */
export async function clearRutrackerSession(): Promise<void> {
	await clearTrackerSession("rutracker");
}

/** @deprecated Use clearTrackerSession("kinozal") */
export async function clearKinozalSession(): Promise<void> {
	await clearTrackerSession("kinozal");
}
