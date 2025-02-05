import React from "react";
import { ExtendedDrop } from "../../../helpers/waves/wave-drops.helpers";
import { WaveSmallLeaderboardTopThreeDrop } from "./WaveSmallLeaderboardTopThreeDrop";
import { WaveSmallLeaderboardDefaultDrop } from "./WaveSmallLeaderboardDefaultDrop";
import { ApiWave } from "../../../generated/models/ApiWave";

interface WaveSmallLeaderboardDropProps {
  readonly drop: ExtendedDrop;
  readonly wave: ApiWave;
  readonly onDropClick: (drop: ExtendedDrop) => void;
}

export const WaveSmallLeaderboardDrop: React.FC<WaveSmallLeaderboardDropProps> = ({ drop, wave, onDropClick }) => {
  return (
    <div className="tw-cursor-pointer" onClick={() => onDropClick(drop)}>
      {drop.rank && drop.rank <= 3 ? (
        <WaveSmallLeaderboardTopThreeDrop
          drop={drop}
          wave={wave}
          onDropClick={onDropClick}
        />
      ) : (
        <WaveSmallLeaderboardDefaultDrop
          drop={drop}
          wave={wave}
          onDropClick={onDropClick}
        />
      )}
    </div>
  );
}; 