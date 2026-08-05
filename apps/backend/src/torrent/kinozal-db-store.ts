import {
	cookiesToHeader,
	fileStoreSchema,
	type FileStore,
	type FileStoreData,
	type StoredCookie,
} from "@brotracker/rutracker-ts/tracker/storage/file-store";
import { eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { db } from "../db/db";
import { kinozalStore } from "../db/kinozal-store/kinozal-store.schema";

const STORE_ID = "default";

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
	const expiresMs =
		cookie.expires < 1e12 ? cookie.expires * 1000 : cookie.expires;
	return expiresMs < Date.now();
}

/** Postgres-backed FileStore for Kinozal session/CF cookies. */
export function createKinozalDbStore(): FileStore {
	async function read(): Promise<Result<FileStoreData, Error>> {
		try {
			const rows = await db
				.select({ data: kinozalStore.data })
				.from(kinozalStore)
				.where(eq(kinozalStore.id, STORE_ID))
				.limit(1);
			const row = rows[0];
			if (!row) {
				return ok(emptyStore());
			}
			const parsed = fileStoreSchema.safeParse(row.data);
			if (!parsed.success) {
				return err(
					new Error(`Invalid kinozal store: ${parsed.error.message}`),
				);
			}
			return ok(parsed.data);
		} catch (error) {
			return err(new Error(`Failed to read kinozal store: ${error}`));
		}
	}

	async function write(data: FileStoreData): Promise<Result<void, Error>> {
		try {
			const parsed = fileStoreSchema.parse({
				...data,
				updatedAt: Date.now(),
			});
			const now = new Date();
			await db
				.insert(kinozalStore)
				.values({ id: STORE_ID, data: parsed, updatedAt: now })
				.onConflictDoUpdate({
					target: kinozalStore.id,
					set: { data: parsed, updatedAt: now },
				});
			return ok(undefined);
		} catch (error) {
			return err(new Error(`Failed to write kinozal store: ${error}`));
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
		path: "db:kinozal_store",
	};
}
