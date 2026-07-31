"use client";

import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import {
	SideNav,
	SideNavCollapseButton,
	SideNavHeading,
	SideNavItem,
	SideNavRenderContext,
	SideNavSection,
} from "@astryxdesign/core/SideNav";
import { HStack } from "@astryxdesign/core/Stack";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, Search, Settings } from "lucide-react";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useState,
} from "react";

const SIDE_NAV_COLLAPSED_KEY = "side-nav-collapsed";

/** Wider than any viewport — MobileNav uses width: 100vw with maxWidth from this prop. */
const MOBILE_NAV_FULL_WIDTH = 10_000;

function readCollapsed(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.localStorage.getItem(SIDE_NAV_COLLAPSED_KEY) === "true";
}

type SideNavLinkProps = ComponentPropsWithoutRef<"a"> & {
	href?: string;
};

const SideNavLink = forwardRef<HTMLAnchorElement, SideNavLinkProps>(
	function SideNavLink({ href, ...props }, ref) {
		return <Link ref={ref} to={href ?? "/"} {...props} />;
	},
);

export function NavItems() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
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
	);
}

export function MobileNavigation() {
	return (
		<MobileNav header="BroTracker" width={MOBILE_NAV_FULL_WIDTH} label="Навигация">
			<SideNavRenderContext value="drawer">
				<NavItems />
			</SideNavRenderContext>
		</MobileNav>
	);
}

export default function Navigation() {
	const { isMobile } = useAppShellMobile();
	const [isCollapsed, setIsCollapsed] = useState(readCollapsed);

	return (
		<SideNav
			header={
				isMobile ? (
					<SideNavHeading heading="BroTracker" />
				) : (
					<HStack
						gap={1}
						vAlign="center"
						justify={isCollapsed ? "center" : "between"}
						width="100%"
					>
						{!isCollapsed ? (
							<SideNavHeading heading="BroTracker" />
						) : null}
						<SideNavCollapseButton />
					</HStack>
				)
			}
			collapsible={{
				hasButton: false,
				isCollapsed,
				onCollapsedChange: (collapsed) => {
					setIsCollapsed(collapsed);
					window.localStorage.setItem(
						SIDE_NAV_COLLAPSED_KEY,
						String(collapsed),
					);
				},
			}}
		>
			<NavItems />
		</SideNav>
	);
}
