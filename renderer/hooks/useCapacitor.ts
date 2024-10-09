import { useEffect, useState } from "react";

export enum CapacitorOrientationType {
  PORTRAIT,
  LANDSCAPE,
}

const useCapacitor = () => {
  const isCapacitor = false;
  const platform = "desktop";
  

  return { isCapacitor, platform };
};

export default useCapacitor;
