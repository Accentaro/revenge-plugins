import { Tokens } from "@revenge-mod/discord/common/tokens";
import { findByProps } from "./metro";
import { StyleSheet } from "react-native";
let useStyles: () => Record<string, any>;
export function initializeTheme() {
    const semanticColors = Tokens?.default?.colors;
    const styles = findByProps("createStyles");
    if (!semanticColors || typeof styles?.createStyles !== "function") throw new Error("ServerDrawer: themed styles are unavailable");
    useStyles = styles.createStyles({
    background: { color: semanticColors.BACKGROUND_BASE_LOWEST },
    border: { color: semanticColors.BORDER_SUBTLE },
    brand: { color: semanticColors.TEXT_BRAND },
    folder: { color: semanticColors.GUILD_FOLDER_BACKGROUND },
    danger: { color: semanticColors.STATUS_DANGER },
    input: { color: semanticColors.BACKGROUND_BASE_LOWER },
    muted: { color: semanticColors.TEXT_MUTED },
    normal: { color: semanticColors.TEXT_DEFAULT },
    surface: { color: semanticColors.BACKGROUND_SECONDARY_ALT },
    });
    if (typeof useStyles !== "function") throw new Error("ServerDrawer: themed styles hook is unavailable");
}
export function usePalette() {
    const styles = useStyles();
    return Object.fromEntries(Object.entries(styles).map(([key, style]) => [key, StyleSheet.flatten(style).color])) as Record<keyof typeof styles, string>;
}
