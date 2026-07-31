import { AppShell } from "@astryxdesign/core/AppShell";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AuthGate } from "#/components/AuthGate";
import Navigation, {
	MobileNavigation,
} from "#/components/navigation/navigation";
import { ThemeProvider } from "#/components/theme-provider";
import { queryClient } from "#/utils/trpc";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "BroTracker",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

const themeFlashScript = `(function(){try{var s=localStorage.getItem("theme");if(s==="light"||s==="dark"){document.documentElement.setAttribute("data-theme",s)}else{document.documentElement.removeAttribute("data-theme")}}catch(e){}})();`;

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script dangerouslySetInnerHTML={{ __html: themeFlashScript }} />
			</head>
			<body className="bg-body text-primary antialiased">
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthGate>
							<AppShell
								height="fill"
								contentPadding={0}
								sideNav={<Navigation />}
								mobileNav={{ content: <MobileNavigation /> }}
							>
								{children}
							</AppShell>
						</AuthGate>
					</QueryClientProvider>
				</ThemeProvider>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
