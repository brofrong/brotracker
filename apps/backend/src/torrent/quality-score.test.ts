import { describe, expect, test } from "bun:test";
import {
	compareTorrentQuality,
	scoreSeeds,
	scoreTorrentQuality,
	type QualityInput,
} from "./quality-score";

const base = (overrides: Partial<QualityInput> = {}): QualityInput => ({
	seeds: 10,
	size: 8e9,
	hdr: "SDR",
	resolution: "1080p",
	...overrides,
});

describe("scoreSeeds", () => {
	test("gains steeply toward ~6 seeds, then slows", () => {
		const s1 = scoreSeeds(1);
		const s6 = scoreSeeds(6);
		const s12 = scoreSeeds(12);
		expect(s6 - s1).toBeGreaterThan(s12 - s6);
	});

	test("400 seeds still beat 300", () => {
		expect(scoreSeeds(400)).toBeGreaterThan(scoreSeeds(300));
	});
});

describe("scoreTorrentQuality", () => {
	test("4K HDR beats 1080p SDR with similar seeds/size", () => {
		const uhd = scoreTorrentQuality(
			base({ resolution: "4K", hdr: "HDR", seeds: 20 }),
		);
		const fhd = scoreTorrentQuality(
			base({ resolution: "1080p", hdr: "SDR", seeds: 20 }),
		);
		expect(uhd).toBeGreaterThan(fhd);
	});

	test("HDR beats SDR when everything else matches", () => {
		expect(
			scoreTorrentQuality(base({ hdr: "HDR" })),
		).toBeGreaterThan(scoreTorrentQuality(base({ hdr: "SDR" })));
	});

	test("smaller file ranks higher when quality factors match", () => {
		const small = scoreTorrentQuality(base({ size: 4e9 }));
		const large = scoreTorrentQuality(base({ size: 16e9 }));
		expect(small).toBeGreaterThan(large);
	});
});

describe("compareTorrentQuality", () => {
	test("sorts by quality then similarity", () => {
		const items = [
			{ ...base({ seeds: 5, resolution: "720p" }), similarity: 0.9 },
			{ ...base({ seeds: 20, resolution: "4K", hdr: "HDR" }), similarity: 0.4 },
			{ ...base({ seeds: 20, resolution: "4K", hdr: "HDR" }), similarity: 0.8 },
		];
		const sorted = [...items].sort(compareTorrentQuality);
		expect(sorted[0]?.similarity).toBe(0.8);
		expect(sorted[1]?.similarity).toBe(0.4);
		expect(sorted[2]?.resolution).toBe("720p");
	});
});
