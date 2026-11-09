import type { WebContents } from "electron";

/** An HTTP error page can still trigger the iframe's DOM load event. */
export function observeLocalGatewayFrameFailures(
  contents: Pick<WebContents, "on" | "send" | "mainFrame" | "getURL">,
  appOrigin: string,
  gatewayOrigin: string,
): void {
  const reportFailure = (
    url: string,
    isMainFrame: boolean,
    processId: number,
    routingId: number,
  ) => {
    if (isMainFrame || URL.parse(contents.getURL())?.origin !== appOrigin) return;
    const target = URL.parse(url);
    if (
      target?.origin !== gatewayOrigin ||
      !target.pathname.startsWith("/ipfs/")
    ) return;
    const isDirectChild = contents.mainFrame.frames.some(
      (frame) => frame.processId === processId && frame.routingId === routingId,
    );
    if (isDirectChild) contents.send("local-ipfs-frame-failed", target.href);
  };

  contents.on(
    "did-frame-navigate",
    (_event, url, status, _statusText, isMainFrame, processId, routingId) => {
      if (status >= 400) reportFailure(url, isMainFrame, processId, routingId);
    },
  );
  contents.on(
    "did-fail-load",
    (_event, code, _description, url, isMainFrame, processId, routingId) => {
      // Chromium emits ERR_ABORTED when an iframe is replaced or removed.
      if (code !== -3) reportFailure(url, isMainFrame, processId, routingId);
    },
  );
}
