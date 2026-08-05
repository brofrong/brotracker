"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
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
import { Link, useNavigate } from "@tanstack/react-router";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useState,
} from "react";
import { trpc } from "#/shared/lib/trpc";
import { RunLogPanel } from "./run-log";

type WorkerLiveStatus = "running" | "idle";

type WorkerRunStatus = "running" | "succeeded" | "failed";

type WorkerRunTrigger = "scheduled" | "manual";

const STATUS_LABEL: Record<WorkerLiveStatus, string> = {
	running: "Работает",
	idle: "Простаивает",
};

const RUN_STATUS_LABEL: Record<WorkerRunStatus, string> = {
	running: "Выполняется",
	succeeded: "Успешно",
	failed: "Ошибка",
};

const RUN_STATUS_VARIANT: Record<
	WorkerRunStatus,
	"accent" | "success" | "error"
> = {
	running: "accent",
	succeeded: "success",
	failed: "error",
};

const TRIGGER_LABEL: Record<WorkerRunTrigger, string> = {
	scheduled: "По расписанию",
	manual: "Вручную",
};

type RouterLinkProps = ComponentPropsWithoutRef<"a"> & {
	href?: string;
};

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
	function RouterLink({ href, ...props }, ref) {
		return <Link ref={ref} to={href ?? "/"} {...props} />;
	},
);

