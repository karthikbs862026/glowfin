import {
  Capacitor,
  SystemBars,
  SystemBarsStyle
} from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  Haptics,
  ImpactStyle,
  NotificationType
} from "@capacitor/haptics";
import type {
  HapticDriver,
  HapticImpactStyle,
  HapticNotificationType
} from "./haptics";

export type GlowfinNativePlatform = "web" | "android" | "ios";

export interface GlowfinNativeRuntime {
  isNative: boolean;
  platform: GlowfinNativePlatform;
}

export interface NativeLifecycleCallbacks {
  onActiveChange(active: boolean): void;
  onOpenUrl?(url: string): void;
}

function normalizedPlatform(): GlowfinNativePlatform {
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : "web";
}

export function nativeRuntime(): GlowfinNativeRuntime {
  const platform = normalizedPlatform();
  return {
    isNative: Capacitor.isNativePlatform() && platform !== "web",
    platform
  };
}

function impactStyle(style: HapticImpactStyle): ImpactStyle {
  if (style === "HEAVY") return ImpactStyle.Heavy;
  if (style === "MEDIUM") return ImpactStyle.Medium;
  return ImpactStyle.Light;
}

function notificationType(type: HapticNotificationType): NotificationType {
  if (type === "WARNING") return NotificationType.Warning;
  if (type === "ERROR") return NotificationType.Error;
  return NotificationType.Success;
}

export function capacitorHapticDriver(
  runtime: GlowfinNativeRuntime = nativeRuntime()
): HapticDriver | null {
  if (!runtime.isNative) return null;
  return {
    impact: (style) => Haptics.impact({ style: impactStyle(style) }),
    notification: (type) => Haptics.notification({
      type: notificationType(type)
    })
  };
}

/**
 * Connect the native Activity/UIApplication lifecycle to Glowfin's existing
 * interruption guard. Browser listeners remain authoritative on the web.
 */
export async function installCapacitorShell(
  callbacks: NativeLifecycleCallbacks,
  runtime: GlowfinNativeRuntime = nativeRuntime()
): Promise<() => Promise<void>> {
  document.documentElement.dataset["glowfinNativePlatform"] = runtime.platform;
  if (!runtime.isNative) return async () => undefined;

  try {
    await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
  } catch {
    // The fixed dark native theme remains the safe fallback.
  }

  const lifecycleListener = await App.addListener("appStateChange", ({ isActive }) => {
    callbacks.onActiveChange(isActive);
    if (isActive) {
      void SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => undefined);
    }
  });
  const urlListener = await App.addListener("appUrlOpen", ({ url }) => {
    if (typeof url === "string" && url.length <= 512) callbacks.onOpenUrl?.(url);
  });

  try {
    const state = await App.getState();
    if (!state.isActive) callbacks.onActiveChange(false);
  } catch {
    // The listener already covers subsequent transitions.
  }

  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url && launch.url.length <= 512) callbacks.onOpenUrl?.(launch.url);
  } catch {
    // A normal launcher start has no URL and remains the dominant path.
  }

  return async () => {
    await Promise.all([lifecycleListener.remove(), urlListener.remove()]);
  };
}
