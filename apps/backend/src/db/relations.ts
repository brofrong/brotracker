import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, () => ({
	// Example (RQB v2):
	// users: {
	// 	invitee: r.one.users({
	// 		from: r.users.invitedBy,
	// 		to: r.users.id,
	// 	}),
	// },
}));
