require("dotenv").config();
const { notarize } = require("electron-notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== "darwin") {
    console.log(
      "Notarize skipped: not macOS build - current platform:",
      electronPlatformName
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log("Notarizing macOS app:", appName, appPath);
  console.log("Start Time:", new Date().toLocaleTimeString());
  console.time("Notarization Time");

  try {
    await notarize({
      tool: "notarytool",
      teamId: process.env.APPLE_TEAM_ID,
      appBundleId: "com.6529.6529core",
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
    });
    console.log("Notarization successful for app:", appName);
  } catch (error) {
    console.error("Notarization failed:", error);
    throw error;
  }
  console.log("End Time:", new Date().toLocaleTimeString());
  console.timeEnd("Notarization Time");
};
