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

const STATUS_LABEL: Record<WorkerLiveStatus, string> = {
	running: "Работает",
	idle: "Простаивает",
};

const RUN_STATUS_LABEL: Record<WorkerRunStatus, string> = {
	running: "Выполняется",
	succeeded: "Успешно",
	failed: "Ошибка",
};

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
	});
}

function lastRunSummary(lastRun: WorkerLastRun | null): string {
	if (!lastRun) {
		return "Ещё не запускался";
	}
	const when = formatTimestamp(lastRun.finishedAt ?? lastRun.startedAt);
	const outcome = RUN_STATUS_LABEL[lastRun.status];
	const detail = lastRun.summary ?? lastRun.error;
	if (detail) {
		return `${outcome} · ${when} · ${detail}`;
	}
	return `${outcome} · ${when}`;
}

export function WorkersPage() {
	const navigate = useNavigate();
	const toast = useToast();
	const queryClient = useQueryClient();

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
			toast({ body: "Воркер запущен" });
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || "Не удалось запустить",
			});
		},
	});

	const workers = listQuery.data ?? [];

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={6} width="100%">
				<VStack gap={1} width="100%">
					<Heading level={1}>Воркеры</Heading>
					<Text type="supporting">
						Фоновые задачи: статус, история запусков и ручной запуск
					</Text>
				</VStack>

				{listQuery.isLoading ? <Spinner label="Загрузка воркеров" /> : null}

				{listQuery.isError ? (
					<Banner
						description={listQuery.error.message}
						status="error"
						title="Не удалось загрузить воркеров"
					/>
				) : null}

				{!listQuery.isLoading && !listQuery.isError && workers.length === 0 ? (
					<EmptyState
						description="Зарегистрированные воркеры появятся здесь."
						title="Нет воркеров"
					/>
				) : null}

				{!listQuery.isLoading && !listQuery.isError && workers.length > 0 ? (
					<List density="compact" hasDividers>
						{workers.map((worker) => {
							const statusLabel = STATUS_LABEL[worker.status];
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
												{lastRunSummary(worker.lastRun)}
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
												label="Запустить"
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
