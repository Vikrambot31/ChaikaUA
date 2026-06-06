export enum PlaceType {
  SHOP = 'shop',
  SCHOOL = 'school',
  KINDERGARTEN = 'kindergarten',
  CAFE = 'cafe',
  SERVICE = 'service',
  PHARMACY = 'pharmacy',
  SALON = 'salon',
  RESTAURANT = 'restaurant',
  BUILDING = 'building',
}

export interface Place {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: PlaceType;
  rating: number;
  reviews: number;
  phone?: string;
  website?: string;
  workingHours?: string;
  createdAt: number;
  childInfo?: ChildInfo;
  foodInfo?: FoodInfo;
  beautyInfo?: BeautyInfo;
}

// --- Food module (раздел "Еда на Чайке") ---

export type FoodCategory =
  | 'pizza'
  | 'cafe'
  | 'restaurant'
  | 'grocery';

export interface FoodInfo {
  category: FoodCategory;
  subCategory?: 'pizza' | 'coffee' | 'bakery' | 'grocery' | string;
  deliveryAvailable?: boolean;
  orderUrl?: string;
  telegram?: string;
}

export interface FoodOffer {
  id: string;
  placeId: string;
  title: string;
  shortText: string;
  validUntil?: number;
  isActive: boolean;
  createdAt: number;
}

export type ShoppingCategory =
  | 'dairy'
  | 'bread'
  | 'meat_fish'
  | 'vegetables'
  | 'groats'
  | 'sauces'
  | 'drinks'
  | 'snacks'
  | 'other';

export interface ShoppingItem {
  id: string;
  name: string;
  category: ShoppingCategory;
  icon: string;
  isChecked: boolean;
  isHidden: boolean;
  sortOrder: number;
}

// --- Children module (раздел "Все для детей") ---

export type ChildCategory =
  | 'kindergarten'
  | 'school'
  | 'development'
  | 'sport'
  | 'medical'
  | 'event';

export type ChildFeature =
  | 'shelter'
  | 'food'
  | 'english'
  | 'speech_therapist'
  | 'nurse'
  | 'sport'
  | 'full_day'
  | 'half_day'
  | 'trial_day';

export interface ChildSafetyInfo {
  hasShelter?: boolean;
  hasSecurityGuard?: boolean;
  hasVideoSurveillance?: boolean;
  hasClosedTerritory?: boolean;
  hasAccessControl?: boolean;
  hasFireSafety?: boolean;
}

export interface ChildMedicalInfo {
  hasNurse?: boolean;
  hasDoctor?: boolean;
  hasFirstAid?: boolean;
  hasAllergySupport?: boolean;
  nearbyClinic?: string;
}

export interface ChildInfo {
  category: ChildCategory;
  ageFrom?: number;
  ageTo?: number;
  priceFrom?: number;
  pricePeriod?: 'month' | 'lesson' | 'day' | 'once';
  hasAvailablePlaces?: boolean;
  schedule?: string;
  shortDescription?: string;
  fullDescription?: string;
  telegram?: string;
  photos?: string[];
  features?: ChildFeature[];
  safety?: ChildSafetyInfo;
  medical?: ChildMedicalInfo;
}

