import { describe, expect, it } from "vitest";

import {
	formatRelativeTime,
	groupByStage,
	hasActiveDownload,
	STAGE_ORDER,
	stageOf,
	waitingStatus,
	waitingStatusDisplay,
	type WatchlistItem,
} from "./watchlist-view";

type Watch = WatchlistItem["watch"];
type Transfer = NonNullable<WatchlistItem["transfer"]>;

function transfer(progress: number): Transfer {
	return {
		hash: "h",
		progress,
		stateKind: "downloading",
		stateLabel: "Downloading",
		downloadSpeed: 0,
		etaSeconds: 0,
	};
}

describe("stageOf", () => {
	const cases: Array<[Watch, Transfer | null, string]> = [
		["waiting", null, "waiting"],
		["downloading", null, "downloading"],
		["downloading", transfer(1), "downloading"],
		["tracking", null, "tracking"],
		["tracking", transfer(1), "tracking"],
		["tracking", transfer(0.4), "downloading"],
		["paused", null, "tracking"],
		["paused", transfer(0.4), "downloading"],
		["completed", null, "completed"],
		["completed", transfer(1), "completed"],
	];

	for (const [watch, t, expected] of cases) {
		it(`maps ${watch} with progress ${t?.progress ?? "none"} to ${expected}`, () => {
			expect(stageOf({ watch, transfer: t })).toBe(expected);
		});
	}
});

describe("groupByStage", () => {
	it("groups items and keeps their order inside a group", () => {
		const items = [
			{ id: "a", watch: "waiting" as Watch, transfer: null },
			{ id: "b", watch: "tracking" as Watch, transfer: transfer(0.4) },
			{ id: "c", watch: "completed" as Watch, transfer: null },
			{ id: "d", watch: "waiting" as Watch, transfer: null },
			{ id: "e", watch: "paused" as Watch, transfer: null },
			{ id: "f", watch: "downloading" as Watch, transfer: transfer(0.1) },
		];

		const groups = groupByStage(items);

		expect(groups.waiting.map((item) => item.id)).toEqual(["a", "d"]);
		expect(groups.downloading.map((item) => item.id)).toEqual(["b", "f"]);
		expect(groups.tracking.map((item) => item.id)).toEqual(["e"]);
		expect(groups.completed.map((item) => item.id)).toEqual(["c"]);
	});

	it("returns every stage, empty when nothing matches", () => {
		expect(groupByStage([])).toEqual({
			waiting: [],
			downloading: [],
			tracking: [],
			completed: [],
		});
	});
});

describe("STAGE_ORDER", () => {
	it("lists downloading first, then waiting, tracking, completed", () => {
		expect(STAGE_ORDER).toEqual([
			"downloading",
			"waiting",
			"tracking",
			"completed",
		]);
	});
});

describe("hasActiveDownload", () => {
	it("is true when any item is in the downloading stage", () => {
		expect(
			hasActiveDownload([
				{ watch: "waiting", transfer: null },
				{ watch: "tracking", transfer: transfer(0.5) },
			]),
		).toBe(true);
	});

	it("is false otherwise", () => {
		expect(
			hasActiveDownload([
				{ watch: "waiting", transfer: null },
				{ watch: "completed", transfer: transfer(1) },
			]),
		).toBe(false);
	});

	it("is false for a downloading film whose torrent is gone from qB", () => {
		expect(hasActiveDownload([{ watch: "downloading", transfer: null }])).toBe(
			false,
		);
	});

	it("is true for a downloading film with a transfer", () => {
		expect(
			hasActiveDownload([{ watch: "downloading", transfer: transfer(0.2) }]),
		).toBe(true);
	});
});

