import React, { useRef, useEffect } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';
import { createFloatAnimation, createSpringPressAnimation } from '@/utils/animationConfig';

export interface PoolCardProps {
  destination: string;
  creatorName: string;
  creatorImage?: string;
  creatorCourse: string;
  creatorDivision: string;
  time: string;
  memberCount: number;
  maxMembers: number;
  status: 'OPEN' | 'FULL' | 'CLOSED' | 'CANCELLED';
  distance?: string;
  requestStatus?: 'idle' | 'requested' | 'accepted' | 'rejected';
  onPress: () => void;
  onJoinPress?: () => void;
  isJoinLoading?: boolean;
  floatOffset?: number;
}

export default function PoolCard({
  destination,
  creatorName,
  creatorImage,
  creatorCourse,
  creatorDivision,
  time,
  memberCount,
  maxMembers,
  status,
  distance,
  requestStatus = 'idle',
  onPress,
  onJoinPress,
  isJoinLoading = false,
  floatOffset = 0,
}: PoolCardProps) {
  // Spring press feedback
  const { pressScale, onPressIn, onPressOut } = useRef(
    createSpringPressAnimation(0.975)
  ).current;

  // Ambient floating animation
  const { floatY, startFloat } = useRef(createFloatAnimation(2.5, 3200)).current;

  useEffect(() => {
    const timer = setTimeout(startFloat, floatOffset * 350);
    return () => clearTimeout(timer);
  }, []);

  const getStatusColor = () => {
    if (status === 'CANCELLED') {
      return { bg: '#FEE2E2', text: '#DC2626', label: 'CANCELLED' };
    }
    if (status === 'CLOSED') {
      return { bg: '#E2E8F0', text: '#64748B', label: 'CLOSED' };
    }
    if (status === 'FULL') {
      return { bg: '#FEF3C7', text: '#D97706', label: 'FULL' };
    }
    
    // OPEN status
    switch (requestStatus) {
      case 'requested':
        return { bg: '#E2E8F0', text: '#475569', label: 'REQUESTED' };
      case 'accepted':
        return { bg: '#D1FAE5', text: '#059669', label: 'ACCEPTED' };
      case 'rejected':
        return { bg: '#FEE2E2', text: '#DC2626', label: 'DECLINED' };
      default:
        return { bg: '#F97316', text: '#FFFFFF', label: 'OPEN' };
    }
  };

  const getJoinButtonConfig = () => {
    switch (requestStatus) {
      case 'requested':
        return { text: 'Pending Approval', icon: 'clock-outline', bg: WARM_CORE.card, border: WARM_CORE.border, textColor: WARM_CORE.textSecondary, disabled: true };
      case 'accepted':
        return { text: 'Joined Pool', icon: 'check-all', bg: '#D1FAE5', border: '#10B981', textColor: '#047857', disabled: true };
      case 'rejected':
        return { text: 'Request Declined', icon: 'close-circle-outline', bg: '#FEE2E2', border: '#EF4444', textColor: '#DC2626', disabled: true };
      default:
        if (status === 'FULL') {
          return { text: 'Pool Full', icon: 'account-multiple-remove', bg: WARM_CORE.card, border: WARM_CORE.border, textColor: WARM_CORE.textSecondary, disabled: true };
        }
        if (status !== 'OPEN') {
          return { text: 'Unavailable', icon: 'lock', bg: WARM_CORE.card, border: WARM_CORE.border, textColor: WARM_CORE.textSecondary, disabled: true };
        }
        return { text: 'Request to Join', icon: 'plus', bg: WARM_CORE.primary, border: WARM_CORE.primary, textColor: WARM_CORE.white, disabled: false };
    }
  };

  const statusConfig = getStatusColor();
  const btnConfig = getJoinButtonConfig();

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          transform: [
            { scale: pressScale },
            { translateY: floatY },
          ],
        },
      ]}
    >
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={styles.card}
      >
        {/* Top Header Row: Creator Info + Status Badge */}
        <View style={styles.topRow}>
          <View style={styles.creatorContainer}>
            <View style={styles.avatar}>
              {creatorImage ? (
                <Image source={{ uri: creatorImage }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {creatorName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.creatorDetails}>
              <Text style={styles.creatorName} numberOfLines={1}>{creatorName}</Text>
              <Text style={styles.creatorMeta} numberOfLines={1}>
                {creatorCourse} • Div {creatorDivision}
              </Text>
            </View>
          </View>
          
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.text }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Middle Body: Destination & Details */}
        <View style={styles.body}>
          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="map-marker" size={18} color={WARM_CORE.primary} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>DESTINATION</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{destination}</Text>
            </View>
            {distance && (
              <View style={styles.distanceBadge}>
                <MaterialCommunityIcons name="map-marker-distance" size={12} color={WARM_CORE.primary} />
                <Text style={styles.distanceText}>{distance}</Text>
              </View>
            )}
          </View>

          <View style={styles.detailsGrid}>
            <View style={styles.gridItem}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.gridText} numberOfLines={1}>{time}</Text>
            </View>
            <View style={styles.gridItem}>
              <MaterialCommunityIcons name="account-multiple" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.gridText}>
                {memberCount} / {maxMembers} Members
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom Actions Row */}
        {onJoinPress && (
          <>
            <View style={styles.divider} />
            <Pressable
              style={[
                styles.joinButton,
                { 
                  backgroundColor: btnConfig.bg,
                  borderColor: btnConfig.border,
                  borderWidth: 1
                }
              ]}
              onPress={(e) => {
                // Prevent trigger parent onPress
                e.stopPropagation();
                if (onJoinPress && !btnConfig.disabled) {
                  onJoinPress();
                }
              }}
              disabled={btnConfig.disabled || isJoinLoading}
            >
              <MaterialCommunityIcons
                name={btnConfig.icon as any}
                size={16}
                color={btnConfig.textColor}
              />
              <Text style={[styles.joinBtnText, { color: btnConfig.textColor }]}>
                {btnConfig.text}
              </Text>
            </Pressable>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    overflow: 'hidden',
  } as ViewStyle,
  card: {
    padding: 16,
  } as ViewStyle,
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  } as ViewStyle,
  creatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  } as ViewStyle,
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  creatorDetails: {
    flex: 1,
  } as ViewStyle,
  creatorName: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  creatorMeta: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  } as ViewStyle,
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  body: {
    gap: 12,
  } as ViewStyle,
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,80,10,0.04)',
    borderRadius: 12,
    padding: 10,
  } as ViewStyle,
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(212,80,10,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  } as ViewStyle,
  infoTextContainer: {
    flex: 1,
  } as ViewStyle,
  infoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: WARM_CORE.primary,
    letterSpacing: 0.5,
  } as TextStyle,
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212,80,10,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  } as ViewStyle,
  distanceText: {
    fontSize: 11,
    color: WARM_CORE.primary,
    fontWeight: '700',
  } as TextStyle,
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  } as ViewStyle,
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  } as ViewStyle,
  gridText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  divider: {
    height: 0.5,
    backgroundColor: WARM_CORE.border,
    marginVertical: 12,
  } as ViewStyle,
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  } as ViewStyle,
  joinBtnText: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
});
