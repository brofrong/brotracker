import { resolveTmdbCredentials } from "../settings/provider-settings";
import { createFetchTmdbPerson } from "./fetch-tmdb-person";
import { createPersonModule } from "./person";

export const personModule = createPersonModule({
	fetchPerson: createFetchTmdbPerson(resolveTmdbCredentials),
});

export { createPersonModule } from "./person";
export type {
	FetchPersonOutcome,
	PersonCredit,
	PersonView,
} from "./person.types";
