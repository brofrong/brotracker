import type { AppRouter } from "@brotracker/backend/appRouter";
import type { inferRouterOutputs } from "@trpc/server";

export type WatchlistItem =
	inferRouterOutputs<AppRouter>["title"]["watchlist"][number];

export type WaitingOutcome = NonNullable<WatchlistItem["waitingOutcome"]>;

export type WatchlistStage =
	| "waiting"
	| "downloading"
	| "tracking"
	| "completed";

/** Order of the groups on the page: Качается → Жду → Слежу → Готово. */
export const STAGE_ORDER: readonly WatchlistStage[] = [
	"downloading",
	"waiting",
	"tracking",
	"completed",
];

type StageInput = Pick<WatchlistItem, "watch" | "transfer">;

export function stageOf(item: StageInput): WatchlistStage {
	switch (item.watch) {
		case "waiting":
			return "waiting";
		case "downloading":
			return "downloading";
		case "completed":
			return "completed";
		default:
			// tracking | paused (an "off" row never reaches the watchlist).
			return item.transfer != null && item.transfer.progress < 1
				? "downloading"
				: "tracking";
	}
}

export function groupByStage<T extends StageInput>(
	items: T[],
): Record<WatchlistStage, T[]> {
	const groups: Record<WatchlistStage, T[]> = {
		waiting: [],
		downloading: [],
		tracking: [],
		completed: [],
	};
	for (const item of items) {
		groups[stageOf(item)].push(item);
	}
	return groups;
}

/** The page polls while anything is downloading. */
export function hasActiveDownload(items: StageInput[]): boolean {
	return items.some((item) => stageOf(item) === "downloading");
}

export type WaitingStatus =
	| { kind: "outcome"; outcome: WaitingOutcome; detail: string | null }
	| { kind: "error"; message: string }
	| { kind: "unchecked" };

/** Status line of a waiting row; a failed qB add clears the outcome, so the error shows instead. */
export function waitingStatus(
	item: Pick<
		WatchlistItem,
		"waitingOutcome" | "waitingOutcomeDetail" | "lastError"
	>,
): WaitingStatus {
	if (item.waitingOutcome != null) {
		return {
			kind: "outcome",
			outcome: item.waitingOutcome,
			detail: item.waitingOutcomeDetail,
		};
	}
	if (item.lastError) {
		return { kind: "error", message: item.lastError };
	}
	return { kind: "unchecked" };
}

export type WaitingStatusDisplay = {
	text: string;
	variant: "neutral" | "warning" | "error";
};

/** Copy + StatusDot variant for a waiting row; keys live in the `watchlist` namespace. */
export function waitingStatusDisplay(
	status: WaitingStatus,
	t: (key: string, options?: Record<string, unknown>) => string,
): WaitingStatusDisplay {
	if (status.kind === "error") {
		return { text: status.message, variant: "error" };
	}
	if (status.kind === "unchecked") {
		return { text: t("notChecked"), variant: "neutral" };
	}
	const variant = status.outcome === "search-failed" ? "error" : "warning";
	if (status.outcome === "below-resolution" && status.detail == null) {
		// No release had a parsed resolution — naming one would be false.
		return { text: t("outcome.belowResolutionUnknown"), variant };
	}
	return {
		text: t(`outcome.${status.outcome}`, { best: status.detail }),
		variant,
	};
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
	["year", 365 * 24 * 3600],
	["month", 30 * 24 * 3600],
	["week", 7 * 24 * 3600],
	["day", 24 * 3600],
	["hour", 3600],
	["minute", 60],
	["second", 1],
];

/** "5 minutes ago" / "3 часа назад" for an ISO timestamp. */
export function formatRelativeTime(
	iso: string,
	now: Date,
	bcp47: string,
): string {
	const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
	const format = new Intl.RelativeTimeFormat(bcp47, { numeric: "auto" });
	const absolute = Math.abs(seconds);
	if (absolute < 45) {
		return format.format(0, "second");
	}
	for (const [unit, size] of RELATIVE_UNITS) {
		if (absolute >= size) {
			return format.format(Math.round(seconds / size), unit);
		}
	}
	return format.format(0, "second");
}
