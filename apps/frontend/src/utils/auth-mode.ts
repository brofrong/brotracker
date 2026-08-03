export type AuthMode = "local" | "authentik";

export type AuthModeResponse = {
	mode: AuthMode;
	registrationOpen: boolean;
};

export async function fetchAuthMode(
	baseURL: string,
	fetchImpl: (
		input: string,
		init?: RequestInit,
	) => Promise<Response> = fetch,
): Promise<AuthModeResponse> {
	const root = baseURL.replace(/\/+$/, "");
	const url = `${root}/api/auth/mode`;
	const res = await fetchImpl(url, { credentials: "include" });
	if (!res.ok) {
		throw new Error(`Failed to fetch auth mode (${res.status})`);
	}
	return (await res.json()) as AuthModeResponse;
}
