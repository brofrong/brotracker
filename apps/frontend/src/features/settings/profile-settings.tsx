"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import {
	MetadataList,
	MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient, signOutAndRedirect } from "#/shared/lib/auth-client";
import { env } from "#/shared/lib/env";
import { LocaleToggle } from "#/shared/ui/LocaleToggle";
import { ThemeToggle } from "#/shared/ui/ThemeToggle";

export function ProfileSettings() {
	const { t } = useTranslation(["settings", "common"]);
	const sessionQuery = useQuery({
		queryKey: ["auth", "session"],
		queryFn: async () => {
			const result = await authClient.getSession();
			if (result.error) {
				throw new Error(result.error.message || t("account.sessionLoadFailed"));
			}
			return result.data;
		},
	});

	if (sessionQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (sessionQuery.isError) {
		return (
			<Banner
				status="error"
				title={t("account.userLoadFailed")}
				description={sessionQuery.error.message}
			/>
		);
	}

	const user = sessionQuery.data?.user;

	return (
		<VStack gap={6} width="100%">
			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t("account.title")}</Heading>
						<Text type="supporting">{t("account.description")}</Text>
					</VStack>

					{user ? (
						<HStack gap={3} vAlign="center" width="100%">
							<Avatar
								name={user.name}
								src={user.image ?? undefined}
								size="lg"
							/>
							<StackItem size="fill">
								<MetadataList>
									<MetadataListItem label={t("account.name")}>
										{user.name}
									</MetadataListItem>
									<MetadataListItem label={t("account.email")}>
										{user.email}
									</MetadataListItem>
								</MetadataList>
							</StackItem>
						</HStack>
					) : (
						<Banner
							status="warning"
							title={t("account.userNotFoundTitle")}
							description={t("account.userNotFoundDescription")}
						/>
					)}

					<Button
						label={t("account.signOut")}
						variant="secondary"
						type="button"
						clickAction={() => signOutAndRedirect()}
					/>
				</VStack>
			</Card>

			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t("appearance.title")}</Heading>
						<Text type="supporting">{t("appearance.description")}</Text>
					</VStack>
					<ThemeToggle />
					<LocaleToggle />
				</VStack>
			</Card>

			<VStack gap={1} width="100%">
				<Text type="supporting">
					{t("buildVersion", { version: env.VITE_APP_VERSION })}
				</Text>
			</VStack>
		</VStack>
	);
}
