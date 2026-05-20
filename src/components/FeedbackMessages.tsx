import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface SuccessMessageProps {
  message: string;
  visible: boolean;
  duration?: number;
  onHide?: () => void;
}

/**
 * Успішне повідомлення з автоматичним приховуванням
 */
export const SuccessMessage: React.FC<SuccessMessageProps> = ({ message, visible, duration = 3000, onHide }) => {
  const [show, setShow] = useState(visible);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShow(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setShow(false);
          onHide?.();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, duration, opacity, onHide]);

  if (!show) return null;

  return (
    <Animated.View style={[styles.successContainer, { opacity }]}>
      <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
      <Text style={styles.successText}>{message}</Text>
    </Animated.View>
  );
};

interface InfoMessageProps {
  message: string;
  tip?: string;
  visible?: boolean;
}

/**
 * Інформаційне повідомлення
 */
export const InfoMessage: React.FC<InfoMessageProps> = ({ message, tip, visible = true }) => {
  if (!visible) return null;

  return (
    <View style={styles.infoContainer}>
      <MaterialCommunityIcons name="information" size={18} color="#3B82F6" />
      <View style={styles.infoText}>
        <Text style={styles.infoMessage}>{message}</Text>
        {tip && <Text style={styles.infoTip}>{tip}</Text>}
      </View>
    </View>
  );
};

interface WarningMessageProps {
  message: string;
  tip?: string;
  visible?: boolean;
}

/**
 * Попереджувальне повідомлення
 */
export const WarningMessage: React.FC<WarningMessageProps> = ({ message, tip, visible = true }) => {
  if (!visible) return null;

  return (
    <View style={styles.warningContainer}>
      <MaterialCommunityIcons name="alert" size={18} color="#F59E0B" />
      <View style={styles.warningText}>
        <Text style={styles.warningMessage}>{message}</Text>
        {tip && <Text style={styles.warningTip}>{tip}</Text>}
      </View>
    </View>
  );
};

interface TipMessageProps {
  title: string;
  message: string;
  icon?: string;
  visible?: boolean;
}

/**
 * Порада/підказка
 */
export const TipMessage: React.FC<TipMessageProps> = ({ title, message, icon = 'lightbulb', visible = true }) => {
  if (!visible) return null;

  return (
    <View style={styles.tipContainer}>
      <View style={styles.tipIcon}>
        <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.tipContent}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipMessage}>{message}</Text>
      </View>
    </View>
  );
};

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  tip?: string;
}

/**
 * Пуста сторінка
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, tip }) => {
  return (
    <View style={styles.emptyStateContainer}>
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={56} color="#D1D5DB" />
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateMessage}>{message}</Text>
      {tip && <Text style={styles.emptyStateTip}>{tip}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  successContainer: {
    flexDirection: 'row',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
    marginLeft: 10,
    flex: 1,
  },
  infoContainer: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoText: {
    marginLeft: 10,
    flex: 1,
  },
  infoMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
    lineHeight: 18,
  },
  infoTip: {
    fontSize: 12,
    color: '#1E3A8A',
    marginTop: 4,
    fontStyle: 'italic',
  },
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  warningText: {
    marginLeft: 10,
    flex: 1,
  },
  warningMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 18,
  },
  warningTip: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 4,
    fontStyle: 'italic',
  },
  tipContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
    justifyContent: 'center',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B21A8',
  },
  tipMessage: {
    fontSize: 12,
    color: '#7C3AED',
    marginTop: 4,
    lineHeight: 16,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2937',
    marginTop: 12,
  },
  emptyStateMessage: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyStateTip: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default {
  SuccessMessage,
  InfoMessage,
  WarningMessage,
  TipMessage,
  EmptyState,
};
