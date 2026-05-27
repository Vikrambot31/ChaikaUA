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
}

export interface AudioAttachment {
  url: string;
  duration: number;
  storagePath: string;
  uploadedAt: number;
  transcript?: string;
}

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
  audio?: AudioAttachment;
  photoUri?: string;
  photoStoragePath?: string;
  userPhotoURL?: string;
  startAvatarKey?: string;
}

export interface HelpRequest {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  description: string;
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
