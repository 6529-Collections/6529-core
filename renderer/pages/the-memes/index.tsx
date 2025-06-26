import styles from "../../styles/Home.module.scss";

import React from "react";
import dynamic from "next/dynamic";
import { useSetTitle } from "../../contexts/TitleContext";
import { SEIZE_URL } from "../../../constants";

const TheMemesComponent = dynamic(
  () => import("../../components/the-memes/TheMemes"),
  { ssr: false }
);

export default function TheMemesPage() {
  useSetTitle("The Memes | Collections");

  return (
    <main className={styles.main}>
      <TheMemesComponent />
    </main>
  );
}

TheMemesPage.metadata = {
  title: "The Memes",
  ogImage: `${SEIZE_URL}/memes-preview.png`,
  description: "Collections",
  twitterCard: "summary_large_image",
};
