import { defineRelations } from "drizzle-orm";
import { userTable } from "./user/user.schema";

export const relations = defineRelations({ user: userTable }, (r) => ({
	// user: {
	// 	invitee: r.one.users({
	// 		from: r.users.invitedBy,
	// 		to: r.users.id,
	// 	}),
	// 	posts: r.many.posts(),
	// }
}));
