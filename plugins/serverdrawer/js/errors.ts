import { showToast } from "./toasts";
export function reportActionFailure(operation: string, error: unknown): void {
    console.error(`[ServerDrawer] ${operation} failed`, error);
    showToast(`Could not ${operation}. Please try again.`);
}
