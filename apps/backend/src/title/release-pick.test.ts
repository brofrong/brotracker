import { describe, expect, test } from "bun:test";
import { DEFAULT_WATCHLIST_SETTINGS } from "../settings/watchlist-settings";
import { type PickTarget, pickRelease } from "./release-pick";
import type { TitleTorrentCandidate } from "./title.types";

const candidate = (
	overrides: Partial<TitleTorrentCandidate> = {},
): TitleTorrentCandidate => ({
	torrentId: "100",
	title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)",
	size: 8e9,
	seeds: 50,
	leeches: 2,
	torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
	topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
	hdr: "SDR",
	resolution: "1080p",
	forumId: "2198",
	...overrides,
});

const filmTarget: PickTarget = {
	kind: "films",
	year: 2026,
	names: ["Одиссея", "The Odyssey"],
	season: null,
};

describe("pickRelease", () => {
	test("no candidates -> no-releases", () => {
		expect(pickRelease([], filmTarget, DEFAULT_WATCHLIST_SETTINGS)).toEqual({
			status: "none",
			outcome: "no-releases",
			detail: null,
		});
	});

	test("only an unrelated title -> no-releases", () => {
		const releases = [
			candidate({
				torrentId: "1",
				title:
					"Космическая одиссея / 2001: A Space Odyssey / 1968 / ПМ / BDRip (1080p)",
			}),
		];
		expect(
			pickRelease(releases, filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "none", outcome: "no-releases", detail: null });
	});

	test("only a matching CAMRip -> only-camrip", () => {
		const releases = [
			candidate({
				torrentId: "2",
				title: "Одиссея / The Odyssey (2026) CAMRip | Звук с TS",
			}),
		];
		expect(
			pickRelease(releases, filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "none", outcome: "only-camrip", detail: null });
	});

	test("only matching 720p -> below-resolution with best resolution as detail", () => {
		const releases = [
			candidate({
				torrentId: "3",
				title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (720p)",
				resolution: "720p",
			}),
		];
		expect(
			pickRelease(releases, filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "none", outcome: "below-resolution", detail: "720p" });
	});

	test("matching release with null resolution -> below-resolution with null detail", () => {
		const releases = [
			candidate({
				torrentId: "4",
				title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL",
				resolution: null,
			}),
		];
		expect(
			pickRelease(releases, filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "none", outcome: "below-resolution", detail: null });
	});

	test("hdrOnly: matching 1080p SDR -> no-hdr", () => {
		const rules = { ...DEFAULT_WATCHLIST_SETTINGS, hdrOnly: true };
		const releases = [
			candidate({
				torrentId: "5",
				title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)",
				resolution: "1080p",
				hdr: "SDR",
			}),
		];
		expect(pickRelease(releases, filmTarget, rules)).toEqual({
			status: "none",
			outcome: "no-hdr",
			detail: null,
		});
	});

	test("matching 1080p without Russian voice -> no-voice", () => {
		const releases = [
			candidate({
				torrentId: "6",
				title: "Одиссея / The Odyssey [2026, WEB-DL 1080p] Original + Sub",
				resolution: "1080p",
			}),
		];
		expect(
			pickRelease(releases, filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "none", outcome: "no-voice", detail: null });
	});

	test("same release passes when requireRussianVoice is false", () => {
		const rules = { ...DEFAULT_WATCHLIST_SETTINGS, requireRussianVoice: false };
		const release = candidate({
			torrentId: "6",
			title: "Одиссея / The Odyssey [2026, WEB-DL 1080p] Original + Sub",
			resolution: "1080p",
		});
		expect(pickRelease([release], filmTarget, rules)).toEqual({
			status: "found",
			candidate: release,
		});
	});

	test("two passing releases -> picks the higher quality score", () => {
		const lower = candidate({
			torrentId: "7",
			title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)",
			resolution: "1080p",
			hdr: "SDR",
			seeds: 50,
			size: 8e9,
		});
		const higher = candidate({
			torrentId: "8",
			title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (2160p)",
			resolution: "4K",
			hdr: "HDR",
			seeds: 300,
			size: 25e9,
		});
		expect(
			pickRelease([lower, higher], filmTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "found", candidate: higher });
	});

	test("tv target: wrong season -> no-releases", () => {
		const tvTarget: PickTarget = {
			kind: "tv",
			year: 2026,
			names: ["Одиссея", "The Odyssey"],
			season: 5,
		};
		const releases = [
			candidate({
				torrentId: "9",
				title: "Одиссея / The Odyssey / Сезон: 4 / 2026 / ДБ / WEB-DL (1080p)",
			}),
		];
		expect(pickRelease(releases, tvTarget, DEFAULT_WATCHLIST_SETTINGS)).toEqual(
			{ status: "none", outcome: "no-releases", detail: null },
		);
	});

	test("tv target: matching season -> found", () => {
		const tvTarget: PickTarget = {
			kind: "tv",
			year: 2026,
			names: ["Одиссея", "The Odyssey"],
			season: 5,
		};
		const release = candidate({
			torrentId: "10",
			title: "Одиссея / The Odyssey / Сезон: 5 / 2026 / ДБ / WEB-DL (1080p)",
		});
		expect(
			pickRelease([release], tvTarget, DEFAULT_WATCHLIST_SETTINGS),
		).toEqual({ status: "found", candidate: release });
	});

	test("outcome reports the furthest stage reached across all candidates", () => {
		const unrelated = candidate({
			torrentId: "11",
			title:
				"Космическая одиссея / 2001: A Space Odyssey / 1968 / ПМ / BDRip (1080p)",
		});
		const camrip = candidate({
			torrentId: "12",
			title: "Одиссея / The Odyssey (2026) CAMRip | Звук с TS",
		});
		const belowResolution = candidate({
			torrentId: "13",
			title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (720p)",
			resolution: "720p",
		});
		expect(
			pickRelease(
				[unrelated, camrip, belowResolution],
				filmTarget,
				DEFAULT_WATCHLIST_SETTINGS,
			),
		).toEqual({ status: "none", outcome: "below-resolution", detail: "720p" });
	});
});
