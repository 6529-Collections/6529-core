import { useEffect, useState } from "react";

export enum CapacitorOrientationType {
  PORTRAIT,
  LANDSCAPE,
}

const useCapacitor = () => {
  const isCapacitor = false;
  const platform = "desktop";
  const keyboardVisible = false;

  return { isCapacitor, platform, keyboardVisible };
};

export default useCapacitor;
