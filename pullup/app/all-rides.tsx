import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { Location } from '@/types';
import { calculateDistance, formatDistance, getCurrentLocation } from '@/utils/locationUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import UserAvatar from '@/components/UserAvatar';
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function SkeletonCard() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });
  return <Animated.View style={[styles.skeletonCard, { opacity }]} />;
}

function SpringCard({ onPress, style, children }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => Animated.spring(scale, { toValue: 0.97, damping: 14, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={style} onPressIn={onIn} onPressOut={onOut} onPress={onPress}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function AllRidesScreen() {
  const router = useRouter();
  const { rides, loadAllAvailableRides, auth } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [rideDistances, setRideDistances] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const headerAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(16) }).current;
  const searchAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(16) }).current;
  const listAnim   = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(20) }).current;

  const backScale = useRef(new Animated.Value(1)).current;
  const onBackIn  = () => Animated.spring(backScale, { toValue: 0.88, damping: 12, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  const onBackOut = () => Animated.spring(backScale, { toValue: 1,    damping: 16, stiffness: 200, mass: 0.9, useNativeDriver: true }).start();

  useEffect(() => {
    Animated.stagger(70, [
      Animated.parallel([
        Animated.timing(headerAnim.opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(searchAnim.opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(searchAnim.translateY, { toValue: 0, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(listAnim.opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(listAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    getCurrentLocation().then(loc => { if (loc) setUserLocation(loc); }).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try { await loadAllAvailableRides(); } catch (e) { console.error('[ALL RIDES] Load error:', e); } finally { setIsLoading(false); }
    };
    load();
  }, [loadAllAvailableRides]);

  useEffect(() => {
    if (userLocation && rides.length > 0) {
      const distances: Record<string, number> = {};
      rides.forEach(ride => {
        distances[ride.id] = calculateDistance(userLocation.latitude, userLocation.longitude, ride.pickupLocation.latitude, ride.pickupLocation.longitude);
      });
      setRideDistances(distances);
    }
  }, [userLocation, rides]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    try { await loadAllAvailableRides(); } catch (e) {} finally { setIsRefreshing(false); }
  };

  const filteredRides = rides
    .filter(ride => ride.status === 'active' && (searchQuery === '' || ride.pickupLocation.address.toLowerCase().includes(searchQuery.toLowerCase()) || ride.dropLocation.address.toLowerCase().includes(searchQuery.toLowerCase()) || ride.driverName.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => (rideDistances[a.id] ?? Infinity) - (rideDistances[b.id] ?? Infinity));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      <Animated.View style={[styles.header, { opacity: headerAnim.opacity, transform: [{ translateY: headerAnim.translateY }] }]}>
        <Animated.View style={{ transform: [{ scale: backScale }] }}>
          <Pressable onPressIn={onBackIn} onPressOut={onBackOut} onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={WARM_CORE.text} />
          </Pressable>
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>All Rides</Text>
          <Text style={styles.headerSubtitle}>{isLoading ? 'Loading...' : `${filteredRides.length} rides available`}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.searchSection, { opacity: searchAnim.opacity, transform: [{ translateY: searchAnim.translateY }] }]}>
        <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
          <MaterialCommunityIcons name="magnify" size={20} color={searchFocused ? WARM_CORE.primary : WARM_CORE.textSecondary} />
          <TextInput style={styles.searchInput} placeholder="Search by location or driver..." placeholderTextColor={WARM_CORE.textSecondary} value={searchQuery} onChangeText={setSearchQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} />
          {searchQuery.length > 0 && (<Pressable onPress={() => setSearchQuery('')} hitSlop={8}><MaterialCommunityIcons name="close-circle" size={18} color={WARM_CORE.textSecondary} /></Pressable>)}
        </View>
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, { opacity: listAnim.opacity, transform: [{ translateY: listAnim.translateY }] }]}>
        {isLoading ? (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </ScrollView>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={WARM_CORE.primary} colors={[WARM_CORE.primary]} progressBackgroundColor={WARM_CORE.card} />}>
            {filteredRides.length > 0 ? (
              filteredRides.map(ride => (
                <SpringCard key={ride.id} style={styles.rideCard} onPress={() => router.push({ pathname: '/ride-details', params: { rideId: ride.id } })}>
                  {ride.driverId === auth.user?.id && (
                    <View style={styles.yourRideBadge}>
                      <Text style={styles.yourRideBadgeText}>YOUR RIDE</Text>
                    </View>
                  )}
                  <View style={styles.routeSection}>
                    <View style={styles.routeIndicator}>
                      <View style={styles.routeDot} />
                      <View style={styles.routeLine} />
                      <View style={[styles.routeDot, { backgroundColor: WARM_CORE.textSecondary, borderColor: WARM_CORE.textSecondary }]} />
                    </View>
                    <View style={styles.locationsContainer}>
                      <View style={styles.locationRow}>
                        <Text style={styles.locationLabel}>PICKUP</Text>
                        <Text style={styles.locationName} numberOfLines={1}>{ride.pickupLocation.address}</Text>
                      </View>
                      <View style={styles.locationRow}>
                        <Text style={[styles.locationLabel, { color: WARM_CORE.textSecondary }]}>DROP-OFF</Text>
                        <Text style={styles.locationName} numberOfLines={1}>{ride.dropLocation.address}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.cardFooter}>
                    <View style={styles.driverSection}>
                      <UserAvatar userId={ride.driverId} imageUrl={(ride as any).driverImage || (ride as any).driverProfileImage} name={ride.driverName} size={34} />
                      <View>
                        <Text style={styles.driverName} numberOfLines={1}>{ride.driverName}</Text>
                        <View style={styles.metaRow}>
                          <Text style={styles.metaText}>{formatTime(ride.departureTime)}</Text>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.metaText}>{ride.availableSeats} seats</Text>
                          {rideDistances[ride.id] !== undefined && (<><Text style={styles.metaDot}>•</Text><Text style={styles.metaText}>{formatDistance(rideDistances[ride.id])}</Text></>)}
                        </View>
                      </View>
                    </View>
                    <View style={styles.priceBox}>
                      <Text style={styles.priceText}>₹{ride.price}</Text>
                      <Text style={styles.priceLabel}>Per Seat</Text>
                    </View>
                  </View>
                </SpringCard>
              ))
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="car-off" size={56} color={WARM_CORE.textSecondary} />
                <Text style={styles.emptyTitle}>No rides found</Text>
                <Text style={styles.emptySubtitle}>{searchQuery ? 'Try a different search term' : 'No rides are currently available'}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WARM_CORE.background } as ViewStyle,
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 } as ViewStyle,
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: WARM_CORE.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: WARM_CORE.border } as ViewStyle,
  headerTitle: { fontSize: 22, fontWeight: '800', color: WARM_CORE.text } as TextStyle,
  headerSubtitle: { fontSize: 13, color: WARM_CORE.textSecondary, marginTop: 2 } as TextStyle,
  searchSection: { paddingHorizontal: 20, marginBottom: 16 } as ViewStyle,
  searchContainer: { flexDirection: 'row', alignItems: 'center', height: 48, backgroundColor: WARM_CORE.card, borderRadius: 24, paddingHorizontal: 16, borderWidth: 1, borderColor: WARM_CORE.border, gap: 10 } as ViewStyle,
  searchContainerFocused: { borderColor: WARM_CORE.primary, backgroundColor: WARM_CORE.card } as ViewStyle,
  searchInput: { flex: 1, fontSize: 15, color: WARM_CORE.text, padding: 0 } as TextStyle,
  skeletonCard: { height: 130, backgroundColor: WARM_CORE.card, borderRadius: 16, borderWidth: 0.5, borderColor: WARM_CORE.border } as ViewStyle,
  scrollView: { flex: 1 } as ViewStyle,
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 } as ViewStyle,
  rideCard: { backgroundColor: WARM_CORE.card, borderRadius: 16, borderWidth: 0.5, borderColor: WARM_CORE.border, overflow: 'hidden' } as ViewStyle,
  routeSection: { flexDirection: 'row', padding: 16, gap: 14 } as ViewStyle,
  routeIndicator: { alignItems: 'center', gap: 6, paddingTop: 4 } as ViewStyle,
  routeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: WARM_CORE.primary, borderWidth: 2, borderColor: WARM_CORE.primary } as ViewStyle,
  routeLine: { width: 2, height: 36, backgroundColor: WARM_CORE.border } as ViewStyle,
  locationsContainer: { flex: 1, justifyContent: 'space-between', gap: 16 } as ViewStyle,
  locationRow: {} as ViewStyle,
  locationLabel: { fontSize: 11, fontWeight: '700', color: WARM_CORE.primary, letterSpacing: 0.5, marginBottom: 3 } as TextStyle,
  locationName: { fontSize: 14, fontWeight: '600', color: WARM_CORE.text, lineHeight: 18 } as TextStyle,
  divider: { height: 1, backgroundColor: WARM_CORE.border, marginHorizontal: 16 } as ViewStyle,
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 } as ViewStyle,
  driverSection: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 } as ViewStyle,
  driverAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: WARM_CORE.border, justifyContent: 'center', alignItems: 'center' } as ViewStyle,
  driverInitial: { fontSize: 13, fontWeight: '700', color: WARM_CORE.primary } as TextStyle,
  driverName: { fontSize: 13, fontWeight: '700', color: WARM_CORE.text } as TextStyle,
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 } as ViewStyle,
  metaText: { fontSize: 11, color: WARM_CORE.textSecondary, fontWeight: '500' } as TextStyle,
  metaDot: { fontSize: 11, color: WARM_CORE.border } as TextStyle,
  priceBox: { alignItems: 'center' } as ViewStyle,
  priceText: { fontSize: 20, fontWeight: '800', color: WARM_CORE.primary } as TextStyle,
  priceLabel: { fontSize: 9, fontWeight: '600', color: WARM_CORE.textSecondary, marginTop: 1 } as TextStyle,
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 } as ViewStyle,
  emptyTitle: { fontSize: 18, fontWeight: '700', color: WARM_CORE.text } as TextStyle,
  emptySubtitle: { fontSize: 14, color: WARM_CORE.textSecondary, textAlign: 'center' } as TextStyle,
  yourRideBadge: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', margin: 12, marginBottom: 0 } as ViewStyle,
  yourRideBadgeText: { fontSize: 10, fontWeight: '800', color: '#ffffff', letterSpacing: 0.8 } as TextStyle,
});
