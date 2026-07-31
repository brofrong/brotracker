import {
	CreateBucketCommand,
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../utils/env";

const s3 = new S3Client({
	endpoint: env.S3_ENDPOINT,
	region: "us-east-1",
	credentials: {
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
	},
	forcePathStyle: true,
});

function isNotFound(err: unknown): boolean {
	const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
	return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

function isAlreadyOwned(err: unknown): boolean {
	const e = err as { name?: string; Code?: string };
	return (
		e?.name === "BucketAlreadyOwnedByYou" ||
		e?.Code === "BucketAlreadyOwnedByYou"
	);
}

/** Ensure the configured bucket exists. Returns false on connection failure. */
export async function ensureBucket(): Promise<boolean> {
	const bucket = env.S3_BUCKET;
	try {
		await s3.send(new HeadBucketCommand({ Bucket: bucket }));
		return true;
	} catch (err) {
		if (!isNotFound(err)) {
			throw err;
		}
	}

	try {
		await s3.send(new CreateBucketCommand({ Bucket: bucket }));
		return true;
	} catch (err) {
		if (isAlreadyOwned(err)) {
			return true;
		}
		throw err;
	}
}

/** Upload cover as WebP; returns the object key `covers/{id}.webp`. */
export async function putCover(
	torrentId: string,
	bytes: Uint8Array,
): Promise<string> {
	const key = `covers/${torrentId}.webp`;
	await s3.send(
		new PutObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: key,
			Body: bytes,
			ContentType: "image/webp",
		}),
	);
	return key;
}

/** Only keys under `covers/` are exposed via the media proxy. */
export function isAllowedMediaKey(key: string): boolean {
	if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
		return false;
	}
	return /^covers\/[A-Za-z0-9._-]+\.webp$/.test(key);
}

export type MediaObject = {
	bytes: Uint8Array;
	contentType: string;
};

/** Fetch an object for the media proxy. Returns null when missing. */
export async function getMediaObject(key: string): Promise<MediaObject | null> {
	if (!isAllowedMediaKey(key)) {
		return null;
	}
	try {
		const result = await s3.send(
			new GetObjectCommand({
				Bucket: env.S3_BUCKET,
				Key: key,
			}),
		);
		if (!result.Body) {
			return null;
		}
		const bytes = await result.Body.transformToByteArray();
		return {
			bytes,
			contentType: result.ContentType ?? "image/webp",
		};
	} catch (err) {
		if (isNotFound(err)) {
			return null;
		}
		const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
		if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) {
			return null;
		}
		throw err;
	}
}

/**
 * Public cover URL served by the backend media proxy (`/media/...`).
 * Absolute via BETTER_AUTH_URL so local Vite (different origin) still works.
 */
export function publicUrl(key: string): string {
	const path = key.replace(/^\/+/, "");
	const base = env.BETTER_AUTH_URL.replace(/\/+$/, "");
	return `${base}/media/${path}`;
}
