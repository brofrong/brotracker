import z from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().default("./data/sqlite.db"),
	PORT: z.coerce.number().default(3101),
	RUTRACKER_LOGIN: z.string(),
	RUTRACKER_PASSWORD: z.string(),
	/** qBittorrent WebUI base URL (without /api/v2). */
	QBITTORRENT_URL: z.url().default("https://torrent.brofrong.ru"),
	/** qBittorrent WebAPI key (Bearer auth, qBittorrent >= 5.2). */
	QBITTORRENT_API_KEY: z.string(),
	/** Browser origin allowed to call the API (required when the frontend uses credentials). */
	CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
