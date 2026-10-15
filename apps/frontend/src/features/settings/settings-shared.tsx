"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import { InputGroup, InputGroupText } from "@astryxdesign/core/InputGroup";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export type StatusMessage = {
	status: "success" | "error";
	text: string;
} | null;

export function SecretInput({
	label,
	value,
	onChange,
	placeholder,
	isRequired,
	revealLabel,
	hideLabel,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isRequired?: boolean;
	revealLabel: string;
	hideLabel: string;
}) {
	const [isVisible, setIsVisible] = useState(false);
	const toggleLabel = isVisible ? hideLabel : revealLabel;

	return (
		<InputGroup label={label} isRequired={isRequired}>
			<TextInput
				label={label}
				isLabelHidden
				type={isVisible ? "text" : "password"}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				width="100%"
			/>
			<InputGroupText>
				<IconButton
					label={toggleLabel}
					tooltip={toggleLabel}
					icon={isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
					variant="ghost"
					size="sm"
					type="button"
					onClick={() => setIsVisible((visible) => !visible)}
				/>
			</InputGroupText>
		</InputGroup>
	);
}
