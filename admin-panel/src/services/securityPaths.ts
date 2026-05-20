export const SECURITY_APP_CONTROL_PATH = 'security_config/app_control/current';
export const SECURITY_AUTHORIZED_DEVICES_PATH = 'authorized_devices';
export const SECURITY_LOGS_PATH = 'security_logs/client_events';
export const USERS_PATH = 'users';

export const MODERATION_PATHS = {
  requests: 'requests',
  appSuggestions: 'app_suggestions',
  communityPhotos: 'community_photos',
  datingProfiles: 'dating_profiles',
  datingAnketaListings: 'dating_anketa_listings',
  datingPrivate: 'dating_profile_private',
  coffeeRequests: 'coffee_requests',
  coffeePrivate: 'coffee_request_private',
  buySell: 'buy_sell_listings',
  contactsListings: 'contacts_listings',
  localBusiness: 'local_business',
  jobs: 'job_listings',
  lostFound: 'lost_found',
  osbbNews: 'osbb_news',
  osbbVotes: 'osbb_votes',
  osbbHouseTopics: 'osbb_house_topics',
  osbbCollections: 'osbb_collections',
  blockedUsers: 'service_moderation/blocked_users',
  deletedUsers: 'service_moderation/deleted_users',
} as const;
