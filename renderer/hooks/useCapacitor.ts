import { useEffect, useState } from "react";

export enum CapacitorOrientationType {
  PORTRAIT,
  LANDSCAPE,
}

const useCapacitor = () => {
  const isCapacitor = false;
  const platform = "desktop";
  const orientation = CapacitorOrientationType.PORTRAIT;

  function sendNotification(id: number, title: string, body: string) {
    console.error(
      "Notifications are not supported in the current environment."
    );
  }

  return { isCapacitor, platform, orientation, sendNotification };
};

export default useCapacitor;
