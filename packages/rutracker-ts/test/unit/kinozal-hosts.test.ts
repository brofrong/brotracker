import { describe, expect, test } from "bun:test";
import {
	isKinozalDownloadUrl,
	resolveKinozalMirror,
} from "../../src/tracker/search-engine/kinozal/hosts";
import {
	DEFAULT_KINOZAL_MIRROR,
	KINOZAL_MIRRORS,
} from "../../src/tracker/search-engine/kinozal/constants";

describe("resolveKinozalMirror", () => {
	test("returns default mirror when no base url", () => {
		expect(resolveKinozalMirror()).toEqual(DEFAULT_KINOZAL_MIRROR);
		expect(resolveKinozalMirror(null)).toEqual(DEFAULT_KINOZAL_MIRROR);
	});

	test("resolves each known mirror", () => {
		for (const mirror of KINOZAL_MIRRORS) {
			expect(resolveKinozalMirror(mirror.url)).toEqual(mirror);
		}
	});

	test("normalizes trailing slashes and case", () => {
		expect(resolveKinozalMirror("https://KINOZAL.GURU/")).toEqual(
			KINOZAL_MIRRORS[1],
		);
	});

	test("falls back to default for unknown host", () => {
		expect(resolveKinozalMirror("https://example.com")).toEqual(
			DEFAULT_KINOZAL_MIRROR,
		);
	});
});

describe("isKinozalDownloadUrl", () => {
	test("accepts download.php on every official dl host", () => {
		expect(
			isKinozalDownloadUrl("https://dl.kinozal.me/download.php?id=2021740"),
		).toBe(true);
		expect(
			isKinozalDownloadUrl(
				"https://dl.kinozal.guru/download.php?id=2021740",
			),
		).toBe(true);
		expect(
			isKinozalDownloadUrl("https://dl.kinozal.tv/download.php?id=2021740"),
		).toBe(true);
	});

	test("rejects non-download Kinozal URLs and other hosts", () => {
		expect(
			isKinozalDownloadUrl("https://kinozal.guru/details.php?id=2021740"),
		).toBe(false);
		expect(
			isKinozalDownloadUrl("https://evil.example/download.php?id=1"),
		).toBe(false);
		expect(
			isKinozalDownloadUrl("http://dl.kinozal.guru/download.php?id=1"),
		).toBe(false);
	});
});
