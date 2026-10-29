"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { useEntryAnimation } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useTheme } from "@astryxdesign/core/theme";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { trpc } from "#/shared/lib/trpc";

import {
	confettiColors,
	nextAction,
	parseCssDuration,
	rulesSummary,
	type TitleWatchState,
	type WaitButtonState,
	waitButtonState,
	type WaitStage,
} from "./wait-state";

const CONFETTI_COLOR_TOKENS = [
	"--color-data-categorical-blue",
	"--color-data-categorical-orange",
	"--color-data-categorical-purple",
	"--color-data-categorical-green",
	"--color-data-categorical-pink",
	"--color-data-categorical-teal",
] as const;

const FALLBACK_DURATION_MS = 400;
const FALLBACK_EASING = "ease-out";
const PARTICLE_COUNT = 40;
const VIBRATE_MS = 15;

const STAGE_BADGE_VARIANT: Record<WaitStage, "blue" | "purple" | "green"> = {
	downloading: "blue",
	tracking: "purple",
	completed: "green",
};

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/** Tap feedback for «Жду»: squeeze + ring, confetti burst, a short vibration. */
function celebrate(element: HTMLElement, token: (name: string) => string) {
	animateButton(element, token("--color-accent"), token("--spacing-3"));
	void burstConfetti(
		element,
		confettiColors(token, CONFETTI_COLOR_TOKENS),
	).catch(() => undefined);
	if (!prefersReducedMotion()) {
		navigator.vibrate?.(VIBRATE_MS);
	}
}

/** Squeeze-and-spring plus an expanding accent ring, timed by the theme's motion tokens. */
function animateButton(element: HTMLElement, accent: string, ring: string) {
	if (prefersReducedMotion() || typeof element.animate !== "function") {
		return;
	}
	const computed = getComputedStyle(element);
	const duration = parseCssDuration(
		computed.getPropertyValue("--duration-medium"),
		FALLBACK_DURATION_MS,
	);
	const easing =
		computed.getPropertyValue("--ease-standard").trim() || FALLBACK_EASING;
	const ringFrom = `0 0 0 0 color-mix(in srgb, ${accent} 55%, transparent)`;
	const ringTo = `0 0 0 ${ring} color-mix(in srgb, ${accent} 0%, transparent)`;

	element.animate(
		[
			{ transform: "scale(1)", boxShadow: ringFrom },
			{ transform: "scale(0.92)", offset: 0.25 },
			{ transform: "scale(1.06)", offset: 0.6 },
			{ transform: "scale(1)", boxShadow: ringTo },
		],
		{ duration, easing },
	);
}

async function burstConfetti(element: HTMLElement, colors: string[]) {
	if (typeof window === "undefined") {
		return;
	}
	const { default: confetti } = await import("canvas-confetti");
	const rect = element.getBoundingClientRect();
	await confetti({
		particleCount: PARTICLE_COUNT,
		spread: 70,
		startVelocity: 25,
		scalar: 0.7,
		ticks: 120,
		origin: {
			x: (rect.left + rect.width / 2) / window.innerWidth,
			y: (rect.top + rect.height / 2) / window.innerHeight,
		},
		colors: colors.length > 0 ? colors : undefined,
		disableForReducedMotion: true,
	});
}

function WaitHint() {
	const { t } = useTranslation("title");
	const entryStyle = useEntryAnimation("fadeIn");
	const settingsQuery = useQuery(trpc.settings.watchlist.get.queryOptions());

	if (!settingsQuery.data) {
		return null;
	}

	return (
		<Text type="supporting" xstyle={entryStyle ?? undefined}>
			{t("wait.hint", {
				hours: settingsQuery.data.checkIntervalHours,
				rules: rulesSummary(settingsQuery.data, t),
			})}
		</Text>
	);
}

export function WaitButton({
	titleId,
	watch,
	isFullWidth,
}: {
	titleId: string;
	watch: { id: string; watch: TitleWatchState } | null;
	isFullWidth: boolean;
}) {
	const { t } = useTranslation(["title", "watchlist"]);
	const { token } = useTheme();
	const toast = useToast();
	const queryClient = useQueryClient();
	const buttonRef = useRef<HTMLButtonElement>(null);
	// Synchronous guard: two taps in one frame must not create two watch rows.
	const inFlightRef = useRef(false);
	// Optimistic state while a request is in flight; cleared once title.get refetched.
	const [optimistic, setOptimistic] = useState<"add" | "waiting" | null>(null);

	const refreshTitle = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.title.get.queryKey({ id: titleId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.title.watchlist.queryKey(),
			}),
		]);

	const waitMutation = useMutation({
		...trpc.title.wait.mutationOptions(),
		onSuccess: refreshTitle,
		onError: (error) => {
			toast({ type: "error", body: error.message });
		},
		onSettled: () => {
			inFlightRef.current = false;
			setOptimistic(null);
		},
	});

	const removeMutation = useMutation({
		...trpc.title.watchlistRemove.mutationOptions(),
		onSuccess: async () => {
			waitMutation.reset();
			await refreshTitle();
		},
		onError: (error) => {
			toast({ type: "error", body: error.message });
		},
		onSettled: () => {
			inFlightRef.current = false;
			setOptimistic(null);
		},
	});

	// The wait result bridges the gap if title.get has not caught up yet.
	const current =
		watch && watch.watch !== "off" ? watch : (waitMutation.data ?? watch);
	const state: WaitButtonState = optimistic
		? { kind: optimistic }
		: waitButtonState(current);
	const isBusy = waitMutation.isPending || removeMutation.isPending;
	const width = isFullWidth ? "100%" : undefined;

	if (state.kind === "stage") {
		return (
			<VStack hAlign="start">
				<Badge
					label={t(`stage.${state.stage}`, { ns: "watchlist" })}
					variant={STAGE_BADGE_VARIANT[state.stage]}
				/>
			</VStack>
		);
	}

	const onClick = () => {
		if (isBusy || inFlightRef.current) {
			return;
		}
		const action = nextAction(state);
		if (action === "wait") {
			inFlightRef.current = true;
			setOptimistic("waiting");
			const element = buttonRef.current;
			if (element) {
				celebrate(element, token);
			}
			waitMutation.mutate({ id: titleId });
		} else if (action === "remove" && current) {
			inFlightRef.current = true;
			setOptimistic("add");
			removeMutation.mutate({ id: current.id });
		}
	};

	const isWaiting = state.kind === "waiting";

	return (
		<VStack gap={1} hAlign={isFullWidth ? "stretch" : "start"} width={width}>
			<Button
				aria-busy={isBusy}
				aria-disabled={isBusy}
				icon={<Icon icon={isWaiting ? Hourglass : Plus} size="sm" />}
				label={isWaiting ? t("wait.active") : t("wait.add")}
				onClick={onClick}
				ref={buttonRef}
				variant={isWaiting ? "secondary" : "primary"}
				width={width}
			/>
			{isWaiting ? <WaitHint /> : null}
		</VStack>
	);
}
