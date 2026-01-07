"use client";

import React, { createContext, useContext, useMemo } from "react";

const MAX_REGISTRATION_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 5000;
const IOS_INITIALIZATION_DELAY_MS = 500;

const DELEGATE_ERROR_PATTERNS = [
  "capacitorDidRegisterForRemoteNotifications",
  "didRegisterForRemoteNotifications",
];

const isDelegateError = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return DELEGATE_ERROR_PATTERNS.some((pattern) =>
    errorMessage.includes(pattern)
  );
};

const registerWithRetry = async (
  maxRetries = MAX_REGISTRATION_RETRIES
): Promise<void> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return;
    } catch (registerError: unknown) {
      const isDelegate = isDelegateError(registerError);
      const hasRetriesLeft = attempt < maxRetries - 1;

      if (isDelegate && hasRetriesLeft) {
        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        console.warn(
          `iOS push notification registration attempt ${
            attempt + 1
          } failed. Retrying in ${delay}ms...`,
          registerError
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw registerError;
    }
  }
};

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
  redirect?: keyof typeof redirectConfig | undefined;
  profile_id?: string | undefined;
  path?: string | undefined;
  handle?: string | undefined;
  id?: string | undefined;
  wave_id?: string | undefined;
  drop_id?: string | undefined;
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
