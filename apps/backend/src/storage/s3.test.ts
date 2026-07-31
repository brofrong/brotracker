import { describe, expect, test } from "bun:test";
import { isAllowedMediaKey } from "./s3";

describe("isAllowedMediaKey", () => {
	test("allows cover webp keys", () => {
		expect(isAllowedMediaKey("covers/abc123.webp")).toBe(true);
		expect(isAllowedMediaKey("covers/torrent-id_1.webp")).toBe(true);
	});

	test("rejects path traversal and other prefixes", () => {
		expect(isAllowedMediaKey("../covers/x.webp")).toBe(false);
		expect(isAllowedMediaKey("covers/../secret.webp")).toBe(false);
		expect(isAllowedMediaKey("covers/x.png")).toBe(false);
		expect(isAllowedMediaKey("other/x.webp")).toBe(false);
		expect(isAllowedMediaKey("/covers/x.webp")).toBe(false);
		expect(isAllowedMediaKey("")).toBe(false);
	});
});