describe("waitingStatus", () => {
	it("shows the outcome when there is one", () => {
		expect(
			waitingStatus({
				waitingOutcome: "below-resolution",
				waitingOutcomeDetail: "720p",
				lastError: null,
			}),
		).toEqual({ kind: "outcome", outcome: "below-resolution", detail: "720p" });
	});

	it("prefers the outcome over a stale error", () => {
		expect(
			waitingStatus({
				waitingOutcome: "search-failed",
				waitingOutcomeDetail: null,
				lastError: "boom",
			}),
		).toEqual({ kind: "outcome", outcome: "search-failed", detail: null });
	});

	it("falls back to the last error when the outcome was cleared", () => {
		expect(
			waitingStatus({
				waitingOutcome: null,
				waitingOutcomeDetail: null,
				lastError: "qBittorrent unreachable",
			}),
		).toEqual({ kind: "error", message: "qBittorrent unreachable" });
	});

	it("reports not checked yet when there is nothing", () => {
		expect(
			waitingStatus({
				waitingOutcome: null,
				waitingOutcomeDetail: null,
				lastError: null,
			}),
		).toEqual({ kind: "unchecked" });
	});
});

describe("formatRelativeTime", () => {
	const now = new Date("2026-10-17T12:00:00Z");

	it("formats minutes in the past", () => {
		expect(formatRelativeTime("2026-10-17T11:55:00Z", now, "en-US")).toBe(
			"5 minutes ago",
		);
	});

	it("formats hours in Russian", () => {
		expect(formatRelativeTime("2026-10-17T09:00:00Z", now, "ru-RU")).toBe(
			"3 часа назад",
		);
	});

	it("formats days", () => {
		expect(formatRelativeTime("2026-10-15T12:00:00Z", now, "en-US")).toBe(
			"2 days ago",
		);
	});

	it("says now for very recent times", () => {
		expect(formatRelativeTime("2026-10-17T11:59:50Z", now, "en-US")).toBe(
			"now",
		);
	});
});

describe("waitingStatusDisplay", () => {
	const COPY: Record<string, string> = {
		"outcome.no-releases": "Раздач пока нет",
		"outcome.below-resolution": "Есть только {{best}} — ниже порога",
		"outcome.belowResolutionUnknown":
			"Есть только раздачи без указанного разрешения — пропущены",
		"outcome.search-failed": "Трекеры недоступны — повторю позже",
		notChecked: "ещё не проверялось",
	};
	const fakeT = (key: string, options?: Record<string, unknown>) =>
		(COPY[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
			String(options?.[name] ?? ""),
		);

	it("names the best resolution when it is known", () => {
		expect(
			waitingStatusDisplay(
				{ kind: "outcome", outcome: "below-resolution", detail: "720p" },
				fakeT,
			),
		).toEqual({ text: "Есть только 720p — ниже порога", variant: "warning" });
	});

	it("says the resolution is unknown when there is no detail", () => {
		expect(
			waitingStatusDisplay(
				{ kind: "outcome", outcome: "below-resolution", detail: null },
				fakeT,
			),
		).toEqual({
			text: "Есть только раздачи без указанного разрешения — пропущены",
			variant: "warning",
		});
	});

	it("marks a search failure as an error", () => {
		expect(
			waitingStatusDisplay(
				{ kind: "outcome", outcome: "search-failed", detail: null },
				fakeT,
			),
		).toEqual({ text: "Трекеры недоступны — повторю позже", variant: "error" });
	});

	it("shows other outcomes as warnings", () => {
		expect(
			waitingStatusDisplay(
				{ kind: "outcome", outcome: "no-releases", detail: null },
				fakeT,
			),
		).toEqual({ text: "Раздач пока нет", variant: "warning" });
	});

	it("shows the raw error message", () => {
		expect(
			waitingStatusDisplay({ kind: "error", message: "qB down" }, fakeT),
		).toEqual({ text: "qB down", variant: "error" });
	});

	it("shows not checked yet as neutral", () => {
		expect(waitingStatusDisplay({ kind: "unchecked" }, fakeT)).toEqual({
			text: "ещё не проверялось",
			variant: "neutral",
		});
	});
});
