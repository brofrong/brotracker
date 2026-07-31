"use client";

import {
	SideNav,
	SideNavHeading,
	SideNavItem,
	SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, Search, Settings } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { ThemeToggle } from "#/components/ThemeToggle";

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

	return (
		<SideNav
			header={<SideNavHeading heading="BroTracker" />}
			footer={<ThemeToggle />}
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
