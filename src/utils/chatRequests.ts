export type ChatRequestLike = {
  id: string;
  userId?: string;
  name: string;
  photoUri?: string;
  photoStoragePath?: string;
  userPhotoURL?: string;
  startAvatarKey?: string;
  sourceItemId?: string;
  sourceType?: string;
  sourceCategory?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  text?: string;
  description?: string;
  category?: string;
  group?: string;
  subcategory?: string;
  building?: string;
  phone?: string;
  status?: string;
  timestamp?: number;
  createdAt?: { getTime?: () => number } | Date;
  expires_at?: number;
};

export const getChatRequestTimestamp = (item: ChatRequestLike): number =>
  item.timestamp ?? item.createdAt?.getTime?.() ?? 0;

export const normalizeChatRequests = <T extends ChatRequestLike>(data: T[]): T[] =>
  data
    .filter((r) => !r.expires_at || r.expires_at > Date.now())
    .sort((a, b) => getChatRequestTimestamp(b) - getChatRequestTimestamp(a));

export const filterChatRequests = <T extends ChatRequestLike>(
  data: T[],
  search: string,
  category: string | null,
): T[] => {
  let filtered = data;

  if (category) {
    filtered = filtered.filter((req) => req.category === category);
  }

  if (!search) {
    return filtered;
  }

  const normalized = search.toLowerCase();
  return filtered.filter(
    (req) =>
      req.text?.toLowerCase().includes(normalized) ||
      req.name?.toLowerCase().includes(normalized),
  );
};
