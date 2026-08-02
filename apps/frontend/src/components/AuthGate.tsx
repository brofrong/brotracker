"use client";

import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { authClient } from "#/utils/auth-client";
import { unauthorizedRedirect } from "#/utils/unauthorized-redirect";

type GateStatus = "checking" | "authenticated" | "redirecting";

const STATUS_COPY = {
	checking: {
		title: "Проверяем сессию",
		description: "Сейчас убедимся, что вы авторизованы",
		ariaLabel: "Проверка авторизации",
	},
	redirecting: {
		title: "Переходим к входу",
		description: "Открываем страницу авторизации",
		ariaLabel: "Перенаправление на страницу входа",
	},
} as const;

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
	}, []);

	if (status === "authenticated") {
		return children;
	}

	const copy = STATUS_COPY[status];

	return (
		<Center height="100dvh" width="100%">
			<VStack gap={8} hAlign="center" maxWidth={280} padding={6} width="100%">
				<Heading justify="center" level={1} type="display-3">
					BroTracker
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
