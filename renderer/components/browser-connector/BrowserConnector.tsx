"use client";

import { LoginImage } from "@/app/access/page.client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BrowserConnectorConnect from "./BrowserConnectorConnect";
import BrowserConnectorProvider from "./BrowserConnectorProvider";
import {
  BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS,
  formatBrowserConnectorTimeLeft,
  getCoreSchemeValidationError,
  getExpectedCoreScheme,
} from "./browserConnector.helpers";

export default function BrowserConnector({
  image,
}: {
  readonly image: string;
}) {
  const searchParams = useSearchParams();

  const [isCompleted, setIsCompleted] = useState(false);
  const [isExpired, setExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const task = searchParams?.get("task");
  const scheme = searchParams?.get("scheme");
  const t = searchParams?.get("t");
  const returnScheme = getExpectedCoreScheme();
  const schemeValidationError = getCoreSchemeValidationError(scheme);

  useEffect(() => {
    if (!t || schemeValidationError) {
      setExpired(true);
      setTimeLeft(null);
      return;
    }

    setExpired(false);
    const expiryTime = parseInt(t) + BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS;

    const calculateTimeLeft = () => {
      const now = Date.now();
      const timeRemaining = expiryTime - now;

      if (timeRemaining > 0) {
        setTimeLeft(timeRemaining);
      } else {
        setExpired(true);
        setTimeLeft(0);
      }
    };

    calculateTimeLeft();

    const intervalId = setInterval(() => {
      calculateTimeLeft();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [schemeValidationError, t]);

  return (
    <div className="tw-grid tw-min-h-screen tw-grid-cols-1 md:tw-grid-cols-2">
      <div className="tw-flex tw-items-center tw-justify-center tw-bg-black">
          <LoginImage image={image} alt="connect" />
      </div>
      <div className="tw-flex tw-min-h-screen tw-flex-col tw-items-center tw-justify-between tw-px-6">
        <>
          <Image
            loading="eager"
            priority
            src="/6529.png"
            alt="6529Seize"
            width={60}
            height={60}
            style={{
              marginTop: "25px",
            }}
          />
          {isCompleted ? (
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-center">
              <h2 className="tw-text-white">You're all set!</h2>
              <p className="tw-text-white">You can now close this window.</p>
            </div>
          ) : schemeValidationError ? (
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-center">
              <h2 className="tw-text-white">Invalid desktop return target</h2>
              <p className="tw-text-white">{schemeValidationError}</p>
              <p className="tw-text-white">
                Close this window and retry from 6529 Desktop.
              </p>
            </div>
          ) : isExpired ? (
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-center">
              <h2 className="tw-text-white">This page is expired</h2>
              <p className="tw-text-white">You can now close this window.</p>
            </div>
          ) : (
            <>
              {task === "connect" && (
                <BrowserConnectorConnect
                  returnScheme={returnScheme}
                  setCompleted={setIsCompleted}
                />
              )}
              {task === "provider" && (
                <BrowserConnectorProvider
                  returnScheme={returnScheme}
                  setCompleted={setIsCompleted}
                />
              )}
            </>
          )}
          <span className="tw-pb-2 tw-text-iron-400">
            {!isCompleted && timeLeft ? (
              <>
                This page will expire in{" "}
                {formatBrowserConnectorTimeLeft(timeLeft)}
              </>
            ) : (
              <></>
            )}
          </span>
        </>
      </div>
    </div>
  );
}
