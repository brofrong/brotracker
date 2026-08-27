import type {
	FetchPersonOutcome,
	PersonDeps,
	PersonView,
} from "./person.types";

export function createPersonModule(deps: PersonDeps) {
	return {
		async get(input: {
			tmdbId: number;
			language?: string;
		}): Promise<{ status: "ok" | "error"; person?: PersonView }> {
			const language = input.language ?? "ru-RU";
			const outcome: FetchPersonOutcome = await deps.fetchPerson(
				input.tmdbId,
				language,
			);

			if (outcome.status === "ok") {
				return { status: "ok", person: outcome.person };
			}
			return { status: "error" };
		},
	};
}

export type PersonModule = ReturnType<typeof createPersonModule>;
