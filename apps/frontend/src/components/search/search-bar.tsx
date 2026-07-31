"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useState, type FormEvent } from "react";

export type SearchSource = "local" | "tracker";

type SearchBarProps = {
	initialQuery?: string;
	isSearching?: boolean;
	searchingSource?: SearchSource;
	onSearch: (query: string, source: SearchSource) => void;
};

export const SearchBar = ({
	initialQuery = "",
	isSearching = false,
	searchingSource,
	onSearch,
}: SearchBarProps) => {
	const [query, setQuery] = useState(initialQuery);
	const canSearch = query.trim().length > 0;

	useEffect(() => {
		setQuery(initialQuery);
	}, [initialQuery]);

	const submit = (source: SearchSource) => {
		const trimmed = query.trim();
		if (!trimmed) return;
		onSearch(trimmed, source);
	};

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		submit("local");
	};

	return (
		<form onSubmit={onSubmit}>
			<HStack gap={2} vAlign="end" width="100%">
				<StackItem size="fill">
					<TextInput
						label="Поиск"
						isLabelHidden
						value={query}
						onChange={setQuery}
						placeholder="Поиск..."
						startIcon="search"
						hasClear
						width="100%"
					/>
				</StackItem>
				<Button
					label="Локально"
					type="submit"
					variant="secondary"
					isDisabled={!canSearch || isSearching}
					isLoading={isSearching && searchingSource === "local"}
				/>
				<Button
					label="Трекер"
					type="button"
					variant="primary"
					isDisabled={!canSearch || isSearching}
					isLoading={isSearching && searchingSource === "tracker"}
					onClick={() => submit("tracker")}
				/>
			</HStack>
		</form>
	);
};
