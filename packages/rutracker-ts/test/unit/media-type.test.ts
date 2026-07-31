import { expect, test } from "bun:test";
import { detectMediaType } from "../../src/tracker/search-engine/rutracker/media-type";

test("detectMediaType: film-only forum", () => {
	expect(detectMediaType("2198")).toBe("films");
});

test("detectMediaType: tv-only forum", () => {
	expect(detectMediaType("189")).toBe("tv");
});

test("detectMediaType: shared or unknown → null", () => {
	expect(detectMediaType("807")).toBeNull();
	expect(detectMediaType("999999")).toBeNull();
});
