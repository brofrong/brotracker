import { createKinozal } from "./search-engine/kinozal";
import { createRutracker } from "./search-engine/rutracker";
import type { CreateTracker, Tracker } from "./tracker-interface";

const trackers: Record<Tracker, CreateTracker> = {
	Rutracker: createRutracker,
	Kinozal: createKinozal,
};

export const createTracker: CreateTracker = (tracker, options) => {
  const trackerConstructor = trackers[tracker];
  if (!trackerConstructor) {
    throw new Error(`Tracker ${tracker} not supported`);
  }
  return trackerConstructor(tracker, options);
};
