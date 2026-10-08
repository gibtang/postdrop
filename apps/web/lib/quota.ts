import { Drop } from "./models";

export const FREE_TIER_CAP_BYTES = 104857600; // 100 MB
export const MAX_FILE_BYTES = 1073741824; // 1 GB

/** Total unpurged storage used by an account. */
export async function accountStorageBytes(accountId: string): Promise<number> {
  const [row] = await Drop.aggregate<{ total: number | null }>([
    { $match: { accountId, purgedAt: null } },
    { $group: { _id: null, total: { $sum: "$sizeBytes" } } },
  ]);
  return row?.total ?? 0;
}
