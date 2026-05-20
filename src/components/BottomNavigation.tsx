import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS: string[] = ['Map', 'List', 'Requests', 'Profile', 'Help'];

const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => onTabChange(tab)} activeOpacity={0.75}>
            <Text style={[styles.label, { color: isActive ? '#7A1E5C' : '#999999' }]}>{tab}</Text>
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
