import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import capacitorConfig from "../capacitor.config";

function file(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Version 42 Capacitor wrapper contract", () => {
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
    expect(android).toContain('android:scheme="glowfin"');
    expect(android).toContain('android:host="challenge"');
    expect(file("android/app/build.gradle")).toContain("versionCode 42");
    expect(file("android/app/build.gradle")).toContain('versionName "0.42.0"');

    const androidStyles = file("android/app/src/main/res/values/styles.xml");
    expect(androidStyles).toContain('android:windowLightNavigationBar" tools:targetApi="27"');
    expect(androidStyles).toContain('android:forceDarkAllowed" tools:targetApi="29"');

    const ios = file("ios/App/App/Info.plist");
    expect(ios).toContain("UIInterfaceOrientationPortrait");
    expect(ios).not.toContain("UIInterfaceOrientationLandscape");
    expect(ios).toContain("UIStatusBarStyleLightContent");
    expect(ios).toContain("com.karthikbs862026.glowfin.challenge");
    expect(ios).toContain("<string>glowfin</string>");
    const privacy = file("ios/App/App/PrivacyInfo.xcprivacy");
    expect(privacy).toContain("NSPrivacyTracking");
    expect(privacy).toContain("<false/>");
    const iosProject = file("ios/App/App.xcodeproj/project.pbxproj");
    expect(iosProject).toContain("CURRENT_PROJECT_VERSION = 42;");
    expect(iosProject).toContain("MARKETING_VERSION = 0.42.0;");
  });

  it("uses Capacitor's Android inset fallback and exposes optional haptics", () => {
    const html = file("index.html");
    expect(html).toContain("--safe-area-inset-top");
    expect(html).toContain("--glowfin-safe-bottom");
    expect(html).toContain('id="hud-haptics"');
    expect(html).toContain("Haptics · On when installed");
    expect(html).toContain('id="startup-progress"');
    expect(html).toContain('id="network-status"');
    expect(html).toContain('id="moonwell-challenge"');
    const tideSprint = file("tide-sprint/index.html");
    expect(tideSprint).toContain("viewport-fit=cover");
    expect(tideSprint).toContain('id="race-runtime"');
  });

  it("registers only lifecycle and haptics as Version 42 native plugins", () => {
    const androidGradle = file("android/app/capacitor.build.gradle");
    expect(androidGradle).toContain("project(':capacitor-app')");
    expect(androidGradle).toContain("project(':capacitor-haptics')");
    const iosPackage = file("ios/App/CapApp-SPM/Package.swift");
    expect(iosPackage).toContain('name: "CapacitorApp"');
    expect(iosPackage).toContain('name: "CapacitorHaptics"');
    const workflow = file(".github/workflows/native-wrapper.yml");
    expect(workflow).toContain("glowfin-v42-android-candidates");
    expect(workflow).toContain("Glowfin-v42.xcarchive");
    expect(workflow).toContain("glowfin-v42-ios-candidate");
  });
});
