import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ValidationError } from '../utils/validationMessages';

interface ValidationErrorMessageProps {
  error: ValidationError | null;
  visible?: boolean;
}

/**
 * Компонент для відображення помилок 20;V40FVW
 * Показує повідомлення та поради до виправлення
 */
export const ValidationErrorMessage: React.FC<ValidationErrorMessageProps> = ({ error, visible = true }) => {
  if (!error || !visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialCommunityIcons name="alert-circle" size={18} color="#DC2626" style={styles.icon} />
        <View style={styles.text}>
          <Text style={styles.errorMessage}>{error.message}</Text>
          {error.tip && <Text style={styles.tip}>{error.tip}</Text>}
        </View>
      </View>
    </View>
  );
};

interface ValidationErrorsListProps {
  errors: ValidationError[];
  visible?: boolean;
}

/**
 * !?8A>: всех ошибок 20;V40FVW
 */
export const ValidationErrorsList: React.FC<ValidationErrorsListProps> = ({ errors, visible = true }) => {
  if (!visible || errors.length === 0) {
    return null;
  }

  return (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <MaterialCommunityIcons name="alert" size={20} color="#DC2626" />
        <Text style={styles.listTitle}>Помилки в формі</Text>
      </View>
      {errors.map((error, index) => (
        <View key={`${error.field}-${index}`} style={styles.listItem}>
          <Text style={styles.listItemText}>• {error.message}</Text>
          {error.tip && <Text style={styles.listItemTip}>{error.tip}</Text>}
        </View>
      ))}
    </View>
  );
};

interface FormFieldErrorProps {
  error?: string;
  tip?: string;
  visible?: boolean;
}

/**
 * Компактна версія для окремого поля форми
 */
export const FormFieldError: React.FC<FormFieldErrorProps> = ({ error, tip, visible = true }) => {
  if (!error || !visible) {
    return null;
  }

  return (
    <View style={styles.fieldErrorContainer}>
      <MaterialCommunityIcons name="close-circle" size={16} color="#DC2626" />
      <View style={styles.fieldErrorText}>
        <Text style={styles.fieldErrorMessage}>{error}</Text>
        {tip && <Text style={styles.fieldErrorTip}>{tip}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
  },
  icon: {
    marginRight: 10,
    marginTop: 2,
  },
  text: {
    flex: 1,
  },
  errorMessage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7F1D1D',
    lineHeight: 18,
  },
  tip: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 4,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  listContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#7F1D1D',
    marginLeft: 8,
  },
  listItem: {
    marginBottom: 10,
  },
  listItemText: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 18,
  },
  listItemTip: {
    fontSize: 11,
    color: '#A84343',
    marginTop: 4,
    marginLeft: 16,
    fontStyle: 'italic',
  },
  fieldErrorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    paddingLeft: 4,
  },
  fieldErrorText: {
    marginLeft: 6,
    flex: 1,
  },
  fieldErrorMessage: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    lineHeight: 16,
  },
  fieldErrorTip: {
    fontSize: 11,
    color: '#991B1B',
    marginTop: 2,
    fontStyle: 'italic',
  },
});

export default ValidationErrorMessage;
