import React from "react";
import { ApiWave } from "../../../../generated/models/ApiWave";
import { ApiWaveType } from "../../../../generated/models/ApiWaveType";
import WaveGroup, { WaveGroupType } from "../specs/groups/group/WaveGroup";

interface WaveGroupsProps {
  readonly wave: ApiWave;
  readonly useRing?: boolean;
}

export default function WaveGroups({ wave, useRing = true }: WaveGroupsProps) {
  const ringClasses = useRing
    ? "tw-ring-1 tw-ring-inset tw-ring-iron-800 tw-rounded-xl"
    : "tw-rounded-b-xl lg:tw-rounded-b-none";

  return (
    <div className="tw-w-full">
      <div
        className={`tw-h-full tw-bg-iron-950 tw-relative tw-overflow-auto ${ringClasses}`}>
        <div>
          <div className="tw-px-5 tw-pt-4 tw-flex tw-justify-between tw-items-start tw-gap-x-6">
            <p className="tw-mb-0 tw-text-lg tw-text-iron-200 tw-font-semibold tw-tracking-tight">
              Groups
            </p>
          </div>
          <div className="tw-px-5 tw-py-5 tw-flex tw-flex-col tw-gap-y-6">
            <WaveGroup
              scope={wave.visibility.scope}
              type={WaveGroupType.VIEW}
              isEligible={true}
              wave={wave}
            />
            {wave.wave.type !== ApiWaveType.Chat && (
              <>
                <WaveGroup
                  scope={wave.participation.scope}
                  type={WaveGroupType.DROP}
                  isEligible={wave.participation.authenticated_user_eligible}
                  wave={wave}
                />
                <WaveGroup
                  scope={wave.voting.scope}
                  type={WaveGroupType.VOTE}
                  isEligible={wave.voting.authenticated_user_eligible}
                  wave={wave}
                />
              </>
            )}

            <WaveGroup
              scope={wave.chat.scope}
              type={WaveGroupType.CHAT}
              isEligible={wave.chat.authenticated_user_eligible}
              wave={wave}
            />

            <WaveGroup
              scope={wave.wave.admin_group}
              type={WaveGroupType.ADMIN}
              isEligible={wave.wave.authenticated_user_eligible_for_admin}
              wave={wave}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
