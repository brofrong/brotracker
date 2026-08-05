"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	authClient,
	getAuthBaseURL,
	redirectToAuthentikSignIn,
} from "#/shared/lib/auth-client";
import { fetchAuthMode } from "#/shared/lib/auth-mode";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const modeQuery = useQuery({
		queryKey: ["auth-mode"],
		queryFn: () => fetchAuthMode(getAuthBaseURL()),
	});

	if (modeQuery.isPending) {
		return (
			<Center height="100dvh" width="100%">
				<Spinner aria-label="Загрузка" size="lg" />
			</Center>
		);
	}

	if (modeQuery.isError) {
		return (
			<Center height="100dvh" width="100%">
				<VStack gap={4} maxWidth={400} padding={6} width="100%">
					<Banner
						status="error"
						title="Не удалось определить режим авторизации"
						description={modeQuery.error.message}
					/>
				</VStack>
			</Center>
		);
	}

	const { mode, registrationOpen } = modeQuery.data;

	if (mode === "authentik") {
		return <AuthentikRedirect />;
	}

	return (
		<Center height="100dvh" width="100%">
			<VStack gap={4} maxWidth={400} padding={6} width="100%">
				<Heading justify="center" level={1} type="display-3">
					torrent-manager
				</Heading>
				<Card elevation="low" padding={8} width="100%">
					<LocalAuthForm
						registrationOpen={registrationOpen}
						onSuccess={() => {
							void navigate({ to: "/" });
						}}
					/>
				</Card>
			</VStack>
		</Center>
	);
}

function AuthentikRedirect() {
	useEffect(() => {
		void redirectToAuthentikSignIn();
	}, []);

	return (
		<Center height="100dvh" width="100%">
			<Spinner
				aria-label="Перенаправление на Authentik"
				label="Открываем Authentik"
				size="lg"
			/>
		</Center>
	);
}

function LocalAuthForm({
	registrationOpen,
	onSuccess,
}: {
	registrationOpen: boolean;
	onSuccess: () => void;
}) {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);

		if (registrationOpen && password !== confirmPassword) {
			setError("Пароли не совпадают");
			return;
		}

		if (password.length < 8) {
			setError("Пароль должен быть не короче 8 символов");
			return;
		}

		setIsSubmitting(true);
		try {
			if (registrationOpen) {
				const result = await authClient.signUp.email({
					email: email.trim(),
					password,
					name: name.trim() || email.trim(),
				});
				if (result.error) {
					setError(result.error.message || "Не удалось зарегистрироваться");
					return;
				}
			} else {
				const result = await authClient.signIn.email({
					email: email.trim(),
					password,
				});
				if (result.error) {
					setError(result.error.message || "Неверный email или пароль");
					return;
				}
			}
			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Ошибка авторизации");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit}>
			<VStack gap={4} width="100%">
				<VStack gap={1}>
					<Heading level={2}>
						{registrationOpen ? "Создать аккаунт" : "Вход"}
					</Heading>
					<Text type="supporting">
						{registrationOpen
							? "Первый пользователь становится администратором"
							: "Войдите с email и паролем"}
					</Text>
				</VStack>

				{error ? <Banner status="error" title={error} /> : null}

				<FormLayout>
					<TextInput
						label="Email"
						type="email"
						value={email}
						onChange={setEmail}
						isRequired
						width="100%"
					/>
					{registrationOpen ? (
						<TextInput
							label="Имя"
							value={name}
							onChange={setName}
							isOptional
							placeholder="Как к вам обращаться"
							width="100%"
						/>
					) : null}
					<TextInput
						label="Пароль"
						type="password"
						value={password}
						onChange={setPassword}
						isRequired
						width="100%"
					/>
					{registrationOpen ? (
						<TextInput
							label="Подтверждение пароля"
							type="password"
							value={confirmPassword}
							onChange={setConfirmPassword}
							isRequired
							width="100%"
						/>
					) : null}
				</FormLayout>

				<Button
					label={registrationOpen ? "Зарегистрироваться" : "Войти"}
					type="submit"
					variant="primary"
					width="100%"
					isLoading={isSubmitting}
					isDisabled={
						!email.trim() || !password || (registrationOpen && !confirmPassword)
					}
				/>
			</VStack>
		</form>
	);
}
