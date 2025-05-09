import Link from "next/link";
import {
  getScaledImageUri,
  ImageScale,
} from "../../../../helpers/image.helpers";
import { INotificationIdentityMentioned } from "../../../../types/feed.types";
import { getTimeAgoShort } from "../../../../helpers/Helpers";
import { ActiveDropState } from "../../../../types/dropInteractionTypes";
import Drop, {
  DropInteractionParams,
  DropLocation,
} from "../../../waves/drops/Drop";
import { ExtendedDrop } from "../../../../helpers/waves/drop.helpers";
import { useRouter } from "next/router";
import { ApiDrop } from "../../../../generated/models/ApiDrop";
import { UserFollowBtnSize } from "../../../user/utils/UserFollowBtn";
import NotificationsFollowBtn from "../NotificationsFollowBtn";

export default function NotificationIdentityMentioned({
  notification,
  activeDrop,
  onReply,
  onQuote,
  onDropContentClick,
}: {
  readonly notification: INotificationIdentityMentioned;
  readonly activeDrop: ActiveDropState | null;
  readonly onReply: (param: DropInteractionParams) => void;
  readonly onQuote: (param: DropInteractionParams) => void;
  readonly onDropContentClick?: (drop: ExtendedDrop) => void;
}) {
  const router = useRouter();
  const navigateToDropInWave = (waveId: string, serialNo: number) => {
    router.push(`/my-stream?wave=${waveId}&serialNo=${serialNo}/`);
  };

  const onReplyClick = (serialNo: number) => {
    navigateToDropInWave(notification.related_drops[0].wave.id, serialNo);
  };

  const onQuoteClick = (quote: ApiDrop) => {
    navigateToDropInWave(quote.wave.id, quote.serial_no);
  };

  return (
    <div className="tw-w-full tw-flex tw-gap-x-3">
      <div className="tw-w-full tw-flex tw-flex-col tw-space-y-2">
        <div className="tw-flex tw-flex-1 tw-justify-between tw-gap-x-3 tw-gap-y-1">
          <div className="sm:tw-hidden tw-mr-2 tw-size-6 md:tw-absolute md:-tw-left-12 tw-flex-shrink-0 md:tw-size-8 tw-rounded-full tw-bg-iron-800 tw-flex tw-items-center tw-justify-center">
            <svg
              className="tw-flex-shrink-0 tw-size-4 md:tw-size-5 tw-text-iron-300"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              aria-hidden="true"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7.99999V13C16 13.7956 16.3161 14.5587 16.8787 15.1213C17.4413 15.6839 18.2043 16 19 16C19.7956 16 20.5587 15.6839 21.1213 15.1213C21.6839 14.5587 22 13.7956 22 13V12C21.9999 9.74302 21.2362 7.55247 19.8333 5.78452C18.4303 4.01658 16.4705 2.77521 14.2726 2.26229C12.0747 1.74936 9.76793 1.99503 7.72734 2.95936C5.68676 3.92368 4.03239 5.54995 3.03325 7.57371C2.03411 9.59748 1.74896 11.8997 2.22416 14.1061C2.69936 16.3125 3.90697 18.2932 5.65062 19.7263C7.39428 21.1593 9.57143 21.9603 11.8281 21.9991C14.0847 22.0379 16.2881 21.3122 18.08 19.94M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79085 9.79086 7.99999 12 7.99999C14.2091 7.99999 16 9.79085 16 12Z"
              />
            </svg>
          </div>

          <div className="tw-flex tw-gap-x-2 tw-items-center">
            <div className="tw-h-7 tw-w-7">
              {notification.related_drops[0].author.pfp ? (
                <img
                  src={getScaledImageUri(
                    notification.related_drops[0].author.pfp,
                    ImageScale.W_AUTO_H_50
                  )}
                  alt="#"
                  className="tw-flex-shrink-0 tw-object-contain tw-h-full tw-w-full tw-rounded-md tw-bg-iron-800 tw-ring-1 tw-ring-iron-700"
                />
              ) : (
                <div className="tw-flex-shrink-0 tw-object-contain tw-h-full tw-w-full tw-rounded-md tw-bg-iron-800 tw-ring-1 tw-ring-iron-700" />
              )}
            </div>
            <span className="tw-text-sm tw-font-normal tw-text-iron-50">
              <Link
                href={`/${notification.related_drops[0].author.handle}`}
                className="tw-no-underline tw-font-semibold">
                {notification.related_drops[0].author.handle}
              </Link>{" "}
              mentioned you{" "}
              <span className="tw-text-sm tw-text-iron-500 tw-font-normal tw-whitespace-nowrap">
                <span className="tw-font-bold tw-mx-0.5">&#8226;</span>{" "}
                {getTimeAgoShort(notification.created_at)}
              </span>
            </span>
          </div>
          <NotificationsFollowBtn
          profile={notification.related_drops[0].author}
          size={UserFollowBtnSize.SMALL}
        />
        </div>

        <Drop
          drop={{
            ...notification.related_drops[0],
            stableKey: "",
            stableHash: "",
          }}
          previousDrop={null}
          nextDrop={null}
          showWaveInfo={true}
          showReplyAndQuote={true}
          activeDrop={activeDrop}
          location={DropLocation.MY_STREAM}
          dropViewDropId={null}
          onReply={onReply}
          onQuote={onQuote}
          onReplyClick={onReplyClick}
          onQuoteClick={onQuoteClick}
          onDropContentClick={onDropContentClick}
        />
      </div>
    </div>
  );
}
