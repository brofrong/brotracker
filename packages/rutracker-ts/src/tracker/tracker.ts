import { createKinozal } from "./search-engine/kinozal";
import { createRutor } from "./search-engine/rutor";
import { createRutracker } from "./search-engine/rutracker";
import type { CreateTracker, Tracker } from "./tracker-interface";

const trackers: Record<Tracker, CreateTracker> = {
	Rutracker: createRutracker,
	Kinozal: createKinozal,
	Rutor: async (_tracker, options) =>
		createRutor({ proxyAgent: options.proxyAgent }),
};

export const createTracker: CreateTracker = (tracker, options) => {
	const trackerConstructor = trackers[tracker];
	if (!trackerConstructor) {
		throw new Error(`Tracker ${tracker} not supported`);
	}
	return trackerConstructor(tracker, options);
};
