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
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	authClient,
	getAuthBaseURL,
	redirectToAuthentikSignIn,
} from "#/shared/lib/auth-client";
import { fetchAuthMode } from "#/shared/lib/auth-mode";

export function LoginPage() {
	const { t } = useTranslation("auth");
	const navigate = useNavigate();
	const modeQuery = useQuery({
		queryKey: ["auth-mode"],
		queryFn: () => fetchAuthMode(getAuthBaseURL()),
	});

	if (modeQuery.isPending) {
		return (
			<Center height="100dvh" width="100%">
				<Spinner aria-label={t("login.loadingAria")} size="lg" />
			</Center>
		);
	}

	if (modeQuery.isError) {
		return (
			<Center height="100dvh" width="100%">
				<VStack gap={4} maxWidth={400} padding={6} width="100%">
					<Banner
						status="error"
						title={t("login.modeErrorTitle")}
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
					{t("login.brand")}
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
	const { t } = useTranslation("auth");

	useEffect(() => {
		void redirectToAuthentikSignIn();
	}, []);

	return (
		<Center height="100dvh" width="100%">
			<Spinner
				aria-label={t("login.authentikRedirectAria")}
				label={t("login.authentikRedirectLabel")}
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
	const { t } = useTranslation("auth");
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
			setError(t("login.passwordsMismatch"));
			return;
		}

		if (password.length < 8) {
			setError(t("login.passwordTooShort"));
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
					setError(result.error.message || t("login.signUpFailed"));
					return;
				}
			} else {
				const result = await authClient.signIn.email({
					email: email.trim(),
					password,
				});
				if (result.error) {
					setError(result.error.message || t("login.invalidCredentials"));
					return;
				}
			}
			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("login.authError"));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit}>
			<VStack gap={4} width="100%">
				<VStack gap={1}>
					<Heading level={2}>
						{registrationOpen ? t("login.signUpTitle") : t("login.signInTitle")}
					</Heading>
					<Text type="supporting">
						{registrationOpen
							? t("login.signUpDescription")
							: t("login.signInDescription")}
					</Text>
				</VStack>

				{error ? <Banner status="error" title={error} /> : null}

				<FormLayout>
					<TextInput
						label={t("login.email")}
						type="email"
						value={email}
						onChange={setEmail}
						isRequired
						width="100%"
					/>
					{registrationOpen ? (
						<TextInput
							label={t("login.name")}
							value={name}
							onChange={setName}
							isOptional
							placeholder={t("login.namePlaceholder")}
							width="100%"
						/>
					) : null}
					<TextInput
						label={t("login.password")}
						type="password"
						value={password}
						onChange={setPassword}
						isRequired
						width="100%"
					/>
					{registrationOpen ? (
						<TextInput
							label={t("login.confirmPassword")}
							type="password"
							value={confirmPassword}
							onChange={setConfirmPassword}
							isRequired
							width="100%"
						/>
					) : null}
				</FormLayout>

				<Button
					label={registrationOpen ? t("login.signUp") : t("login.signIn")}
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
