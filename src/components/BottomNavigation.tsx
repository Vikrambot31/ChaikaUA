import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  language?: 'ua' | 'ru' | 'en';
}

const TAB_LABELS: Record<string, Record<string, string>> = {
  ua: { Map: 'Карта', List: 'Список', Requests: 'Запити', Profile: 'Профіль', Help: 'Допомога' },
  ru: { Map: 'Карта', List: 'Список', Requests: 'Запросы', Profile: 'Профиль', Help: 'Помощь' },
  en: { Map: 'Map', List: 'List', Requests: 'Requests', Profile: 'Profile', Help: 'Help' },
};

const TAB_IDS = ['Map', 'List', 'Requests', 'Profile', 'Help'];

const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange, language = 'ua' }) => {
  const labels = TAB_LABELS[language] ?? TAB_LABELS.ua;
  const { colors, isDark } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.paper, borderTopColor: colors.uiBorder }]}>
      {TAB_IDS.map((id) => {
        const isActive = activeTab === id;
        return (
          <TouchableOpacity key={id} style={styles.tab} onPress={() => onTabChange(id)} activeOpacity={0.75}>
            <Text style={[styles.label, { color: isActive ? (isDark ? colors.textPrimary : '#7A1E5C') : colors.textMuted }]}>{labels[id]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E5E5', paddingVertical: 10, paddingHorizontal: 5, justifyContent: 'space-between' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 12, fontWeight: '600' },
});

export default BottomNavigation;
