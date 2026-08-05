import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import iconv from "iconv-lite";
import { parseImageUrl } from "../../src/tracker/search-engine/kinozal/get-image";

const htmlDir = join(import.meta.dir, "../fixtures/html/kinozal");

async function loadFixture(name: string) {
	const bytes = await Bun.file(join(htmlDir, name)).arrayBuffer();
	return iconv.decode(Buffer.from(bytes), "windows-1251");
}

describe("kinozal parseImageUrl", () => {
	test("prefers /i/poster/ from details-authed-minimal", async () => {
		const html = await loadFixture("details-authed-minimal.html");
		const result = parseImageUrl(html);

		expect(result.isOk()).toBe(true);
		if (!result.isOk()) return;

		expect(result.value).toBe(
			"https://kinozal.me/i/poster/6/7/1717867.jpg",
		);
	});
});
