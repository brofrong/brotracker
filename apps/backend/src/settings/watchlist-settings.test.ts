import { describe, expect, test } from "bun:test";

import {
	DEFAULT_WATCHLIST_SETTINGS,
	parseWatchlistSettings,
} from "./watchlist-settings";

describe("parseWatchlistSettings", () => {
	test("null returns defaults", () => {
		expect(parseWatchlistSettings(null)).toEqual(DEFAULT_WATCHLIST_SETTINGS);
	});

	test("invalid JSON returns defaults", () => {
		expect(parseWatchlistSettings("not json")).toEqual(
			DEFAULT_WATCHLIST_SETTINGS,
		);
	});

	test("partial settings merge over defaults", () => {
		expect(parseWatchlistSettings('{"minResolution":"4K"}')).toEqual({
			...DEFAULT_WATCHLIST_SETTINGS,
			minResolution: "4K",
		});
	});

	test("invalid field value falls back to defaults entirely", () => {
		expect(parseWatchlistSettings('{"checkIntervalHours":3}')).toEqual(
			DEFAULT_WATCHLIST_SETTINGS,
		);
	});
});
