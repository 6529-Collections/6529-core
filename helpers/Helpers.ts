import { GRADIENT_CONTRACT, MEMES_CONTRACT } from "../constants";

export function formatAddress(address: string) {
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

export function isMemesContract(contract: string) {
  return contract.toUpperCase() == MEMES_CONTRACT.toUpperCase();
}

export function isGradientsContract(contract: string) {
  return contract.toUpperCase() == GRADIENT_CONTRACT.toUpperCase();
}

export const fetchMeta = async (uri: string) => {
  try {
    new URL(uri);
    const response = await fetch(uri);
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchBlockTimestamp = async (provider: any, block: number) => {
  const blockEvent = await provider.getBlock(block);
  return blockEvent.timestamp * 1000;
};

export function getDaysDiff(t1: number, t2: number, floor = true) {
  const diff = t1 - t2;
  if (floor) {
    return Math.floor(diff / (1000 * 3600 * 24));
  }
  return Math.ceil(diff / (1000 * 3600 * 24));
}

export function fromGWEI(from: number) {
  return from / 1e18;
}

export function numberWithCommas(x: number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function getDateDisplay(date: Date) {
  const secondsAgo = (new Date().getTime() - date.getTime()) / 1000;
  if (60 > secondsAgo) {
    return `${Math.round(secondsAgo)} seconds ago`;
  }
  if (60 * 60 > secondsAgo) {
    return `${Math.round(secondsAgo / 60)} minutes ago`;
  }
  if (60 * 60 * 24 > secondsAgo) {
    const hours = Math.round(secondsAgo / (60 * 60));
    if (2 > hours) {
      return `${Math.round(secondsAgo / 60)} minutes ago`;
    }
    return `${hours} hours ago`;
  }
  const days = Math.round(secondsAgo / (60 * 60 * 24));
  if (2 > days) {
    return `${Math.round(secondsAgo / (60 * 60))} hours ago`;
  }
  return `${days} days ago`;
}

export function areEqualAddresses(w1: any, w2: any) {
  if (w1 && w2) {
    return w1.toUpperCase() === w2.toUpperCase();
  }
  return false;
}

export const fullScreenSupported = () => {
  const element: any = document.getElementsByClassName("container")[0];

  if (!element) return false;

  return (
    element.requestFullscreen ||
    element.mozRequestFullScreen ||
    element.webkitRequestFullscreen ||
    element.msRequestFullscreen
  );
};

export function enterArtFullScreen(elementId: string) {
  const element: any = document.getElementById(elementId);

  if (!element) return;

  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if (element.mozRequestFullScreen) {
    element.mozRequestFullScreen();
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}
