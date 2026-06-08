import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { fetchRoute } from '@/utils/routeUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WARM_CORE } from '@/constants/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RideDetailsScreen() {
  const router = useRouter();
  const { rideId, bookingId } = useLocalSearchParams();
  const { getRideById, requestRide, auth, bookings } = useAppContext();
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'accepted' | 'rejected' | 'cancelled'>('idle');
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [carPositionIndex, setCarPositionIndex] = useState(0);
  const carPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(carPulseAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [carPulseAnim]);

  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 1) {
      setCarPositionIndex(0);
      const interval = setInterval(() => {
        setCarPositionIndex((prev) => {
          if (prev >= routeCoordinates.length - 1) {
            return 0;
          }
          return prev + 1;
        });
      }, 180);
      return () => clearInterval(interval);
    }
  }, [routeCoordinates]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const ride = getRideById(rideId as string);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['20%', '50%'], []);

  // ── Floating header fade-in after map loads ──
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // ── Bottom sheet section stagger ──
  const routeSection = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const infoSection  = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const carSection   = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;

  // ── CTA breathing ──
  const ctaBreath = useRef(new Animated.Value(1)).current;

  // ── Back button spring ──
  const backScale  = useRef(new Animated.Value(1)).current;
  const plantScale = useRef(new Animated.Value(1)).current;

  // ── Eco modal ──
  const [ecoModalVisible, setEcoModalVisible] = useState(false);
  const ecoModalAnim = useRef(new Animated.Value(0)).current;  // 0→1 on open

  const openEcoModal  = () => {
    setEcoModalVisible(true);
    Animated.spring(ecoModalAnim, { toValue: 1, damping: 18, stiffness: 160, mass: 1, useNativeDriver: true }).start();
  };
  const closeEcoModal = () => {
    Animated.timing(ecoModalAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setEcoModalVisible(false));
  };

  const springIn = (val: Animated.Value) =>
    Animated.spring(val, { toValue: 0.88, damping: 14, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
  const springOut = (val: Animated.Value) =>
    Animated.spring(val, { toValue: 1, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }).start();

  // Check if user already has a booking for this ride
  useEffect(() => {
    if (ride && auth.user) {
      if (bookingId) {
        const booking = bookings.find(b => b.id === bookingId);
        if (booking) {
          setRequestStatus(booking.status as any);
        }
      } else {
        const activeBooking = bookings.find(
          b => b.rideId === ride.id &&
                b.passengerId === auth.user?.id &&
                (b.status === 'pending' || b.status === 'accepted')
        );
        if (activeBooking) {
          setRequestStatus(activeBooking.status as any);
        } else {
          const userBooking = ride.bookedSeats.find(bs => bs.passengerId === auth.user?.id);
          if (userBooking) {
            setRequestStatus(userBooking.status as any);
          } else {
            setRequestStatus('idle');
          }
        }
      }
    }
  }, [ride, auth.user, bookings, bookingId]);

  // Fetch route from Google Directions API
  useEffect(() => {
    if (!ride) return;

    const loadRoute = async () => {
      setIsLoadingRoute(true);
      try {
        const result = await fetchRoute(
          ride.pickupLocation,
          ride.dropLocation,
          'AIzaSyCIZ1Lccen5Ek7-0cXIU3Pxv5he7vhmZ6Y'
        );

        console.log('📍 Setting route coordinates:', result.points.length);
        setRouteCoordinates(result.points);

        if (result.distance) {
          const parsed = parseFloat(result.distance.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed) && parsed > 0) setRouteDistanceKm(parsed);
        }

        if (mapRef.current && result.points && result.points.length > 1) {
          setTimeout(() => {
            try {
              console.log('Fitting map to route...');
              mapRef.current?.fitToCoordinates(result.points, {
                edgePadding: { top: 150, right: 50, bottom: 350, left: 50 },
                animated: true,
              });
            } catch (error) {
              console.error('Error fitting map:', error);
            }
          }, 500);
        }
      } catch (error) {
        console.error('Error loading route:', error);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    loadRoute();
  }, [ride]);

  // Animate header + sheet content in after mount
  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 400,
      delay: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.stagger(90, [
      Animated.parallel([
        Animated.timing(routeSection.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(routeSection.translateY, { toValue: 0, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(infoSection.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(infoSection.translateY, { toValue: 0, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(carSection.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(carSection.translateY, { toValue: 0, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaBreath, { toValue: 1.018, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(ctaBreath, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!ride) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.errorText}>Ride not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleBookRide = async () => {
    if (!auth.user) return;
    router.push({ pathname: '/booking-confirmation', params: { rideId: ride.id } });
  };

  const getButtonInfo = () => {
    if (ride.status === 'completed') {
      return {
        text: 'Ride Completed',
        icon: 'check-circle',
        color: WARM_CORE.success,
        bgColor: WARM_CORE.card,
        disabled: true,
      };
    }
    if (ride.status === 'in_progress') {
      return {
        text: 'Ride in Progress',
        icon: 'play-circle',
        color: '#F59E0B',
        bgColor: WARM_CORE.card,
        disabled: true,
      };
    }
    if (ride.status === 'cancelled') {
      return {
        text: 'Ride Cancelled',
        icon: 'close-circle',
        color: WARM_CORE.error,
        bgColor: WARM_CORE.card,
        disabled: true,
      };
    }

    switch (requestStatus) {
      case 'pending':
        return {
          text: 'Ride Requested',
          icon: 'clock-outline',
          color: '#D97706',
          bgColor: WARM_CORE.card,
          disabled: true,
        };
      case 'accepted':
        return {
          text: 'Accepted',
          icon: 'check-circle',
          color: WARM_CORE.success,
          bgColor: WARM_CORE.card,
          disabled: true,
        };
      case 'rejected':
        return {
          text: 'Request Rejected',
          icon: 'close-circle',
          color: WARM_CORE.error,
          bgColor: WARM_CORE.card,
          disabled: false,
        };
      case 'cancelled':
        return {
          text: 'Booking Cancelled',
          icon: 'close-circle',
          color: WARM_CORE.textSecondary,
          bgColor: WARM_CORE.card,
          disabled: false,
        };
      default:
        return {
          text: 'Request Seat',
          icon: 'plus-circle',
          color: WARM_CORE.white,
          bgColor: WARM_CORE.primary,
          disabled: false,
        };
    }
  };

  const buttonInfo = getButtonInfo();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} translucent={true} />

        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            customMapStyle={warmMapStyle}
            initialRegion={{
              latitude: (ride.pickupLocation.latitude + ride.dropLocation.latitude) / 2,
              longitude: (ride.pickupLocation.longitude + ride.dropLocation.longitude) / 2,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            scrollEnabled={true}
            zoomEnabled={true}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {routeCoordinates && routeCoordinates.length > 1 && (
              <>
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor={WARM_CORE.border}
                  strokeWidth={6}
                  geodesic={false}
                />
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor={WARM_CORE.primary}
                  strokeWidth={4}
                  geodesic={false}
                />
              </>
            )}

            {routeCoordinates && routeCoordinates.length > 0 && routeCoordinates[carPositionIndex] && (
              <Marker
                coordinate={routeCoordinates[carPositionIndex]}
                anchor={{ x: 0.5, y: 0.5 }}
                flat={true}
              >
                <View style={styles.movingCarMarker}>
                  <Animated.View
                    style={[
                      styles.movingCarPulse,
                      {
                        transform: [
                          {
                            scale: carPulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2.8],
                            }),
                          },
                        ],
                        opacity: carPulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 0],
                        }),
                      },
                    ]}
                  />
                  <View style={styles.movingCarInner}>
                    <MaterialCommunityIcons name="car-sports" size={14} color={WARM_CORE.white} />
                  </View>
                </View>
              </Marker>
            )}

            <Marker
              coordinate={
                routeCoordinates && routeCoordinates.length > 1
                  ? routeCoordinates[0]
                  : {
                      latitude: ride.pickupLocation.latitude,
                      longitude: ride.pickupLocation.longitude,
                    }
              }
              title="Pickup Location"
              description={ride.pickupLocation.address}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerPickup}>
                <View style={styles.markerPickupInner}>
                  <MaterialCommunityIcons name="check" size={14} color={WARM_CORE.white} />
                </View>
              </View>
            </Marker>

            <Marker
              coordinate={
                routeCoordinates && routeCoordinates.length > 1
                  ? routeCoordinates[routeCoordinates.length - 1]
                  : {
                      latitude: ride.dropLocation.latitude,
                      longitude: ride.dropLocation.longitude,
                    }
              }
              title="Drop-off Location"
              description={ride.dropLocation.address}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerDropoff}>
                <MaterialCommunityIcons name="circle" size={20} color={WARM_CORE.white} />
              </View>
            </Marker>
          </MapView>
        </View>

        {/* HEADER OVER MAP */}
        <Animated.View style={[styles.floatingHeader, { opacity: headerOpacity }]}>
          <Animated.View style={{ transform: [{ scale: backScale }] }}>
            <Pressable
              onPressIn={() => springIn(backScale)}
              onPressOut={() => springOut(backScale)}
              onPress={() => router.back()}
              style={styles.circleBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color={WARM_CORE.text} />
            </Pressable>
          </Animated.View>

          <Text style={styles.headerTitle}>Ride Details</Text>

          {/* PLANT / ECO BUTTON */}
          <Animated.View style={{ transform: [{ scale: plantScale }] }}>
            <Pressable
              onPressIn={() => springIn(plantScale)}
              onPressOut={() => springOut(plantScale)}
              onPress={openEcoModal}
              style={styles.circleBtn}
            >
              <MaterialCommunityIcons name="leaf" size={20} color={WARM_CORE.success} />
            </Pressable>
          </Animated.View>
        </Animated.View>

        <BottomSheet
          ref={bottomSheetRef}
          index={1}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          backgroundStyle={{
            backgroundColor: WARM_CORE.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          handleIndicatorStyle={{
            backgroundColor: WARM_CORE.border,
            width: 36,
          }}
        >
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 160,
            }}
          >
            {/* ROUTE */}
            <Animated.View style={{ opacity: routeSection.opacity, transform: [{ translateY: routeSection.translateY }] }}>
              <View style={styles.routeContainer}>
                <View style={styles.routeRow}>
                  <View style={styles.pickupDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeLabel}>PICKUP</Text>
                    <Text style={styles.routeText} numberOfLines={1}>
                      {ride.pickupLocation.address}
                    </Text>
                  </View>
                </View>

                <View style={styles.dottedLine} />

                <View style={styles.routeRow}>
                  <View style={styles.dropDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeLabel, { color: WARM_CORE.textSecondary }]}>DROP-OFF</Text>
                    <Text style={styles.routeText}>
                      {ride.dropLocation.address}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* DATE + PRICE */}
            <Animated.View style={{ opacity: infoSection.opacity, transform: [{ translateY: infoSection.translateY }] }}>
              <View style={styles.infoRow}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>DATE & TIME</Text>
                  <Text style={styles.infoValue}>
                    Today, {formatTime(ride.departureTime)}
                  </Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>PRICE PER SEAT</Text>
                  <Text style={styles.infoValue}>₹{ride.price}</Text>
                </View>
              </View>
            </Animated.View>

            {/* VEHICLE */}
            <Animated.View style={{ opacity: carSection.opacity, transform: [{ translateY: carSection.translateY }] }}>
              <Text style={styles.sectionLabel}>VEHICLE & SEATS</Text>

              <View style={styles.vehicleCard}>
                <View style={styles.driverRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {ride.driverName.charAt(0)}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{ride.driverName}</Text>
                    <Text style={styles.verified}>VERIFIED</Text>
                  </View>

                  <Text style={styles.seatBadge}>{ride.availableSeats}</Text>
                </View>
              </View>
            </Animated.View>

            <View style={{ height: 120 }} />
          </BottomSheetScrollView>
        </BottomSheet>
      </View>

      {/* STICKY FOOTER */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>TOTAL TO PAY</Text>
          <Text style={styles.totalAmount}>₹{ride.price}</Text>
        </View>

        <Animated.View style={{ transform: [{ scale: buttonInfo.disabled ? new Animated.Value(1) : ctaBreath }] }}>
          <TouchableOpacity
            style={[
              styles.ctaButton,
              {
                backgroundColor: buttonInfo.bgColor,
                opacity: buttonInfo.disabled ? 0.7 : 1,
              },
            ]}
            onPress={handleBookRide}
            disabled={buttonInfo.disabled}
            activeOpacity={buttonInfo.disabled ? 1 : 0.82}
          >
            <MaterialCommunityIcons
              name={buttonInfo.icon as any}
              size={18}
              color={buttonInfo.color}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.ctaText, { color: buttonInfo.color }]}>
              {buttonInfo.text}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ECO IMPACT MODAL */}
      <EcoImpactModal
        visible={ecoModalVisible}
        onClose={closeEcoModal}
        animValue={ecoModalAnim}
        ride={ride}
        routeDistanceKm={routeDistanceKm}
        routeCoordinates={routeCoordinates}
      />
    </GestureHandlerRootView>
  );
}

// ── Eco constants ──────────────────────────────────────────────────────────────
const CO2_KG_PER_LITER  = 2.31;
const FUEL_PRICE_PER_L  = 103;   // ₹ estimate
const AVG_MILEAGE_KM_L  = 15;    // avg Indian car mileage
const TREES_PER_TON_CO2 = 16.67;

function computeEco(distanceKm: number, totalPeople: number) {
  const litersPerCar        = distanceKm / AVG_MILEAGE_KM_L;
  const co2SoloKg           = litersPerCar * CO2_KG_PER_LITER * totalPeople;
  const co2CarpoolKg        = litersPerCar * CO2_KG_PER_LITER;
  const co2SavedKg          = co2SoloKg - co2CarpoolKg;
  const carsRemovedFromRoad = totalPeople - 1;
  const fuelSavedLiters     = litersPerCar * (totalPeople - 1);
  const treeEquivalent      = (co2SavedKg / 1000) * TREES_PER_TON_CO2;
  const savingsPct          = co2SoloKg > 0 ? (co2SavedKg / co2SoloKg) * 100 : 0;
  const fuelSavedRupees     = Math.round(fuelSavedLiters * FUEL_PRICE_PER_L);
  return { co2SavedKg, carsRemovedFromRoad, fuelSavedLiters, treeEquivalent, savingsPct, fuelSavedRupees };
}

function polylineDistanceKm(coords: { latitude: number; longitude: number }[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const R  = 6371;
    const dL = ((b.latitude  - a.latitude)  * Math.PI) / 180;
    const dl = ((b.longitude - a.longitude) * Math.PI) / 180;
    const s  = Math.sin(dL / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dl / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  return total;
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R  = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(dL / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Eco Modal ─────────────────────────────────────────────────────────────────
function EcoImpactModal({ visible, onClose, animValue, ride, routeDistanceKm, routeCoordinates }: {
  visible: boolean;
  onClose: () => void;
  animValue: Animated.Value;
  ride: any;
  routeDistanceKm: number;
  routeCoordinates: { latitude: number; longitude: number }[];
}) {
  if (!visible) return null;

  const distKm: number = (() => {
    if (routeDistanceKm > 0) return routeDistanceKm;
    const poly = polylineDistanceKm(routeCoordinates);
    if (poly > 0.5) return Math.round(poly * 10) / 10;
    return Math.max(1, Math.round(haversineKm(
      ride.pickupLocation.latitude, ride.pickupLocation.longitude,
      ride.dropLocation.latitude,   ride.dropLocation.longitude,
    )));
  })();

  const isRoadDist  = routeDistanceKm > 0;
  const totalPeople = Math.max(2, (ride.availableSeats ?? 2));
  const eco         = computeEco(distKm, totalPeople);

  const translateY  = animValue.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });
  const backdropOp  = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  const treeDisplay = eco.treeEquivalent >= 0.1
    ? eco.treeEquivalent.toFixed(1)
    : `${(eco.treeEquivalent * 100).toFixed(0)}%`;
  const treeLabel   = eco.treeEquivalent >= 0.1 ? "trees' worth" : 'of a tree planted';

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={ecoSt.backdropTouch} onPress={onClose}>
        <Animated.View style={[ecoSt.backdrop, { opacity: backdropOp }]} />
      </Pressable>

      <View style={ecoSt.sheetWrap} pointerEvents="box-none">
        <Animated.View style={[ecoSt.sheet, { transform: [{ translateY }] }]}>
          <View style={ecoSt.handle} />

          {/* Header */}
          <View style={ecoSt.headerRow}>
            <View style={ecoSt.headerIconWrap}>
              <MaterialCommunityIcons name="leaf" size={22} color={WARM_CORE.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ecoSt.title}>Environmental Impact</Text>
              <Text style={ecoSt.subtitle}>
                {distKm} km{isRoadDist ? ' road' : ' (est.)'} · {totalPeople} people sharing
              </Text>
            </View>
            <Pressable onPress={onClose} style={ecoSt.closeBtn}>
              <MaterialCommunityIcons name="close" size={16} color={WARM_CORE.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Savings % banner */}
            <View style={ecoSt.heroBanner}>
              <MaterialCommunityIcons name="trending-down" size={15} color={WARM_CORE.success} />
              <Text style={ecoSt.heroTxt}>
                <Text style={ecoSt.heroAccent}>{eco.savingsPct.toFixed(0)}% fewer emissions</Text>
                {'  '}vs {totalPeople} people each driving alone
              </Text>
            </View>

            {/* All 4 stats in one card */}
            <View style={ecoSt.statsBlock}>
              {/* CO2 */}
              <View style={ecoSt.statRow}>
                <View style={[ecoSt.statIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <MaterialCommunityIcons name="molecule-co2" size={17} color={WARM_CORE.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ecoSt.statLabel}>CO₂ Not Emitted</Text>
                  <Text style={ecoSt.statSub}>vs {totalPeople} people each driving solo</Text>
                </View>
                <Text style={[ecoSt.statValue, { color: WARM_CORE.success }]}>
                  {eco.co2SavedKg.toFixed(1)}<Text style={ecoSt.statUnit}> kg</Text>
                </Text>
              </View>

              <View style={ecoSt.rowDiv} />

              {/* Trees */}
              <View style={ecoSt.statRow}>
                <View style={[ecoSt.statIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <MaterialCommunityIcons name="tree" size={17} color={WARM_CORE.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ecoSt.statLabel}>Tree Equivalent</Text>
                  <Text style={ecoSt.statSub}>in annual CO₂ absorption</Text>
                </View>
                <Text style={[ecoSt.statValue, { color: WARM_CORE.success }]}>
                  {treeDisplay} <Text style={ecoSt.statUnit}>{treeLabel}</Text>
                </Text>
              </View>

              <View style={ecoSt.rowDiv} />

              {/* Cars off road */}
              <View style={ecoSt.statRow}>
                <View style={[ecoSt.statIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <MaterialCommunityIcons name="car-off" size={17} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ecoSt.statLabel}>
                    {eco.carsRemovedFromRoad === 1 ? 'Car' : 'Cars'} Off the Road
                  </Text>
                  <Text style={ecoSt.statSub}>{totalPeople} people in 1 vehicle</Text>
                </View>
                <Text style={[ecoSt.statValue, { color: '#3B82F6' }]}>{eco.carsRemovedFromRoad}</Text>
              </View>

              <View style={ecoSt.rowDiv} />

              {/* Fuel */}
              <View style={ecoSt.statRow}>
                <View style={[ecoSt.statIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                  <MaterialCommunityIcons name="gas-station-off" size={17} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ecoSt.statLabel}>Fuel Saved</Text>
                  <Text style={ecoSt.statSub}>
                    by {totalPeople} people travelling together{'\n'}
                    ≈ ₹{eco.fuelSavedRupees} saved · at ₹{FUEL_PRICE_PER_L}/L (est.)
                  </Text>
                </View>
                <Text style={[ecoSt.statValue, { color: '#F59E0B' }]}>
                  {eco.fuelSavedLiters.toFixed(1)}<Text style={ecoSt.statUnit}> L</Text>
                </Text>
              </View>
            </View>

            {/* Footer */}
            <View style={ecoSt.footerNote}>
              <MaterialCommunityIcons name="information-outline" size={12} color={WARM_CORE.textSecondary} />
              <Text style={ecoSt.footerTxt}>
                {isRoadDist ? 'Road distance via Google Maps. ' : 'Distance estimated. '}
                Assumes avg {AVG_MILEAGE_KM_L} km/L · {CO2_KG_PER_LITER} kg CO₂/L · ₹{FUEL_PRICE_PER_L}/L fuel.
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  movingCarMarker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movingCarInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: WARM_CORE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: WARM_CORE.white,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 2,
  },
  movingCarPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WARM_CORE.accent,
    zIndex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: WARM_CORE.text,
    marginTop: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WARM_CORE.background,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginTop: 24,
  },
  successSubtitle: {
    fontSize: 16,
    color: WARM_CORE.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },

  /* MAP */
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    flex: 1,
  },
  fakeMap: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
  },

  /* HEADER FLOATING */
  floatingHeader: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: WARM_CORE.text,
  },

  /* BOTTOM SHEET */
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "65%",
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: WARM_CORE.border,
    marginBottom: 20,
  },

  /* ROUTE */
  routeContainer: {
    marginBottom: 20,
  },
  routeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
    marginTop: 4,
    flexShrink: 0,
  },
  dropDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.textSecondary,
    borderWidth: 2,
    borderColor: WARM_CORE.textSecondary,
    marginTop: 4,
    flexShrink: 0,
  },
  dottedLine: {
    width: 2,
    height: 28,
    backgroundColor: WARM_CORE.border,
    marginLeft: 4,
    marginVertical: 5,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: WARM_CORE.primary,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  routeText: {
    fontSize: 15,
    fontWeight: "600",
    color: WARM_CORE.text,
    lineHeight: 20,
  },

  /* INFO CARDS */
  infoRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: WARM_CORE.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    color: WARM_CORE.text,
  },

  /* VEHICLE */
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: WARM_CORE.primary,
    marginBottom: 12,
  },
  vehicleCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.border,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontWeight: "700",
    color: WARM_CORE.primary,
  },
  driverName: {
    fontSize: 14,
    fontWeight: "700",
    color: WARM_CORE.text,
  },
  verified: {
    fontSize: 11,
    fontWeight: "700",
    color: WARM_CORE.success,
  },
  seatBadge: {
    backgroundColor: WARM_CORE.border,
    width: 36,
    height: 36,
    borderRadius: 18,
    lineHeight: 36,
    textAlign: "center",
    fontWeight: "700",
    color: WARM_CORE.primary,
    overflow: 'hidden',
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: WARM_CORE.textSecondary,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: WARM_CORE.primary,
  },
  ctaButton: {
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  ctaText: {
    fontWeight: "700",
    fontSize: 16,
  },
  markerPickup: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.background,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  markerPickupInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerDropoff: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
});

// Custom warm light styling for Google Maps
const warmMapStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#FFF8F0' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#FFF8F0' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E5650' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#F4E9D9' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E8DCCB' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#1E120D' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#D4E8FC' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E5650' }],
  },
];

// ── Eco Impact Modal Styles ──────────────────────────────────────────────────
const ecoSt = StyleSheet.create({
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },

  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 30,
  },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: WARM_CORE.border,
    alignSelf: 'center',
    marginTop: 14, marginBottom: 22,
  },

  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 16,
  },
  headerIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  title:    { fontSize: 17, fontWeight: '700', color: WARM_CORE.text, marginBottom: 2 },
  subtitle: { fontSize: 12, color: WARM_CORE.textSecondary, fontWeight: '500' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1, borderColor: WARM_CORE.border,
    justifyContent: 'center', alignItems: 'center',
  },

  heroBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 9,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 12,
  },
  heroTxt:    { fontSize: 13, color: WARM_CORE.textSecondary, flex: 1, lineHeight: 20 },
  heroAccent: { color: WARM_CORE.success, fontWeight: '800' },

  co2Card: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 18, paddingVertical: 18,
    marginBottom: 12,
  },
  co2Left:     { flexDirection: 'row', alignItems: 'center', gap: 13 },
  co2IconBox:  {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  co2EyeLabel: { fontSize: 10, fontWeight: '700', color: WARM_CORE.success, letterSpacing: 1, marginBottom: 4 },
  co2Sub:      { fontSize: 11, color: WARM_CORE.textSecondary, fontWeight: '500' },
  co2Value:    { fontSize: 38, fontWeight: '800', color: WARM_CORE.success, letterSpacing: -1.5 },
  co2Unit:     { fontSize: 16, fontWeight: '600', color: WARM_CORE.success, letterSpacing: 0 },

  statsBlock: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 18, borderWidth: 1, borderColor: WARM_CORE.border,
    overflow: 'hidden', marginBottom: 14,
  },
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 13, paddingHorizontal: 16, paddingVertical: 16,
  },
  statIconBox: {
    width: 36, height: 36, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  statLabel: { fontSize: 13, fontWeight: '600', color: WARM_CORE.text },
  statSub:   { fontSize: 11, color: WARM_CORE.textSecondary, marginTop: 3, lineHeight: 16 },
  statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, textAlign: 'right' },
  statUnit:  { fontSize: 12, fontWeight: '600', color: WARM_CORE.textSecondary, letterSpacing: 0 },
  rowDiv:    { height: 1, backgroundColor: WARM_CORE.border, marginHorizontal: 16 },

  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerTxt:  { fontSize: 10, color: WARM_CORE.textSecondary, flex: 1, lineHeight: 15 },
});
