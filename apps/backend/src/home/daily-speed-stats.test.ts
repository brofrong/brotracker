import { describe, expect, test } from "bun:test";
import {
	applyActiveSpeedSample,
	buildSpeedHistoryDays,
	dayStatsToApi,
	type DailySpeedStatsRow,
} from "./daily-speed-stats";

describe("applyActiveSpeedSample", () => {
	test("ignores idle speeds (both zero)", () => {
		const next = applyActiveSpeedSample(null, {
			downloadSpeed: 0,
			uploadSpeed: 0,
		});
		expect(next).toBeNull();
	});

	test("creates row from first active download sample", () => {
		const next = applyActiveSpeedSample(null, {
			downloadSpeed: 1_000_000,
			uploadSpeed: 0,
		});
		expect(next).toEqual({
			minDownloadSpeed: 1_000_000,
			maxDownloadSpeed: 1_000_000,
			sumDownloadSpeed: 1_000_000,
			activeDownloadSamples: 1,
			minUploadSpeed: null,
			maxUploadSpeed: null,
			sumUploadSpeed: 0,
			activeUploadSamples: 0,
		});
	});

	test("updates min max sum and count for download", () => {
		const first = applyActiveSpeedSample(null, {
			downloadSpeed: 100,
			uploadSpeed: 0,
		});
		const second = applyActiveSpeedSample(first, {
			downloadSpeed: 300,
			uploadSpeed: 0,
		});
		expect(second).toEqual({
			minDownloadSpeed: 100,
			maxDownloadSpeed: 300,
			sumDownloadSpeed: 400,
			activeDownloadSamples: 2,
			minUploadSpeed: null,
			maxUploadSpeed: null,
			sumUploadSpeed: 0,
			activeUploadSamples: 0,
		});
	});

	test("tracks upload independently", () => {
		const row = applyActiveSpeedSample(
			{
				minDownloadSpeed: 50,
				maxDownloadSpeed: 50,
				sumDownloadSpeed: 50,
				activeDownloadSamples: 1,
				minUploadSpeed: null,
				maxUploadSpeed: null,
				sumUploadSpeed: 0,
				activeUploadSamples: 0,
			},
			{ downloadSpeed: 0, uploadSpeed: 200 },
		);
		expect(row?.minUploadSpeed).toBe(200);
		expect(row?.maxUploadSpeed).toBe(200);
		expect(row?.sumUploadSpeed).toBe(200);
		expect(row?.activeUploadSamples).toBe(1);
		expect(row?.activeDownloadSamples).toBe(1);
	});
});

describe("dayStatsToApi", () => {
	test("returns null directions when no active samples", () => {
		const empty: DailySpeedStatsRow = {
			minDownloadSpeed: null,
			maxDownloadSpeed: null,
			sumDownloadSpeed: 0,
			activeDownloadSamples: 0,
			minUploadSpeed: null,
			maxUploadSpeed: null,
			sumUploadSpeed: 0,
			activeUploadSamples: 0,
		};
		expect(dayStatsToApi(empty)).toEqual({
			download: null,
			upload: null,
		});
	});

	test("computes rounded avg from sum and count", () => {
		expect(
			dayStatsToApi({
				minDownloadSpeed: 100,
				maxDownloadSpeed: 201,
				sumDownloadSpeed: 301,
				activeDownloadSamples: 2,
				minUploadSpeed: 10,
				maxUploadSpeed: 10,
				sumUploadSpeed: 10,
				activeUploadSamples: 1,
			}),
		).toEqual({
			download: { min: 100, avg: 151, max: 201 },
			upload: { min: 10, avg: 10, max: 10 },
		});
	});
});

describe("buildSpeedHistoryDays", () => {
	test("fills every day in range with nulls when no rows", () => {
		const days = buildSpeedHistoryDays([], "2026-08-03", "2026-08-05");
		expect(days).toEqual([
			{ date: "2026-08-03", download: null, upload: null },
			{ date: "2026-08-04", download: null, upload: null },
			{ date: "2026-08-05", download: null, upload: null },
		]);
	});

	test("maps existing row into the range", () => {
		const days = buildSpeedHistoryDays(
			[
				{
					day: "2026-08-04",
					minDownloadSpeed: 100,
					maxDownloadSpeed: 200,
					sumDownloadSpeed: 300,
					activeDownloadSamples: 2,
					minUploadSpeed: null,
					maxUploadSpeed: null,
					sumUploadSpeed: 0,
					activeUploadSamples: 0,
				},
			],
			"2026-08-03",
			"2026-08-05",
		);
		expect(days[0]).toEqual({
			date: "2026-08-03",
			download: null,
			upload: null,
		});
		expect(days[1]).toEqual({
			date: "2026-08-04",
			download: { min: 100, avg: 150, max: 200 },
			upload: null,
		});
		expect(days[2]?.download).toBeNull();
	});
});
