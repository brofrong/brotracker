import { describe, expect, test } from "bun:test";
import { resolveKinozalMirror } from "../../src/tracker/search-engine/kinozal/hosts";
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
