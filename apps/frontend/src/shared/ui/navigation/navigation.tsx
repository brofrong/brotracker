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
import { Bot, Download, Film, Home, Search, Settings } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";

const SIDE_NAV_COLLAPSED_KEY = "side-nav-collapsed";

/** Wider than any viewport — MobileNav uses width: 100vw with maxWidth from this prop. */
const MOBILE_NAV_FULL_WIDTH = 10_000;

const brandIcon = (
	<img
		src="/logos/chunky-wordmark-icon.png"
		alt=""
		width={20}
		height={20}
		className="size-5 rounded-sm"
	/>
);

function BrandHeading() {
	const { t } = useTranslation("nav");
	return <SideNavHeading heading={t("brand")} icon={brandIcon} />;
}

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
	const { t } = useTranslation("nav");
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<SideNavSection title={t("sectionActions")}>
			<SideNavItem
				as={SideNavLink}
				label={t("home")}
				href="/"
				icon={Home}
				isSelected={pathname === "/"}
			/>
			<SideNavItem
				as={SideNavLink}
				label={t("films")}
				href="/title"
				icon={Film}
				isSelected={pathname === "/title" || pathname.startsWith("/title/")}
			/>
			<SideNavItem
				as={SideNavLink}
				label={t("search")}
				href="/search"
				icon={Search}
				isSelected={pathname === "/search"}
			/>
			<SideNavItem
				as={SideNavLink}
				label={t("torrents")}
				href="/torrents"
				icon={Download}
				isSelected={pathname === "/torrents"}
			/>
			<SideNavItem
				as={SideNavLink}
				label={t("workers")}
				href="/workers"
				icon={Bot}
				isSelected={pathname === "/workers" || pathname.startsWith("/workers/")}
			/>
			<SideNavItem
				as={SideNavLink}
				label={t("settings")}
				href="/settings"
				icon={Settings}
				isSelected={pathname === "/settings"}
			/>
		</SideNavSection>
	);
}

export function MobileNavigation() {
	const { t } = useTranslation("nav");

	return (
		<MobileNav
			header={<BrandHeading />}
			width={MOBILE_NAV_FULL_WIDTH}
			label={t("ariaLabel")}
		>
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
					<BrandHeading />
				) : (
					<HStack
						gap={1}
						vAlign="center"
						justify={isCollapsed ? "center" : "between"}
						width="100%"
					>
						{!isCollapsed ? <BrandHeading /> : null}
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
