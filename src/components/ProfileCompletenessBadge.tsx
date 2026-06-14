import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import type { ContactListing } from '../services/contactsService';

type Props = {
  listing: ContactListing;
  isOwn?: boolean;
  hintText?: string;
  style?: StyleProp<ViewStyle>;
};

function calculateCompleteness(listing: ContactListing): { percent: number; missingCount: number } {
  const fields = [
    Boolean(listing.itemName),
    Boolean(listing.category),
    Boolean(listing.condition),
    Boolean(listing.price),
    Boolean(listing.phone),
    Boolean(listing.description),
    Boolean(listing.photoUri || (listing.photoUris && listing.photoUris.length > 0)),
    Boolean(listing.zodiacSign),
    Boolean(listing.humanDesignType),
    Boolean(listing.humanDesignProfile),
  ];
  const filled = fields.filter(Boolean).length;
  return { percent: Math.round((filled / fields.length) * 100), missingCount: fields.length - filled };
}

export default function ProfileCompletenessBadge({ listing, isOwn, hintText, style }: Props) {
  const { percent, missingCount } = calculateCompleteness(listing);

  let badgeColor = '#DC2626'; // red < 50%
  if (percent >= 80) {
    badgeColor = '#16A34A'; // green > 80%
  } else if (percent >= 50) {
    badgeColor = '#7A2551'; // yellow 50-80%
  }

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.badgeText}>{percent}%</Text>
      </View>
      {isOwn && missingCount > 0 && hintText ? (
        <Text style={styles.hint} numberOfLines={1}>{hintText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 9,
    fontWeight: '600',
    color: '#78716C',
    flexShrink: 1,
  },
});
