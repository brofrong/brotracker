"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "#/shared/lib/trpc";
import type { StatusMessage } from "./settings-shared";

const CHECK_INTERVAL_HOURS = [1, 2, 4, 6, 12, 24] as const;
type CheckIntervalHours = (typeof CHECK_INTERVAL_HOURS)[number];

const MIN_RESOLUTIONS = ["720p", "1080p", "4K"] as const;
type MinResolution = (typeof MIN_RESOLUTIONS)[number];

export function WatchlistSettings() {
	const { t } = useTranslation(["settings", "common"]);
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(trpc.settings.watchlist.get.queryOptions());

	const [intervalHours, setIntervalHours] = useState<string>("24");
	const [minResolution, setMinResolution] = useState<string>("1080p");
	const [hdrOnly, setHdrOnly] = useState(false);
	const [requireRussianVoice, setRequireRussianVoice] = useState(true);
	const [message, setMessage] = useState<StatusMessage>(null);

	useEffect(() => {
		if (!settingsQuery.data) {
			return;
		}
		setIntervalHours(String(settingsQuery.data.checkIntervalHours));
		setMinResolution(settingsQuery.data.minResolution);
		setHdrOnly(settingsQuery.data.hdrOnly);
		setRequireRussianVoice(settingsQuery.data.requireRussianVoice);
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		...trpc.settings.watchlist.set.mutationOptions(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.settings.watchlist.get.queryKey(),
			});
			setIntervalHours(String(data.checkIntervalHours));
			setMinResolution(data.minResolution);
			setHdrOnly(data.hdrOnly);
			setRequireRussianVoice(data.requireRussianVoice);
			setMessage({ status: "success", text: t("saved", { ns: "common" }) });
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || t("saveFailed", { ns: "common" }),
			});
		},
	});

	const intervalOptions = CHECK_INTERVAL_HOURS.map((hours) => ({
		value: String(hours),
		label: t("watchlist.hours", { count: hours }),
	}));

	const resolutionOptions = MIN_RESOLUTIONS.map((resolution) => ({
		value: resolution,
		label: resolution,
	}));

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setMessage(null);
		saveMutation.mutate({
			checkIntervalHours: Number(intervalHours) as CheckIntervalHours,
			minResolution: minResolution as MinResolution,
			hdrOnly,
			requireRussianVoice,
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title={t("watchlist.loadFailed")}
				description={settingsQuery.error.message}
			/>
		);
	}

	return (
		<form onSubmit={onSubmit}>
			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<FormLayout>
						<Selector
							label={t("watchlist.interval")}
							options={intervalOptions}
							value={intervalHours}
							onChange={setIntervalHours}
							width="100%"
						/>
						<Selector
							label={t("watchlist.minResolution")}
							options={resolutionOptions}
							value={minResolution}
							onChange={setMinResolution}
							width="100%"
						/>
						<Switch
							label={t("watchlist.hdrOnly")}
							value={hdrOnly}
							onChange={setHdrOnly}
							labelSpacing="spread"
							width="100%"
						/>
						<Switch
							label={t("watchlist.requireVoice")}
							value={requireRussianVoice}
							onChange={setRequireRussianVoice}
							labelSpacing="spread"
							width="100%"
						/>
					</FormLayout>

					<Text type="supporting">{t("watchlist.camripNote")}</Text>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}

					<HStack gap={2} wrap="wrap">
						<Button
							label={t("save", { ns: "common" })}
							type="submit"
							variant="primary"
							isLoading={saveMutation.isPending}
							isDisabled={saveMutation.isPending}
						/>
					</HStack>
				</VStack>
			</Card>
		</form>
	);
}
