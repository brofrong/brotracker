import type { IncomingMessage, ServerResponse } from "node:http";
import { getMediaObject, isAllowedMediaKey } from "../storage/s3";
import { logger } from "../utils/logger";

/**
 * Proxies `GET|HEAD /media/covers/...` from MinIO / S3.
 * Returns true when the request was handled.
 */
export async function tryServeMedia(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	const method = req.method ?? "GET";
	if (method !== "GET" && method !== "HEAD") {
		return false;
	}

	const urlPath = (req.url ?? "").split("?")[0] ?? "";
	if (!urlPath.startsWith("/media/")) {
		return false;
	}

	let key: string;
	try {
		key = decodeURIComponent(urlPath.slice("/media/".length));
	} catch {
		res.statusCode = 400;
		res.end("Bad request");
		return true;
	}

	if (!isAllowedMediaKey(key)) {
		res.statusCode = 404;
		res.end("Not found");
		return true;
	}

	try {
		const object = await getMediaObject(key);
		if (!object) {
			res.statusCode = 404;
			res.end("Not found");
			return true;
		}

		res.statusCode = 200;
		res.setHeader("Content-Type", object.contentType);
		res.setHeader("Content-Length", String(object.bytes.byteLength));
		res.setHeader("Cache-Control", "public, max-age=86400, immutable");
		if (method === "HEAD") {
			res.end();
			return true;
		}
		res.end(Buffer.from(object.bytes));
		return true;
	} catch (err) {
		logger.warn({ err, key }, "media proxy failed");
		res.statusCode = 502;
		res.end("Bad gateway");
		return true;
	}
}
