"use client";

import { WagmiProvider } from "wagmi";
import { useEffect, useState } from "react";
import { useAppWalletPasswordModal } from "@/hooks/useAppWalletPasswordModal";
import { WagmiConfig } from "@/wagmiConfig/wagmiConfig";
import { initWeb3Modal } from "./web3ModalSetup";

export default function WagmiSetup({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const appWalletPasswordModal = useAppWalletPasswordModal();
  const [wagmiConfig, setWagmiConfig] = useState<WagmiConfig>();

  useEffect(() => {
    import("@/wagmiConfig/wagmiConfig").then(({ getWagmiConfig }) => {
      getWagmiConfig().then((c) => {
        initWeb3Modal(c.config);
        setWagmiConfig(c);
      });
    });
  }, []);

  useEffect(() => {
    const updateWagmiConfig = () => {
      import("@/wagmiConfig/wagmiConfig").then(({ getWagmiConfig }) => {
        getWagmiConfig().then((c) => setWagmiConfig(c));
      });
    };

    window.api?.onSeedWalletsChange(updateWagmiConfig);
    updateWagmiConfig();

    return () => {
      window.api?.offSeedWalletsChange(updateWagmiConfig);
    };
  }, []);

  if (!wagmiConfig) {
    return null;
  }

  return (
    <WagmiProvider config={wagmiConfig.config}>
      {children}
      {appWalletPasswordModal.modal}
    </WagmiProvider>
  );
}
