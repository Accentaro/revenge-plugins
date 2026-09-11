import type { ComponentType } from "react";
export type HostComponent = ComponentType<any>;
export type Unpatch = () => void;
export interface Preferences<T> {
    get(): T;
    update(value: Partial<T>): void;
    subscribe(listener: () => void): Unpatch;
}
export interface SurfaceApi {
    useGuildMenu(signal: AbortSignal): (id: string, x: number, y: number) => void;
    react: unknown;
    reactNative: any;
    components: { TextInput: HostComponent; ChatIcon: HostComponent };
    modules: { findByProps(...props: string[]): any };
}
