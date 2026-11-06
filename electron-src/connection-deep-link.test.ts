import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getConnectionDeepLinkNavigation,
  getNavigationLogUrl,
} from "./connection-deep-link";

test("private setup fragments survive both receiving-app deep link forms", () => {
  for (const link of [
    "core6529://share-connection?connection_share_code=fixture#setup=private-secret",
    "core6529://navigate/accept-connection-sharing?connection_share_code=fixture#setup=private-secret",
  ]) {
    assert.equal(
      getConnectionDeepLinkNavigation(new URL(link)),
      "/accept-connection-sharing?connection_share_code=fixture#setup=private-secret",
    );
    const log = getNavigationLogUrl(link);
    assert.ok(!log.includes("fixture"));
    assert.ok(!log.includes("private-secret"));
  }
});

test("unsupported hosts and off-origin paths are not forwarded", () => {
  for (const link of [
    "core6529://other/path",
    "core6529://navigate//other.example/path",
  ]) {
    assert.equal(getConnectionDeepLinkNavigation(new URL(link)), null);
  }
});

test("logs omit setup queries, fragments and URL credentials, including failed web loads", () => {
  assert.equal(
    getNavigationLogUrl(
      "https://user:password@6529.io/connect?code=credential#setup=secret",
    ),
    "https://6529.io/connect",
  );
  assert.equal(
    getNavigationLogUrl("not a URL with private data"),
    "[invalid URL]",
  );
});

test("encoded traversal, foreign paths and malformed encodings are rejected", () => {
  for (const pathname of [
    "/..%2f..%2fetc",
    "/safe/%2e%2e%2fsecret",
    "/%2fexample.com/path",
    "/%5cexample.com",
    "/%09/example.com",
    "/%00/path",
    "/%7f/path",
    "/%252e%252e%252fsecret",
    "/%2509/path",
    "/broken%encoding",
  ]) {
    assert.equal(
      getConnectionDeepLinkNavigation(
        new URL(`core6529://navigate${pathname}`),
      ),
      null,
      pathname,
    );
  }
});

test("ordinary encoded routes keep their encoding, query and private fragment", () => {
  const path = "/waves/%E6%97%A5%E6%9C%AC?filter=a%2Fb#setup=private-secret";
  assert.equal(
    getConnectionDeepLinkNavigation(new URL(`core6529://navigate${path}`)),
    path,
  );
});
