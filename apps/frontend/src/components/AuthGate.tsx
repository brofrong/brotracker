"use client";

import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { useEffect, useState } from "react";
import { authClient, redirectToAuthentikSignIn } from "#/utils/auth-client";

type GateStatus = "checking" | "authenticated" | "redirecting";

export function AuthGate({ children }: { children: React.ReactNode }) {
	const [status, setStatus] = useState<GateStatus>("checking");

	useEffect(() => {
		let cancelled = false;

		async function ensureSession() {
			try {
				const session = await authClient.getSession();
				if (cancelled) return;

				if (!session.data?.session) {
					setStatus("redirecting");
					await redirectToAuthentikSignIn();
					return;
				}

				setStatus("authenticated");
			} catch {
				if (cancelled) return;
				setStatus("redirecting");
				await redirectToAuthentikSignIn();
			}
		}

		void ensureSession();

		return () => {
			cancelled = true;
		};
	}, []);

	if (status === "authenticated") {
		return children;
	}

	return (
		<VStack height="100%" vAlign="center" hAlign="center" gap={3}>
			<Spinner
				size="lg"
				label="Signing in…"
				aria-label="Checking authentication"
			/>
		</VStack>
	);
}
