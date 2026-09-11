import { getJsonStorage, pluginStoragePathFor } from "@revenge-mod/json-storage";
import { reportActionFailure } from "./errors";
import type { ServerDrawerPreferences } from "./surface";
import type { Preferences } from "./types";
export async function createPreferences(): Promise<Preferences<ServerDrawerPreferences>> {
    const defaults: ServerDrawerPreferences = { dmOrder: [], layout: "grid", serverOrder: [] };
    const storage = getJsonStorage<ServerDrawerPreferences>(pluginStoragePathFor("dev.rain.serverdrawer"), { default: defaults });
    let state = { ...defaults, ...await storage.get() };
    let pending = Promise.resolve();
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        update(value) {
            state = { ...state, ...value };
            const snapshot = { ...state, dmOrder: [...state.dmOrder], serverOrder: [...state.serverOrder] };
            pending = pending.then(() => storage.set(snapshot, true)).catch(error => reportActionFailure("save drawer preferences", error));
            listeners.forEach(listener => listener());
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
}
