import { NavigationProp, ParamListBase } from '@react-navigation/native';

type NavigationLike =
  | NavigationProp<ParamListBase>
  | {
      navigate: (name: string, params?: object) => void;
      getState?: () => unknown;
      getParent?: () => unknown;
    };

const tryNavigate = (
  navigation: NavigationProp<ParamListBase>,
  routeName: string,
  params?: object
): boolean => {
  try {
    navigation.navigate(routeName, params);
    return true;
  } catch {
    return false;
  }
};

export const safeNavigate = (
  navigation: NavigationLike,
  routeName: string,
  params?: object
): boolean => {
  try {
    const navWithState = navigation as NavigationProp<ParamListBase>;

    if (!navigation.getState) {
      navigation.navigate(routeName, params);
      return true;
    }

    let cursor: NavigationProp<ParamListBase> | undefined = navWithState;
    while (cursor) {
      if (tryNavigate(cursor, routeName, params)) {
        return true;
      }
      cursor = cursor.getParent?.() as NavigationProp<ParamListBase> | undefined;
    }

    return false;
  } catch (error) {
    if (__DEV__) {
      console.error(`[safeNavigate] Failed to navigate to ${routeName}`, error);
    }
    return false;
  }
};
