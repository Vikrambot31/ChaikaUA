import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  previewUri: string;
  onPress: () => void;
  onRemove?: () => void;
  loading?: boolean;
  disabled?: boolean;
  addLabel: string;
  removeLabel?: string;
  iconColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  height?: number;
  testID?: string;
};

const PhotoPreviewField: React.FC<Props> = ({
  previewUri,
  onPress,
  onRemove,
  loading = false,
  disabled = false,
  addLabel,
  removeLabel,
  iconColor = '#5E534C',
  accentColor = '#7A4B36',
  backgroundColor = '#F7F3EE',
  borderColor = '#E8DDD3',
  height = 170,
  testID,
}) => {
  const hasPhoto = Boolean(previewUri);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [previewUri]);

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor, borderColor, height },
          disabled && styles.buttonDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.84}
        testID={testID}
      >
        {loading ? (
          <ActivityIndicator color={accentColor} />
        ) : hasPhoto && !imageFailed ? (
          <Image
            source={{ uri: previewUri }}
            style={styles.preview}
            onError={(error) => {
              console.warn('[PhotoPreviewField] preview image failed to load', {
                previewUri: previewUri.slice(0, 120),
                error: error.nativeEvent?.error,
              });
              setImageFailed(true);
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name={hasPhoto ? 'image-off-outline' : 'camera-plus-outline'} size={30} color={iconColor} />
            <Text style={[styles.placeholderText, { color: iconColor }]}>
              {hasPhoto ? 'Фото не удалось показать. Выберите другое фото.' : addLabel}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {hasPhoto && onRemove ? (
        <TouchableOpacity style={styles.removeButton} onPress={onRemove} activeOpacity={0.82} disabled={disabled || loading}>
          <Text style={[styles.removeText, { color: accentColor }]}>{removeLabel || addLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  preview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    backgroundColor: 'transparent',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  placeholderText: {
    fontWeight: '900',
    textAlign: 'center',
  },
  removeButton: {
    marginTop: 8,
    alignSelf: 'center',
  },
  removeText: {
    fontSize: 13,
    fontWeight: '800',
  },
});

export default PhotoPreviewField;
