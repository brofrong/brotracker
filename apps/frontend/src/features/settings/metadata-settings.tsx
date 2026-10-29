"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { trpc } from "#/shared/lib/trpc";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

import { SecretInput, type StatusMessage } from "./settings-shared";

export function MetadataSettings() {
	const { t } = useTranslation(["settings", "common"]);
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		trpc.settings.providers.tmdb.get.queryOptions(),
	);

	const [apiKey, setApiKey] = useState("");
	const [proxyUrl, setProxyUrl] = useState("");
	const [message, setMessage] = useState<StatusMessage>(null);

	useEffect(() => {
		if (!settingsQuery.data) {
			return;
		}
		setApiKey(settingsQuery.data.apiKey);
		setProxyUrl(settingsQuery.data.proxyUrl ?? "");
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		...trpc.settings.providers.tmdb.set.mutationOptions(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.settings.providers.tmdb.get.queryKey(),
			});
			setApiKey(data.apiKey);
			setProxyUrl(data.proxyUrl ?? "");
			setMessage({ status: "success", text: t("saved", { ns: "common" }) });
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || t("saveFailed", { ns: "common" }),
			});
		},
	});

	const testMutation = useMutation({
		...trpc.settings.providers.tmdb.test.mutationOptions(),
		onSuccess: () => {
			setMessage({
				status: "success",
				text: t("tmdb.testSuccess"),
			});
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || t("testFailed", { ns: "common" }),
			});
		},
	});

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setMessage(null);
		saveMutation.mutate({
			apiKey,
			proxyUrl: proxyUrl.trim() === "" ? null : proxyUrl.trim(),
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title={t("tmdb.loadFailed")}
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = Boolean(settingsQuery.data?.isConfigured);
	const isBusy = saveMutation.isPending || testMutation.isPending;
	const canSave =
		Boolean(apiKey.trim()) || Boolean(settingsQuery.data?.isConfigured);

	return (
		<form onSubmit={onSubmit}>
			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t("tmdb.title")}</Heading>
						<Text type="supporting">{t("tmdb.description")}</Text>
					</VStack>

					<FormLayout>
						<SecretInput
							label={t("apiKey", { ns: "common" })}
							value={apiKey}
							onChange={setApiKey}
							isRequired={!settingsQuery.data?.isConfigured}
							revealLabel={t("showKey", { ns: "common" })}
							hideLabel={t("hideKey", { ns: "common" })}
							placeholder={
								settingsQuery.data?.isConfigured
									? t("tmdb.apiKeyLeaveBlank")
									: undefined
							}
						/>
						<TextInput
							label={t("proxy", { ns: "common" })}
							value={proxyUrl}
							onChange={setProxyUrl}
							isOptional
							placeholder={t("proxyPlaceholder", { ns: "common" })}
							description={t("proxyDescription", { ns: "common" })}
							width="100%"
						/>
					</FormLayout>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}

					<TmdbAttribution />

					<HStack gap={2} wrap="wrap">
						<Button
							label={t("save", { ns: "common" })}
							type="submit"
							variant="primary"
							isLoading={saveMutation.isPending}
							isDisabled={!canSave || isBusy}
						/>
						<Button
							label={t("test", { ns: "common" })}
							type="button"
							variant="secondary"
							isLoading={testMutation.isPending}
							isDisabled={!canTest || isBusy}
							onClick={() => {
								setMessage(null);
								testMutation.mutate();
							}}
						/>
					</HStack>
				</VStack>
			</Card>
		</form>
	);
}
