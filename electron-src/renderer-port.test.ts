import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRememberedRendererPort,
  resolveRendererPort,
} from "./renderer-port";

test("only valid non-privileged integer ports become a saved origin", () => {
  for (const value of [undefined, null, "3001", 80, 65536, 3001.5, NaN]) {
    assert.equal(parseRememberedRendererPort(value), null);
  }
  assert.equal(parseRememberedRendererPort(3001), 3001);
  assert.equal(parseRememberedRendererPort(65535), 65535);
});

test("a first launch waits for its confirmed listener before saving a fallback origin", async () => {
  const saved: number[] = [];
  let bind!: (port: number) => void;
  const result = resolveRendererPort({
    remembered: undefined,
    listen: async (preferred) => {
      assert.equal(preferred, 6529);
      return new Promise<number>((resolve) => {
        bind = resolve;
      });
    },
    remember: (port) => saved.push(port),
  });
  assert.deepEqual(saved, []);
  bind(3001);
  assert.equal(await result, 3001);
  assert.deepEqual(saved, [3001]);
});

test("busy saved origins are retained so later launches return to existing device keys", async () => {
  for (const boundPort of [3001, 3002]) {
    assert.equal(
      await resolveRendererPort({
        remembered: 3001,
        listen: async (preferred) => {
          assert.equal(preferred, 3001);
          return boundPort;
        },
        remember: () => assert.fail("must not replace the saved origin"),
      }),
      boundPort,
    );
  }
});

test("a failed bind never saves a new origin", async () => {
  await assert.rejects(
    resolveRendererPort({
      remembered: undefined,
      listen: async () => {
        throw new Error("Cannot bind");
      },
      remember: () => assert.fail("must not save a failed bind"),
    }),
    /Cannot bind/,
  );
});
