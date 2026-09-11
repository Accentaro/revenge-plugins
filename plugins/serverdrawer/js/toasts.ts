import { ToastAndroid } from "react-native";
export function showToast(message: string): void {
    ToastAndroid.show(message, ToastAndroid.LONG);
}
