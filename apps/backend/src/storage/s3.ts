import {
	CreateBucketCommand,
	HeadBucketCommand,
	PutBucketPolicyCommand,
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

/** Allow anonymous GetObject (MinIO-compatible). Errors ignored if already set. */
async function ensurePublicRead(bucket: string): Promise<void> {
	const policy = JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: { AWS: ["*"] },
				Action: ["s3:GetObject"],
				Resource: [`arn:aws:s3:::${bucket}/*`],
			},
		],
	});
	try {
		await s3.send(
			new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }),
		);
	} catch {
		// already set / unsupported — covers still uploaded; public URL may 403
	}
}

/** Ensure the configured bucket exists. Returns false on connection failure. */
export async function ensureBucket(): Promise<boolean> {
	const bucket = env.S3_BUCKET;
	try {
		await s3.send(new HeadBucketCommand({ Bucket: bucket }));
		await ensurePublicRead(bucket);
		return true;
	} catch (err) {
		if (!isNotFound(err)) {
			throw err;
		}
	}

	try {
		await s3.send(new CreateBucketCommand({ Bucket: bucket }));
		await ensurePublicRead(bucket);
		return true;
	} catch (err) {
		if (isAlreadyOwned(err)) {
			await ensurePublicRead(bucket);
			return true;
		}
		throw err;
	}
}

function extFromContentType(contentType: string): string {
	const subtype = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	switch (subtype) {
		case "image/jpeg":
		case "image/jpg":
			return "jpg";
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		default:
			return "jpg";
	}
}

/** Upload cover bytes; returns the object key `covers/{id}.{ext}`. */
export async function putCover(
	torrentId: string,
	bytes: Uint8Array,
	contentType: string,
): Promise<string> {
	const ext = extFromContentType(contentType);
	const key = `covers/${torrentId}.${ext}`;
	await s3.send(
		new PutObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: key,
			Body: bytes,
			ContentType: contentType,
		}),
	);
	return key;
}

/** Join public base URL with key without a double slash. */
export function publicUrl(key: string): string {
	const base = env.S3_PUBLIC_URL.replace(/\/+$/, "");
	const path = key.replace(/^\/+/, "");
	return `${base}/${path}`;
}
