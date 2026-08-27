export const KINOZAL_URL = "https://kinozal.me" as const;
export const KINOZAL_DL_URL = "https://dl.kinozal.me" as const;

export type KinozalMirror = {
	url: string;
	dlUrl: string;
	/** Hostname shown in UI. */
	label: string;
};

/** Official Kinozal mirrors (site + download subdomain). */
export const KINOZAL_MIRRORS = [
	{ url: "https://kinozal.me", dlUrl: "https://dl.kinozal.me", label: "kinozal.me" },
	{ url: "https://kinozal.guru", dlUrl: "https://dl.kinozal.guru", label: "kinozal.guru" },
	{ url: "https://kinozal.tv", dlUrl: "https://dl.kinozal.tv", label: "kinozal.tv" },
] as const satisfies readonly KinozalMirror[];

export const DEFAULT_KINOZAL_MIRROR: KinozalMirror = KINOZAL_MIRRORS[0];
