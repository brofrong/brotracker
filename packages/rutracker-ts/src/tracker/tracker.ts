import { createRutracker } from "./search-engine/rutracker/rutracker";
import type { CreateTracker, Tracker } from "./tracker-interface";

const trackers: Record<Tracker, CreateTracker> = {
  Rutracker: createRutracker,
}

export const createTracker: CreateTracker = (tracker, options) => {
  const trackerConstructor = trackers[tracker];
  if (!trackerConstructor) {
    throw new Error(`Tracker ${tracker} not supported`);
  }
  return trackerConstructor(tracker, options);
};
