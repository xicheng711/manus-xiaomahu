// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";
const rawBundleId = "space.manus.dementia.care.t20260311173557";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
const env = {
  appName: "小马虎",
  appSlug: "dementia-care",
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/86142412/UawqaAMbBrqrMFqh.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};
const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      LSApplicationQueriesSchemes: ['weixin', 'weixinULAPI'],
    },
    associatedDomains: [
      'applinks:xtdtinthemorning.cn',
      'webcredentials:xtdtinthemorning.cn',
    ],
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#FFF8F0",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: env.scheme, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-audio",
      { microphonePermission: "允许小马虎使用麦克风录音。" },
    ],
    [
      "expo-video",
      { supportsBackgroundPlayback: true, supportsPictureInPicture: true },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#F3EEFF",
        dark: { backgroundColor: "#F3EEFF" },
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "允许小马虎获取您的位置，用于显示当地天气信息。",
        locationWhenInUsePermission: "允许小马虎获取您的位置，用于显示当地天气信息。",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission: "允许小马虎使用麦克风进行语音输入。",
        speechRecognitionPermission: "允许小马虎使用语音识别功能。",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "允许小马虎保存护理简报图片到相册。",
        savePhotosPermission: "允许小马虎保存护理简报图片到相册。",
        isAccessMediaLocationEnabled: true,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#FF6B6B",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "36e30bf8-6e6c-4359-a1ce-fac45d5d24c6",
    },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};
export default config;
