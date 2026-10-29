"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { KINOZAL_MIRRORS } from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SecretInput, type StatusMessage } from "./settings-shared";
import {
	TrackerDiagnostics,
	type TrackerDiagnosticsResult,
} from "./tracker-diagnostics";
import {
	type TrackerEntry,
	trackerSettingsApi,
	type TrackerSettingsData,
} from "./tracker-registry";

export function TrackerForm({ tracker }: { tracker: TrackerEntry }) {
	const { t } = useTranslation(["settings", "common"]);
	const queryClient = useQueryClient();
	const api = trackerSettingsApi(tracker.id);
	const settingsQuery = useQuery<TrackerSettingsData>(api.queryOptions());

	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [proxyUrl, setProxyUrl] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [autoHost, setAutoHost] = useState(true);
	const [host, setHost] = useState("");
	const [message, setMessage] = useState<StatusMessage>(null);
	const [diagnostics, setDiagnostics] =
		useState<TrackerDiagnosticsResult | null>(null);

	const applyData = useCallback((data: TrackerSettingsData) => {
		setLogin(data.login ?? "");
		setPassword(data.password ?? "");
		setProxyUrl(data.proxyUrl ?? "");
		setEnabled(data.enabled);
		if (typeof data.autoHost === "boolean") {
			setAutoHost(data.autoHost);
		}
		if ("host" in data) {
			setHost(data.host ?? "");
		}
	}, []);

	useEffect(() => {
		if (settingsQuery.data) {
			applyData(settingsQuery.data);
		}
	}, [settingsQuery.data, applyData]);

	const saveMutation = useMutation({
		...api.saveOptions(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({ queryKey: api.queryKey() });
			applyData(data);
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
		...api.testOptions(),
		onSuccess: (result) => {
			setDiagnostics(result);
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
		setDiagnostics(null);
		saveMutation.mutate({
			proxyUrl: proxyUrl.trim() === "" ? null : proxyUrl.trim(),
			enabled,
			...(tracker.credentials ? { login: login.trim(), password } : {}),
			...(tracker.mirrors ? { autoHost, host: host || null } : {}),
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title={t(`${tracker.id}.loadFailed`)}
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = tracker.credentials
		? Boolean(settingsQuery.data?.password)
		: true;
	const isBusy = saveMutation.isPending || testMutation.isPending;
	const canSave = tracker.credentials
		? Boolean(login.trim()) && Boolean(password.trim())
		: true;

	return (
		<form onSubmit={onSubmit}>
			<Card elevation="low" padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t(`${tracker.id}.title`)}</Heading>
						<Text type="supporting">{t(`${tracker.id}.description`)}</Text>
					</VStack>

					<FormLayout>
						<Switch
							label={t("enabled")}
							description={t(`${tracker.id}.enabledDescription`)}
							value={enabled}
							onChange={setEnabled}
							width="100%"
							labelSpacing="spread"
						/>
						{tracker.credentials ? (
							<>
								<TextInput
									label={t(`${tracker.id}.login`)}
									value={login}
									onChange={setLogin}
									isRequired
									width="100%"
								/>
								<SecretInput
									label={t(`${tracker.id}.password`)}
									value={password}
									onChange={setPassword}
									isRequired
									revealLabel={t("showPassword", { ns: "common" })}
									hideLabel={t("hidePassword", { ns: "common" })}
								/>
							</>
						) : null}
						<TextInput
							label={t("proxy", { ns: "common" })}
							value={proxyUrl}
							onChange={setProxyUrl}
							isOptional
							placeholder={t("proxyPlaceholder", { ns: "common" })}
							description={t("proxyDescription", { ns: "common" })}
							width="100%"
						/>
						{tracker.mirrors ? (
							<>
								<Switch
									label={t("kinozal.autoHost")}
									description={t("kinozal.autoHostDescription")}
									value={autoHost}
									onChange={setAutoHost}
									width="100%"
									labelSpacing="spread"
								/>
								<Selector
									label={t("kinozal.host")}
									options={KINOZAL_MIRRORS.map((mirror) => ({
										value: mirror.url,
										label: mirror.label,
									}))}
									value={host}
									onChange={setHost}
									isDisabled={autoHost}
									disabledMessage={t("kinozal.hostDisabled")}
									placeholder={t("kinozal.hostPlaceholder")}
									description={t("kinozal.hostDescription")}
									width="100%"
								/>
							</>
						) : null}
					</FormLayout>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}
					{diagnostics ? <TrackerDiagnostics result={diagnostics} /> : null}

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
								setDiagnostics(null);
								testMutation.mutate();
							}}
						/>
					</HStack>
				</VStack>
			</Card>
		</form>
	);
}
