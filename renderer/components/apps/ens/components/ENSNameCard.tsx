// renderer/components/apps/ens/components/ENSNameCard.tsx

import { Card, Badge } from "react-bootstrap";
import { formatDistanceToNow } from "date-fns";
import { ENSNameEntity } from "../constants";

interface ENSNameCardProps {
  ensName: ENSNameEntity;
}

export function ENSNameCard({ ensName }: ENSNameCardProps) {
  // Calculate if the name is expiring soon (within 90 days)
  const isExpiringSoon =
    ensName.validTillTimestamp &&
    new Date(ensName.validTillTimestamp).getTime() - Date.now() <
      90 * 24 * 60 * 60 * 1000;

  return (
    <Card className="tw-bg-zinc-900/80 tw-border tw-border-zinc-800 tw-rounded-xl tw-text-white tw-backdrop-blur-md tw-shadow-xl tw-overflow-hidden tw-transition-all tw-duration-300 hover:tw-border-zinc-700">
      <Card.Body className="tw-p-6">
        <div className="tw-flex tw-justify-between tw-items-start tw-mb-4">
          <h3 className="tw-text-2xl tw-font-bold tw-break-all">
            {ensName.name}
          </h3>
          {ensName.matchesReverseRecord && (
            <Badge
              bg="primary"
              className="tw-bg-blue-600 tw-text-white tw-font-normal tw-py-1 tw-px-2"
            >
              Primary
            </Badge>
          )}
        </div>

        <div className="tw-grid tw-gap-4">
          <div className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-white/60 tw-text-sm tw-uppercase tw-tracking-wider tw-font-medium">
              Registered:
            </span>
            <span className="tw-text-white">
              {new Date(ensName.validFromTimestamp).toLocaleDateString()}(
              {formatDistanceToNow(new Date(ensName.validFromTimestamp), {
                addSuffix: true,
              })}
              )
            </span>
          </div>

          {ensName.validTillTimestamp && (
            <div className="tw-flex tw-flex-col tw-gap-1">
              <span className="tw-text-white/60 tw-text-sm tw-uppercase tw-tracking-wider tw-font-medium">
                Expires:
              </span>
              <span
                className={`${
                  isExpiringSoon ? "tw-text-red-400" : "tw-text-white"
                }`}
              >
                {new Date(ensName.validTillTimestamp).toLocaleDateString()}(
                {formatDistanceToNow(new Date(ensName.validTillTimestamp), {
                  addSuffix: true,
                })}
                ){isExpiringSoon && " - Expiring soon!"}
              </span>
            </div>
          )}

          <div className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-white/60 tw-text-sm tw-uppercase tw-tracking-wider tw-font-medium">
              Parent:
            </span>
            <span className="tw-text-white">{ensName.parentName}</span>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
