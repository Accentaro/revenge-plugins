import { getModuleDependencies } from "@revenge-mod/modules/metro";
import { withStoreName } from "@revenge-mod/discord/flux";
import { lookupModule, lookupModules } from "@revenge-mod/modules/finders";
import { createFilterGenerator, FilterScopes, withDependencies, withName, withProps } from "@revenge-mod/modules/finders/filters";
export function findByProps(...props: string[]): any {
    if (!props.length) throw new Error("ServerDrawer: an export selector is required");
    return lookupModule(withProps(props[0], ...props.slice(1)), { cached: false })[0];
}
export function findByName(name: string): any {
    const target = lookupModule(withName(name), { cached: false })[0];
    return typeof target === "function" && target.name === name ? target : undefined;
}
export function findByStoreName(name: string): any {
    return lookupModule(withStoreName(name), { cached: false })[0];
}
function lookupUsingStore(storeName: string, filter: ReturnType<typeof withProps>): any {
    const found = lookupModule(filter, { cached: false })[0];
    if (found) return found;
    // Rain eagerly searches all modules; limit lazy initialization to the relevant stores and their wrappers.
    const stores = [storeName, "GuildStore", "UserSettingsProtoStore"];
    const ids = [...new Set(stores.flatMap(name => [...lookupModules(withStoreName(name), { cached: false })].map(([, id]) => id)))];
    for (const id of ids) {
        const dependency = withDependencies.unordered([id]);
        for (const pattern of [dependency, withDependencies.unordered([dependency])]) {
            const result = lookupModule(withDependencies(pattern).and(filter), { cached: false })[0];
            if (result) return result;
        }
    }
}
const withModuleIds = createFilterGenerator<[number[]]>(
    ([ids], id) => ids.includes(id),
    ([ids]) => `serverdrawer.dependencies(${ids.join(",")})`,
    FilterScopes.Initialized | FilterScopes.Uninitialized,
);
export function findByPropsInDependencies(anchorProps: string[], ...props: string[]): any {
    if (!anchorProps.length || !props.length) throw new Error("ServerDrawer: dependency selectors are required");
    const found = findByProps(...props);
    if (found) return found;
    let ids = [...lookupModules(withProps(anchorProps[0], ...anchorProps.slice(1)), { cached: false })].map(([, id]) => id);
    const visited = new Set(ids);
    for (let depth = 0; depth < 2; depth++) {
        ids = [...new Set(ids.flatMap(id => getModuleDependencies(id) ?? []))].filter(id => !visited.has(id));
        ids.forEach(id => visited.add(id));
        if (!ids.length) return undefined;
        const result = lookupModule(withModuleIds(ids).and(withProps(props[0], ...props.slice(1))), { cached: false })[0];
        if (result) return result;
    }
}
export function findByPropsUsingStore(storeName: string, ...props: string[]): any {
    if (!props.length) throw new Error("ServerDrawer: an export selector is required");
    return lookupUsingStore(storeName, withProps(props[0], ...props.slice(1)));
}
export function findByNameUsingStore(storeName: string, name: string): any {
    const found = lookupUsingStore(storeName, withName(name));
    return typeof found === "function" && found.name === name ? found : undefined;
}
