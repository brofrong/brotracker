"use client";

import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "#/shared/lib/auth-client";
import { unauthorizedRedirect } from "#/shared/lib/unauthorized-redirect";

type GateStatus = "checking" | "authenticated" | "redirecting";

export function AuthGate({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation("auth");
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const [status, setStatus] = useState<GateStatus>("checking");

	useEffect(() => {
		if (pathname === "/login") {
			return;
		}

		let cancelled = false;

		async function ensureSession() {
			try {
				const session = await authClient.getSession();
				if (cancelled) return;

				if (!session.data?.session) {
					setStatus("redirecting");
					await unauthorizedRedirect.redirectOnUnauthorized();
					return;
				}

				setStatus("authenticated");
			} catch {
				if (cancelled) return;
				setStatus("redirecting");
				await unauthorizedRedirect.redirectOnUnauthorized();
			}
		}

		void ensureSession();

		return () => {
			cancelled = true;
		};
	}, [pathname]);

	if (pathname === "/login") {
		return children;
	}

	if (status === "authenticated") {
		return children;
	}

	const copy =
		status === "checking"
			? {
					title: t("gate.checkingTitle"),
					description: t("gate.checkingDescription"),
					ariaLabel: t("gate.checkingAria"),
				}
			: {
					title: t("gate.redirectingTitle"),
					description: t("gate.redirectingDescription"),
					ariaLabel: t("gate.redirectingAria"),
				};

	return (
		<Center height="100dvh" width="100%">
			<VStack gap={8} hAlign="center" maxWidth={280} padding={6} width="100%">
				<Heading justify="center" level={1} type="display-3">
					{t("login.brand")}
				</Heading>

				<Spinner
					aria-label={copy.ariaLabel}
					label={
						<VStack gap={0} hAlign="center">
							<Text type="body" weight="semibold">
								{copy.title}
							</Text>
							<Text color="secondary" justify="center" type="supporting">
								{copy.description}
							</Text>
						</VStack>
					}
					size="lg"
				/>
			</VStack>
		</Center>
	);
}
