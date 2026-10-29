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

import { SecretInput, type StatusMessage } from "./settings-shared";

export function DownloadsSettings() {
	const { t } = useTranslation(["settings", "common"]);
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);

	const [url, setUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [filmsPath, setFilmsPath] = useState("");
	const [seriesPath, setSeriesPath] = useState("");
	const [message, setMessage] = useState<StatusMessage>(null);

	useEffect(() => {
		if (!settingsQuery.data) {
			return;
		}
		setUrl(settingsQuery.data.url);
		setApiKey(settingsQuery.data.apiKey);
		setFilmsPath(settingsQuery.data.filmsPath);
		setSeriesPath(settingsQuery.data.seriesPath);
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		...trpc.settings.providers.qbittorrent.set.mutationOptions(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.settings.providers.qbittorrent.get.queryKey(),
			});
			setUrl(data.url);
			setApiKey(data.apiKey);
			setFilmsPath(data.filmsPath);
			setSeriesPath(data.seriesPath);
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
		...trpc.settings.providers.qbittorrent.test.mutationOptions(),
		onSuccess: (data) => {
			setMessage({
				status: "success",
				text: t("qbittorrent.testSuccess", {
					version: data.version,
					torrentCount: data.torrentCount,
				}),
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
			url: url.trim(),
			apiKey,
			filmsPath: filmsPath.trim(),
			seriesPath: seriesPath.trim(),
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title={t("qbittorrent.loadFailed")}
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = Boolean(settingsQuery.data?.isConfigured);
	const isBusy = saveMutation.isPending || testMutation.isPending;
	const canSave = Boolean(url.trim()) && Boolean(apiKey.trim());

	return (
		<form onSubmit={onSubmit}>
			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t("qbittorrent.title")}</Heading>
						<Text type="supporting">{t("qbittorrent.description")}</Text>
					</VStack>

					<FormLayout>
						<TextInput
							label={t("qbittorrent.url")}
							value={url}
							onChange={setUrl}
							isRequired
							placeholder={t("qbittorrent.urlPlaceholder")}
							description={t("qbittorrent.urlDescription")}
							width="100%"
						/>
						<SecretInput
							label={t("apiKey", { ns: "common" })}
							value={apiKey}
							onChange={setApiKey}
							isRequired
							revealLabel={t("showKey", { ns: "common" })}
							hideLabel={t("hideKey", { ns: "common" })}
						/>
						<TextInput
							label={t("qbittorrent.filmsPath")}
							value={filmsPath}
							onChange={setFilmsPath}
							placeholder={t("qbittorrent.filmsPathPlaceholder")}
							description={t("qbittorrent.filmsPathDescription")}
							width="100%"
						/>
						<TextInput
							label={t("qbittorrent.seriesPath")}
							value={seriesPath}
							onChange={setSeriesPath}
							placeholder={t("qbittorrent.seriesPathPlaceholder")}
							description={t("qbittorrent.seriesPathDescription")}
							width="100%"
						/>
					</FormLayout>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}

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
