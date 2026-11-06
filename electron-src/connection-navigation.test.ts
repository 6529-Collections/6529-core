import assert from "node:assert/strict";
import { test } from "node:test";
import { getDesktopNavigationTarget } from "../renderer/components/header/titlebar/titlebar-navigation";
import { getConnectionDeepLinkNavigation } from "./connection-deep-link";

const origin = "http://localhost:6529";

test("receiving a second setup link on the same page retains the new code and secret", () => {
  const path = getConnectionDeepLinkNavigation(
    new URL(
      "core6529://share-connection?connection_share_code=new-code#setup=new-secret",
    ),
  );
  assert.ok(path);
  const target = getDesktopNavigationTarget(
    path,
    origin,
    "/accept-connection-sharing",
  );
  assert.ok(target?.replace);
  const result = new URL(target.url, origin);
  assert.equal(result.searchParams.get("connection_share_code"), "new-code");
  assert.equal(result.searchParams.get("reload"), "true");
  assert.equal(result.hash, "#setup=new-secret");
});

test("a first setup navigation keeps the original query and private fragment", () => {
  const path =
    "/accept-connection-sharing?connection_share_code=fixture#setup=secret";
  assert.deepEqual(getDesktopNavigationTarget(path, origin, "/waves"), {
    url: path,
    replace: false,
  });
});

test("renderer handoff does not navigate to another origin", () => {
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
  ]) {
    assert.equal(getDesktopNavigationTarget(path, origin, "/"), null);
  }
});
