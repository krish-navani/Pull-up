import { createFloatAnimation, createSpringPressAnimation } from '@/utils/animationConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

type RequestStatus = 'idle' | 'pending' | 'accepted' | 'rejected';

interface RideCardProps {
  pickupLocation: string;
  dropoffLocation: string;
  carName: string;
  time: string;
  seatsLeft: number;
  pricePerSeat: number;
  currency?: string;
  distance?: string;
  requestStatus?: RequestStatus;
  onRequestSeat?: () => void;
  isLoading?: boolean;
  floatOffset?: number; // stagger the float phase per card
}

export default function RideCard({
  pickupLocation,
  dropoffLocation,
  carName,
  time,
  seatsLeft,
  pricePerSeat,
  currency = '₹',
  distance,
  requestStatus = 'idle',
  onRequestSeat,
  isLoading = false,
  floatOffset = 0,
}: RideCardProps) {
  // Spring press feedback
  const { pressScale, onPressIn, onPressOut } = useRef(
    createSpringPressAnimation(0.97)
  ).current;

  // Ambient float
  const { floatY, startFloat } = useRef(createFloatAnimation(3, 3000)).current;

  useEffect(() => {
    // Stagger float start so cards don't all oscillate in sync
    const timer = setTimeout(startFloat, floatOffset * 400);
    return () => clearTimeout(timer);
  }, []);

  const getRequestStatusColor = () => {
    switch (requestStatus) {
      case 'pending':
        return { bg: '#2E2E2E', text: '#FFFFFF', icon: 'clock' };
      case 'accepted':
        return { bg: '#D1FAE5', text: '#047857', icon: 'check-circle' };
      case 'rejected':
        return { bg: '#FEE2E2', text: '#DC2626', icon: 'close-circle' };
      default:
        return { bg: '#FFFFFF', text: '#1A1A1A', icon: 'plus-circle' };
    }
  };

  const getRequestButtonText = () => {
    switch (requestStatus) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Request Seat';
    }
  };

  const statusColor = getRequestStatusColor();
  const isInteractive = requestStatus === 'idle' && !isLoading;

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
        style={styles.card}
      >
        {/* Timeline and Route Section */}
        <View style={styles.mainContent}>
          {/* Timeline Left */}
          <View style={styles.timeline}>
            {/* Pickup Circle */}
            <View style={styles.pickupDot} />

            {/* Dashed Line */}
            <View style={styles.dottedLine} />

            {/* Dropoff Circle */}
            <View style={styles.dropDot} />
          </View>

          {/* Route Content Right */}
          <View style={styles.routeContent}>
            {/* Pickup Section */}
            <View>
              <Text style={styles.routeLabel}>PICKUP</Text>
              <Text style={styles.routeText}>{pickupLocation}</Text>
            </View>

            {/* Dropoff Section */}
            <View style={styles.dropoffSection}>
              <Text style={styles.routeLabel}>DROP-OFF</Text>
              {distance && (
                <View style={styles.distanceContainer}>
                  <MaterialCommunityIcons name="map-marker-distance" size={12} color="#FFFFFF" />
                  <Text style={styles.distanceText}>{distance}</Text>
                </View>
              )}
              <Text style={styles.routeText}>{dropoffLocation}</Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Car Info and Price */}
        <View style={styles.footerSection}>
          {/* Car Info Left */}
          <View style={styles.carInfoContainer}>
            <MaterialCommunityIcons
              name="car"
              size={20}
              color="#A0A8B7"
              style={styles.carIcon}
            />
            <View style={styles.carTextContainer}>
              <Text style={styles.carName}>{carName}</Text>
              <Text style={styles.carDetails}>
                {time} • {seatsLeft} Seats Left
              </Text>
            </View>
          </View>

          {/* Price Right */}
          <View style={styles.priceContainer}>
            <Text style={styles.priceAmount}>
              {currency}
              {pricePerSeat}
            </Text>
            <Text style={styles.priceLabel}>Per Seat</Text>
          </View>
        </View>

        {/* Request Seat Button */}
        {onRequestSeat && (
          <View style={styles.buttonDivider} />
        )}
        {onRequestSeat && (
          <Pressable
            style={[
              styles.requestButton,
              { backgroundColor: statusColor.bg, opacity: isInteractive ? 1 : 0.7 },
            ]}
            onPress={onRequestSeat}
            disabled={!isInteractive || isLoading}
          >
            <MaterialCommunityIcons
              name={statusColor.icon as any}
              size={18}
              color={statusColor.text}
              style={styles.buttonIcon}
            />
            <Text style={[styles.requestButtonText, { color: statusColor.text }]}>
              {getRequestButtonText()}
            </Text>
            {isLoading && (
              <MaterialCommunityIcons
                name="loading"
                size={18}
                color={statusColor.text}
                style={styles.loadingIcon}
              />
            )}
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    // Wrapper carries transform so inner card is untouched
  } as ViewStyle,
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  } as ViewStyle,
  mainContent: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  } as ViewStyle,
  timeline: {
    alignItems: 'center',
  } as ViewStyle,
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  } as ViewStyle,
  dottedLine: {
    height: 24,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#333333',
    marginLeft: 5,
    marginVertical: 6,
  } as ViewStyle,
  dropDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  } as ViewStyle,
  routeContent: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 16,
  } as ViewStyle,
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 0.5,
  } as TextStyle,
  routeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  } as TextStyle,
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  } as ViewStyle,
  distanceText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  } as TextStyle,
  dropoffSection: {} as ViewStyle,
  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginBottom: 16,
  } as ViewStyle,
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  carInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  } as ViewStyle,
  carIcon: {
    marginTop: 2,
    color: '#94A3B8',
  },
  carTextContainer: {
    flex: 1,
    gap: 4,
  } as ViewStyle,
  carName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  } as TextStyle,
  carDetails: {
    fontSize: 12,
    color: '#B3B3B3',
    fontWeight: '500',
  } as TextStyle,
  priceContainer: {
    alignItems: 'flex-end',
    gap: 2,
  } as ViewStyle,
  priceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,
  priceLabel: {
    fontSize: 12,
    color: '#B3B3B3',
    fontWeight: '500',
  } as TextStyle,
  // Button styles
  buttonDivider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 16,
  } as ViewStyle,
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  } as ViewStyle,
  buttonIcon: {
    marginRight: 2,
  },
  requestButtonText: {
    fontSize: 14,
    fontWeight: '700',
  } as TextStyle,
  loadingIcon: {
    marginLeft: 6,
  },
});
