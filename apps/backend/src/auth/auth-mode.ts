export type AuthMode = "local" | "authentik";

export function resolveAuthMode(input: {
	AUTHENTIK_CLIENT_ID?: string | undefined;
}): AuthMode {
	const id = input.AUTHENTIK_CLIENT_ID?.trim();
	return id ? "authentik" : "local";
}

export function buildAuthModeResponse(input: {
	mode: AuthMode;
	userCount: number;
}): { mode: AuthMode; registrationOpen: boolean } {
	return {
		mode: input.mode,
		registrationOpen: input.mode === "local" && input.userCount === 0,
	};
}

/** Throws if local bootstrap registration must stay closed. */
export function assertLocalSignUpAllowed(userCount: number): void {
	if (userCount > 0) {
		throw new Error("Registration is closed");
	}
}
