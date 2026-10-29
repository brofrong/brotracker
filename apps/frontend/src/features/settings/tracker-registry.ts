import type { TrackerSource } from "@brotracker/rutracker-ts/tracker/torrent-id";
import type {
	QueryKey,
	UseMutationOptions,
	UseQueryOptions,
} from "@tanstack/react-query";

import { trpc } from "#/shared/lib/trpc";

import type { TrackerDiagnosticsResult } from "./tracker-diagnostics";

export type TrackerEntry = {
	id: TrackerSource;
	/** Needs login + password (private trackers). */
	credentials: boolean;
	/** Has several site mirrors to choose from (Kinozal). */
	mirrors: boolean;
};

/** Settings pages and the overview are generated from this list. */
export const TRACKERS: TrackerEntry[] = [
	{ id: "rutracker", credentials: true, mirrors: false },
	{ id: "kinozal", credentials: true, mirrors: true },
	{ id: "rutor", credentials: false, mirrors: false },
];

export function findTracker(id: string): TrackerEntry | undefined {
	return TRACKERS.find((tracker) => tracker.id === id);
}

/** What the settings UI reads back for any tracker; absent fields don't apply to it. */
export type TrackerSettingsData = {
	enabled: boolean;
	proxyUrl: string | null;
	login?: string;
	password?: string;
	autoHost?: boolean;
	host?: string | null;
};

type TrackerSettingsApi = {
	queryOptions: () => UseQueryOptions<TrackerSettingsData, Error>;
	queryKey: () => QueryKey;
	saveOptions: () => UseMutationOptions<
		TrackerSettingsData,
		Error,
		Record<string, unknown>
	>;
	testOptions: () => UseMutationOptions<TrackerDiagnosticsResult, Error, void>;
};

/** Procedures of one tracker router, with the input type erased. */
function erase(procedures: {
	get: { queryOptions: () => unknown; queryKey: () => QueryKey };
	set: { mutationOptions: () => unknown };
	test: { mutationOptions: () => unknown };
}): TrackerSettingsApi {
	return {
		queryOptions: () =>
			procedures.get.queryOptions() as ReturnType<
				TrackerSettingsApi["queryOptions"]
			>,
		queryKey: () => procedures.get.queryKey(),
		saveOptions: () =>
			procedures.set.mutationOptions() as ReturnType<
				TrackerSettingsApi["saveOptions"]
			>,
		testOptions: () =>
			procedures.test.mutationOptions() as ReturnType<
				TrackerSettingsApi["testOptions"]
			>,
	};
}

/**
 * Each tracker has its own tRPC router with a different input type; the
 * settings UI drives them through this one loosely typed shape.
 */
export function trackerSettingsApi(id: TrackerSource): TrackerSettingsApi {
	const providers = trpc.settings.providers;
	switch (id) {
		case "rutracker":
			return erase(providers.rutracker);
		case "kinozal":
			return erase(providers.kinozal);
		case "rutor":
			return erase(providers.rutor);
	}
}
