export const openInExternalBrowser = (url: string, event?: any) => {
  if (event) {
    event.preventDefault();
  }
  window.api.openExternal(url);
};

export const openInExternalChrome = (url: string, event?: any) => {
  if (event) {
    event.preventDefault();
  }
  window.api.openExternalChrome(url);
};

export const openInExternalFirefox = (url: string, event?: any) => {
  if (event) {
    event.preventDefault();
  }
  window.api.openExternalFirefox(url);
};

export const openInExternalBrave = (url: string, event?: any) => {
  if (event) {
    event.preventDefault();
  }
  window.api.openExternalBrave(url);
};

export const parseNftDescriptionToHtml = (description: string) => {
  let d = description.replaceAll("\n", "<br />");
  d = d.replace(
    /(https?:\/\/(www\.)?[-a-z0-9@:%._+~#=]{1,256}\.[a-z0-9]{1,6}\b([-a-z0-9@:%_+.~#?&=/]*))/gi,
    '<a href=\'$1\' target="blank" rel="noreferrer">$1</a>'
  );
  return d;
};

export function printMintDate(date: Date) {
  const mintDate = new Date(date);
  return `
      ${mintDate.toLocaleString("default", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })} 
      (${getDateDisplay(mintDate)})
    `;
}

export function getDateDisplay(date: Date) {
  const secondsAgo = (new Date().getTime() - date.getTime()) / 1000;
  if (60 > secondsAgo) {
    return `${Math.round(secondsAgo)} seconds ago`;
  }
  if (60 * 60 > secondsAgo) {
    const minutes = Math.round(secondsAgo / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  if (60 * 60 * 24 > secondsAgo) {
    const hours = Math.floor(secondsAgo / (60 * 60));
    const minutes = secondsAgo % (60 * 60);
    return `${hours} hr${hours > 1 ? "s" : ""} ${
      minutes > 0 ? `${Math.floor(minutes / 60)} mins` : ""
    } ago`;
  }
  const days = Math.round(secondsAgo / (60 * 60 * 24));
  if (2 > days) {
    return `${Math.round(secondsAgo / (60 * 60))} hours ago`;
  }
  return `${days.toLocaleString()} days ago`;
}

export function getRandomKey() {
  return Math.random().toString(36).substring(7);
}

export const isElectron = () => {
  // Check if running in an Electron renderer process
  if (
    typeof window !== "undefined" &&
    window.process &&
    window.process.type === "renderer"
  ) {
    return true;
  }

  // Check if running in an Electron main process
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.electron
  ) {
    return true;
  }

  // Check the user agent for Electron
  if (
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Electron")
  ) {
    return true;
  }

  return false;
};

export function isHexString(str: string): boolean {
  // Regular expression to match valid hex strings
  const hexRegex = /^[0-9a-fA-F]+$/;

  // Check if the string matches the hex pattern and has an even length (pairs of characters)
  return hexRegex.test(str) && str.length % 2 === 0;
}

export function hexToString(hex: string) {
  hex = hex.replace(/^0x/, "");

  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}
