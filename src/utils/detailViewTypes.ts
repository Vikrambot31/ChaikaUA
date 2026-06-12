export type BusinessMenuItem = {
  name: string;
  price: string;
};

export type BusinessPromotion = {
  title: string;
  description: string;
  dateUntil: string; // ISO date string
};

export type DetailItemData = {
  id: string;
  title: string;
  description?: string;
  photoUri?: string;
  photoStoragePath?: string;
  phone?: string;
  category?: string;
  price?: string;
  priceLabel?: string;
  address?: string;
  status?: string;
  votesCount?: number;
  hasVoted?: boolean;
  userId?: string;
  ownerAvatarUri?: string;
  createdAt?: string;
  sourceType: string;
  sourceId: string;
  // Contacts listing fields (only for sourceType 'lyudi')
  moderationStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  photoUris?: string[];
  photoStoragePaths?: string[];
  rawCondition?: string;
  zodiacSign?: string;
  humanDesignType?: string;
  humanDesignProfile?: string;
  lookingForGender?: string;
  showPhone?: boolean;
  lastEditedAt?: string;
  rawPhone?: string;
  // Business+ fields (only for sourceType 'place' / 'food_top')
  businessPlusOwnerId?: string;
  businessPlusModerationStatus?: 'pending' | 'approved' | 'rejected';
  businessPhotoUri?: string;
  businessPhotoStoragePath?: string;
  menuItems?: BusinessMenuItem[];   // up to 20
  promotions?: BusinessPromotion[]; // up to 3
};
