import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDesktopNotificationMarkdown as format,
  getDesktopDropPreview,
} from "../shared/desktop-notification-text";

const cases = [
  [
    "# Push Preview Test\n\nSome **bold**, *italic*, and ~~struck-through~~ text.",
    "Push Preview Test\nSome bold, italic, and struck-through text.",
  ],
  [
    "### Backend Deploy · commit [33b43a6b](https://github.com/example/commit/33b43a6b)",
    "Backend Deploy · commit 33b43a6b",
  ],
  ["- **one**\n- two\n\n3. three\n4. four", "• one\n• two\n3. three\n4. four"],
  ["> outer\n>\n> > inner\n> >\n> > > deepest", "“outer\n‘inner\n“deepest”’”"],
  [
    "Use `a_b * c`\n\n```ts\nconst x = '*';\nprint(x);\n```",
    "Use ‘a_b * c’\nconst x = '*';\nprint(x);",
  ],
  ["@[prxt0] :wave: 👋 &amp; friends", "@[prxt0] :wave: 👋 & friends"],
  [
    "[label **bold**][ref]\n\n[ref]: https://example.com/long/path",
    "label bold",
  ],
  [
    "before ![alt](https://example.com/image) [video](https://example.com/a.mp4) https://example.com/a.PDF?download=1 after",
    "before after",
  ],
  ["> ![image](https://example.com/x)\n\n---", ""],
  ["    code_line()\n    next_line()", "code_line()\nnext_line()"],
  ["a\n\n\n\nb", "a\nb"],
  [
    String.raw`escaped \*literal\* and snake_case`,
    "escaped *literal* and snake_case",
  ],
] as const;

for (const [input, expected] of cases) {
  test(`converts ${input.slice(0, 45)}`, () =>
    assert.equal(format(input), expected));
}

test("parses complete links before native clipping and retains long readable text", () => {
  assert.equal(
    format(`[short label](https://example.com/${"x".repeat(1000)})`),
    "short label",
  );
  assert.equal(format("**" + "x".repeat(1000) + "**"), "x".repeat(1000));
  assert.equal(format("x".repeat(25001)), "");
});

test("preserves literal attachment fallbacks and default fallback eligibility", () => {
  assert.equal(
    getDesktopDropPreview([
      {
        content: "![image](https://example.com/x)",
        attachments: [{ file_name: "my_**file**.pdf" }],
      },
    ]),
    "my_**file**.pdf",
  );
  assert.equal(
    getDesktopDropPreview([
      {
        content: "> ![image](https://example.com/x)",
        media: [{ mime_type: "image/png" }],
      },
    ]),
    "Media attachment",
  );
  assert.equal(getDesktopDropPreview([{ content: "---" }]), null);
  assert.equal(getDesktopDropPreview(), null);
  assert.equal(
    getDesktopDropPreview([{ content: "" }, { content: "**second**" }]),
    "second",
  );
});
