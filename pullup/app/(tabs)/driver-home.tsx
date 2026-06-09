import { useAppContext } from '@/context/AppContext';
import { ANIMATION_TIMINGS, EASING_FUNCTIONS, createFadeAnimation, createScaleAnimation, createSlideAnimation } from '@/utils/animationConfig';
import { formatTime } from '@/utils/mockData';
import { getTimeBasedGreeting } from '@/utils/stringUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

// ─── Pressable wrapper with spring scale ───────────────────────────────────
function SpringPress({
  children,
  onPress,
  style,
  scaleDown = 0.96,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  scaleDown?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: scaleDown, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  // Extract flex/width/height layout props to apply on TouchableOpacity too
  const { flex, width, height, ...restStyle } = (style && typeof style === 'object' && !Array.isArray(style)) ? style : {};
  const layoutStyle = { flex, width, height };
  return (
    <TouchableOpacity onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} activeOpacity={1} style={layoutStyle}>
      <Animated.View style={[restStyle, { flex: flex ?? undefined, transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

// ─── Shimmer bar ────────────────────────────────────────────────────────────
function ShimmerBar({ width, height = 14, radius = 7, style }: { width: number | string; height?: number; radius?: number; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ).start();
  }, []);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] });
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: WARM_CORE.border, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(212,80,10,0.06)',
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}

