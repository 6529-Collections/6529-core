import { ExtendedDrop } from "../../../../../helpers/waves/drop.helpers";
import { ApiDropType } from "../../../../../generated/models/ApiDropType";
import { DropLocation } from "../Drop";

interface ParticipationDropContainerProps {
  readonly drop: ExtendedDrop;
  readonly isActiveDrop: boolean;
  readonly location: DropLocation;
  readonly children: React.ReactNode;
}

const getColorClasses = ({
  isActiveDrop,
  rank,
  isDrop,
}: {
  isActiveDrop: boolean;
  rank: number | null;
  isDrop: boolean;
}): {
  container: string;
  text: string;
  metadataKey: string;
  metadataValue: string;
} => {
  if (!isDrop)
    return {
      container: "tw-bg-iron-950",
      text: "",
      metadataKey: "tw-text-iron-400",
      metadataValue: "tw-text-iron-200",
    };

  const rankStyles = {
    1: {
      base: "tw-border tw-border-solid tw-border-amber-400/20 tw-bg-[linear-gradient(180deg,rgba(31,31,37,0.99)_0%,rgba(66,56,41,0.95)_100%)] tw-shadow-[inset_0_0_20px_rgba(251,191,36,0.01)]",
      hover:
        "desktop-hover:hover:tw-shadow-[inset_0_0_25px_rgba(251,191,36,0.03)] desktop-hover:hover:tw-border-amber-400/25 desktop-hover:hover:tw-bg-[linear-gradient(180deg,rgba(35,35,41,0.99)_0%,rgba(71,61,46,0.95)_100%)]",
      active:
        "tw-border-l-4 tw-border-l-amber-400 tw-border-y tw-border-y-amber-400/20 tw-border-r tw-border-r-amber-400/20 tw-bg-[linear-gradient(180deg,rgba(66,56,41,0.98)_0%,rgba(31,31,37,0.95)_100%)] tw-shadow-[inset_0_0_30px_rgba(251,191,36,0.06)]",
      metadataKey: "tw-text-amber-400/70",
      metadataValue: "tw-text-amber-200/90",
    },
    2: {
      base: "tw-border tw-border-solid tw-border-slate-400/20 tw-bg-[linear-gradient(180deg,rgba(31,31,37,0.99)_0%,rgba(56,56,66,0.95)_100%)] tw-shadow-[inset_0_0_20px_rgba(226,232,240,0.01)]",
      hover:
        "desktop-hover:hover:tw-shadow-[inset_0_0_25px_rgba(226,232,240,0.03)] desktop-hover:hover:tw-border-slate-400/25 desktop-hover:hover:tw-bg-[linear-gradient(180deg,rgba(35,35,41,0.99)_0%,rgba(61,61,71,0.95)_100%)]",
      active:
        "tw-border-l-4 tw-border-l-slate-400 tw-border-y tw-border-y-slate-400/20 tw-border-r tw-border-r-slate-400/20 tw-bg-[linear-gradient(180deg,rgba(56,56,66,0.98)_0%,rgba(31,31,37,0.95)_100%)] tw-shadow-[inset_0_0_30px_rgba(226,232,240,0.06)]",
      metadataKey: "tw-text-slate-400/70",
      metadataValue: "tw-text-slate-200/90",
    },
    3: {
      base: "tw-border tw-border-solid tw-border-[#CD7F32]/20 tw-bg-[linear-gradient(180deg,rgba(31,31,37,0.99)_0%,rgba(56,41,36,0.95)_100%)] tw-shadow-[inset_0_0_20px_rgba(205,127,50,0.01)]",
      hover:
        "desktop-hover:hover:tw-shadow-[inset_0_0_25px_rgba(205,127,50,0.03)] desktop-hover:hover:tw-border-[#CD7F32]/25 desktop-hover:hover:tw-bg-[linear-gradient(180deg,rgba(35,35,41,0.99)_0%,rgba(61,46,41,0.95)_100%)]",
      active:
        "tw-border-l-4 tw-border-l-[#CD7F32] tw-border-y tw-border-y-[#CD7F32]/20 tw-border-r tw-border-r-[#CD7F32]/20 tw-bg-[linear-gradient(180deg,rgba(56,41,36,0.98)_0%,rgba(31,31,37,0.95)_100%)] tw-shadow-[inset_0_0_30px_rgba(205,127,50,0.06)]",
      metadataKey: "tw-text-[#CD7F32]/70",
      metadataValue: "tw-text-[#CD7F32]/90",
    },
    default: {
      base: "tw-border tw-border-solid tw-border-iron-600/40 tw-bg-[linear-gradient(90deg,rgba(31,31,37,0.95)_0%,rgba(35,35,40,0.98)_100%)] tw-shadow-[inset_0_0_16px_rgba(255,255,255,0.03)]",
      hover:
        "desktop-hover:hover:tw-shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] desktop-hover:hover:tw-border-iron-500/40",
      active:
        "tw-border-l-4 tw-border-l-iron-400 tw-border-y tw-border-y-iron-400/20 tw-border-r tw-border-r-iron-400/20 tw-bg-[linear-gradient(90deg,rgba(35,35,40,0.98)_0%,rgba(31,31,37,0.95)_100%)] tw-shadow-[inset_0_0_25px_rgba(255,255,255,0.1)]",
      metadataKey: "tw-text-iron-400",
      metadataValue: "tw-text-iron-200",
    },
  };

  const style =
    rankStyles[rank as keyof typeof rankStyles] ?? rankStyles.default;
  const classes = [style.base, style.hover];

  if (isActiveDrop) {
    classes.push(style.active);
  }

  return {
    container: classes.join(" "),
    text: "",
    metadataKey: style.metadataKey,
    metadataValue: style.metadataValue,
  };
};

export default function ParticipationDropContainer({
  drop,
  isActiveDrop,
  location,
  children
}: ParticipationDropContainerProps) {
  const isDrop = drop.drop_type === ApiDropType.Participatory;
  const rank = drop.rank;
  const colorClasses = getColorClasses({ isActiveDrop, rank, isDrop });

  return (
    <div className={`${location === DropLocation.WAVE ? "tw-px-4 tw-py-2" : ""} `}>
      <div
        className={`tw-relative tw-w-full tw-rounded-xl tw-py-6 ${colorClasses.container} tw-overflow-hidden tw-backdrop-blur-sm
          tw-transition-all tw-duration-300 tw-ease-out
          tw-shadow-lg tw-shadow-black/5
          desktop-hover:hover:tw-shadow-xl desktop-hover:hover:tw-shadow-black/10
          tw-group`}
      >
        {children}
      </div>
    </div>
  );
}

export { getColorClasses }; 
