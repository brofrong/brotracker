import { TRPCClientError } from "@trpc/client";
import { redirectToAuthentikSignIn } from "./auth-client";

export type UnauthorizedRedirectDeps = {
	isBrowser: () => boolean;
	redirect: () => void | Promise<void>;
};

export function isUnauthorizedTrpcError(error: unknown): boolean {
	if (error instanceof TRPCClientError) {
		return error.data?.code === "UNAUTHORIZED";
	}
	if (
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		typeof (error as { data?: { code?: string } }).data?.code === "string"
	) {
		return (error as { data: { code: string } }).data.code === "UNAUTHORIZED";
	}
	return false;
}

export function createUnauthorizedRedirectPolicy(
	deps: UnauthorizedRedirectDeps,
) {
	let pending = false;

	async function redirectOnUnauthorized(): Promise<void> {
		if (pending || !deps.isBrowser()) {
			return;
		}
		pending = true;
		await deps.redirect();
	}

	function handleTrpcUnauthorized(error: unknown): boolean {
		if (!isUnauthorizedTrpcError(error)) {
			return false;
		}
		void redirectOnUnauthorized();
		return true;
	}

	return {
		redirectOnUnauthorized,
		handleTrpcUnauthorized,
	};
}

export const unauthorizedRedirect = createUnauthorizedRedirectPolicy({
	isBrowser: () => typeof window !== "undefined",
	redirect: redirectToAuthentikSignIn,
});