export interface ChildOffer {
  id: string;
  placeId: string;
  type: 'promotion' | 'event' | 'open_day' | 'trial_lesson' | 'available_places';
  title: string;
  shortText: string;
  fullText?: string;
  dateFrom?: number;
  dateTo?: number;
  validUntil?: number;
  ageFrom?: number;
  ageTo?: number;
  price?: number;
  discountPercent?: number;
  isFeatured?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// --- Beauty module (раздел "Салоны красоты") ---

export type BeautyCategory =
  | 'hair'
  | 'nails'
  | 'cosmetology'
  | 'massage'
  | 'barbershop'
  | 'spa';

export type BeautyFeature =
  | 'home_visit'
  | 'online_booking'
  | 'kids_friendly'
  | 'men'
  | 'women'
  | 'parking'
  | 'certificate'
  | 'discount_first';

export interface BeautyInfo {
  category: BeautyCategory;
  priceFrom?: number;
  pricePeriod?: 'service' | 'hour' | 'session';
  hasAvailableSlots?: boolean;
  workingHours?: string;
  shortDescription?: string;
  fullDescription?: string;
  telegram?: string;
  instagram?: string;
  photos?: string[];
  features?: BeautyFeature[];
  rating?: number;
  masterName?: string;
}

export interface BeautyOffer {
  id: string;
  placeId: string;
  type: 'promotion' | 'event' | 'new_master' | 'discount' | 'available_slots';
  title: string;
  shortText: string;
  fullText?: string;
  dateFrom?: number;
  dateTo?: number;
  validUntil?: number;
  price?: number;
  discountPercent?: number;
  isFeatured?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AudioAttachment {
  url: string;
  duration: number;
  storagePath: string;
  uploadedAt: number;
  transcript?: string;
}

export type ProblemResolutionStatus = 'new' | 'in_progress' | 'resolved' | 'rejected';

export interface Request {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  description: string;
  isCensored: boolean;
  isApproved: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  timestamp: number;
  text?: string;
  category?: string;
  group?: string;
  subcategory?: string;
  store?: string;
  timeSlot?: string;
  destination?: string;
  building?: string;
  expires_at?: number;
  moderatedAt?: number;
  moderatedBy?: string;
  moderationReason?: string;
  rejectionReason?: string;
  resolutionStatus?: ProblemResolutionStatus;
  resolutionStatusUpdatedAt?: number;
  resolvedAt?: number;
  audio?: AudioAttachment;
  photoUri?: string;
  photoStoragePath?: string;
  userPhotoURL?: string;
  startAvatarKey?: string;
  sourceItemId?: string;
  sourceType?: string;
  sourceCategory?: string;
  sourceTitle?: string;
  sourceDescription?: string;
}

export interface HelpRequest {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  description: string;
  category?: string;
  group?: string;
  subcategory?: string;
  photoUri?: string;
  photoStoragePath?: string;
  createdAt: Date;
  expiresAt: Date;
  isBurning: boolean;
  moderationStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  submittedForModerationAt?: string;
  moderatedAt?: string;
  moderationReason?: string;
  rejectionReason?: string;
}

export interface CommunityPhoto {
  id: string;
  title: string;
  description: string;
  imageUri: string | number;
  storagePath?: string;
  uploadedBy: string;
  userId?: string;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  target?: 'gallery_public' | 'my_photos';
  sourceScreen?: string;
  sourceScreenLabel?: string;
  sourceFeature?: string;
  likes: number;
  locationLabel?: string;
  locationType?: 'building' | 'place';
  moderationReason?: string;
  rejectionReason?: string;
}

export interface User {
  id: string;
  email: string;
  phone: string;
  name: string;
  registeredAt: string;
  daysUsed: number;
  isActive: boolean;
  city: string;
  houseNumber?: string;
  profession?: string;
  about?: string;
  registrationStatus: 'partial' | 'complete';
  photoURL?: string;
  photoURLs?: string[];
  startAvatarKey?: string;
  gender?: 'male' | 'female';
  age?: number;
  provider?: 'google' | 'facebook' | 'apple' | 'email';
  providerId?: string;
  referrerPhone?: string;
  fcmToken?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  fcmToken: string | null;
  isBootstrapped: boolean;
}

export interface PlacesState {
  items: Place[];
  loading: boolean;
  error: string | null;
  filtered: Place[];
  searchQuery: string;
  selectedTypes: PlaceType[];
  lastFetchedAt: number | null;
}

export interface RequestsState {
  items: Request[];
  loading: boolean;
  error: string | null;
  approved: Request[];
}

export interface HelpRequestsState {
  items: HelpRequest[];
  todayItems: HelpRequest[];
  loading: boolean;
  error: string | null;
}

export interface LanguageState {
  current: string;
}

export interface SubscriptionState {
  plan: 'free' | 'premium' | 'premium_plus';
  expiresAt: string | null;
  activatedAt: string | null;
}

export interface RequestFormData {
  name: string;
  phone: string;
  description: string;
  language?: 'ua' | 'ru' | 'en';
  category?: string;
  text?: string;
  group?: string;
  subcategory?: string;
  store?: string;
  timeSlot?: string;
  destination?: string;
  building?: string;
  audioUri?: string;
  audioDuration?: number;
  photoUri?: string;
  photoStoragePath?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ElectricityState {
  reports: Array<{
    id: string;
    buildingId: string;
    status: 'on' | 'off';
    createdAt: Date;
    userName: string;
    userPhone: string;
  }>;
  todayReports: Array<{
    id: string;
    buildingId: string;
    status: 'on' | 'off';
    createdAt: Date;
    userName: string;
    userPhone: string;
  }>;
  loading: boolean;
  error: string | null;
}

export interface OsbbState {
  buildingId: string | null;
  street: string | null;
  houseNumber: string | null;
  apartment: string | null;
  role: 'resident' | 'osbb_manager';
  isSetupDone: boolean;
  viewMode: 'extended' | 'simple';
}
