import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";

export const storedCookieSchema = z.object({
	name: z.string(),
	value: z.string(),
	domain: z.string().optional(),
	path: z.string().optional(),
	expires: z.number().nullable().optional(),
	httpOnly: z.boolean().optional(),
	secure: z.boolean().optional(),
});

export type StoredCookie = z.infer<typeof storedCookieSchema>;

export const fileStoreSchema = z.object({
	cfClearance: storedCookieSchema.nullable().default(null),
	sessionCookies: z.array(storedCookieSchema).default([]),
	userAgent: z.string().nullable().default(null),
	updatedAt: z.number().nullable().default(null),
});

export type FileStoreData = z.infer<typeof fileStoreSchema>;

export type FileStore = {
	read: () => Promise<Result<FileStoreData, Error>>;
	write: (data: FileStoreData) => Promise<Result<void, Error>>;
	update: (
		patch: Partial<FileStoreData>,
	) => Promise<Result<FileStoreData, Error>>;
	getCookieHeader: () => Promise<Result<string, Error>>;
	path: string;
};

const emptyStore = (): FileStoreData =>
	fileStoreSchema.parse({
		cfClearance: null,
		sessionCookies: [],
		userAgent: null,
		updatedAt: null,
	});

function isExpired(cookie: StoredCookie): boolean {
	if (cookie.expires == null || cookie.expires <= 0) {
		return false;
	}
	// Puppeteer/Chrome and Byparr use unix seconds for expires
	const expiresMs =
		cookie.expires < 1e12 ? cookie.expires * 1000 : cookie.expires;
	return expiresMs < Date.now();
}

export function cookiesToHeader(cookies: StoredCookie[]): string {
	return cookies
		.filter((c) => !isExpired(c))
		.map((c) => `${c.name}=${c.value}`)
		.join("; ");
}

export function createFileStore(filePath: string): FileStore {
	async function read(): Promise<Result<FileStoreData, Error>> {
		try {
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				return ok(emptyStore());
			}
			const raw = await file.json();
			const parsed = fileStoreSchema.safeParse(raw);
			if (!parsed.success) {
				return err(
					new Error(`Invalid file store schema: ${parsed.error.message}`),
				);
			}
			return ok(parsed.data);
		} catch (error) {
			return err(new Error(`Failed to read file store: ${error}`));
		}
	}

	async function write(data: FileStoreData): Promise<Result<void, Error>> {
		try {
			const parsed = fileStoreSchema.parse({
				...data,
				updatedAt: Date.now(),
			});
			await mkdir(dirname(filePath), { recursive: true });
			await Bun.write(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
			return ok(undefined);
		} catch (error) {
			return err(new Error(`Failed to write file store: ${error}`));
		}
	}

	async function update(
		patch: Partial<FileStoreData>,
	): Promise<Result<FileStoreData, Error>> {
		const current = await read();
		if (current.isErr()) {
			return err(current.error);
		}
		const next = fileStoreSchema.parse({
			...current.value,
			...patch,
			updatedAt: Date.now(),
		});
		const saved = await write(next);
		if (saved.isErr()) {
			return err(saved.error);
		}
		return ok(next);
	}

	async function getCookieHeader(): Promise<Result<string, Error>> {
		const data = await read();
		if (data.isErr()) {
			return err(data.error);
		}
		const cookies: StoredCookie[] = [...data.value.sessionCookies];
		if (data.value.cfClearance && !isExpired(data.value.cfClearance)) {
			cookies.unshift(data.value.cfClearance);
		}
		return ok(cookiesToHeader(cookies));
	}

	return {
		read,
		write,
		update,
		getCookieHeader,
		path: filePath,
	};
}
