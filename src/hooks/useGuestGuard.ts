import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../redux/selectors';

/**
 * Returns a `guard` wrapper that lets authenticated users run an action
 * immediately, while showing a soft registration banner for guests.
 *
 * Usage:
 *   const { guard, bannerVisible, hideBanner } = useGuestGuard();
 *   <TouchableOpacity onPress={guard(() => doSomething())} />
 *   <GuestRegisterBanner visible={bannerVisible} onClose={hideBanner} />
 */
export function useGuestGuard() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [bannerVisible, setBannerVisible] = useState(false);

  const guard = (action: () => void) => () => {
    if (isAuthenticated) {
      action();
    } else {
      setBannerVisible(true);
    }
  };

  return {
    guard,
    bannerVisible,
    hideBanner: () => setBannerVisible(false),
  };
}
