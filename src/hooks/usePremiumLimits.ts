import { useSelector } from 'react-redux';
import { selectIsPremium } from '../redux/slices/subscriptionSlice';

export type PremiumLimitCategory =
  | 'buySellMax'
  | 'requestsMax'
  | 'soulPhotosPerDay'
  | 'districtPhotosPerDay'
  | 'jobsMax';

export interface PremiumLimits {
  buySellMax: number;
  requestsMax: number;
  soulPhotosPerDay: number;
  districtPhotosPerDay: number;
  jobsMax: number;
}

const FREE_LIMITS: PremiumLimits = {
  buySellMax: 2,
  requestsMax: 3,
  soulPhotosPerDay: 3,
  districtPhotosPerDay: 5,
  jobsMax: 1,
};

const PREMIUM_LIMITS: PremiumLimits = {
  buySellMax: 5,
  requestsMax: 6,
  soulPhotosPerDay: 6,
  districtPhotosPerDay: 10,
  jobsMax: 3,
};

export interface UsePremiumLimitsResult {
  limits: PremiumLimits;
  isPremium: boolean;
  /**
   * Returns true if the user can add more items (currentCount < limit),
   * or if the user has Premium (limit is automatically not exceeded in that tier context).
   */
  checkLimit: (category: PremiumLimitCategory, currentCount: number) => boolean;
}

export function usePremiumLimits(): UsePremiumLimitsResult {
  const isPremium = useSelector(selectIsPremium);
  const limits = isPremium ? PREMIUM_LIMITS : FREE_LIMITS;

  const checkLimit = (category: PremiumLimitCategory, currentCount: number): boolean => {
    return currentCount < limits[category];
  };

  return { limits, isPremium, checkLimit };
}
