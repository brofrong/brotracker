"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocale } from "#/shared/i18n/locale-provider";
import { trpc } from "#/shared/lib/trpc";

type WorkerLiveStatus = "running" | "idle";

type WorkerRunStatus = "running" | "succeeded" | "failed";

type WorkerLastRun = {
	status: WorkerRunStatus;
	startedAt: string | Date;
	finishedAt: string | Date | null;
	summary: string | null;
	error: string | null;
};

function formatTimestamp(
	value: string | Date | null | undefined,
	bcp47: string,
	emDash: string,
): string {
	if (value == null) {
		return emDash;
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return emDash;
	}
	return date.toLocaleString(bcp47, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function lastRunSummary(
	lastRun: WorkerLastRun | null,
	t: TFunction<"workers">,
	bcp47: string,
	emDash: string,
): string {
	if (!lastRun) {
		return t("list.neverRun");
	}
	const when = formatTimestamp(
		lastRun.finishedAt ?? lastRun.startedAt,
		bcp47,
		emDash,
	);
	const outcome = t(`runStatus.${lastRun.status}`);
	const detail = lastRun.summary ?? lastRun.error;
	if (detail) {
		return t("list.lastRunWithDetail", { outcome, when, detail });
	}
	return t("list.lastRun", { outcome, when });
}

export function WorkersPage() {
	const navigate = useNavigate();
	const toast = useToast();
	const queryClient = useQueryClient();
	const { t } = useTranslation("workers");
	const { t: tCommon } = useTranslation("common");
	const { bcp47 } = useLocale();

	const listQuery = useQuery({
		...trpc.workers.list.queryOptions(),
		refetchInterval: (query) => {
			const workers = query.state.data;
			if (!workers) {
				return false;
			}
			return workers.some((worker) => worker.status === "running")
				? 2000
				: false;
		},
	});

	const runMutation = useMutation({
		...trpc.workers.run.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: trpc.workers.list.queryKey(),
			});
			toast({ body: t("list.started") });
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || t("list.startFailed"),
			});
		},
	});

	const workers = listQuery.data ?? [];
	const emDash = tCommon("emDash");

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={6} width="100%">
				<VStack gap={1} width="100%">
					<Heading level={1}>{t("list.title")}</Heading>
					<Text type="supporting">{t("list.subtitle")}</Text>
				</VStack>

				{listQuery.isLoading ? <Spinner label={t("list.loading")} /> : null}

				{listQuery.isError ? (
					<Banner
						description={listQuery.error.message}
						status="error"
						title={t("list.loadFailed")}
					/>
				) : null}

				{!listQuery.isLoading && !listQuery.isError && workers.length === 0 ? (
					<EmptyState
						description={t("list.emptyDescription")}
						title={t("list.emptyTitle")}
					/>
				) : null}

				{!listQuery.isLoading && !listQuery.isError && workers.length > 0 ? (
					<List density="compact" hasDividers>
						{workers.map((worker) => {
							const statusLabel = t(
								`status.${worker.status as WorkerLiveStatus}`,
							);
							const isRunning = worker.status === "running";
							const isThisPending =
								runMutation.isPending &&
								runMutation.variables?.workerId === worker.id;

							return (
								<ListItem
									key={worker.id}
									description={
										<VStack gap={0}>
											<Text type="supporting">{worker.description}</Text>
											<Text type="supporting">
												{lastRunSummary(worker.lastRun, t, bcp47, emDash)}
											</Text>
										</VStack>
									}
									endContent={
										<HStack gap={3} vAlign="center">
											<HStack gap={2} vAlign="center">
												<StatusDot
													isPulsing={isRunning}
													label={statusLabel}
													variant={isRunning ? "accent" : "neutral"}
												/>
												<Text type="supporting">{statusLabel}</Text>
											</HStack>
											<Button
												isDisabled={isRunning || runMutation.isPending}
												isLoading={isThisPending}
												label={t("list.run")}
												onClick={(event) => {
													event.stopPropagation();
													runMutation.mutate({ workerId: worker.id });
												}}
												size="sm"
												variant="secondary"
											/>
										</HStack>
									}
									label={worker.name}
									onClick={() =>
										void navigate({
											to: "/workers/$id",
											params: { id: worker.id },
										})
									}
								/>
							);
						})}
					</List>
				) : null}
			</VStack>
		</Section>
	);
}
