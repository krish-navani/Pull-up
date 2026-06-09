import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Shared route marker token (same everywhere in the app) ──────────────────
const ROUTE = {
  dotWhite:  { width: 10, height: 10, borderRadius: 5, backgroundColor: WARM_CORE.primary, borderWidth: 2, borderColor: WARM_CORE.primary },
  dotGrey:   { width: 10, height: 10, borderRadius: 5, backgroundColor: WARM_CORE.textSecondary, borderWidth: 2, borderColor: WARM_CORE.textSecondary },
  line:      { width: 2, backgroundColor: WARM_CORE.border },
  labelPickup:  { fontSize: 11, fontWeight: '700' as const, color: WARM_CORE.primary, letterSpacing: 0.5, marginBottom: 3 },
  labelDropoff: { fontSize: 11, fontWeight: '700' as const, color: WARM_CORE.textSecondary, letterSpacing: 0.5, marginBottom: 3 },
  address:   { fontSize: 14, fontWeight: '600' as const, color: WARM_CORE.text, lineHeight: 18 },
};

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

function SuccessScreen({ ride, seatsSelected, totalPrice, onGoToBookings }: any) {
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
                <Text style={ROUTE.address} numberOfLines={1}>{ride.pickupLocation.address.split(',')[0]}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {ride.pickupLocation.address.split(',').slice(1, 3).join(',').trim()}
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
                <Text style={ROUTE.address} numberOfLines={1}>{ride.dropLocation.address.split(',')[0]}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {ride.dropLocation.address.split(',').slice(1, 3).join(',').trim()}
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
  const { getRideById, requestRide } = useAppContext();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ride          = getRideById(rideId as string);
  const seatsSelected = 1;

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

  const totalPrice = ride.price * seatsSelected;

  const handleConfirm = async () => {
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      await requestRide(ride.id, seatsSelected);
      setShowSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to book ride. Please try again.');
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
                <Text style={ROUTE.address} numberOfLines={1}>{ride.pickupLocation.address.split(',')[0]}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {ride.pickupLocation.address.split(',').slice(1, 3).join(',').trim()}
                </Text>
              </View>
              <View>
                <Text style={ROUTE.labelDropoff}>DROP-OFF</Text>
                <Text style={ROUTE.address} numberOfLines={1}>{ride.dropLocation.address.split(',')[0]}</Text>
                <Text style={st.cityText} numberOfLines={1}>
                  {ride.dropLocation.address.split(',').slice(1, 3).join(',').trim()}
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

        {/* Price breakdown */}
        <Animated.View style={[st.card, {
          opacity: card2Anim.opacity,
          transform: [{ translateY: card2Anim.translateY }],
        }]}>
          <Text style={st.sectionLabel}>Price Breakdown</Text>

          <View style={st.priceRow}>
            <Text style={st.priceLabel}>Per Seat</Text>
            <Text style={st.priceValue}>₹{ride.price}</Text>
          </View>
          <View style={st.priceRow}>
            <Text style={st.priceLabel}>Number of Seats</Text>
            <Text style={st.priceValue}>× {seatsSelected}</Text>
          </View>

          <View style={st.priceDivider} />

          <View style={st.totalRow}>
            <Text style={st.totalLabel}>Total Amount</Text>
            <Text style={st.totalValue}>₹{totalPrice}</Text>
          </View>
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
              By confirming, you agree to the cancellation policy. 20 min before departure you can cancel with a 50% penalty.
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
