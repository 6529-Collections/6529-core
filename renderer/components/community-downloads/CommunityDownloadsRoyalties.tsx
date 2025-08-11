"use client";

import { useSetTitle } from "@/contexts/TitleContext";
import { SEIZE_API_URL } from "@/electron-constants";
import CommunityDownloadsComponent from "./CommunityDownloadsComponent";

export default function CommunityDownloadsRoyalties() {
  useSetTitle("Royalties | Open Data");

  return (
    <CommunityDownloadsComponent
      title="Royalties"
      url={`${SEIZE_API_URL}/api/royalties/uploads`}
    />
  );
}
