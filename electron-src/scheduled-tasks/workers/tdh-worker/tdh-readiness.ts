export function getTdhCheckpointWaitingMessage(
  targetBlock: number,
  transactionsBlock: number,
  nftDelegationBlock: number,
): string | null {
  if (transactionsBlock < targetBlock) {
    return `Waiting for Transactions to reach block ${targetBlock} — currently ${transactionsBlock}`;
  }
  if (nftDelegationBlock < targetBlock) {
    return `Waiting for NFTDelegation to reach block ${targetBlock} — currently ${nftDelegationBlock}`;
  }
  return null;
}
