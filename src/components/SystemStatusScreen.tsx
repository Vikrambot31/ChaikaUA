import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';

type SystemStatusScreenProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const SystemStatusScreen: React.FC<SystemStatusScreenProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name={icon} size={34} color="#fff" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.actionButton} activeOpacity={0.86} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    padding: 24,
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadowStrong,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  actionButton: {
    marginTop: 18,
    minHeight: 48,
    minWidth: 180,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default SystemStatusScreen;
