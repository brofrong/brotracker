import { describe, expect, test } from "bun:test";
import { optimizeCover } from "./cover-image";

const PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

async function pngOfSize(width: number, height: number): Promise<Uint8Array> {
	return new Bun.Image(PIXEL_PNG).resize(width, height).png().bytes();
}

async function imageMeta(bytes: Uint8Array) {
	return new Bun.Image(bytes).metadata();
}

describe("optimizeCover", () => {
	test("encodes as WebP and downscales width to 1000", async () => {
		const source = await pngOfSize(2000, 800);
		const out = await optimizeCover(source);

		expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
		expect(String.fromCharCode(...out.slice(8, 12))).toBe("WEBP");
		const meta = await imageMeta(out);
		expect(meta.format).toBe("webp");
		expect(meta.width).toBe(1000);
		expect(meta.height).toBe(400);
	});

	test("does not upscale covers narrower than 1000px", async () => {
		const source = await pngOfSize(400, 600);
		const out = await optimizeCover(source);
		const meta = await imageMeta(out);

		expect(meta.format).toBe("webp");
		expect(meta.width).toBe(400);
		expect(meta.height).toBe(600);
	});

	test("rejects bytes that are not an image", async () => {
		await expect(optimizeCover(new Uint8Array([1, 2, 3]))).rejects.toThrow();
	});
});
