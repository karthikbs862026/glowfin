import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import capacitorConfig from "../capacitor.config";

function file(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Version 39 Capacitor wrapper contract", () => {
  it("wraps only the sealed dist artifact with hardened native defaults", () => {
    expect(capacitorConfig).toMatchObject({
      appId: "com.karthikbs862026.glowfin",
      appName: "Glowfin",
      webDir: "dist",
      loggingBehavior: "none",
      zoomEnabled: false,
      android: {
        allowMixedContent: false,
        webContentsDebuggingEnabled: false
      },
      ios: {
        contentInset: "never",
        scrollEnabled: false,
        preferredContentMode: "mobile",
        webContentsDebuggingEnabled: false
      },
      plugins: {
        SystemBars: {
          insetsHandling: "css",
          style: "DARK",
          hidden: false
        }
      }
    });
  });

  it("locks both shells to portrait and rejects Android cleartext", () => {
    const android = file("android/app/src/main/AndroidManifest.xml");
    expect(android).toContain('android:screenOrientation="portrait"');
    expect(android).toContain('android:usesCleartextTraffic="false"');
    expect(android).toContain('android:allowBackup="false"');

    const ios = file("ios/App/App/Info.plist");
    expect(ios).toContain("UIInterfaceOrientationPortrait");
    expect(ios).not.toContain("UIInterfaceOrientationLandscape");
    expect(ios).toContain("UIStatusBarStyleLightContent");
  });

  it("uses Capacitor's Android inset fallback and exposes optional haptics", () => {
    const html = file("index.html");
    expect(html).toContain("--safe-area-inset-top");
    expect(html).toContain("--glowfin-safe-bottom");
    expect(html).toContain('id="hud-haptics"');
    expect(html).toContain("Haptics · On when installed");
  });

  it("registers only lifecycle and haptics as Version 39 native plugins", () => {
    const androidGradle = file("android/app/capacitor.build.gradle");
    expect(androidGradle).toContain("project(':capacitor-app')");
    expect(androidGradle).toContain("project(':capacitor-haptics')");
    const iosPackage = file("ios/App/CapApp-SPM/Package.swift");
    expect(iosPackage).toContain('name: "CapacitorApp"');
    expect(iosPackage).toContain('name: "CapacitorHaptics"');
  });
});