function formatTimestamp(value: string | Date | null | undefined): string {
	if (value == null) {
		return "—";
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	return date.toLocaleString("ru-RU", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function toMillis(value: string | Date): number {
	const date = value instanceof Date ? value : new Date(value);
	return date.getTime();
}

function formatDuration(
	startedAt: string | Date,
	finishedAt: string | Date | null,
): string {
	const start = toMillis(startedAt);
	if (Number.isNaN(start)) {
		return "—";
	}
	const end =
		finishedAt != null ? toMillis(finishedAt) : Date.now();
	if (Number.isNaN(end)) {
		return "—";
	}
	const ms = Math.max(0, end - start);
	if (ms < 1000) {
		return `${ms} мс`;
	}
	const totalSec = Math.round(ms / 1000);
	if (totalSec < 60) {
		return `${totalSec} с`;
	}
	const minutes = Math.floor(totalSec / 60);
	const seconds = totalSec % 60;
	if (minutes < 60) {
		return seconds === 0 ? `${minutes} мин` : `${minutes} мин ${seconds} с`;
	}
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	return remMinutes === 0 ? `${hours} ч` : `${hours} ч ${remMinutes} мин`;
}

type WorkerDetailPageProps = {
	id: string;
};

export function WorkerDetailPage({ id }: WorkerDetailPageProps) {
	const navigate = useNavigate();
	const toast = useToast();
	const queryClient = useQueryClient();
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

	const workerQuery = useQuery({
		...trpc.workers.get.queryOptions({ id }),
		refetchInterval: (query) =>
			query.state.data?.status === "running" ? 2000 : false,
	});

	const runsQuery = useQuery({
		...trpc.workers.listRuns.queryOptions({ workerId: id }),
		refetchInterval: (query) => {
			if (workerQuery.data?.status === "running") {
				return 2000;
			}
			const runs = query.state.data;
			if (!runs) {
				return false;
			}
			return runs.some((run) => run.status === "running") ? 2000 : false;
		},
	});

	const selectedListRun =
		runsQuery.data?.find((run) => run.id === selectedRunId) ?? null;

	const runQuery = useQuery({
		...trpc.workers.getRun.queryOptions({
			runId: selectedRunId ?? "",
		}),
		enabled: selectedRunId != null,
		refetchInterval: (query) => {
			if (query.state.data?.status === "running") {
				return 2000;
			}
			if (selectedListRun?.status === "running") {
				return 2000;
			}
			return false;
		},
	});

	const runMutation = useMutation({
		...trpc.workers.run.mutationOptions(),
		onSuccess: async (run) => {
			setSelectedRunId(run.id);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.workers.get.queryKey({ id }),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.workers.listRuns.queryKey({ workerId: id }),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.workers.list.queryKey(),
				}),
			]);
			toast({ body: "Воркер запущен" });
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || "Не удалось запустить",
			});
		},
	});

	const runs = runsQuery.data ?? [];
	const worker = workerQuery.data;

	useEffect(() => {
		if (selectedRunId != null) {
			const stillExists = runs.some((run) => run.id === selectedRunId);
			if (!stillExists && runs.length > 0) {
				setSelectedRunId(runs[0]?.id ?? null);
			}
			return;
		}
		if (runs[0]) {
			setSelectedRunId(runs[0].id);
		}
	}, [runs, selectedRunId]);

	const selectedRun = runQuery.data ?? selectedListRun;
	const isWorkerRunning = worker?.status === "running";
	const statusLabel = worker ? STATUS_LABEL[worker.status] : "";

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={6} width="100%">
				<VStack gap={3} width="100%">
					<Breadcrumbs label="Навигация" variant="supporting">
						<BreadcrumbItem as={RouterLink} href="/workers">
							Воркеры
						</BreadcrumbItem>
						<BreadcrumbItem isCurrent>
							{worker?.name ?? id}
						</BreadcrumbItem>
					</Breadcrumbs>

					{workerQuery.isLoading ? (
						<Spinner label="Загрузка воркера" />
					) : null}

					{workerQuery.isError ? (
						<Banner
							description={workerQuery.error.message}
							status="error"
							title="Не удалось загрузить воркера"
						/>
					) : null}

					{worker ? (
						<HStack gap={4} hAlign="between" vAlign="start" width="100%" wrap="wrap">
							<VStack gap={1}>
								<Heading level={1}>{worker.name}</Heading>
								<Text type="supporting">{worker.description}</Text>
							</VStack>
							<HStack gap={3} vAlign="center">
								<HStack gap={2} vAlign="center">
									<StatusDot
										isPulsing={isWorkerRunning}
										label={statusLabel}
										variant={isWorkerRunning ? "accent" : "neutral"}
									/>
									<Text type="supporting">{statusLabel}</Text>
								</HStack>
								<Button
									isDisabled={isWorkerRunning || runMutation.isPending}
									isLoading={runMutation.isPending}
									label="Запустить"
									onClick={() => runMutation.mutate({ workerId: id })}
									size="sm"
									variant="secondary"
								/>
							</HStack>
						</HStack>
					) : null}
				</VStack>

				{runsQuery.isLoading ? <Spinner label="Загрузка истории" /> : null}

				{runsQuery.isError ? (
					<Banner
						description={runsQuery.error.message}
						status="error"
						title="Не удалось загрузить историю запусков"
					/>
				) : null}

				{!runsQuery.isLoading && !runsQuery.isError && runs.length === 0 ? (
					<EmptyState
						description="Запустите воркера вручную или дождитесь расписания."
						title="Нет запусков"
					/>
				) : null}

				{!runsQuery.isLoading && !runsQuery.isError && runs.length > 0 ? (
					<VStack gap={6} width="100%">
						<VStack gap={3} width="100%">
							<Heading level={2}>История запусков</Heading>
							<List density="compact" hasDividers>
								{runs.map((run) => {
									const runStatusLabel = RUN_STATUS_LABEL[run.status];
									const isRunning = run.status === "running";
									const duration = formatDuration(
										run.startedAt,
										run.finishedAt,
									);
									const summary =
										run.summary ?? run.error ?? "Без сводки";

									return (
										<ListItem
											key={run.id}
											description={
												<VStack gap={0}>
													<Text type="supporting">
														{TRIGGER_LABEL[run.trigger]} · {duration}
													</Text>
													<Text type="supporting">{summary}</Text>
												</VStack>
											}
											endContent={
												<HStack gap={2} vAlign="center">
													<StatusDot
														isPulsing={isRunning}
														label={runStatusLabel}
														variant={RUN_STATUS_VARIANT[run.status]}
													/>
													<Text type="supporting">{runStatusLabel}</Text>
												</HStack>
											}
											isSelected={run.id === selectedRunId}
											label={formatTimestamp(run.startedAt)}
											onClick={() => setSelectedRunId(run.id)}
										/>
									);
								})}
							</List>
						</VStack>

						<VStack gap={3} width="100%">
							{selectedRunId == null ? (
								<EmptyState
									description="Нажмите на строку в истории, чтобы открыть журнал."
									title="Выберите запуск"
								/>
							) : runQuery.isError && selectedRun == null ? (
								<Banner
									description={runQuery.error.message}
									status="error"
									title="Не удалось загрузить журнал"
								/>
							) : runQuery.isLoading && selectedRun == null ? (
								<Spinner label="Загрузка журнала" />
							) : selectedRun ? (
								<RunLogPanel
									lines={selectedRun.log}
									title={`Журнал · ${formatTimestamp(selectedRun.startedAt)}`}
								/>
							) : null}
						</VStack>
					</VStack>
				) : null}

				{workerQuery.isError ? (
					<Button
						label="К воркерам"
						onClick={() => void navigate({ to: "/workers" })}
						variant="secondary"
					/>
				) : null}
			</VStack>
		</Section>
	);
}
