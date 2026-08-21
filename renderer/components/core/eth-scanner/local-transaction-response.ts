import type { Transaction } from "@/entities/ITransaction";
import type {
  RawTransaction,
  RawTransactionResponse,
} from "@/shared/preload-types";
import type { PaginatedResponseLocal } from "@/shared/types";

const normalizeLocalTransaction = (
  transaction: RawTransaction
): Transaction => ({
  ...transaction,
  from_display: transaction.from_display,
  to_display: transaction.to_display,
  transaction_date: new Date(transaction.transaction_date * 1000),
});

export const normalizeLocalTransactionResponse = (
  response: RawTransactionResponse
): PaginatedResponseLocal<Transaction> => ({
  ...response,
  data: response.data.map(normalizeLocalTransaction),
});
