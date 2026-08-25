import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import LocationSearchInput from '@/components/LocationSearchInput';
import { ATLAS_LOCATION, getRideDirectionType } from '@/utils/atlasLocationUtils';
import { calculateDistance } from '@/utils/locationUtils';
import apiClient from '@/utils/backendApiClient';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Shared route marker token (same everywhere in the app) ──────────────────
const ROUTE = {
  dotWhite:  { width: 10, height: 10, borderRadius: 5, backgroundColor: WARM_CORE.primary, borderWidth: 2, borderColor: WARM_CORE.primary },
  dotGrey:   { width: 10, height: 10, borderRadius: 5, backgroundColor: WARM_CORE.textSecondary, borderWidth: 2, borderColor: WARM_CORE.textSecondary },
  line:      { width: 2, backgroundColor: WARM_CORE.border },
  labelPickup:  { fontSize: 11, fontWeight: '700' as const, color: WARM_CORE.primary, letterSpacing: 0.5, marginBottom: 3 },
  labelDropoff: { fontSize: 11, fontWeight: '700' as const, color: WARM_CORE.textSecondary, letterSpacing: 0.5, marginBottom: 3 },
  address:      { fontSize: 14, fontWeight: '600' as const, color: WARM_CORE.text, lineHeight: 18 },
};

function getPrimaryAddr(loc?: any): string {
  if (!loc) return 'Location';
  const addr = typeof loc === 'string' ? loc : loc.address || loc.city || '';
  if (!addr) return 'Location';
  return addr.split(',')[0].trim() || 'Location';
}

function getSecondaryAddr(loc?: any): string {
  if (!loc) return '';
  const addr = typeof loc === 'string' ? loc : loc.address || '';
  if (!addr) return loc.city || '';
  const parts = addr.split(',').slice(1, 3).map((p: string) => p.trim()).filter(Boolean);
  return parts.join(', ') || loc.city || '';
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function useFadeSlideIn(delay = 0, fromY = 18) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 380, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0, delay, speed: 14, bounciness: 3, useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return { opacity, translateY };
}

function SpringBtn({ onPress, children, style, disabled = false, scaleVal = 0.96 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: scaleVal, speed: 50, bounciness: 2, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,        speed: 40, bounciness: 6, useNativeDriver: true }).start();
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity onPress={onPress} onPressIn={onIn} onPressOut={onOut} disabled={disabled} activeOpacity={1}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Cinematic Success Screen ─────────────────────────────────────────────────

