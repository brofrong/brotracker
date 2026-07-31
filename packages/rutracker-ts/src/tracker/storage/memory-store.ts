export type MemoryStore = {
	get: (key: string) => Promise<string | undefined> | string | undefined;
	set: (key: string, value: string) => Promise<void> | void;
	delete: (key: string) => Promise<void> | void;
};

export function createMemoryStore(): MemoryStore {
	const store = new Map<string, string>();
	return {
		get: (key: string) => store.get(key),
		set: (key: string, value: string) => {
			store.set(key, value);
		},
		delete: (key: string) => {
			store.delete(key);
		},
	};
}
