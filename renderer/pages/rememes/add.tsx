import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import React from "react";
import { useSetTitle } from "../../contexts/TitleContext";
import { SEIZE_URL } from "../../../constants";

const AddRememeComponent = dynamic(
  () => import("../../components/rememes/RememeAddPage"),
  { ssr: false }
);

export default function ReMemes() {
  useSetTitle("Add ReMemes | Collections");

  return (
    <main className={styles.main}>
      <AddRememeComponent />
    </main>
  );
}

ReMemes.metadata = {
  title: "ReMemes | Add",
  description: "Collections",
  ogImage: `${SEIZE_URL}/re-memes-b.jpeg`,
};
