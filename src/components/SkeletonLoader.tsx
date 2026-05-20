import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, StyleProp, ViewStyle } from 'react-native';

interface SkeletonLoaderProps {
  width?: number | 'auto' | `${number}%`;
  height?: number | 'auto' | `${number}%`;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Skeleton Loader Component
 * Shows a shimmer animation while content is loading
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity: shimmerOpacity,
        },
        style,
      ]}
    />
  );
};

interface SkeletonCardProps {
  count?: number;
  height?: number;
}

/**
 * Skeleton Card - Multiple skeletons for a card-like layout
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ count = 3, height = 16 }) => {
  return (
    <View style={styles.card}>
      <SkeletonLoader width="60%" height={height + 8} style={styles.mb12} />
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonLoader
          key={i}
          width={i === count - 1 ? '70%' : '100%'}
          height={height}
          style={[styles.mb8, i === count - 1 && styles.mb0]}
        />
      ))}
    </View>
  );
};

interface SkeletonListProps {
  count?: number;
  cardHeight?: number;
  spacing?: number;
}

/**
 * Skeleton List - Multiple skeleton cards
 */
export const SkeletonList: React.FC<SkeletonListProps> = ({ count = 5, spacing = 12 }) => {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.listItem, { marginBottom: i === count - 1 ? 0 : spacing }]}>
          <SkeletonLoader width={60} height={60} borderRadius={8} style={styles.mb12} />
          <View style={{ flex: 1 }}>
            <SkeletonLoader width="80%" height={16} style={styles.mb8} />
            <SkeletonLoader width="100%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

interface SkeletonGridProps {
  count?: number;
  columns?: number;
}

/**
 * Skeleton Grid - Grid layout skeleton
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 6, columns = 2 }) => {
  const { width } = Dimensions.get('window');
  const itemWidth = (width - 32) / columns - 8; // Account for padding and gaps

  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.gridItem, { width: itemWidth }]}>
          <SkeletonLoader width="100%" height={itemWidth} borderRadius={8} style={styles.mb8} />
          <SkeletonLoader width="100%" height={12} style={styles.mb4} />
          <SkeletonLoader width="80%" height={12} />
        </View>
      ))}
    </View>
  );
};

interface SkeletonAvatarProps {
  size?: number;
}

/**
 * Skeleton Avatar - Circular skeleton for profile pictures
 */
export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({ size = 60 }) => {
  return <SkeletonLoader width={size} height={size} borderRadius={size / 2} />;
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E5E7EB',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
  },
  listItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 16,
  },
  gridItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
  },
  mb0: {
    marginBottom: 0,
  },
  mb4: {
    marginBottom: 4,
  },
  mb8: {
    marginBottom: 8,
  },
  mb12: {
    marginBottom: 12,
  },
});

export default SkeletonLoader;
