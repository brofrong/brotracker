"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { type FormEvent, useEffect, useState } from "react";

type SearchBarProps = {
	initialQuery?: string;
	isSearching?: boolean;
	placeholder?: string;
	onSearch: (query: string) => void;
	/** Called when the field is cleared (e.g. clear button). */
	onClear?: () => void;
};

export const SearchBar = ({
	initialQuery = "",
	isSearching = false,
	placeholder = "Поиск...",
	onSearch,
	onClear,
}: SearchBarProps) => {
	const [query, setQuery] = useState(initialQuery);
	const canSearch = query.trim().length > 0;

	useEffect(() => {
		setQuery(initialQuery);
	}, [initialQuery]);

	const submit = () => {
		const trimmed = query.trim();
		if (!trimmed) return;
		onSearch(trimmed);
	};

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		submit();
	};

	const handleChange = (value: string) => {
		setQuery(value);
		if (!value.trim()) {
			onClear?.();
		}
	};

	return (
		<form onSubmit={onSubmit}>
			<HStack gap={2} vAlign="end" width="100%">
				<StackItem size="fill">
					<TextInput
						label="Поиск"
						isLabelHidden
						value={query}
						onChange={handleChange}
						placeholder={placeholder}
						startIcon="search"
						hasClear
						width="100%"
					/>
				</StackItem>
				<Button
					label="Найти"
					type="submit"
					variant="primary"
					isDisabled={!canSearch}
					isLoading={isSearching}
				/>
			</HStack>
		</form>
	);
};
