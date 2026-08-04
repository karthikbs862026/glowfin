import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function text(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

function requireTruth(condition, message) {
  if (!condition) throw new Error(`Native wrapper check failed: ${message}`);
}

const packageJson = json("package.json");
const nativePackages = [
  "@capacitor/core",
  "@capacitor/android",
  "@capacitor/ios",
  "@capacitor/app",
  "@capacitor/haptics"
];
for (const dependency of nativePackages) {
  requireTruth(
    typeof packageJson.dependencies?.[dependency] === "string" &&
      packageJson.dependencies[dependency].startsWith("8."),
    `${dependency} is not pinned to Capacitor 8`
  );
}
requireTruth(
  packageJson.devDependencies?.["@capacitor/cli"]?.startsWith("8."),
  "@capacitor/cli is not pinned to Capacitor 8"
);

const androidConfig = json("android/app/src/main/assets/capacitor.config.json");
const iosConfig = json("ios/App/App/capacitor.config.json");
for (const config of [androidConfig, iosConfig]) {
  requireTruth(config.appId === "com.karthikbs862026.glowfin", "app ID drifted");
  requireTruth(config.appName === "Glowfin", "app name drifted");
  requireTruth(config.webDir === "dist", "native shell does not consume dist");
  requireTruth(config.loggingBehavior === "none", "native release logging is enabled");
  requireTruth(config.android?.allowMixedContent === false, "mixed content is enabled");
  requireTruth(
    config.plugins?.SystemBars?.insetsHandling === "css",
    "Android safe-area CSS injection is not configured"
  );
}

const androidPlugins = json("android/app/src/main/assets/capacitor.plugins.json");
const androidPluginPackages = androidPlugins.map((plugin) => plugin.pkg).sort();
requireTruth(
  JSON.stringify(androidPluginPackages) ===
    JSON.stringify(["@capacitor/app", "@capacitor/haptics"]),
  "Android lifecycle/haptics plugins are not the exact approved set"
);
requireTruth(
  Array.isArray(iosConfig.packageClassList) &&
    iosConfig.packageClassList.includes("AppPlugin") &&
    iosConfig.packageClassList.includes("HapticsPlugin"),
  "iOS lifecycle/haptics plugins are not registered"
);

const androidManifest = text("android/app/src/main/AndroidManifest.xml");
requireTruth(androidManifest.includes('android:screenOrientation="portrait"'), "Android is not portrait-only");
requireTruth(androidManifest.includes('android:usesCleartextTraffic="false"'), "Android cleartext traffic is allowed");
requireTruth(androidManifest.includes('android:allowBackup="false"'), "Android app-data backup is enabled");
const androidBuild = text("android/app/build.gradle");
requireTruth(androidBuild.includes("versionCode 39"), "Android build number does not match Version 39");
requireTruth(androidBuild.includes('versionName "0.39.0"'), "Android version name does not match Version 39");

const iosPlist = text("ios/App/App/Info.plist");
requireTruth(!iosPlist.includes("UIInterfaceOrientationLandscape"), "iOS still permits landscape");
requireTruth(iosPlist.includes("UIStatusBarStyleLightContent"), "iOS system-bar contrast is not fixed");
const iosProject = text("ios/App/App.xcodeproj/project.pbxproj");
requireTruth(iosProject.includes("CURRENT_PROJECT_VERSION = 39;"), "iOS build number does not match Version 39");
requireTruth(iosProject.includes("MARKETING_VERSION = 0.39.0;"), "iOS version name does not match Version 39");

const releaseManifest = text("dist/release.json");
requireTruth(
  text("android/app/src/main/assets/public/release.json") === releaseManifest,
  "Android web payload is stale"
);
requireTruth(
  text("ios/App/App/public/release.json") === releaseManifest,
  "iOS web payload is stale"
);

console.info("Native wrapper check passed: Android/iOS payloads, lifecycle, haptics, portrait, safe areas and security are aligned.");
