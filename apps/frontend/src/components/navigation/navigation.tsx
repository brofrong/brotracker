"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import {
	SideNav,
	SideNavHeading,
	SideNavItem,
	SideNavSection,
} from "@astryxdesign/core/SideNav";
import { HStack } from "@astryxdesign/core/Stack";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, LogOut, Search, Settings } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { ThemeToggle } from "#/components/ThemeToggle";
import { authClient, redirectToAuthentikSignIn } from "#/utils/auth-client";

type SideNavLinkProps = ComponentPropsWithoutRef<"a"> & {
	href?: string;
};

const SideNavLink = forwardRef<HTMLAnchorElement, SideNavLinkProps>(
	function SideNavLink({ href, ...props }, ref) {
		return <Link ref={ref} to={href ?? "/"} {...props} />;
	},
);

export default function Navigation() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	async function handleSignOut() {
		await authClient.signOut();
		await redirectToAuthentikSignIn();
	}

	return (
		<SideNav
			header={<SideNavHeading heading="BroTracker" />}
			footer={
				<HStack gap={1}>
					<ThemeToggle />
					<IconButton
						variant="ghost"
						label="Sign out"
						tooltip="Sign out"
						icon={<LogOut />}
						onClick={() => {
							void handleSignOut();
						}}
					/>
				</HStack>
			}
		>
			<SideNavSection title="Действия">
				<SideNavItem
					as={SideNavLink}
					label="Поиск"
					href="/"
					icon={Search}
					isSelected={pathname === "/"}
				/>
				<SideNavItem
					as={SideNavLink}
					label="Торренты"
					href="/torrents"
					icon={Download}
					isSelected={pathname === "/torrents"}
				/>
				<SideNavItem
					as={SideNavLink}
					label="Настройки"
					href="/settings"
					icon={Settings}
					isSelected={pathname === "/settings"}
				/>
			</SideNavSection>
		</SideNav>
	);
}
