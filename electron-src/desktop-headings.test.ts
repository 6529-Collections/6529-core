import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");
const compile = (text: string) =>
  ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

test("Desktop heading markup reuses FE Network tokens inside a narrowly scoped wrapper", () => {
  const network = { exports: {} as Record<string, string> };
  vm.runInNewContext(
    compile(read("renderer/components/network/networkPageLayoutClasses.ts")),
    {
      module: network,
      exports: network.exports,
    },
  );
  const module = {
    exports: {} as Record<
      string,
      (props: Record<string, unknown>) => {
        type: string;
        props: {
          className: string;
          children: { type: string; props: Record<string, unknown> };
        };
      }
    >,
  };
  const jsx = (type: string, props: unknown) => ({ type, props });
  vm.runInNewContext(
    compile(read("renderer/components/core/DesktopHeadings.tsx")),
    {
      module,
      exports: module.exports,
      require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        assert.equal(name, "@/components/network/networkPageLayoutClasses");
        return network.exports;
      },
    },
  );
  for (const [component, tag, token] of [
    ["DesktopPageHeading", "h1", "NETWORK_PAGE_TITLE_CLASSES"],
  ]) {
    const wrapper = module.exports[component]({
      children: "ETH Transactions",
      id: "heading",
    });
    assert.equal(wrapper.type, "div");
    assert.equal(wrapper.props.className, "tailwind-scope");
    const heading = wrapper.props.children;
    assert.equal(heading.type, tag);
    assert.equal(heading.props.id, "heading");
    assert.equal(
      heading.props.children,
      "ETH Transactions",
      "no muted prefix wrappers",
    );
    assert.equal(heading.props.className, network.exports[token]);
    assert.match(String(heading.props.className), /tw-font-semibold/);
  }
  assert.match(network.exports.NETWORK_PAGE_TITLE_CLASSES, /tw-text-\[22px\]/);
  assert.match(
    network.exports.NETWORK_PAGE_TITLE_CLASSES,
    /sm:tw-text-\[26px\]/,
  );
  assert.match(network.exports.NETWORK_PAGE_TITLE_CLASSES, /tw-text-iron-50/);
});

for (const [file, title] of [
  ["eth-scanner/ETHScanner", "ETH Transactions"],
  ["tdh-calculation/TDHCalculation", "TDH Calculation"],
  ["core-wallet/SeedWallets", "6529 Desktop Wallets"],
  ["core-wallet/SeedWalletImport", "Import Seed Wallet"],
  ["app-info/AppInfo", "6529 Desktop About"],
]) {
  test(`${file} keeps its title as one uniform Desktop page heading`, () => {
    const source = ts.createSourceFile(
      file,
      read(`renderer/components/core/${file}.tsx`),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const headings: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(source) === "DesktopPageHeading"
      )
        headings.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(headings.length, 1);
    assert.ok(
      headings[0].children.every(ts.isJsxText),
      "no mixed-weight/color spans inside the title",
    );
    assert.equal(
      headings[0].children
        .map((child) => (child as ts.JsxText).text)
        .join("")
        .trim()
        .replace(/\s+/g, " "),
      title,
    );
  });
}
