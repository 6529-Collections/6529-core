import { useAuth } from "@/components/auth/Auth";
import { SEIZE_URL } from "@/electron-constants";
import styles from "@/styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useSetTitle } from "../../contexts/TitleContext";

const MemeLabComponent = dynamic(() => import("@/components/memelab/MemeLab"), {
  ssr: false,
});

export default function MemeLab() {
  useSetTitle("Meme Lab | Collections");

  const { connectedProfile } = useAuth();

  return (
    <main className={styles.main}>
      <MemeLabComponent
        wallets={connectedProfile?.wallets?.map((w) => w.wallet) ?? []}
      />
    </main>
  );
}

MemeLab.metadata = {
  title: "Meme Lab",
  ogImage: `${SEIZE_URL}/meme-lab.jpg`,
  description: "Collections",
};
