import { describe, expect, test } from "bun:test";

import {
	DEFAULT_KINOZAL_MIRROR,
	KINOZAL_MIRRORS,
} from "../../src/tracker/search-engine/kinozal/constants";
import {
	isKinozalDownloadUrl,
	kinozalDownloadRequestUrl,
	resolveKinozalMirror,
} from "../../src/tracker/search-engine/kinozal/hosts";

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
			isKinozalDownloadUrl("https://dl.kinozal.guru/download.php?id=2021740"),
		).toBe(true);
		expect(
			isKinozalDownloadUrl("https://dl.kinozal.tv/download.php?id=2021740"),
		).toBe(true);
	});

	test("accepts download.php on every official site host", () => {
		for (const mirror of KINOZAL_MIRRORS) {
			expect(isKinozalDownloadUrl(`${mirror.url}/download.php?id=1`)).toBe(
				true,
			);
		}
	});

	test("rejects non-download Kinozal URLs and other hosts", () => {
		expect(
			isKinozalDownloadUrl("https://forum.kinozal.guru/download.php?id=1"),
		).toBe(false);
		expect(
			isKinozalDownloadUrl("https://kinozal.guru/details.php?id=2021740"),
		).toBe(false);
		expect(isKinozalDownloadUrl("https://evil.example/download.php?id=1")).toBe(
			false,
		);
		expect(
			isKinozalDownloadUrl("http://dl.kinozal.guru/download.php?id=1"),
		).toBe(false);
	});
});

describe("kinozalDownloadRequestUrl", () => {
	test("fetches from the configured mirror's site host", () => {
		expect(
			kinozalDownloadRequestUrl(
				"https://kinozal.guru/download.php?id=2098857",
				"https://kinozal.guru",
			),
		).toBe("https://kinozal.guru/download.php?id=2098857");
	});

	test("rewrites legacy dl.* URLs, which Cloudflare answers with 520", () => {
		expect(
			kinozalDownloadRequestUrl(
				"https://dl.kinozal.guru/download.php?id=2098857",
				"https://kinozal.guru",
			),
		).toBe("https://kinozal.guru/download.php?id=2098857");
		expect(
			kinozalDownloadRequestUrl("https://dl.kinozal.me/download.php?id=7"),
		).toBe("https://kinozal.me/download.php?id=7");
	});

	test("follows the configured mirror, not the URL's mirror", () => {
		expect(
			kinozalDownloadRequestUrl(
				"https://kinozal.me/download.php?id=7",
				"https://kinozal.guru",
			),
		).toBe("https://kinozal.guru/download.php?id=7");
	});

	test("returns null for URLs outside the allowlist", () => {
		expect(
			kinozalDownloadRequestUrl("https://evil.example/download.php?id=1"),
		).toBeNull();
	});
});
