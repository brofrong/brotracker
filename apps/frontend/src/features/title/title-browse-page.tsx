"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { skipToken, useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { SearchBar } from "#/components/search/search-bar";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard, type TitleCardData } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

function getNextPageParam(last: { page: number; totalPages: number }) {
	return last.page < last.totalPages ? last.page + 1 : undefined;
}

export function TitleBrowsePage({ q }: { q?: string }) {
	const navigate = useNavigate({ from: "/title/" });
	const query = q?.trim() ?? "";
	const hasQuery = query.length > 0;

	const trendingQuery = useInfiniteQuery(
		trpc.title.trending.infiniteQueryOptions(hasQuery ? skipToken : {}, {
			getNextPageParam,
			initialCursor: 1,
		}),
	);

	const searchQuery = useInfiniteQuery(
		trpc.title.search.infiniteQueryOptions(hasQuery ? { query } : skipToken, {
			getNextPageParam,
			initialCursor: 1,
		}),
	);

	const active = hasQuery ? searchQuery : trendingQuery;

	const items = useMemo((): TitleCardData[] => {
		const pages = active.data?.pages;
		if (!pages) {
			return [];
		}
		return pages.flatMap((page) => page.items);
	}, [active.data?.pages]);

	const sentinelRef = useRef<HTMLDivElement>(null);
	const fetchNextPage = active.fetchNextPage;
	const hasNextPage = active.hasNextPage;
	const isFetchingNextPage = active.isFetchingNextPage;

	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || !hasNextPage || isFetchingNextPage) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void fetchNextPage();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const handleSearch = (next: string) => {
		void navigate({ search: { q: next }, replace: true });
	};

	const handleClear = () => {
		void navigate({ search: { q: undefined }, replace: true });
	};

	const showInitialSpinner = active.isLoading && items.length === 0;
	const showError = active.isError && items.length === 0;
	const showEmpty =
		!showInitialSpinner && !showError && active.isSuccess && items.length === 0;
	const isTmdbUnavailable = showError && active.error.message.includes("TMDB");

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				<Heading level={1}>Фильмы и сериалы</Heading>
				<SearchBar
					initialQuery={query}
					isSearching={showInitialSpinner}
					onClear={handleClear}
					onSearch={handleSearch}
					placeholder="Название фильма или сериала"
				/>

				{showInitialSpinner ? <Spinner label="Загрузка" /> : null}

				{isTmdbUnavailable ? (
					<Banner
						container="section"
						description="Укажите API key TMDB в настройках, чтобы искать фильмы и сериалы."
						endContent={
							<Button
								label="Открыть настройки"
								onClick={() =>
									void navigate({
										to: "/settings",
										search: { section: "tmdb" },
									})
								}
								variant="secondary"
							/>
						}
						status="warning"
						title="TMDB недоступен"
					/>
				) : null}

				{showError && !isTmdbUnavailable ? (
					<EmptyState
						description={active.error.message}
						title="Не удалось загрузить"
					/>
				) : null}

				{showEmpty ? (
					<EmptyState
						description={
							hasQuery
								? "Попробуйте другое название"
								: "Сейчас нет трендов — попробуйте поиск"
						}
						title={hasQuery ? "Ничего не найдено" : "Пока пусто"}
					/>
				) : null}

				{items.length > 0 ? (
					<VStack gap={4} width="100%">
						<Heading level={2}>
							{hasQuery ? "Результаты поиска" : "В тренде сегодня"}
						</Heading>
						<Grid columns={{ minWidth: 176, max: 6 }} gap={3} width="100%">
							{items.map((item) => (
								<TitleCard key={item.titleId} item={item} />
							))}
						</Grid>
						{hasNextPage || isFetchingNextPage ? (
							<Center height={48} ref={sentinelRef} width="100%">
								{isFetchingNextPage ? (
									<Spinner aria-label="Загрузка ещё" size="sm" />
								) : null}
							</Center>
						) : null}
						<TmdbAttribution compact />
					</VStack>
				) : null}
			</VStack>
		</Section>
	);
}
