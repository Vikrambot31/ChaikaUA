import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { SCREEN_THEME, DARK_THEME_COLORS } from '../utils/screenTheme';

export function useAppTheme() {
  const theme = useSelector((state: RootState) => state.theme?.current ?? 'light');
  const isDark = theme === 'dark';
  return {
    isDark,
    theme,
    colors: {
      appBg: isDark ? DARK_THEME_COLORS.appBg : SCREEN_THEME.appBg,
      navBarBg: isDark ? DARK_THEME_COLORS.navBarBg : SCREEN_THEME.navBarBg,
      navBarBorder: isDark ? DARK_THEME_COLORS.navBarBorder : SCREEN_THEME.navBarBorder,
      navTabDefault: isDark ? DARK_THEME_COLORS.navTabDefault : SCREEN_THEME.navTabDefault,
      navTabActive: isDark ? DARK_THEME_COLORS.navTabActive : SCREEN_THEME.navTabActive,
      uiBorder: isDark ? DARK_THEME_COLORS.uiBorder : SCREEN_THEME.uiBorder,
      textPrimary: isDark ? DARK_THEME_COLORS.textPrimary : SCREEN_THEME.textPrimary,
      textSecondary: isDark ? DARK_THEME_COLORS.textSecondary : SCREEN_THEME.textSecondary,
      textMuted: isDark ? DARK_THEME_COLORS.textMuted : SCREEN_THEME.textMuted,
      placeholder: isDark ? DARK_THEME_COLORS.placeholder : '#A0938D',
      paper: isDark ? DARK_THEME_COLORS.paper : SCREEN_THEME.paper,
      cardBg: isDark ? DARK_THEME_COLORS.cardBg : SCREEN_THEME.paperStrong,
      inputBg: isDark ? DARK_THEME_COLORS.inputBg : '#FFFFFF',
      inputDisabledBg: isDark ? DARK_THEME_COLORS.inputDisabledBg : '#F0F0F0',
      accentText: isDark ? DARK_THEME_COLORS.accentText : SCREEN_THEME.terracotta,
    },
  };
}
