import { db } from "../db/db";
import { titleLinks } from "../db/title/title-link.schema";

export async function upsertLink(key: string, titleId: string): Promise<void> {
	await db
		.insert(titleLinks)
		.values({
			key,
			titleId,
		})
		.onConflictDoUpdate({
			target: titleLinks.key,
			set: {
				titleId,
				updatedAt: new Date(),
			},
		});
}

export async function loadAllLinks(): Promise<Record<string, string>> {
	const rows = await db.select().from(titleLinks);
	const links: Record<string, string> = {};
	for (const row of rows) {
		links[row.key] = row.titleId;
	}
	return links;
}
