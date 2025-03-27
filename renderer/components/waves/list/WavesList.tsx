import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AuthContext } from "../../auth/Auth";
import { ApiWavesOverviewType } from "../../../generated/models/ApiWavesOverviewType";
import WavesListWrapper from "./WavesListWrapper";
import WavesListHeader from "./header/WavesListHeader";
import WavesListSearchResults from "./WavesListSearchResults";

export default function WavesList({
  showCreateNewButton,
  onCreateNewWave,
  onCreateNewDirectMessage,
}: {
  readonly showCreateNewButton?: boolean;
  readonly onCreateNewWave: () => void;
  readonly onCreateNewDirectMessage: () => void;
}) {
  const router = useRouter();
  const { connectedProfile, activeProfileProxy } = useContext(AuthContext);
  const [showAllType, setShowAllType] = useState<ApiWavesOverviewType | null>(
    null
  );

  const getWaveOverviewTypes = (): ApiWavesOverviewType[] => {
    const types = showAllType
      ? Object.values(ApiWavesOverviewType).filter((t) => t === showAllType)
      : Object.values(ApiWavesOverviewType);
    if (!connectedProfile?.profile?.handle || !!activeProfileProxy) {
      return types.filter(
        (t) => t !== ApiWavesOverviewType.AuthorYouHaveRepped
      );
    }
    return types;
  };

  const [overviewTypes, setOverviewTypes] = useState(getWaveOverviewTypes());
  useEffect(
    () => setOverviewTypes(getWaveOverviewTypes()),
    [connectedProfile, activeProfileProxy, showAllType]
  );

  const [identity, setIdentity] = useState<string | null>(
    (router.query.identity as string) || null
  );
  const [waveName, setWaveName] = useState<string | null>(null);

  const updateIdentity = (newIdentity: string | null) => {
    setIdentity(newIdentity);
    const newQuery = { ...router.query };
    if (!newIdentity || newIdentity.trim() === "") {
      delete newQuery.identity;
    } else {
      newQuery.identity = newIdentity;
    }
    router.push(
      {
        pathname: router.pathname,
        query: newQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const getShowSearchResults = () => !!identity || !!waveName;
  const [showSearchResults, setShowSearchResults] = useState(
    getShowSearchResults()
  );

  useEffect(() => {
    setShowSearchResults(getShowSearchResults());
    setIdentity((router.query.identity as string) || null);
  }, [router.query.identity, waveName]);

  return (
    <div className="tailwind-scope">
      <div className="tw-pb-14 lg:tw-pb-24 tw-px-4 min-[992px]:tw-px-3 min-[992px]:tw-max-w-[960px] max-[1100px]:tw-max-w-[950px] min-[1200px]:tw-max-w-[1050px] min-[1300px]:tw-max-w-[1150px] min-[1400px]:tw-max-w-[1250px] min-[1500px]:tw-max-w-[1280px] tw-mx-auto">
        <WavesListHeader
          identity={identity}
          waveName={waveName}
          showCreateNewButton={showCreateNewButton}
          onCreateNewWave={onCreateNewWave}
          onCreateNewDirectMessage={onCreateNewDirectMessage}
          setIdentity={updateIdentity}
          setWaveName={setWaveName}
        />
        <div className="tw-mt-6">
          {showSearchResults ? (
            <WavesListSearchResults identity={identity} waveName={waveName} />
          ) : (
            <div className="tw-space-y-8">
              {overviewTypes.map((type) => (
                <WavesListWrapper
                  key={type}
                  overviewType={type}
                  showAllType={showAllType}
                  setShowAllType={setShowAllType}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
