import z from "zod";

const envSchema = z.object({
	DATABASE_URL: z
		.string()
		.default("postgresql://brotracker:brotracker@localhost:5432/brotracker"),
	PORT: z.coerce.number().default(3101),
	RUTRACKER_LOGIN: z.string(),
	RUTRACKER_PASSWORD: z.string(),
	/** qBittorrent WebUI base URL (without /api/v2). */
	QBITTORRENT_URL: z.url().default("https://torrent.brofrong.ru"),
	/** qBittorrent WebAPI key (Bearer auth, qBittorrent >= 5.2). */
	QBITTORRENT_API_KEY: z.string(),
	/** Browser origin allowed to call the API (required when the frontend uses credentials). */
	CORS_ORIGIN: z.string().default("http://localhost:3100"),
	S3_ENDPOINT: z.string().default("http://localhost:9000"),
	S3_ACCESS_KEY: z.string().default("minioadmin"),
	S3_SECRET_KEY: z.string().default("minioadmin"),
	S3_BUCKET: z.string().default("brotracker"),
	S3_PUBLIC_URL: z.string().default("http://localhost:9000/brotracker"),
});

export const env = envSchema.parse(process.env);