// ─── Animated counter ───────────────────────────────────────────────────────
function AnimatedCounter({ value, prefix = '₹', style }: { value: number; prefix?: string; style?: any }) {
  const animVal = useRef(new Animated.Value(0)).current;
  const displayRef = useRef(0);
  useEffect(() => {
    animVal.setValue(0);
    Animated.timing(animVal, { toValue: value, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const id = animVal.addListener(({ value: v }) => { displayRef.current = Math.round(v); });
    return () => animVal.removeListener(id);
  }, [value]);
  return (
    <Animated.Text style={style}>
      {prefix}
      {animVal.interpolate({ inputRange: [0, value || 1], outputRange: ['0', String(value)] }) as any}
    </Animated.Text>
  );
}

export default function DriverHomeScreen() {
  const router = useRouter();
  const { rides, auth, loadDriverRides } = useAppContext();

  // Load driver rides whenever this screen gains focus (covers app start + tab switch)
  useFocusEffect(
    useCallback(() => {
      if (auth.user?.id) {
        loadDriverRides(auth.user.id);
      }
    }, [auth.user?.id, loadDriverRides])
  );
  // ── Entrance animations ──────────────────────────────────────────────────
  const greetingFade = useRef(createFadeAnimation(0)).current;
  const greetingSlide = useRef(new Animated.Value(-16)).current;
  const todaySlide    = useRef(createSlideAnimation(40)).current;
  const earningsScale = useRef(createScaleAnimation(0.88)).current;
  const actionsSlide  = useRef(createSlideAnimation(40)).current;
  const upcomingSlide = useRef(createSlideAnimation(40)).current;
  const emptySlide    = useRef(new Animated.Value(30)).current;
  const emptyFade     = useRef(new Animated.Value(0)).current;

  // ── Ambient: breathing dot on greeting icon ──────────────────────────────
  const breatheScale = useRef(new Animated.Value(1)).current;

  // ── Pulse on Start Ride CTA ──────────────────────────────────────────────
  const ctaGlow = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.parallel([
        Animated.timing(greetingFade.opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(greetingSlide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6 }),
      ]),
      Animated.delay(60),
      Animated.parallel([
        Animated.spring(todaySlide.slideY, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 7 }),
        Animated.spring(earningsScale.scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 7 }),
      ]),
      Animated.delay(60),
      Animated.spring(actionsSlide.slideY, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 7 }),
      Animated.delay(40),
      Animated.parallel([
        Animated.spring(upcomingSlide.slideY, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 7 }),
        Animated.spring(emptySlide, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 7 }),
        Animated.timing(emptyFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    // Ambient breathing on greeting icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheScale, { toValue: 1.12, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breatheScale, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Breathing CTA pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(ctaGlow, { toValue: 0.85, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const driverRides = rides.filter(r => r.driverId === auth.user?.id && r.status === 'active');
  const todayRide   = useMemo(() => (driverRides.length > 0 ? driverRides[0] : null), [driverRides]);
  const upcomingRides = useMemo(() => driverRides.slice(1, 4), [driverRides]);

  const earningsData = useMemo(() => {
    const todayEarnings = todayRide
      ? todayRide.bookedSeats.reduce((s, b) => s + (b.status !== 'cancelled' ? b.seatsBooked * todayRide.price : 0), 0)
      : 0;
    const weeklyEarnings = driverRides.reduce((s, r) =>
      s + r.bookedSeats.reduce((rs, b) => rs + (b.status !== 'cancelled' ? b.seatsBooked * r.price : 0), 0), 0);
    let totalFuelSaved = 0;
    driverRides.forEach(r => {
      const booked = r.bookedSeats.reduce((s, b) => s + (b.status !== 'cancelled' ? b.seatsBooked : 0), 0);
      if (booked > 0) totalFuelSaved += 15 * 6.67 * 0.7;
    });
    return { todayEarnings, weeklyEarnings, fuelSaved: Math.round(totalFuelSaved) };
  }, [driverRides, todayRide]);

  const getTodayBooked = useCallback(() =>
    todayRide ? todayRide.bookedSeats.reduce((s, b) => s + (b.status !== 'cancelled' ? b.seatsBooked : 0), 0) : 0,
    [todayRide]);

  const handlePostRide      = () => router.push('/(tabs)/post-ride' as any);
  const handleMileage       = () => router.push('/driver-calculator');
  const handleViewDetails   = (id: string) => router.push({ pathname: '/ride-details', params: { rideId: id } });
  const handleStartRide     = (id: string) => router.push({ pathname: '/driver-rides', params: { rideId: id } });

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Error Banner */}
        {auth.error && (
          <View style={s.errorBanner}>
            <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
            <Text style={s.errorText}>{auth.error}</Text>
          </View>
        )}

        {/* ── Greeting ── */}
        <Animated.View style={[s.greeting, { opacity: greetingFade.opacity, transform: [{ translateY: greetingSlide }] }]}>
          <Animated.View style={[s.greetingIcon, { transform: [{ scale: breatheScale }] }]}>
            <MaterialCommunityIcons name="hand-wave" size={22} color={WARM_CORE.primary} />
          </Animated.View>
          <Text style={s.greetingText}>{getTimeBasedGreeting(auth.user?.fullName?.split(' ')[0] || 'Driver')}</Text>
          {earningsData.fuelSaved > 0 && (
            <View style={s.savingsBadge}>
              <MaterialCommunityIcons name="leaf" size={13} color={WARM_CORE.primary} />
              <Text style={s.savingsText}>₹{earningsData.fuelSaved} saved this week</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Today's Ride ── */}
        {todayRide ? (
          <Animated.View style={[s.section, { transform: [{ translateY: todaySlide.slideY }] }]}>
            <Text style={s.sectionLabel}>TODAY{"'"}S RIDE</Text>
            <SpringPress onPress={() => handleViewDetails(todayRide.id)} style={s.todayCard}>
              <View style={s.todayInner}>
                {/* Route */}
                <View style={s.routeRow}>
                  <View style={s.routeIndicator}>
                    <View style={[s.routeDot, { backgroundColor: WARM_CORE.primary }]} />
                    <View style={s.routeConnector} />
                    <View style={[s.routeDot, { backgroundColor: WARM_CORE.accent }]} />
                  </View>
                  <View style={s.routeLabels}>
                    <View>
                      <Text style={s.locLabel}>PICKUP</Text>
                      <Text style={s.locText} numberOfLines={1}>{todayRide.pickupLocation.address}</Text>
                    </View>
                    <View style={{ height: 16 }} />
                    <View>
                      <Text style={s.locLabel}>DROP-OFF</Text>
                      <Text style={s.locText} numberOfLines={1}>{todayRide.dropLocation.address}</Text>
                    </View>
                  </View>
                </View>

                {/* Footer info */}
                <View style={s.todayFooter}>
                  <View style={s.infoGroup}>
                    <View style={s.infoItem}>
                      <MaterialCommunityIcons name="clock-outline" size={15} color={WARM_CORE.primary} />
                      <Text style={s.infoText}>{formatTime(todayRide.departureTime)}</Text>
                    </View>
                    <Text style={s.dot}>•</Text>
                    <View style={s.infoItem}>
                      <MaterialCommunityIcons name="seat" size={15} color={WARM_CORE.accent} />
                      <Text style={s.infoText}>{getTodayBooked()}/{todayRide.totalSeats}</Text>
                    </View>
                  </View>
                  <View style={s.earningsBox}>
                    <Text style={s.earningsLabel}>SAVINGS</Text>
                    <Text style={s.earningsAmount}>₹{earningsData.todayEarnings}</Text>
                  </View>
                </View>
              </View>

              {/* Action buttons */}
              <View style={s.actionRow}>
                <View style={s.actionBtn}>
                  <SpringPress
                    onPress={() => handleViewDetails(todayRide.id)}
                    style={s.detailsBtn}
                    scaleDown={0.95}
                  >
                    <View style={s.detailsBtnInner}>
                      <MaterialCommunityIcons name="eye-outline" size={15} color={WARM_CORE.text} />
                      <Text style={s.detailsBtnText}>View Details</Text>
                    </View>
                  </SpringPress>
                </View>
                <View style={s.actionBtn}>
                  <Animated.View style={[s.startBtn, { opacity: ctaGlow }]}>
                    <SpringPress
                      onPress={() => handleStartRide(todayRide.id)}
                      style={s.startBtnFill}
                      scaleDown={0.95}
                    >
                      <View style={s.startBtnInner}>
                        <MaterialCommunityIcons name="play-circle" size={16} color={WARM_CORE.white} />
                        <Text style={s.startBtnText}>Start Ride</Text>
                      </View>
                    </SpringPress>
                  </Animated.View>
                </View>
              </View>
            </SpringPress>
          </Animated.View>
        ) : null}

        {/* ── Fuel Saved Card ── */}
        <Animated.View style={[s.section, { transform: [{ scale: earningsScale.scale }] }]}>
          <SpringPress style={s.fuelCard}>
            <View style={s.fuelIconWrap}>
              <MaterialCommunityIcons name="leaf" size={22} color={WARM_CORE.success} />
            </View>
            <View style={s.fuelInfo}>
              <Text style={s.fuelLabel}>Total Fuel Saved</Text>
              <Text style={s.fuelValue}>₹{earningsData.fuelSaved}</Text>
            </View>
          </SpringPress>
        </Animated.View>

        {/* ── Quick Actions ── */}
        <Animated.View style={[s.section, { transform: [{ translateY: actionsSlide.slideY }] }]}>
          <View style={s.actionsRow}>
            <View style={{ flex: 1 }}>
              <SpringPress onPress={handlePostRide} style={s.actionCard} scaleDown={0.95}>
                <View style={[s.actionIcon, { backgroundColor: 'rgba(212, 80, 10, 0.08)' }]}>
                  <MaterialCommunityIcons name="plus-circle" size={26} color={WARM_CORE.primary} />
                </View>
                <Text style={s.actionLabel}>Post New{'\n'}Ride</Text>
              </SpringPress>
            </View>
            <View style={{ flex: 1 }}>
              <SpringPress onPress={handleMileage} style={s.actionCard} scaleDown={0.95}>
                <View style={[s.actionIcon, { backgroundColor: 'rgba(255, 122, 51, 0.1)' }]}>
                  <MaterialCommunityIcons name="map-marker-distance" size={26} color={WARM_CORE.accent} />
                </View>
                <Text style={s.actionLabel}>Mileage{'\n'}Calculator</Text>
              </SpringPress>
            </View>
          </View>
        </Animated.View>

        {/* ── Upcoming Rides ── */}
        {upcomingRides.length > 0 && (
          <Animated.View style={[s.section, { transform: [{ translateY: upcomingSlide.slideY }] }]}>
            <Text style={s.sectionLabel}>UPCOMING RIDES</Text>
            {upcomingRides.map((ride, i) => {
              const booked = ride.bookedSeats.reduce((sum, b) =>
                sum + (b.status !== 'cancelled' ? b.seatsBooked : 0), 0);
              return (
                <Animated.View key={ride.id} style={{ opacity: 1 }}>
                  <SpringPress
                    onPress={() => handleViewDetails(ride.id)}
                    style={s.upcomingCard}
                    scaleDown={0.97}
                  >
                    <View style={s.upcomingInner}>
                      <View style={s.miniRoute}>
                        <View style={[s.miniDot, { backgroundColor: WARM_CORE.primary }]} />
                        <View style={s.miniLine} />
                        <View style={[s.miniDot, { backgroundColor: WARM_CORE.accent }]} />
                      </View>
                      <View style={s.upcomingLocs}>
                        <Text style={s.upLocLabel}>FROM</Text>
                        <Text style={s.upLocName} numberOfLines={1}>{ride.pickupLocation.address}</Text>
                        <View style={{ height: 8 }} />
                        <Text style={s.upLocLabel}>TO</Text>
                        <Text style={s.upLocName} numberOfLines={1}>{ride.dropLocation.address}</Text>
                      </View>
                    </View>
                    <View style={s.upcomingFooter}>
                      <View style={s.infoGroup}>
                        <View style={s.infoItem}>
                          <MaterialCommunityIcons name="clock-outline" size={13} color={WARM_CORE.primary} />
                          <Text style={s.upInfoText}>{formatTime(ride.departureTime)}</Text>
                        </View>
                        <Text style={s.dot}>•</Text>
                        <View style={s.infoItem}>
                          <MaterialCommunityIcons name="seat" size={13} color={WARM_CORE.accent} />
                          <Text style={s.upInfoText}>{booked}/{ride.totalSeats}</Text>
                        </View>
                      </View>
                      <Text style={s.upPrice}>₹{ride.price}/seat</Text>
                    </View>
                  </SpringPress>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        {/* ── Empty State ── */}
        {driverRides.length === 0 && (
          <Animated.View style={[s.emptyWrap, { opacity: emptyFade, transform: [{ translateY: emptySlide }] }]}>
            <View style={s.emptyIconRing}>
              <MaterialCommunityIcons name="car-outline" size={48} color={WARM_CORE.primary} />
            </View>
            <Text style={s.emptyTitle}>No rides posted yet</Text>
            <Text style={s.emptySubtitle}>Start saving with your first{'\n'}ride today</Text>
            <Animated.View style={{ opacity: ctaGlow }}>
              <SpringPress onPress={handlePostRide} style={s.emptyCTA} scaleDown={0.96}>
                <MaterialCommunityIcons name="plus" size={18} color={WARM_CORE.white} />
                <Text style={s.emptyCTAText}>Post a Ride</Text>
              </SpringPress>
            </Animated.View>
          </Animated.View>
        )}

      </ScrollView>

      <StatusBar barStyle="dark-content" />

      <StatusBar barStyle="dark-content" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: WARM_CORE.background },
  scroll:     { flex: 1 },
  content:    { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.06)', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)' },
  errorText:   { color: WARM_CORE.error, fontSize: 13, fontWeight: '500', flex: 1 },

  // Greeting
  greeting:     { alignItems: 'center', marginBottom: 28, paddingTop: 8 },
  greetingIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(212, 80, 10, 0.08)', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  greetingText: { fontSize: 27, fontWeight: '800', color: WARM_CORE.text, letterSpacing: -0.5 },
  savingsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(212, 80, 10, 0.06)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  savingsText:  { fontSize: 13, fontWeight: '600', color: WARM_CORE.primary },

  // Sections
  section:     { marginBottom: 24 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: WARM_CORE.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },

  // Today Card
  todayCard:   { backgroundColor: WARM_CORE.card, borderRadius: 18, borderWidth: 1, borderColor: WARM_CORE.border, overflow: 'hidden' },
  accentBar:   { height: 3, backgroundColor: WARM_CORE.primary, borderRadius: 2 },
  todayInner:  { padding: 18 },
  routeRow:    { flexDirection: 'row', gap: 14, marginBottom: 18 },
  routeIndicator: { alignItems: 'center', paddingTop: 2 },
  routeDot:    { width: 10, height: 10, borderRadius: 5 },
  routeConnector: { width: 2, height: 52, backgroundColor: WARM_CORE.border, marginVertical: 4 },
  routeLabels: { flex: 1, justifyContent: 'space-between' },
  locLabel:    { fontSize: 10, fontWeight: '700', color: WARM_CORE.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  locText:     { fontSize: 15, fontWeight: '700', color: WARM_CORE.text },
  todayFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: WARM_CORE.border },
  infoGroup:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText:    { fontSize: 13, fontWeight: '700', color: WARM_CORE.text },
  dot:         { fontSize: 14, color: WARM_CORE.border },
  earningsBox: { alignItems: 'flex-end' },
  earningsLabel: { fontSize: 9, fontWeight: '700', color: WARM_CORE.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  earningsAmount:{ fontSize: 22, fontWeight: '800', color: WARM_CORE.primary },

  actionRow:     { flexDirection: 'row', paddingHorizontal: 18, paddingBottom: 16, paddingTop: 4, gap: 10 },
  actionBtn:     { flex: 1 },
  detailsBtn:    { flex: 1, borderRadius: 12, backgroundColor: WARM_CORE.card, borderWidth: 1, borderColor: WARM_CORE.border, overflow: 'hidden' },
  detailsBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  detailsBtnText:{ fontSize: 13, fontWeight: '700', color: WARM_CORE.text },
  startBtn:      { borderRadius: 12, overflow: 'hidden', backgroundColor: WARM_CORE.primary,
                   shadowColor: WARM_CORE.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  startBtnFill:  { flex: 1 },
  startBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  startBtnText:  { fontSize: 13, fontWeight: '700', color: WARM_CORE.white },

  // Fuel card
  fuelCard:    { backgroundColor: WARM_CORE.card, borderRadius: 16, borderWidth: 1, borderColor: WARM_CORE.border, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  fuelIconWrap:{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center' },
  fuelInfo:    { alignItems: 'center' },
  fuelLabel:   { fontSize: 11, fontWeight: '600', color: WARM_CORE.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fuelValue:   { fontSize: 24, fontWeight: '800', color: WARM_CORE.text, marginTop: 2 },
  fuelBadge:   { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  fuelBadgeText:{ fontSize: 11, fontWeight: '800', color: WARM_CORE.success, letterSpacing: 1 },

  // Quick Actions
  actionsRow:  { flexDirection: 'row', gap: 12 },
  actionCard:  { flex: 1, backgroundColor: WARM_CORE.card, borderRadius: 16, borderWidth: 1, borderColor: WARM_CORE.border, paddingVertical: 24, alignItems: 'center', gap: 12, minWidth: 0 },
  actionIcon:  { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '700', color: WARM_CORE.text, textAlign: 'center', lineHeight: 18 },

  // Upcoming cards
  upcomingCard:  { backgroundColor: WARM_CORE.card, borderRadius: 18, borderWidth: 1, borderColor: WARM_CORE.border, overflow: 'hidden', marginBottom: 10 },
  upcomingInner: { flexDirection: 'row', gap: 14, padding: 16, backgroundColor: WARM_CORE.card },
  miniRoute:     { alignItems: 'center', paddingTop: 3 },
  miniDot:       { width: 9, height: 9, borderRadius: 5 },
  miniLine:      { width: 2, height: 30, backgroundColor: WARM_CORE.border, marginVertical: 3 },
  upcomingLocs:  { flex: 1, gap: 2 },
  upLocLabel:    { fontSize: 9, fontWeight: '700', color: WARM_CORE.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  upLocName:     { fontSize: 14, fontWeight: '600', color: WARM_CORE.text },
  upcomingFooter:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: WARM_CORE.card, borderTopWidth: 1, borderTopColor: WARM_CORE.border },
  upInfoText:    { fontSize: 12, fontWeight: '600', color: WARM_CORE.text },
  upPrice:       { fontSize: 13, fontWeight: '700', color: WARM_CORE.primary },

  // Empty state
  emptyWrap:   { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 },
  emptyIconRing: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(212, 80, 10, 0.08)', borderWidth: 1, borderColor: 'rgba(212, 80, 10, 0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:  { fontSize: 20, fontWeight: '800', color: WARM_CORE.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: WARM_CORE.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyCTA:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: WARM_CORE.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyCTAText: { fontSize: 15, fontWeight: '700', color: WARM_CORE.white },
  // FAB & Action Sheet Styles
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 99,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,18,13,0.4)',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  actionSheet: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  actionSheetHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionSheetKnob: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WARM_CORE.border,
    marginBottom: 14,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
  },
  actionSheetButtons: {
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionButtonText: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  actionButtonDesc: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  cancelActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  cancelActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
});