function SuccessScreen({ ride, seatsSelected, totalPrice, customLocation, direction, onGoToBookings }: any) {
  const screenOpacity  = useRef(new Animated.Value(0)).current;
  const ring1Scale     = useRef(new Animated.Value(0)).current;
  const ring2Scale     = useRef(new Animated.Value(0)).current;
  const circleScale    = useRef(new Animated.Value(0)).current;
  const circleOpacity  = useRef(new Animated.Value(0)).current;
  const checkOpacity   = useRef(new Animated.Value(0)).current;
  const checkScale     = useRef(new Animated.Value(0.4)).current;
  // Sonar ripples — subtle orange rings expanding out
  const ripple1Scale   = useRef(new Animated.Value(1)).current;
  const ripple1Opacity = useRef(new Animated.Value(0)).current;
  const ripple2Scale   = useRef(new Animated.Value(1)).current;
  const ripple2Opacity = useRef(new Animated.Value(0)).current;
  const circleBreath   = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY       = useRef(new Animated.Value(22)).current;
  const btnScale       = useRef(new Animated.Value(0.92)).current;
  const btnOpacity     = useRef(new Animated.Value(0)).current;
  const infoOpacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ripplePulse = (sc: Animated.Value, op: Animated.Value, toSc: number, dur: number) =>
      Animated.parallel([
        Animated.sequence([
          Animated.timing(op, { toValue: 0.3, duration: 80, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0,   duration: dur - 80, useNativeDriver: true }),
        ]),
        Animated.timing(sc, { toValue: toSc, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);

    const loopRipple = (sc: Animated.Value, op: Animated.Value, toSc: number, dur: number, del: number) => {
      const run = () => {
        sc.setValue(1); op.setValue(0);
        Animated.sequence([Animated.delay(del), ripplePulse(sc, op, toSc, dur)]).start(() => run());
      };
      run();
    };

    Animated.sequence([
      Animated.timing(screenOpacity,   { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(ring1Scale,      { toValue: 1, speed: 12, bounciness: 4, useNativeDriver: true }),
      Animated.spring(ring2Scale,      { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(circleScale,   { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: true }),
        Animated.timing(circleOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(checkScale,    { toValue: 1, speed: 22, bounciness: 8, useNativeDriver: true }),
        Animated.timing(checkOpacity,  { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(contentY,       { toValue: 0, speed: 16, bounciness: 3, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(btnScale,   { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(infoOpacity,{ toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start(() => {
      loopRipple(ripple1Scale, ripple1Opacity, 1.7, 1600, 0);
      loopRipple(ripple2Scale, ripple2Opacity, 2.1, 1600, 800);
      Animated.loop(Animated.sequence([
        Animated.timing(circleBreath, { toValue: 1.04, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(circleBreath, { toValue: 1.0,  duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    });
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: screenOpacity }}>
      <ScrollView style={st.container} contentContainerStyle={st.successScroll} showsVerticalScrollIndicator={false}>

        {/* Animated circle */}
        <View style={st.successCircleWrap}>
          <Animated.View style={[st.halo1, { transform: [{ scale: ring1Scale }] }]} />
          <Animated.View style={[st.halo2, { transform: [{ scale: ring2Scale }] }]} />
          {/* Ripples: orange ring pulses */}
          <Animated.View style={[st.ripple, { opacity: ripple2Opacity, transform: [{ scale: ripple2Scale }] }]} />
          <Animated.View style={[st.ripple, { opacity: ripple1Opacity, transform: [{ scale: ripple1Scale }] }]} />
          <Animated.View style={[st.successCircle, {
            opacity: circleOpacity,
            transform: [{ scale: Animated.multiply(circleScale, circleBreath) }],
          }]}>
            <Animated.View style={{ opacity: checkOpacity, transform: [{ scale: checkScale }] }}>
              <MaterialCommunityIcons name="check" size={52} color={WARM_CORE.white} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Content */}
        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentY }], width: '100%' }}>
          <Text style={st.successTitle}>Ride Requested!</Text>
          <Text style={st.successSubtitle}>Your booking request has been sent to the car owner</Text>

          {/* Route card — uniform markers */}
          <View style={st.card}>
            <View style={st.cardHeaderRow}>
              <MaterialCommunityIcons name="map-marker-multiple-outline" size={15} color={WARM_CORE.textSecondary} />
              <Text style={st.cardHeaderText}>Your Journey</Text>
            </View>

            {/* Pickup row */}
            <View style={st.routeRow}>
              <View style={st.dotsCol}>
                <View style={ROUTE.dotWhite} />
                <View style={[ROUTE.line, { flex: 1, minHeight: 20, marginVertical: 4 }]} />
              </View>
              <View style={st.routeTextBlock}>
                <Text style={ROUTE.labelPickup}>PICKUP</Text>
                <Text style={ROUTE.address} numberOfLines={1}>
                  {getPrimaryAddr(direction === 'home-to-atlas' && customLocation ? customLocation : ride?.pickupLocation)}
                </Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {getSecondaryAddr(direction === 'home-to-atlas' && customLocation ? customLocation : ride?.pickupLocation)}
                </Text>
              </View>

            </View>

            {/* Dropoff row */}
            <View style={st.routeRow}>
              <View style={st.dotsCol}>
                <View style={ROUTE.dotGrey} />
              </View>
              <View style={st.routeTextBlock}>
                <Text style={ROUTE.labelDropoff}>DROP-OFF</Text>
                <Text style={ROUTE.address} numberOfLines={1}>
                  {getPrimaryAddr(direction === 'atlas-to-home' && customLocation ? customLocation : ride?.dropLocation)}
                </Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {getSecondaryAddr(direction === 'atlas-to-home' && customLocation ? customLocation : ride?.dropLocation)}
                </Text>
              </View>
            </View>
          </View>

          {/* Detail grid — centered */}
          <View style={st.detailGrid}>
            <View style={st.detailBox}>
              <View style={st.detailBoxIcon}>
                <MaterialCommunityIcons name="clock-outline" size={15} color={WARM_CORE.primary} />
              </View>
              <Text style={st.detailBoxLabel}>Departure</Text>
              <Text style={st.detailBoxValue}>{formatTime(ride.departureTime)}</Text>
            </View>
            <View style={st.detailBox}>
              <View style={st.detailBoxIcon}>
                <MaterialCommunityIcons name="car-seat" size={15} color={WARM_CORE.primary} />
              </View>
              <Text style={st.detailBoxLabel}>Seats</Text>
              <Text style={st.detailBoxValue}>{seatsSelected}</Text>
            </View>
            <View style={st.detailBox}>
              <View style={st.detailBoxIcon}>
                <MaterialCommunityIcons name="currency-inr" size={15} color={WARM_CORE.primary} />
              </View>
              <Text style={st.detailBoxLabel}>Total</Text>
              <Text style={st.detailBoxValue}>₹{totalPrice}</Text>
            </View>
          </View>

          {/* Driver card */}
          <View style={st.driverCard}>
            <View style={st.driverAvatar}>
              <Text style={st.driverInitial}>{ride.driverName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.driverCardLabel}>CAR OWNER</Text>
              <Text style={st.driverCardValue}>{ride.driverName}</Text>
            </View>
            <View style={st.pendingBadge}>
              <MaterialCommunityIcons name="clock-outline" size={11} color="#D97706" />
              <Text style={st.pendingBadgeText}>Pending</Text>
            </View>
          </View>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }], width: '100%' }}>
          <SpringBtn onPress={onGoToBookings} style={st.primaryBtn}>
            <View style={st.primaryBtnInner}>
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color={WARM_CORE.white} />
              <Text style={st.primaryBtnText}>View My Bookings</Text>
            </View>
          </SpringBtn>
        </Animated.View>

        <Animated.View style={[st.infoNote, { opacity: infoOpacity }]}>
          <MaterialCommunityIcons name="information-outline" size={14} color={WARM_CORE.textSecondary} />
          <Text style={st.infoNoteText}>
            The car owner will review your request shortly. You{"'"}ll be notified once accepted or rejected.
          </Text>
        </Animated.View>

      </ScrollView>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams();
  const { getRideById, requestRide, auth } = useAppContext();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ride          = getRideById(rideId as string);
  const seatsSelected = 1;
  const detourLimit   = ride?.detourRadiusMeters ?? 0;

  const direction = ride ? getRideDirectionType(
    ride.pickupLocation.latitude,
    ride.pickupLocation.longitude,
    ride.dropLocation.latitude,
    ride.dropLocation.longitude
  ) : 'other';

  const [selectedPickup, setSelectedPickup] = useState<any>(null);
  const [selectedDrop, setSelectedDrop] = useState<any>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [boardingChoice, setBoardingChoice] = useState<'ride_pickup' | 'home' | 'saved_pickup' | 'custom'>('ride_pickup');
  const [detourData, setDetourData] = useState<any>({
    status: 'pending',
    extraDistanceMeters: 0,
    extraDurationSeconds: 0,
    distanceToPolyline: 0,
    recommendations: null,
  });
  const [isLoadingDetour, setIsLoadingDetour] = useState(false);
  const [fareQuote, setFareQuote] = useState<any>(null);
  const [isLoadingFare, setIsLoadingFare] = useState(false);
  const [fareRetryNonce, setFareRetryNonce] = useState(0);

  const evaluateDetourOnBackend = async (location: any) => {
    if (!ride || !location) return;
    setIsLoadingDetour(true);
    try {
      const response = await apiClient.post('/evaluate-detour', {
        rideId: ride.id,
        passengerPickup: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          placeId: location.placeId,
        },
        passengerId: auth.user?.id,
      });

      if (response.data && response.data.success) {
        setDetourData({
          status: response.data.status,
          extraDistanceMeters: response.data.extraDistanceMeters || 0,
          extraDurationSeconds: response.data.extraDurationSeconds || 0,
          distanceToPolyline: response.data.distanceToPolyline || 0,
          recommendations: response.data.recommendations || null,
          congestionMode: response.data.congestionMode || false,
        });
      }
    } catch (err: any) {
      console.warn('[DETOUR EVALUATION] Failed:', err);
    } finally {
      setIsLoadingDetour(false);
    }
  };

  const handleBoardingChoiceChange = (choice: 'ride_pickup' | 'home' | 'saved_pickup' | 'custom') => {
    setBoardingChoice(choice);
    setErrorMessage(null);
    if (ride) {
      if (choice === 'ride_pickup') {
        setSelectedPickup(direction === 'atlas-to-home' ? ATLAS_LOCATION : ride.pickupLocation);
        setSelectedDrop(direction === 'home-to-atlas' ? ATLAS_LOCATION : ride.dropLocation);
      } else if (choice === 'home') {
        const homeLoc = auth.user?.homeAddress;
        if (homeLoc) {
          if (direction === 'home-to-atlas') setSelectedPickup(homeLoc);
          else setSelectedDrop(homeLoc);
        } else {
          Alert.alert('No Home Address', 'Please edit your profile to add a home address, or choose a custom location.');
          setBoardingChoice('custom');
        }
      } else if (choice === 'saved_pickup') {
        const savedLoc = (auth.user as any)?.preferredPickupLocation || auth.user?.homeAddress;
        if (savedLoc) {
          if (direction === 'home-to-atlas') setSelectedPickup(savedLoc);
          else setSelectedDrop(savedLoc);
        } else {
          Alert.alert('No Saved Location', 'Please edit your profile to add a saved pickup location, or choose a custom location.');
          setBoardingChoice('custom');
        }
      } else {
        // Custom selection
      }
    }
  };

  useEffect(() => {
    if (ride) {
      setSelectedPickup(direction === 'atlas-to-home' ? ATLAS_LOCATION : ride.pickupLocation);
      setSelectedDrop(direction === 'home-to-atlas' ? ATLAS_LOCATION : ride.dropLocation);
    }
  }, [ride?.id, direction]);

  useEffect(() => {
    const targetLoc = direction === 'home-to-atlas' ? selectedPickup : selectedDrop;
    if (targetLoc) {
      evaluateDetourOnBackend(targetLoc);
    }
  }, [selectedPickup, selectedDrop, direction]);

  useEffect(() => {
    if (!ride || !selectedPickup || !selectedDrop || detourData.status !== 'approved') {
      setFareQuote(null);
      return;
    }
    let active = true;
    setIsLoadingFare(true);
    apiClient.post('/fare/booking-quote', {
      rideId: ride.id,
      seatsBooked: seatsSelected,
      pickupLocation: direction === 'atlas-to-home' ? ATLAS_LOCATION : selectedPickup,
      dropLocation: direction === 'home-to-atlas' ? ATLAS_LOCATION : selectedDrop,
    }).then(response => {
      if (active) {
        setFareQuote(response.data);
        setErrorMessage(null);
      }
    }).catch(error => {
      if (active) {
        setFareQuote(null);
        console.error('[FARE QUOTE] Road-distance quote failed', {
          code: error?.code,
          message: error?.message,
          rideId: ride.id,
          pickup: selectedPickup,
          drop: selectedDrop,
        });
        setErrorMessage(error?.code === 'NO_ROUTE_FOUND'
          ? "We couldn't find a drivable route between these locations."
          : "We couldn't calculate the road distance. Please try again.");
      }
    }).finally(() => {
      if (active) setIsLoadingFare(false);
    });
    return () => { active = false; };
  }, [ride?.id, selectedPickup, selectedDrop, detourData.status, seatsSelected, direction, fareRetryNonce]);

  // Staggered entrance
  const headerAnim = useFadeSlideIn(0,   14);
  const card1Anim  = useFadeSlideIn(80,  20);
  const card2Anim  = useFadeSlideIn(160, 20);
  const ctaAnim    = useFadeSlideIn(240, 20);

  // Confirm button
  const btnScale   = useRef(new Animated.Value(1)).current;
  const btnOpacity = useRef(new Animated.Value(1)).current;
  const shimmer    = useRef(new Animated.Value(-1)).current;
  const shimmerX   = shimmer.interpolate({ inputRange: [-1, 1], outputRange: [-140, 340] });

  useEffect(() => {
    if (isConfirming) {
      shimmer.setValue(-1);
      Animated.loop(
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true })
      ).start();
      Animated.parallel([
        Animated.spring(btnScale,   { toValue: 0.97, speed: 20, bounciness: 2, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 0.75, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      shimmer.stopAnimation(); shimmer.setValue(-1);
      Animated.parallel([
        Animated.spring(btnScale,   { toValue: 1, speed: 20, bounciness: 4, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [isConfirming]);

  // Error shake
  const errorShake = useRef(new Animated.Value(0)).current;
  const errorOpac  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (errorMessage) {
      errorOpac.setValue(0);
      Animated.timing(errorOpac, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.sequence([
        Animated.timing(errorShake, { toValue:  7, duration: 55, useNativeDriver: true }),
        Animated.timing(errorShake, { toValue: -7, duration: 55, useNativeDriver: true }),
        Animated.timing(errorShake, { toValue:  4, duration: 45, useNativeDriver: true }),
        Animated.timing(errorShake, { toValue: -4, duration: 45, useNativeDriver: true }),
        Animated.timing(errorShake, { toValue:  0, duration: 35, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(errorOpac, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }
  }, [errorMessage]);

  const pressIn  = () => !isConfirming && Animated.spring(btnScale, { toValue: 0.96, speed: 50, bounciness: 2, useNativeDriver: true }).start();
  const pressOut = () => !isConfirming && Animated.spring(btnScale, { toValue: 1,    speed: 40, bounciness: 6, useNativeDriver: true }).start();

  if (!ride) {
    return (
      <SafeAreaView style={st.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <View style={st.centered}>
          <MaterialCommunityIcons name="car-off" size={48} color={WARM_CORE.textSecondary} />
          <Text style={st.notFoundText}>Ride not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalPrice = fareQuote?.totalAmount ?? (ride.price * seatsSelected);

  const handleConfirm = async () => {
    if (!auth.user) {
      Alert.alert('Error', 'Please log in to book a ride.');
      return;
    }

    if (auth.user.id === ride.driverId) {
      setErrorMessage('You cannot book your own ride.');
      return;
    }

    if (detourData.status !== 'approved') {
      setErrorMessage(
        detourLimit === 0
          ? 'This ride follows a fixed route. You must choose a location within 200m of the corridor.'
          : 'Detour distance exceeds the remaining budget of this ride. Please choose a recommended pickup point.'
      );
      return;
    }

    if (!acknowledged) {
      setErrorMessage('Please confirm your pickup and drop-off points.');
      return;
    }

    if ((ride as any).pricing && !fareQuote) {
      setErrorMessage('Your exact fare is still being calculated. Please wait and retry.');
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);
    try {
      const pickupLocation = selectedPickup;
      const dropLocation = selectedDrop;
      const detourMeta = {
        passengerOriginalLocation: boardingChoice === 'custom' ? auth.user?.homeAddress || selectedPickup : selectedPickup,
        passengerSelectedPickup: direction === 'home-to-atlas' ? selectedPickup : selectedDrop,
        extraDistanceMeters: detourData.extraDistanceMeters || 0,
        extraDurationSeconds: detourData.extraDurationSeconds || 0,
        walkingDistanceMeters: detourData.distanceToPolyline || 0,
      };

      await (requestRide as any)(ride.id, seatsSelected, pickupLocation, dropLocation, detourMeta);

      // Save custom location to passenger's preferred location for future bookings
      if (boardingChoice === 'custom' && auth.user) {
        try {
          const locToSave = direction === 'home-to-atlas' ? selectedPickup : selectedDrop;
          if (locToSave) {
            const userRef = doc(db, 'users', auth.user.id);
            await updateDoc(userRef, {
              preferredPickupLocation: locToSave,
              updatedAt: new Date().toISOString()
            });
            console.log('[BOOKING] Saved custom location to preferredPickupLocation');
          }
        } catch (saveErr) {
          console.warn('[BOOKING] Failed to save preferred location:', saveErr);
        }
      }

      setShowSuccess(true);
      setIsConfirming(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to request booking.');
      setIsConfirming(false);
    }
  };

  if (showSuccess) {
    return (
      <SafeAreaView style={st.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <SuccessScreen
          ride={ride}
          seatsSelected={seatsSelected}
          totalPrice={totalPrice}
          customLocation={direction === 'home-to-atlas' ? selectedPickup : selectedDrop}
          direction={direction}
          onGoToBookings={() => router.push('/(tabs)/my-bookings')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView style={st.container} contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Animated.View style={[st.header, {
          opacity: headerAnim.opacity,
          transform: [{ translateY: headerAnim.translateY }],
        }]}>
          <SpringBtn onPress={() => router.back()} scaleVal={0.88}>
            <View style={st.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={WARM_CORE.text} />
            </View>
          </SpringBtn>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>Confirm Booking</Text>
            <Text style={st.headerSub}>Review your ride details</Text>
          </View>
        </Animated.View>

        {/* Error banner */}
        {errorMessage && (
          <Animated.View style={[st.errorBanner, {
            opacity: errorOpac,
            transform: [{ translateX: errorShake }],
          }]}>
            <MaterialCommunityIcons name="alert-circle" size={17} color={WARM_CORE.error} />
            <Text style={st.errorBannerText}>{errorMessage}</Text>
            {!fareQuote && detourData.status === 'approved' && (
              <Pressable onPress={() => setFareRetryNonce(value => value + 1)} hitSlop={8}>
                <Text style={{ color: WARM_CORE.error, fontSize: 12, fontWeight: '700' }}>Retry</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setErrorMessage(null)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={15} color={WARM_CORE.error} />
            </Pressable>
          </Animated.View>
        )}

        {/* Ride summary card */}
        <Animated.View style={[st.card, {
          opacity: card1Anim.opacity,
          transform: [{ translateY: card1Anim.translateY }],
        }]}>
          {/* Route — uniform markers */}
          <View style={st.routeRow}>
            <View style={st.dotsCol}>
              <View style={ROUTE.dotWhite} />
              <View style={[ROUTE.line, { height: 36, marginVertical: 4 }]} />
            </View>
            <View style={[st.routeTextBlock, { gap: 20 }]}>
              <View>
                <Text style={ROUTE.labelPickup}>PICKUP</Text>
                <Text style={ROUTE.address} numberOfLines={1}>{getPrimaryAddr(ride?.pickupLocation)}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {getSecondaryAddr(ride?.pickupLocation)}
                </Text>
              </View>
              <View>
                <Text style={ROUTE.labelDropoff}>DROP-OFF</Text>
                <Text style={ROUTE.address} numberOfLines={1}>{getPrimaryAddr(ride?.dropLocation)}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {getSecondaryAddr(ride?.dropLocation)}
                </Text>
              </View>
            </View>
          </View>

          <View style={st.cardDivider} />

          {/* Time + Driver */}
          <View style={st.infoRow}>
            <View style={st.infoCell}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={WARM_CORE.textSecondary} />
              <View style={{ marginLeft: 10 }}>
                <Text style={st.infoLabel}>Departure</Text>
                <Text style={st.infoValue}>{formatTime(ride.departureTime)}</Text>
              </View>
            </View>
            <View style={st.infoDividerV} />
            <View style={st.infoCell}>
              <View style={st.miniAvatar}>
                <Text style={st.miniAvatarText}>{ride.driverName.charAt(0)}</Text>
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={st.infoLabel}>Car Owner</Text>
                <Text style={st.infoValue} numberOfLines={1}>{ride.driverName}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Dual Location Selection */}
        <Animated.View style={[st.card, {
          opacity: card2Anim.opacity,
          transform: [{ translateY: card2Anim.translateY }],
          zIndex: 999,
        }]}>
          <Text style={st.sectionLabel}>YOUR BOARDING POINT</Text>
          <Text style={{ fontSize: 12, color: WARM_CORE.textSecondary, marginBottom: 12 }}>
            Where are you boarding from?
          </Text>

          {/* Boarding Choice Selector */}
          <View style={st.boardingChoiceRow}>
            <TouchableOpacity
              style={[st.boardingChoiceBtn, boardingChoice === 'ride_pickup' && st.boardingChoiceBtnActive]}
              onPress={() => handleBoardingChoiceChange('ride_pickup')}
            >
              <Text style={[st.boardingChoiceText, boardingChoice === 'ride_pickup' && st.boardingChoiceTextActive]}>Ride Pickup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.boardingChoiceBtn, boardingChoice === 'home' && st.boardingChoiceBtnActive]}
              onPress={() => handleBoardingChoiceChange('home')}
            >
              <Text style={[st.boardingChoiceText, boardingChoice === 'home' && st.boardingChoiceTextActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.boardingChoiceBtn, boardingChoice === 'custom' && st.boardingChoiceBtnActive]}
              onPress={() => handleBoardingChoiceChange('custom')}
            >
              <Text style={[st.boardingChoiceText, boardingChoice === 'custom' && st.boardingChoiceTextActive]}>Custom</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 16 }} />

          {/* Location inputs */}
          <LocationSearchInput
            label="Pickup Location"
            value={selectedPickup?.address || ''}
            onChange={(location) => {
              setSelectedPickup(direction === 'atlas-to-home' ? ATLAS_LOCATION : location);
              setErrorMessage(null);
            }}
            placeholder="Search pickup address..."
            readOnly={boardingChoice === 'ride_pickup'}
          />

          <View style={{ height: 12 }} />

          <LocationSearchInput
            label="Drop-off Location"
            value={selectedDrop?.address || ''}
            onChange={(location) => {
              setSelectedDrop(direction === 'home-to-atlas' ? ATLAS_LOCATION : location);
              setErrorMessage(null);
            }}
            placeholder="Search drop-off address..."
            readOnly={boardingChoice === 'ride_pickup'}
          />

          <View style={{ height: 16 }} />

          {/* Dynamic detour check output */}
          {isLoadingDetour ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: WARM_CORE.border, borderRadius: 12 }}>
              <ActivityIndicator size="small" color={WARM_CORE.primary} />
              <Text style={{ fontSize: 13, color: WARM_CORE.textSecondary }}>Evaluating driving detour...</Text>
            </View>
          ) : detourData.congestionMode ? (
            <View style={[st.detourInfoCard, { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.18)' }]}>
              <MaterialCommunityIcons name="alert" size={16} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={[st.detourInfoTitle, { color: '#F59E0B' }]}>
                  Estimated route due to service congestion
                </Text>
                <Text style={st.detourInfoText}>
                  Google Maps is currently congested. Route detour budget has been estimated using mathematical projection.
                </Text>
              </View>
            </View>
          ) : detourLimit > 0 ? (
            <View style={[
              st.detourInfoCard,
              detourData.status === 'approved' ? st.detourValidCard : st.detourInvalidCard
            ]}>
              <MaterialCommunityIcons 
                name={detourData.status === 'approved' ? "check-circle" : "alert-circle"} 
                size={16} 
                color={detourData.status === 'approved' ? WARM_CORE.success : "#EF4444"} 
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  st.detourInfoTitle,
                  { color: detourData.status === 'approved' ? WARM_CORE.success : "#EF4444" }
                ]}>
                  {detourData.status === 'approved' ? "Detour is within limit ✓" : "Detour exceeds driver limit ⚠️"}
                </Text>
                <Text style={st.detourInfoText}>
                  Adds +{(detourData.extraDistanceMeters / 1000).toFixed(1)} km & +{Math.round(detourData.extraDurationSeconds / 60)} min.
                  Driver Limit: {(detourLimit / 1000).toFixed(0)} km.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[
              st.detourInfoCard,
              detourData.status === 'approved' ? st.detourValidCard : st.detourInvalidCard
            ]}>
              <MaterialCommunityIcons 
                name={detourData.status === 'approved' ? "check-circle" : "lock"} 
                size={16} 
                color={detourData.status === 'approved' ? WARM_CORE.success : WARM_CORE.textSecondary} 
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  st.detourInfoTitle,
                  { color: detourData.status === 'approved' ? WARM_CORE.success : WARM_CORE.textSecondary }
                ]}>
                  {detourData.status === 'approved' ? "Fixed Route Corridor Approved ✓" : "Fixed Route (No Detour) ⚠️"}
                </Text>
                <Text style={st.detourInfoText}>
                  {detourData.status === 'approved' 
                    ? `Within 200m of route (Detour: ${(detourData.extraDistanceMeters / 1000).toFixed(2)} km).`
                    : 'Must lie directly on driver route (within 200m corridor, <=300m detour).'}
                </Text>
              </View>
            </View>
          )}

          {/* Recommendations Render */}
          {detourData.status === 'rejected' && detourData.recommendations && (
            <View style={st.recommendationsContainer}>
              <Text style={st.recommendationsLabel}>Choose a recommended pickup point near driver's route:</Text>
              {detourData.recommendations.map((rec: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={st.recommendationCard}
                  onPress={() => {
                    const newLoc = {
                      latitude: rec.latitude,
                      longitude: rec.longitude,
                      address: rec.name,
                      city: '',
                    };
                    if (direction === 'home-to-atlas') setSelectedPickup(newLoc);
                    else setSelectedDrop(newLoc);
                    setBoardingChoice('custom');
                    setDetourData({
                      status: 'approved',
                      extraDistanceMeters: rec.detourDistanceMeters,
                      extraDurationSeconds: Math.round(rec.detourDistanceMeters / 13.88),
                      distanceToPolyline: rec.walkingDistanceMeters,
                    });
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={st.recName}>{rec.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <Text style={st.recDetail}>Walk: {rec.walkingDistanceMeters}m</Text>
                      <Text style={st.recDetail}>•</Text>
                      <Text style={st.recDetail}>Driver Detour: {rec.detourDistanceMeters === 0 ? '0km' : `${(rec.detourDistanceMeters / 1000).toFixed(1)}km`}</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={WARM_CORE.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Price breakdown */}
        <Animated.View style={[st.card, {
          opacity: card2Anim.opacity,
          transform: [{ translateY: card2Anim.translateY }],
        }]}>
          <Text style={st.sectionLabel}>Your Fare</Text>

          <View style={st.priceRow}>
            <Text style={st.priceLabel}>Road distance</Text>
            <Text style={st.priceValue}>{fareQuote ? `${fareQuote.fare.passengerSegmentDistanceKm} km` : 'Calculating...'}</Text>
          </View>
          <View style={st.priceRow}>
            <Text style={st.priceLabel}>Operating cost</Text>
            <Text style={st.priceValue}>₹{fareQuote ? (fareQuote.fare.operatingCostPaise / 100).toFixed(0) : '—'}</Text>
          </View>
          <View style={st.priceRow}>
            <Text style={st.priceLabel}>Passenger contribution</Text>
            <Text style={st.priceValue}>₹{fareQuote ? (fareQuote.fare.baseFarePaise / 100).toFixed(0) : '—'}</Text>
          </View>
          {fareQuote?.fare.detourCostPaise > 0 && (
            <View style={st.priceRow}>
              <Text style={st.priceLabel}>Detour ({fareQuote.fare.detourDistanceKm} km)</Text>
              <Text style={st.priceValue}>₹{(fareQuote.fare.detourCostPaise / 100).toFixed(0)}</Text>
            </View>
          )}
          {fareQuote?.fare.platformFeePaise > 0 && (
            <View style={st.priceRow}>
              <Text style={st.priceLabel}>Platform fee</Text>
              <Text style={st.priceValue}>₹{(fareQuote.fare.platformFeePaise / 100).toFixed(0)}</Text>
            </View>
          )}
          <View style={st.priceDivider} />

          <View style={st.totalRow}>
            <Text style={st.totalLabel}>Total Amount</Text>
            <Text style={st.totalValue}>{isLoadingFare ? 'Calculating...' : `₹${totalPrice}`}</Text>
          </View>
        </Animated.View>

        {/* Acknowledgment Checkbox */}
        <Animated.View style={[st.checkboxRow, {
          opacity: ctaAnim.opacity,
          transform: [{ translateY: ctaAnim.translateY }],
        }]}>
          <TouchableOpacity 
            onPress={() => setAcknowledged(!acknowledged)} 
            style={st.checkboxClickable}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons 
              name={acknowledged ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={20} 
              color={acknowledged ? WARM_CORE.primary : WARM_CORE.textSecondary} 
            />
            <Text style={st.checkboxText}>
              I confirm my exact pickup and drop-off points.
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={{
          opacity: ctaAnim.opacity,
          transform: [{ translateY: ctaAnim.translateY }],
        }}>
          <Animated.View style={{ transform: [{ scale: btnScale }], opacity: btnOpacity, marginBottom: 14 }}>
            <TouchableOpacity
              style={st.confirmBtn}
              onPress={handleConfirm}
              onPressIn={pressIn}
              onPressOut={pressOut}
              disabled={isConfirming}
              activeOpacity={1}
            >
              <View style={StyleSheet.absoluteFill}>
                <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
                  {isConfirming && (
                    <Animated.View style={[st.shimmerStripe, { transform: [{ translateX: shimmerX }] }]} />
                  )}
                </View>
              </View>
              {isConfirming ? (
                <>
                  <MaterialCommunityIcons name="loading" size={18} color={WARM_CORE.white} />
                  <Text style={st.confirmBtnText}>Confirming...</Text>
                </>
              ) : (
                <>
                  <Text style={st.confirmBtnText}>Confirm Booking</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color={WARM_CORE.white} />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={st.termsRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={13} color={WARM_CORE.textSecondary} />
            <Text style={st.termsText}>
              By confirming, you agree to the cancellation policy. 20 min before departure you can cancel with a flat ₹50 penalty.
            </Text>
          </View>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: WARM_CORE.background },
  container:    { flex: 1, backgroundColor: WARM_CORE.background },
  scroll:       { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 44 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  notFoundText: { fontSize: 15, fontWeight: '600', color: WARM_CORE.textSecondary },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1, borderColor: WARM_CORE.border,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: WARM_CORE.text },
  headerSub:   { fontSize: 12, color: WARM_CORE.textSecondary, marginTop: 2, fontWeight: '500' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEE2E2',
    borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 16,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: WARM_CORE.error, fontWeight: '500' },

  card: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20, padding: 16,
    marginBottom: 14,
    borderWidth: 0.5, borderColor: WARM_CORE.border,
  },

  // Uniform route markers (shared between confirmation + success screens)
  routeRow: { flexDirection: 'row', gap: 14 },
  dotsCol:  { alignItems: 'center', paddingTop: 3 },
  routeTextBlock: { flex: 1 },
  cityText: { fontSize: 11, color: WARM_CORE.textSecondary, marginTop: 2 },

  cardDivider:  { height: 1, backgroundColor: WARM_CORE.border, marginVertical: 16 },
  infoRow:      { flexDirection: 'row', alignItems: 'center' },
  infoCell:     { flex: 1, flexDirection: 'row', alignItems: 'center' },
  infoDividerV: { width: 1, height: 36, backgroundColor: WARM_CORE.border, marginHorizontal: 14 },
  infoLabel:    { fontSize: 10, fontWeight: '600', color: WARM_CORE.textSecondary },
  infoValue:    { fontSize: 13, fontWeight: '700', color: WARM_CORE.text, marginTop: 2 },
  miniAvatar:   {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center', alignItems: 'center',
  },
  miniAvatarText: { fontSize: 12, fontWeight: '700', color: WARM_CORE.primary },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: WARM_CORE.primary, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 14 },
  priceRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  priceLabel:   { fontSize: 13, fontWeight: '500', color: WARM_CORE.textSecondary },
  priceValue:   { fontSize: 13, fontWeight: '600', color: WARM_CORE.text },
  priceDivider: { height: 1, backgroundColor: WARM_CORE.border, marginVertical: 6 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 },
  totalLabel:   { fontSize: 15, fontWeight: '700', color: WARM_CORE.text },
  totalValue:   { fontSize: 24, fontWeight: '800', color: WARM_CORE.primary, letterSpacing: -0.8 },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: WARM_CORE.primary,
    paddingVertical: 15, borderRadius: 24, gap: 8, overflow: 'hidden',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: WARM_CORE.white },
  shimmerStripe:  { position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: 'rgba(255,255,255,0.15)' },
  termsRow:       { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  termsText:      { flex: 1, fontSize: 11, color: WARM_CORE.textSecondary, lineHeight: 17, fontWeight: '500' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkboxClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  checkboxText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
    flex: 1,
  },
  detourInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  detourValidCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.18)',
  },
  detourInvalidCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.18)',
  },
  detourFixedCard: {
    backgroundColor: 'rgba(107, 114, 128, 0.06)',
    borderColor: 'rgba(107, 114, 128, 0.15)',
  },
  boardingChoiceRow: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.border,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  boardingChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  boardingChoiceBtnActive: {
    backgroundColor: WARM_CORE.primary,
  },
  boardingChoiceText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  boardingChoiceTextActive: {
    color: WARM_CORE.white,
  },
  recommendationsContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    paddingTop: 16,
  },
  recommendationsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  recName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  recDetail: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.primary,
  },
  detourInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  detourInfoText: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },

  // ── Success screen ────────────────────────────────────────────────────────
  successScroll: {
    paddingHorizontal: 20, paddingTop: 32, paddingBottom: 48, alignItems: 'center',
  },

  successCircleWrap: {
    width: 180, height: 180,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  // Static halo rings — very subtle glow
  halo1: {
    position: 'absolute', width: 164, height: 164, borderRadius: 82,
    borderWidth: 1, borderColor: WARM_CORE.border,
    backgroundColor: 'rgba(244, 233, 217, 0.3)',
  },
  halo2: {
    position: 'absolute', width: 134, height: 134, borderRadius: 67,
    borderWidth: 1, borderColor: WARM_CORE.border,
    backgroundColor: 'rgba(244, 233, 217, 0.5)',
  },
  // Sonar ripple — orange border ring that expands and fades
  ripple: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    borderWidth: 1.5, borderColor: WARM_CORE.primary,
  },
  // Main circle — primary background, white icon
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 12,
  },

  successTitle:    { fontSize: 28, fontWeight: '800', color: WARM_CORE.text, textAlign: 'center', marginBottom: 8 },
  successSubtitle: {
    fontSize: 14, fontWeight: '500', color: WARM_CORE.textSecondary,
    textAlign: 'center', marginBottom: 28, lineHeight: 21,
  },

  cardHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 },
  cardHeaderText: { fontSize: 12, fontWeight: '600', color: WARM_CORE.textSecondary, letterSpacing: 0.3 },

  // Detail grid — centered content
  detailGrid: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 14 },
  detailBox: {
    flex: 1, backgroundColor: WARM_CORE.card,
    borderRadius: 16, padding: 14,
    borderWidth: 0.5, borderColor: WARM_CORE.border,
    alignItems: 'center',
  },
  detailBoxIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  detailBoxLabel: { fontSize: 10, fontWeight: '600', color: WARM_CORE.textSecondary, marginBottom: 4, textAlign: 'center' },
  detailBoxValue: { fontSize: 15, fontWeight: '800', color: WARM_CORE.text, textAlign: 'center' },

  driverCard: {
    width: '100%',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WARM_CORE.card,
    borderRadius: 16, padding: 14,
    borderWidth: 0.5, borderColor: WARM_CORE.border,
    marginBottom: 24,
  },
  driverAvatar:    {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center', alignItems: 'center',
  },
  driverInitial:   { fontSize: 16, fontWeight: '700', color: WARM_CORE.primary },
  driverCardLabel: { fontSize: 10, fontWeight: '700', color: WARM_CORE.textSecondary, letterSpacing: 0.5 },
  driverCardValue: { fontSize: 14, fontWeight: '700', color: WARM_CORE.text, marginTop: 2 },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '600', color: '#D97706' },

  primaryBtn:      { width: '100%', borderRadius: 24, overflow: 'hidden', marginBottom: 0 },
  primaryBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: WARM_CORE.primary, paddingVertical: 15, gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WARM_CORE.white },

  infoNote: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    width: '100%', marginTop: 16,
    backgroundColor: WARM_CORE.card,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: WARM_CORE.border,
  },
  infoNoteText: { flex: 1, fontSize: 12, color: WARM_CORE.textSecondary, lineHeight: 18, fontWeight: '500' },
});
