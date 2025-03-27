import { useEffect, useState } from "react";

export enum CapacitorOrientationType {
  PORTRAIT,
  LANDSCAPE,
}

const useCapacitor = () => {
  const isCapacitor = false;
  const platform = "desktop";
  const keyboardVisible = false;
  const isIos = false;
  const isAndroid = false;

  return { isCapacitor, platform, keyboardVisible, isIos, isAndroid };
};

export default useCapacitor;
