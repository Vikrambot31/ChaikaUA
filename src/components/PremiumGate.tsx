import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { selectIsPremium } from '../redux/slices/subscriptionSlice';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useTranslation } from '../i18n/useTranslation';

interface PremiumGateProps {
  /** Whether premium is required to see the content */
  required: boolean;
  children: React.ReactNode;
  /** Optional fallback to show instead of the lock overlay */
  fallback?: React.ReactNode;
  /** Optional callback when user taps "Upgrade to Premium" */
  onUpgrade?: () => void;
}

/**
 * PremiumGate wraps content that requires Premium access.
 *
 * - If `required` is false, or user already has Premium: renders children normally.
 * - Otherwise: renders a lock overlay with a badge and an upgrade button.
 */
export const PremiumGate: React.FC<PremiumGateProps> = ({
  required,
  children,
  fallback,
  onUpgrade,
}) => {
  const isPremium = useSelector(selectIsPremium);
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { t } = useTranslation();

  // If not required or user has premium — show content as normal
  if (!required || isPremium) {
    return <>{children}</>;
  }

  // If a custom fallback is provided, render it
  if (fallback) {
    return <>{fallback}</>;
  }

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigation.navigate('SubscriptionScreen');
    }
  };

  return (
    <View style={styles.lockContainer}>
      <View style={styles.lockOverlay}>
        <View style={styles.badgeRow}>
          <MaterialCommunityIcons name="crown" size={22} color="#C79C47" />
          <Text style={styles.badgeText}>{'\u2B50 Premium'}</Text>
        </View>
        <Text style={styles.lockMessage}>
          {t.premium.gateMessage}
        </Text>
        <TouchableOpacity
          style={styles.upgradeButton}
          activeOpacity={0.82}
          onPress={handleUpgrade}
        >
          <MaterialCommunityIcons name="crown" size={16} color="#FBF8FD" />
          <Text style={styles.upgradeButtonText}>{t.premium.upgradeButton}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  lockContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  lockOverlay: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(199, 156, 71, 0.14)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(199, 156, 71, 0.28)',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#C79C47',
  },
  lockMessage: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C79C47',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 4,
  },
  upgradeButtonText: {
    color: '#FBF8FD',
    fontSize: 14,
    fontWeight: '900',
  },
});
