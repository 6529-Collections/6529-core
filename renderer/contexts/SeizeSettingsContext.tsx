"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
} from "react";
import { ApiSeizeSettings } from "@/generated/models/ApiSeizeSettings";
import { fetchUrl } from "@/services/6529api";
import { SEIZE_API_URL } from "@/electron-constants";

type SeizeSettingsContextType = {
  seizeSettings: ApiSeizeSettings;
  isMemesWave: (waveId: string | undefined | null) => boolean;
};

const SeizeSettingsContext = createContext<
  SeizeSettingsContextType | undefined
>(undefined);

export const SeizeSettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [seizeSettings, setSeizeSettings] = useState<ApiSeizeSettings>({
    rememes_submission_tdh_threshold: 0,
    all_drops_notifications_subscribers_limit: 0,
    memes_wave_id: null,
  });

  useEffect(() => {
    fetchUrl(`${SEIZE_API_URL}/api/settings`).then(
      (settings: ApiSeizeSettings) => {
        setSeizeSettings({
          ...settings,
          memes_wave_id: settings.memes_wave_id,
        });
      }
    );
  }, []);

  const isMemesWave = (waveId: string | undefined | null): boolean => {
    if (!waveId) return false;
    return seizeSettings?.memes_wave_id === waveId;
  };

  const value: SeizeSettingsContextType = useMemo(
    () => ({
      seizeSettings,
      isMemesWave,
    }),
    [seizeSettings, isMemesWave]
  );

  return (
    <SeizeSettingsContext.Provider value={value}>
      {children}
    </SeizeSettingsContext.Provider>
  );
};

export const useSeizeSettings = (): SeizeSettingsContextType => {
  const context = useContext(SeizeSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useSeizeSettings must be used within a SeizeSettingsProvider"
    );
  }
  return context;
};
