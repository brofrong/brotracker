"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { InputGroup, InputGroupText } from "@astryxdesign/core/InputGroup";
import {
	MetadataList,
	MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Switch } from "@astryxdesign/core/Switch";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient, signOutAndRedirect } from "#/shared/lib/auth-client";
import { env } from "#/shared/lib/env";
import { trpc } from "#/shared/lib/trpc";
import { LocaleToggle } from "#/shared/ui/LocaleToggle";
import { ThemeToggle } from "#/shared/ui/ThemeToggle";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

export type SettingsSection =
	| "account"
	| "appearance"
	| "rutracker"
	| "kinozal"
	| "qbittorrent"
	| "tmdb";

type TrackerProvider = "rutracker" | "kinozal";

export function SettingsPage({ section }: { section?: SettingsSection }) {
	const { t } = useTranslation("settings");

	useEffect(() => {
		if (!section) {
			return;
		}
		const el = document.getElementById(`settings-${section}`);
		el?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [section]);

	return (
		<Section padding={4} variant="transparent" height="100%">
			<Center axis="horizontal" height="100%" width="100%">
				<VStack gap={6} maxWidth={520} width="100%">
					<VStack gap={1} width="100%">
						<Heading level={1}>{t("title")}</Heading>
						<Text type="supporting">
							{t("buildVersion", { version: env.VITE_APP_VERSION })}
						</Text>
					</VStack>
					<AccountSettings highlighted={section === "account"} />
					<AppearanceSettings highlighted={section === "appearance"} />
					<TrackerProviderSettingsForm
						highlighted={section === "rutracker"}
						provider="rutracker"
					/>
					<TrackerProviderSettingsForm
						highlighted={section === "kinozal"}
						provider="kinozal"
					/>
					<QbittorrentSettingsForm highlighted={section === "qbittorrent"} />
					<TmdbSettingsForm highlighted={section === "tmdb"} />
				</VStack>
			</Center>
		</Section>
	);
}

function AccountSettings({ highlighted }: { highlighted: boolean }) {
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
		<form id="settings-account">
			<Card elevation={highlighted ? "med" : "low"} padding={5} width="100%">
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
		</form>
	);
}

function AppearanceSettings({ highlighted }: { highlighted: boolean }) {
	const { t } = useTranslation("settings");

	return (
		<form id="settings-appearance">
			<Card elevation={highlighted ? "med" : "low"} padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t("appearance.title")}</Heading>
						<Text type="supporting">{t("appearance.description")}</Text>
					</VStack>
					<ThemeToggle />
					<LocaleToggle />
				</VStack>
			</Card>
		</form>
	);
}

type StatusMessage = {
	status: "success" | "error";
	text: string;
} | null;

function SecretInput({
	label,
	value,
	onChange,
	placeholder,
	isRequired,
	revealLabel,
	hideLabel,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isRequired?: boolean;
	revealLabel: string;
	hideLabel: string;
}) {
	const [isVisible, setIsVisible] = useState(false);
	const toggleLabel = isVisible ? hideLabel : revealLabel;

	return (
		<InputGroup label={label} isRequired={isRequired} width="100%">
			<TextInput
				label={label}
				isLabelHidden
				type={isVisible ? "text" : "password"}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				width="100%"
			/>
			<InputGroupText>
				<IconButton
					label={toggleLabel}
					tooltip={toggleLabel}
					icon={isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
					variant="ghost"
					size="sm"
					type="button"
					onClick={() => setIsVisible((visible) => !visible)}
				/>
			</InputGroupText>
		</InputGroup>
	);
}

function TrackerProviderSettingsForm({
	provider,
	highlighted,
}: {
	provider: TrackerProvider;
	highlighted: boolean;
}) {
	const { t } = useTranslation(["settings", "common"]);
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		provider === "rutracker"
			? trpc.settings.providers.rutracker.get.queryOptions()
			: trpc.settings.providers.kinozal.get.queryOptions(),
	);

	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [proxyUrl, setProxyUrl] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [message, setMessage] = useState<StatusMessage>(null);

	useEffect(() => {
		if (!settingsQuery.data) {
			return;
		}
		setLogin(settingsQuery.data.login);
		setPassword(settingsQuery.data.password);
		setProxyUrl(settingsQuery.data.proxyUrl ?? "");
		setEnabled(settingsQuery.data.enabled);
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		...(provider === "rutracker"
			? trpc.settings.providers.rutracker.set.mutationOptions()
			: trpc.settings.providers.kinozal.set.mutationOptions()),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({
				queryKey:
					provider === "rutracker"
						? trpc.settings.providers.rutracker.get.queryKey()
						: trpc.settings.providers.kinozal.get.queryKey(),
			});
			setLogin(data.login);
			setPassword(data.password);
			setProxyUrl(data.proxyUrl ?? "");
			setEnabled(data.enabled);
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
		...(provider === "rutracker"
			? trpc.settings.providers.rutracker.test.mutationOptions()
			: trpc.settings.providers.kinozal.test.mutationOptions()),
		onSuccess: () => {
			setMessage({
				status: "success",
				text: t(`${provider}.testSuccess`),
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
			login: login.trim(),
			password,
			proxyUrl: proxyUrl.trim() === "" ? null : proxyUrl.trim(),
			enabled,
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label={t("loading", { ns: "common" })} />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title={t(`${provider}.loadFailed`)}
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = Boolean(settingsQuery.data?.password);
	const isBusy = saveMutation.isPending || testMutation.isPending;
	const canSave = Boolean(login.trim()) && Boolean(password.trim());

	return (
		<form id={`settings-${provider}`} onSubmit={onSubmit}>
			<Card elevation={highlighted ? "med" : "low"} padding={5} width="100%">
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>{t(`${provider}.title`)}</Heading>
						<Text type="supporting">{t(`${provider}.description`)}</Text>
					</VStack>

					<FormLayout>
						<Switch
							label={t("enabled")}
							description={t(`${provider}.enabledDescription`)}
							value={enabled}
							onChange={setEnabled}
							width="100%"
							labelSpacing="spread"
						/>
						<TextInput
							label={t(`${provider}.login`)}
							value={login}
							onChange={setLogin}
							isRequired
							width="100%"
						/>
						<SecretInput
							label={t(`${provider}.password`)}
							value={password}
							onChange={setPassword}
							isRequired
							revealLabel={t("showPassword", { ns: "common" })}
							hideLabel={t("hidePassword", { ns: "common" })}
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

function QbittorrentSettingsForm({ highlighted }: { highlighted: boolean }) {
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
		<form id="settings-qbittorrent" onSubmit={onSubmit}>
			<Card elevation={highlighted ? "med" : "low"} padding={5} width="100%">
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

function TmdbSettingsForm({ highlighted }: { highlighted: boolean }) {
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
		<form id="settings-tmdb" onSubmit={onSubmit}>
			<Card elevation={highlighted ? "med" : "low"} padding={5} width="100%">
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
