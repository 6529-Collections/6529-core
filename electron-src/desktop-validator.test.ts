import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretValidatorStatus,
  openDesktopValidator,
} from "./desktop-validator";

const signedToday = JSON.stringify({
  format: 1,
  day: { state: "IN_CERTIFICATE", signed: true },
});

test("shows today's signature even if the live validator reports a warning", () => {
  assert.equal(interpretValidatorStatus(signedToday), "signed");
  assert.equal(interpretValidatorStatus(signedToday, 5), "signed");
});

test("never shows a stopped validator's cached signature as live", () => {
  assert.equal(interpretValidatorStatus(signedToday, 3), "stopped");
});

test("distinguishes a running node without a signature from an unreadable status", () => {
  assert.equal(
    interpretValidatorStatus('{"format":1,"day":{"signed":false}}'),
    "running",
  );
  assert.equal(interpretValidatorStatus(signedToday, "EACCES"), "unavailable");
  assert.equal(interpretValidatorStatus("invalid JSON"), "unavailable");
});

const installation = {
  appPath: "/Applications/6529 Validator.app",
  cliPath: "/Applications/6529 Validator.app/Contents/Resources/validator",
};

test("opens the installed app when Electron returns an empty error string", async () => {
  let openedApp: string | undefined;
  await openDesktopValidator(
    {
      openPath: async (appPath) => {
        openedApp = appPath;
        return "";
      },
      openExternal: async () => assert.fail("Opened the download page"),
    },
    async () => installation,
  );
  assert.equal(openedApp, installation.appPath);
});

test("opens the official download page when Validator is missing", async () => {
  let openedUrl: string | undefined;
  await openDesktopValidator(
    {
      openPath: async () => assert.fail("Opened a local app"),
      openExternal: async (url) => {
        openedUrl = url;
      },
    },
    async () => undefined,
  );
  assert.equal(openedUrl, "https://6529.io/validator");
});

test("reports an OS launch failure without opening the download page", async () => {
  await assert.rejects(
    openDesktopValidator(
      {
        openPath: async () => "Permission denied",
        openExternal: async () => assert.fail("Opened the download page"),
      },
      async () => installation,
    ),
    /6529 Validator could not be opened/,
  );
});
