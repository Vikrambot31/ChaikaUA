import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { HelperOption } from '../types/app';
import { pickUserAvatarUri } from '../utils/userAvatar';
import MiniUserAvatar from './MiniUserAvatar';

interface Props {
  visible: boolean;
  helpers: HelperOption[];
  onConfirm: (selectedUids: string[]) => void;
  onNobodyHelped: () => void;
  onCancel: () => void;
}

const ACCENT = '#7A1E5C';

const HelperSelectionModal: React.FC<Props> = ({ visible, helpers, onConfirm, onNobodyHelped, onCancel }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleHelper = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    setSelected(new Set());
  };

  const handleNobodyHelped = () => {
    onNobodyHelped();
    setSelected(new Set());
  };

  const handleCancel = () => {
    setSelected(new Set());
    onCancel();
  };

  const renderHelper = ({ item }: { item: HelperOption }) => {
    const isChecked = selected.has(item.uid);
    return (
      <TouchableOpacity
        style={styles.helperRow}
        onPress={() => toggleHelper(item.uid)}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
          {isChecked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <MiniUserAvatar
          uri={pickUserAvatarUri({ startAvatarKey: item.avatarKey })}
          name={item.name}
          size={36}
          backgroundColor="#4B7F9E"
        />
        <View style={styles.helperInfo}>
          <Text style={styles.helperName}>{item.name}</Text>
          <Text style={styles.helperPreview} numberOfLines={1}>
            {item.commentPreview}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={handleCancel}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />

          <Text style={styles.title}>{t.comments.modalTitle}</Text>

          {helpers.length === 0 ? (
            <Text style={styles.emptyText}>{t.comments.empty}</Text>
          ) : (
            <FlatList
              data={helpers}
              renderItem={renderHelper}
              keyExtractor={(item) => item.uid}
              scrollEnabled={false}
            />
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.nobodyButton}
              onPress={handleNobodyHelped}
              activeOpacity={0.8}
            >
              <Text style={styles.nobodyButtonText}>{t.comments.nobodyHelped}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, selected.size === 0 && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={selected.size === 0}
              activeOpacity={0.84}
            >
              <Text style={styles.confirmButtonText}>{t.comments.confirm}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  helperInfo: {
    flex: 1,
  },
  helperName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  helperPreview: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    paddingVertical: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  nobodyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
  },
  nobodyButtonText: {
    fontSize: 15,
    color: '#666',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCC',
  },
  confirmButtonText: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '600',
  },
});

export default HelperSelectionModal;
