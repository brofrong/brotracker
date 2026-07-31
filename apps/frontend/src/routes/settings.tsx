"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import z from "zod";
import { ThemeToggle } from "#/components/ThemeToggle";
import { env } from "#/utils/env";
import { trpc } from "#/utils/trpc";

const settingsSearchSchema = z.object({
	section: z.enum(["appearance", "rutracker", "qbittorrent"]).optional(),
});

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
	validateSearch: settingsSearchSchema,
});

function SettingsPage() {
	const { section } = Route.useSearch();

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
						<Heading level={1}>Настройки</Heading>
						<Text type="supporting">
							Версия сборки {env.VITE_APP_VERSION}
						</Text>
					</VStack>
					<AppearanceSettings highlighted={section === "appearance"} />
					<RutrackerSettingsForm highlighted={section === "rutracker"} />
					<QbittorrentSettingsForm
						highlighted={section === "qbittorrent"}
					/>
				</VStack>
			</Center>
		</Section>
	);
}

function AppearanceSettings({ highlighted }: { highlighted: boolean }) {
	return (
		<form id="settings-appearance">
			<Card
				elevation={highlighted ? "med" : "low"}
				padding={5}
				width="100%"
			>
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>Оформление</Heading>
						<Text type="supporting">
							Тема интерфейса: светлая, тёмная или как в системе
						</Text>
					</VStack>
					<ThemeToggle />
				</VStack>
			</Card>
		</form>
	);
}

type StatusMessage = {
	status: "success" | "error";
	text: string;
} | null;

function RutrackerSettingsForm({ highlighted }: { highlighted: boolean }) {
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		trpc.settings.providers.rutracker.get.queryOptions(),
	);

	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [proxyUrl, setProxyUrl] = useState("");
	const [message, setMessage] = useState<StatusMessage>(null);

	useEffect(() => {
		if (!settingsQuery.data) {
			return;
		}
		setLogin(settingsQuery.data.login);
		setPassword(settingsQuery.data.password);
		setProxyUrl(settingsQuery.data.proxyUrl ?? "");
	}, [settingsQuery.data]);

	const saveMutation = useMutation({
		...trpc.settings.providers.rutracker.set.mutationOptions(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.settings.providers.rutracker.get.queryKey(),
			});
			setLogin(data.login);
			setProxyUrl(data.proxyUrl ?? "");
			setMessage({ status: "success", text: "Сохранено" });
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || "Не удалось сохранить",
			});
		},
	});

	const testMutation = useMutation({
		...trpc.settings.providers.rutracker.test.mutationOptions(),
		onSuccess: () => {
			setMessage({ status: "success", text: "Подключение к Rutracker успешно" });
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || "Проверка не удалась",
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
		});
	};

	if (settingsQuery.isLoading) {
		return <Spinner label="Загрузка" />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title="Не удалось загрузить настройки Rutracker"
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = Boolean(settingsQuery.data?.hasPassword);
	const isBusy = saveMutation.isPending || testMutation.isPending;

	return (
		<form id="settings-rutracker" onSubmit={onSubmit}>
			<Card
				elevation={highlighted ? "med" : "low"}
				padding={5}
				width="100%"
			>
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>Rutracker</Heading>
						<Text type="supporting">
							Учётные данные и прокси для поиска на трекере
						</Text>
					</VStack>

					<FormLayout>
						<TextInput
							label="Login"
							value={login}
							onChange={setLogin}
							isRequired
							width="100%"
						/>
						<InputGroup label="Password" isRequired>
							<TextInput
								label="Password"
								isLabelHidden
								type={showPassword ? "text" : "password"}
								value={password}
								onChange={setPassword}
								width="100%"
							/>
							<IconButton
								label={showPassword ? "Скрыть пароль" : "Показать пароль"}
								icon={showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
								variant="ghost"
								type="button"
								onClick={() => setShowPassword((visible) => !visible)}
							/>
						</InputGroup>
						<TextInput
							label="Proxy"
							value={proxyUrl}
							onChange={setProxyUrl}
							isOptional
							placeholder="socks5://user:pass@host:1080"
							description="http://, https:// или socks5://, с optional user:pass@"
							width="100%"
						/>
					</FormLayout>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}

					<HStack gap={2} wrap="wrap">
						<Button
							label="Сохранить"
							type="submit"
							variant="primary"
							isLoading={saveMutation.isPending}
							isDisabled={!login.trim() || !password.trim() || isBusy}
						/>
						<Button
							label="Проверить"
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
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);

	const [url, setUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [showApiKey, setShowApiKey] = useState(false);
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
			setMessage({ status: "success", text: "Сохранено" });
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || "Не удалось сохранить",
			});
		},
	});

	const testMutation = useMutation({
		...trpc.settings.providers.qbittorrent.test.mutationOptions(),
		onSuccess: (data) => {
			setMessage({
				status: "success",
				text: `Подключение успешно (qBittorrent ${data.version}, торрентов: ${data.torrentCount})`,
			});
		},
		onError: (error) => {
			setMessage({
				status: "error",
				text: error.message || "Проверка не удалась",
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
		return <Spinner label="Загрузка" />;
	}

	if (settingsQuery.isError) {
		return (
			<Banner
				status="error"
				title="Не удалось загрузить настройки qBittorrent"
				description={settingsQuery.error.message}
			/>
		);
	}

	const canTest = Boolean(settingsQuery.data?.isConfigured);
	const isBusy = saveMutation.isPending || testMutation.isPending;

	return (
		<form id="settings-qbittorrent" onSubmit={onSubmit}>
			<Card
				elevation={highlighted ? "med" : "low"}
				padding={5}
				width="100%"
			>
				<VStack gap={4} width="100%">
					<VStack gap={1}>
						<Heading level={2}>qBittorrent</Heading>
						<Text type="supporting">
							WebUI, API key и пути сохранения для фильмов и сериалов
						</Text>
					</VStack>

					<FormLayout>
						<TextInput
							label="URL"
							value={url}
							onChange={setUrl}
							isRequired
							placeholder="https://torrent.example.com"
							description="Базовый URL WebUI без /api/v2"
							width="100%"
						/>
						<InputGroup label="API key" isRequired>
							<TextInput
								label="API key"
								isLabelHidden
								type={showApiKey ? "text" : "password"}
								value={apiKey}
								onChange={setApiKey}
								width="100%"
							/>
							<IconButton
								label={showApiKey ? "Скрыть ключ" : "Показать ключ"}
								icon={showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
								variant="ghost"
								type="button"
								onClick={() => setShowApiKey((visible) => !visible)}
							/>
						</InputGroup>
						<TextInput
							label="Путь для фильмов"
							value={filmsPath}
							onChange={setFilmsPath}
							placeholder="/data/media/movies"
							description="Куда qBittorrent будет сохранять фильмы"
							width="100%"
						/>
						<TextInput
							label="Путь для сериалов"
							value={seriesPath}
							onChange={setSeriesPath}
							placeholder="/data/media/tv"
							description="Куда qBittorrent будет сохранять сериалы"
							width="100%"
						/>
					</FormLayout>

					{message ? (
						<Banner status={message.status} title={message.text} />
					) : null}

					<HStack gap={2} wrap="wrap">
						<Button
							label="Сохранить"
							type="submit"
							variant="primary"
							isLoading={saveMutation.isPending}
							isDisabled={!url.trim() || !apiKey.trim() || isBusy}
						/>
						<Button
							label="Проверить"
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
