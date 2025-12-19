"use client";

import React, { createContext, useContext, useMemo } from "react";

type NotificationsContextType = {
  removeWaveDeliveredNotifications: (waveId: string) => Promise<void>;
  removeAllDeliveredNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<
  NotificationsContextType | undefined
>(undefined);

const redirectConfig = {
  path: ({ path }: { path: string }) => `/${path}`,
  profile: ({ handle }: { handle: string }) => `/${handle}`,
  "the-memes": ({ id }: { id: string }) => `/the-memes/${id}`,
  "6529-gradient": ({ id }: { id: string }) => `/6529-gradient/${id}`,
  "meme-lab": ({ id }: { id: string }) => `/meme-lab/${id}`,
  waves: ({ wave_id, drop_id }: { wave_id: string; drop_id: string }) => {
    const base = `/waves?wave=${wave_id}`;
    return drop_id ? `${base}&serialNo=${drop_id}` : base;
  },
};

interface NotificationData {
  redirect?: keyof typeof redirectConfig;
  profile_id?: string;
  path?: string;
  handle?: string;
  id?: string;
  wave_id?: string;
  drop_id?: string;
  [key: string]: unknown;
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const removeWaveDeliveredNotifications = async (waveId: string) => {
    return;
  };

  const removeAllDeliveredNotifications = async () => {
    return;
  };

  const value = useMemo(
    () => ({
      removeWaveDeliveredNotifications,
      removeAllDeliveredNotifications,
    }),
    [removeWaveDeliveredNotifications, removeAllDeliveredNotifications]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotificationsContext = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotificationsContext must be used within a NotificationsProvider"
    );
  }
  return context;
};
