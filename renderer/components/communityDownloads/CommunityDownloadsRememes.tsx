import { SEIZE_API_URL } from "../../../constants";
import CommunityDownloadsComponent from "./CommunityDownloadsComponent";

export default function CommunityDownloadsRememes() {
  return (
    <CommunityDownloadsComponent
      title="Rememes"
      url={`${SEIZE_API_URL}/api/rememes_uploads`}
    />
  );
}
