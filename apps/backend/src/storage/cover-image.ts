import sharp from "sharp";

const MAX_WIDTH = 1000;
/** WebP quality ~80 is a good size/quality tradeoff for covers. */
const WEBP_QUALITY = 80;

/**
 * Resize (max width 1000, no upscale) and encode as WebP.
 */
export async function optimizeCover(bytes: Uint8Array): Promise<Uint8Array> {
	return sharp(Buffer.from(bytes))
		.rotate()
		.resize({
			width: MAX_WIDTH,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: WEBP_QUALITY, effort: 4 })
		.toBuffer();
}
