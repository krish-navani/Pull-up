import LocationSearchInput from '@/components/LocationSearchInput';
import { useAppContext } from '@/context/AppContext';
import { Location } from '@/types';
import { WARM_CORE } from '@/constants/theme';
import { ATLAS_LOCATION, isWithinAtlasRadius, validateRideDirections } from '@/utils/atlasLocationUtils';
import { getCurrentLocation } from '@/utils/locationUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRoute } from '@/utils/routeUtils';
import { simplifyDouglasPeucker } from '@/utils/routeMatching';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Animation Hooks ---

/** Spring-based press scale for tactile tap feedback */
function usePressScale(toValue = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return { scale, onPressIn, onPressOut };
}

/** Fade + translateY entrance with configurable delay */
function useFadeSlideIn(delay = 0, fromY = 18) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 420, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0, delay, speed: 14, bounciness: 3, useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return { opacity, translateY };
}

/** Slow infinite pulse for ambient breathing effect */
function usePulse(min = 0.97, max = 1.0) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: max, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scale, { toValue: min, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return scale;
}

/** Shimmer opacity loop for skeleton/loading state */
function useShimmer() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return opacity;
}

/** Animated press wrapper replacing TouchableOpacity */
function PressableScale({
  children, onPress, style, disabled = false, scaleValue = 0.96
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  disabled?: boolean;
  scaleValue?: number;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(scaleValue);
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Lazy-load DateTimePicker to prevent crash if native module fails
let DateTimePicker: any = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch (e) {
  console.warn('[POST RIDE] DateTimePicker not available:', e);
}

// Error Boundary to prevent full app crash
class PostRideErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[POST RIDE] Error boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: WARM_CORE.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
          <MaterialCommunityIcons name="alert-circle-outline" size={64} color={WARM_CORE.error} />
          <Text style={{ color: WARM_CORE.text, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: WARM_CORE.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
            Please go back and try again
          </Text>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: WARM_CORE.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: WARM_CORE.white, fontSize: 15, fontWeight: '700' }}>Try Again</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// --- Premium Post Ride Button ---
function PostRideButton({ onPress, disabled, isLoading }: { onPress: () => void; disabled: boolean; isLoading: boolean }) {
  const scale = useRef(new Animated.Value(disabled ? 0.97 : 1)).current;
  const opacity = useRef(new Animated.Value(disabled ? 0.5 : 1)).current;
  const shimmer = useRef(new Animated.Value(-1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  // Enabled/disabled smooth transition
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: disabled ? 0.97 : 1, speed: 20, bounciness: 4, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: disabled ? 0.45 : 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [disabled]);

  // Shimmer sweep while loading
  useEffect(() => {
    if (isLoading) {
      shimmer.setValue(-1);
      Animated.loop(
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true })
      ).start();
    } else {
      shimmer.stopAnimation();
      shimmer.setValue(-1);
    }
  }, [isLoading]);

  const onPressIn = () => Animated.spring(pressScale, { toValue: 0.97, speed: 50, bounciness: 2, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1, speed: 40, bounciness: 5, useNativeDriver: true }).start();

  const shimmerTranslate = shimmer.interpolate({ inputRange: [-1, 1], outputRange: [-120, 320] });

  return (
    <Animated.View style={{ opacity, transform: [{ scale: Animated.multiply(scale, pressScale) }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || isLoading}
        activeOpacity={1}
        style={[styles.postButton, disabled && styles.postButtonDisabled]}
      >
        <View style={{ overflow: 'hidden', borderRadius: 14, ...styles.postButtonInner }}>
          {/* Shimmer sweep overlay while loading */}
          {isLoading && (
            <Animated.View
              style={{
                position: 'absolute', top: 0, bottom: 0, width: 80,
                transform: [{ translateX: shimmerTranslate }],
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 14,
              }}
            />
          )}
          {isLoading ? (
            <ActivityIndicator color={WARM_CORE.white} size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post Ride</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// --- Animated Success Screen ---
function SuccessScreen({ pickupCity, dropoffCity, pickupDetail, dropoffDetail, rideData, onViewRides, onPostAnother }: any) {
  const screenOpacity   = useRef(new Animated.Value(0)).current;
  // Outer halo rings (static, scale in sequentially)
  const ring1Scale      = useRef(new Animated.Value(0)).current;
  const ring2Scale      = useRef(new Animated.Value(0)).current;
  // Main circle
  const circleScale     = useRef(new Animated.Value(0)).current;
  const circleOpacity   = useRef(new Animated.Value(0)).current;
  // Check inside circle
  const checkOpacity    = useRef(new Animated.Value(0)).current;
  const checkScale      = useRef(new Animated.Value(0.4)).current;
  // Ripple rings (pulse outward once on entry)
  const ripple1Scale    = useRef(new Animated.Value(1)).current;
  const ripple1Opacity  = useRef(new Animated.Value(0)).current;
  const ripple2Scale    = useRef(new Animated.Value(1)).current;
  const ripple2Opacity  = useRef(new Animated.Value(0)).current;
  // Ambient breathe on circle after entry
  const circleBreath    = useRef(new Animated.Value(1)).current;
  // Content + buttons
  const contentOpacity  = useRef(new Animated.Value(0)).current;
  const contentY        = useRef(new Animated.Value(20)).current;
  const btn1Scale       = useRef(new Animated.Value(0.92)).current;
  const btn1Opacity     = useRef(new Animated.Value(0)).current;
  const btn2Opacity     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Helper: one ripple pulse — expand outward and fade
    const ripplePulse = (scale: Animated.Value, opacity: Animated.Value, toScale: number, duration: number) =>
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.5, duration: 60, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: duration - 60, useNativeDriver: true }),
        ]),
        Animated.timing(scale, { toValue: toScale, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]);

    const resetAndLoop = (scale: Animated.Value, opacity: Animated.Value, toScale: number, duration: number, delay: number) => {
      const runCycle = () => {
        scale.setValue(1);
        opacity.setValue(0);
        Animated.sequence([
          Animated.delay(delay),
          ripplePulse(scale, opacity, toScale, duration),
        ]).start(() => runCycle());
      };
      runCycle();
    };

    Animated.sequence([
      // 1. Screen in
      Animated.timing(screenOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),

      // 2. Outer halo rings scale in sequentially
      Animated.spring(ring1Scale, { toValue: 1, speed: 12, bounciness: 4, useNativeDriver: true }),
      Animated.spring(ring2Scale, { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: true }),

      // 3. Green circle springs in
      Animated.parallel([
        Animated.spring(circleScale,   { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: true }),
        Animated.timing(circleOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),

      // 4. Check appears
      Animated.parallel([
        Animated.spring(checkScale,   { toValue: 1, speed: 22, bounciness: 8, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),

      // 5. Content slides up
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(contentY,       { toValue: 0, speed: 16, bounciness: 3, useNativeDriver: true }),
      ]),

      // 6. Buttons appear
      Animated.parallel([
        Animated.spring(btn1Scale,   { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
        Animated.timing(btn1Opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(btn2Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // 7. Ripples loop forever with staggered offset (sonar style)
      resetAndLoop(ripple1Scale, ripple1Opacity, 1.75, 1400, 0);
      resetAndLoop(ripple2Scale, ripple2Opacity, 2.1,  1400, 700);

      // 8. Slow breath on circle
      Animated.loop(
        Animated.sequence([
          Animated.timing(circleBreath, { toValue: 1.05, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(circleBreath, { toValue: 1.0,  duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: screenOpacity }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.successContainer} showsVerticalScrollIndicator={false}>

        {/* Success Circle — with static halo rings + ripple */}
        <View style={styles.successAnimationWrapper}>
          {/* Static outer halo ring 1 (largest) */}
          <Animated.View style={[styles.successHalo1, { transform: [{ scale: ring1Scale }] }]} />
          {/* Static outer halo ring 2 */}
          <Animated.View style={[styles.successHalo2, { transform: [{ scale: ring2Scale }] }]} />
          {/* Ripple ring 2 (outermost, fades out) */}
          <Animated.View style={[styles.successRipple, {
            opacity: ripple2Opacity,
            transform: [{ scale: ripple2Scale }],
          }]} />
          {/* Ripple ring 1 */}
          <Animated.View style={[styles.successRipple, {
            opacity: ripple1Opacity,
            transform: [{ scale: ripple1Scale }],
          }]} />
          {/* Main green circle with check */}
          <Animated.View style={[styles.successCircleMain, {
            opacity: circleOpacity,
            transform: [{ scale: Animated.multiply(circleScale, circleBreath) }],
          }]}>
            <Animated.View style={{ opacity: checkOpacity, transform: [{ scale: checkScale }] }}>
              <MaterialCommunityIcons name="check" size={52} color={WARM_CORE.white} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* All content fades up together */}
        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentY }] }}>
          <Text style={styles.successMainTitle}>Ride Posted!</Text>
          <Text style={styles.successMainSubtitle}>Your ride is live and ready to receive bookings</Text>

          <View style={styles.routeCardWrapper}>
            <View style={styles.routeHeader}>
              <MaterialCommunityIcons name="map-marker-multiple" size={18} color={WARM_CORE.textSecondary} />
              <Text style={styles.routeHeaderText}>Your Route</Text>
            </View>
            <View style={styles.routeTimeline}>
              <View style={styles.routePoint}>
                <View style={styles.routePointCircle}>
                  <MaterialCommunityIcons name="map-marker" size={16} color={WARM_CORE.white} />
                </View>
                <View style={styles.routePointContent}>
                  <Text style={styles.routePointLabel}>Pickup</Text>
                  <Text style={styles.routePointAddress}>{pickupDetail}</Text>
                  <Text style={styles.routePointCity}>{pickupCity}</Text>
                </View>
              </View>
              <View style={styles.routePoint}>
                <View style={[styles.routePointCircle, { backgroundColor: WARM_CORE.card }]}>
                  <MaterialCommunityIcons name="map-marker-check" size={16} color={WARM_CORE.primary} />
                </View>
                <View style={styles.routePointContent}>
                  <Text style={styles.routePointLabel}>Dropoff</Text>
                  <Text style={styles.routePointAddress}>{dropoffDetail}</Text>
                  <Text style={styles.routePointCity}>{dropoffCity}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.rideDetailsGrid}>
            <View style={styles.detailBox}>
              <View style={styles.detailBoxIcon}>
                <MaterialCommunityIcons name="calendar-today" size={16} color={WARM_CORE.primary} />
              </View>
              <Text style={styles.detailBoxLabel}>Date</Text>
              <Text style={styles.detailBoxValue}>
                {rideData?.departureTime
                  ? new Date(rideData.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </Text>
            </View>
            <View style={styles.detailBox}>
              <View style={styles.detailBoxIcon}>
                <MaterialCommunityIcons name="seat" size={16} color={WARM_CORE.primary} />
              </View>
              <Text style={styles.detailBoxLabel}>Seats</Text>
              <Text style={styles.detailBoxValue}>{rideData?.availableSeats ?? '—'}</Text>
            </View>
            <View style={styles.detailBox}>
              <View style={styles.detailBoxIcon}>
                <MaterialCommunityIcons name="currency-inr" size={16} color={WARM_CORE.primary} />
              </View>
              <Text style={styles.detailBoxLabel}>Per Seat</Text>
              <Text style={styles.detailBoxValue}>₹{rideData?.price ?? '—'}</Text>
            </View>
          </View>

          <View style={styles.carInfoCard}>
            <MaterialCommunityIcons name="car" size={18} color={WARM_CORE.primary} />
            <View style={styles.carInfoContent}>
              <Text style={styles.carInfoLabel}>Vehicle</Text>
              <Text style={styles.carInfoValue}>{rideData?.carModel || '—'}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Buttons */}
        <Animated.View style={{ opacity: btn1Opacity, transform: [{ scale: btn1Scale }], gap: 12 }}>
          <PressableScale onPress={onViewRides} style={styles.primaryButton}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color={WARM_CORE.white} />
              <Text style={styles.primaryButtonText}>View My Rides</Text>
            </View>
          </PressableScale>

          <Animated.View style={{ opacity: btn2Opacity }}>
            <PressableScale onPress={onPostAnother} style={styles.secondaryButton}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <MaterialCommunityIcons name="plus" size={18} color={WARM_CORE.primary} />
                <Text style={styles.secondaryButtonText}>Post Another Ride</Text>
              </View>
            </PressableScale>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

function PostRideScreenInner() {
  const router = useRouter();
  const { createRide, auth } = useAppContext();
  const [postMode, setPostMode] = useState<'car' | 'taxi'>('car');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [postedRideData, setPostedRideData] = useState<any>(null);
  const [atlasLocation, setAtlasLocation] = useState<'pickup' | 'dropoff'>('pickup');
  const [isDetectingLocation, setIsDetectingLocation] = useState(true); // starts true - detecting on mount
  const [formData, setFormData] = useState({
    pickupLocation: null as Location | null,
    dropLocation: null as Location | null,
    departureDate: '',
    departureTime: '',
    price: '',
    availableSeats: 2,
    carModel: '',
    fuelType: 'Petrol' as 'Petrol' | 'Diesel' | 'EV',
    notes: '',
    detourRadiusMeters: null as number | null,
  });
  const [savedCars, setSavedCars] = useState<Array<{ id: string; model: string; fuelType: 'Petrol' | 'Diesel' | 'EV'; color?: string }>>([]);
  const [showSavedCarsDropdown, setShowSavedCarsDropdown] = useState(false);

  // Add New Vehicle Modal state
  const [showAddCarModal, setShowAddCarModal] = useState(false);
  const [newCarModel, setNewCarModel] = useState('');
  const [newCarColor, setNewCarColor] = useState('');
  const [newCarFuelType, setNewCarFuelType] = useState<'Petrol' | 'Diesel' | 'EV'>('Petrol');
  const [isSavingCar, setIsSavingCar] = useState(false);

  const [isRecurringWeekdays, setIsRecurringWeekdays] = useState(false);
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showSeatsDropdown, setShowSeatsDropdown] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const hasDetectedLocation = useRef(false);
  const isDetectingRef = useRef(false);

  // Handler to save new car to Firestore
  const handleAddNewCar = async () => {
    if (!newCarModel.trim()) {
      Alert.alert('Required', 'Please enter your car model name');
      return;
    }
    const currentUserId = auth.user?.id;
    if (!currentUserId) return;

    setIsSavingCar(true);
    try {
      const userRef = doc(db, 'users', currentUserId);
      const userSnap = await getDoc(userRef);
      let existingCars: Array<{ id: string; model: string; fuelType: 'Petrol' | 'Diesel' | 'EV'; color?: string }> = [];
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (Array.isArray(data.savedCars)) {
          existingCars = data.savedCars;
        }
      }

      const createdCar = {
        id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
        model: newCarModel.trim(),
        fuelType: newCarFuelType,
        color: newCarColor.trim() || undefined,
      };

      const updatedCars = [...existingCars, createdCar];
      await updateDoc(userRef, {
        savedCars: updatedCars,
        carModel: createdCar.model,
        fuelType: createdCar.fuelType,
      });

      setSavedCars(updatedCars);
      setFormData(prev => ({
        ...prev,
        carModel: createdCar.model,
        fuelType: createdCar.fuelType,
      }));

      setNewCarModel('');
      setNewCarColor('');
      setNewCarFuelType('Petrol');
      setShowAddCarModal(false);
      setShowSavedCarsDropdown(false);
    } catch (err) {
      console.error('[POST RIDE] Failed to save vehicle:', err);
      Alert.alert('Error', 'Failed to save vehicle. Please try again.');
    } finally {
      setIsSavingCar(false);
    }
  };

  // Load creator's saved vehicles from Firestore
  useEffect(() => {
    const currentUserId = auth.user?.id;
    if (!currentUserId) return;

    const loadUserCars = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUserId));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const cars: Array<{ id: string; model: string; fuelType: 'Petrol' | 'Diesel' | 'EV' }> = Array.isArray(userData.savedCars) ? userData.savedCars : [];
          setSavedCars(cars);

          // Populate initial car model and fuel type from saved cars or profile defaults
          setFormData((prev) => {
            if (prev.carModel) return prev;
            const primaryModel = cars[0]?.model || userData.carModel || '';
            const primaryFuel = cars[0]?.fuelType || userData.fuelType || 'Petrol';
            return {
              ...prev,
              carModel: primaryModel,
              fuelType: primaryFuel,
            };
          });
        }
      } catch (err) {
        console.warn('[POST RIDE] Failed to load saved vehicles:', err);
      }
    };

    loadUserCars();
  }, [auth.user?.id]);

  const [routeInfo, setRouteInfo] = useState<{
    points: any[];
    distance: string;
    duration: string;
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [priceSuggestion, setPriceSuggestion] = useState('₹80-₹120');

  const handleSwapRoute = () => {
    setFormData(prev => {
      const temp = prev.pickupLocation;
      return {
        ...prev,
        pickupLocation: prev.dropLocation,
        dropLocation: temp,
      };
    });
    setAtlasLocation(prev => prev === 'pickup' ? 'dropoff' : 'pickup');
    setError('');
  };

  useEffect(() => {
    if (!formData.pickupLocation || !formData.dropLocation) {
      setRouteInfo(null);
      return;
    }

    const loadRoutePreview = async () => {
      setLoadingRoute(true);
      try {
        const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyCdnyZ7HERA-Oc8OONAsuzIhATlcMweuFs';
        const result = await fetchRoute(
          formData.pickupLocation!,
          formData.dropLocation!,
          apiKey
        );

        if (result.success) {
          setRouteInfo({
            points: result.points,
            distance: result.distance || '0 km',
            duration: result.duration || '0 mins',
            distanceMeters: result.distanceMeters || 0,
            durationSeconds: result.durationSeconds || 0,
          });

          const distanceKm = (result.distanceMeters || 0) / 1000;
          if (distanceKm > 0) {
            const minSugg = Math.round(distanceKm * 8);
            const maxSugg = Math.round(distanceKm * 12);
            setPriceSuggestion(`₹${minSugg}-₹${maxSugg}`);
          }
        }
      } catch (err) {
        console.warn('[POST RIDE] Failed to fetch route preview:', err);
      } finally {
        setLoadingRoute(false);
      }
    };

    loadRoutePreview();
  }, [formData.pickupLocation, formData.dropLocation]);

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#0B1220" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#94A3B8" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#020617" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1E293B" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#334155" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#475569" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#020617" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0B1A2A" }] }
  ];

  // Default form state with Atlas as fallback
  const getDefaultFormData = useCallback((atlasAs: 'pickup' | 'dropoff') => {
    const atlasLoc: Location = {
      latitude: ATLAS_LOCATION.latitude,
      longitude: ATLAS_LOCATION.longitude,
      address: ATLAS_LOCATION.address,
      city: 'Mumbai',
    };
    return {
      pickupLocation: atlasAs === 'pickup' ? atlasLoc : null,
      dropLocation: atlasAs === 'dropoff' ? atlasLoc : null,
      departureDate: '',
      departureTime: '',
      price: '',
      availableSeats: 2,
      carModel: '',
      fuelType: 'Petrol' as 'Petrol' | 'Diesel' | 'EV',
      notes: '',
      detourRadiusMeters: null as number | null,
    };
  }, []);

  // Function to reset form and detect atlas location again
  // Uses a ref guard to prevent concurrent execution
  const resetFormAndDetectAtlas = useCallback(async (force?: boolean) => {
    // Prevent concurrent execution
    if (isDetectingRef.current) {
      console.log('[POST RIDE] Already detecting location, skipping');
      return;
    }
    isDetectingRef.current = true;
    setIsDetectingLocation(true);
    try {
      let currentLocation: { latitude: number; longitude: number } | null = null;
      try {
        currentLocation = await getCurrentLocation();
      } catch (locErr) {
        console.warn('[POST RIDE] getCurrentLocation threw:', locErr);
        // Don't rethrow - we have a fallback
      }

      if (currentLocation && 
          typeof currentLocation.latitude === 'number' && 
          typeof currentLocation.longitude === 'number' &&
          !isNaN(currentLocation.latitude) && 
          !isNaN(currentLocation.longitude)) {
        let withinAtlas = false;
        try {
          withinAtlas = isWithinAtlasRadius(currentLocation.latitude, currentLocation.longitude);
        } catch (e) {
          console.warn('[POST RIDE] isWithinAtlasRadius threw:', e);
        }

        if (withinAtlas) {
          setFormData(getDefaultFormData('pickup'));
          setAtlasLocation('pickup');
        } else {
          setFormData(getDefaultFormData('dropoff'));
          setAtlasLocation('dropoff');
        }
      } else {
        console.warn('[POST RIDE] Location unavailable, defaulting to Atlas dropoff');
        setFormData(getDefaultFormData('dropoff'));
        setAtlasLocation('dropoff');
      }
      setError('');
    } catch (err) {
      console.error('[POST RIDE] Error resetting form and detecting location:', err);
      setFormData(getDefaultFormData('dropoff'));
      setAtlasLocation('dropoff');
    } finally {
      isDetectingRef.current = false;
      setIsDetectingLocation(false);
      hasDetectedLocation.current = true;
    }
  }, [getDefaultFormData]);

  // Only use useFocusEffect for detection - removes the duplicate useEffect race condition
  useFocusEffect(
    useCallback(() => {
      resetFormAndDetectAtlas();
    }, [resetFormAndDetectAtlas])
  );

  // Handle Date Change - with Android dismiss event handling
  const handleDateChange = (event: any, selectedDate?: Date) => {
    try {
      // On Android, always dismiss the picker first
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      // Only update if user selected (not dismissed)
      if (event?.type !== 'dismissed' && selectedDate) {
        setPickerDate(selectedDate);
        const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        handleInputChange('departureDate', dateString);
      }
      // For iOS, dismiss after handling
      if (Platform.OS === 'ios') {
        setShowDatePicker(false);
      }
    } catch (e) {
      console.error('[POST RIDE] handleDateChange error:', e);
      setShowDatePicker(false);
    }
  };

  // Handle Time Change - with Android dismiss event handling
  const handleTimeChange = (event: any, selectedDate?: Date) => {
    try {
      // On Android, always dismiss the picker first
      if (Platform.OS === 'android') {
        setShowTimePicker(false);
      }
      // Only update if user selected (not dismissed)
      if (event?.type !== 'dismissed' && selectedDate) {
        const timeString = `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`;
        handleInputChange('departureTime', timeString);
      }
      // For iOS, dismiss after handling
      if (Platform.OS === 'ios') {
        setShowTimePicker(false);
      }
    } catch (e) {
      console.error('[POST RIDE] handleTimeChange error:', e);
      setShowTimePicker(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Select Date';
    try {
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return dateString;
    }
  };

  const formatTimeDisplay = (timeString: string, is24Hour: boolean) => {
    if (!timeString) return 'HH:MM';
    if (is24Hour) return timeString;
    
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${String(h).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  const getTimeRemaining = () => {
    if (!formData.departureDate || !formData.departureTime) return null;
    try {
      const departureDateStr = `${formData.departureDate}T${formData.departureTime}`;
      const departureTimeMs = new Date(departureDateStr).getTime();
      const nowMs = new Date().getTime();
      const diffMs = departureTimeMs - nowMs;
      
      if (diffMs <= 0) return 'Ride starts soon';
      
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours % 24} hr${diffHours % 24 !== 1 ? 's' : ''} till the ride`;
      }
      
      if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ${diffMins} min${diffMins !== 1 ? 's' : ''} till the ride`;
      }
      
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} till the ride`;
    } catch (e) {
      return null;
    }
  };

  const handleViewMyRides = () => {
    setShowSuccess(false);
    router.navigate('/(tabs)/my-bookings' as any);
  };

  const handleCreateRide = async () => {
    // Check if driver license is verified
    const isLicenseVerified = auth.user?.licenseVerified === true || auth.user?.licenseVerificationStatus === 'verified';
    if (!isLicenseVerified) {
      if (auth.user?.licenseVerificationStatus === 'pending') {
        setError('Your driving license is still under verification. You will be able to post rides once approved.');
      } else if (auth.user?.licenseVerificationStatus === 'rejected') {
        setError('Your license was not approved. Please re-upload your license.');
      } else {
        setError('You must upload and verify your driving license to offer seats.');
        Alert.alert(
          'License Verification Required',
          'You need to upload and verify your driving license to offer seats.',
          [
            { text: 'Upload License', onPress: () => router.push('/auth/license-upload') },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
      return;
    }

    if (!formData.pickupLocation) {
      setError('Please select pickup location');
      return;
    }
    if (!formData.dropLocation) {
      setError('Please select drop location');
      return;
    }

    // Validate ride directions - must be from home to Atlas or from Atlas anywhere
    const directionValidation = validateRideDirections(
      formData.pickupLocation.latitude,
      formData.pickupLocation.longitude,
      formData.dropLocation.latitude,
      formData.dropLocation.longitude
    );

    if (!directionValidation.isValid) {
      setError(directionValidation.message);
      return;
    }

    if (!formData.departureDate) {
      setError('Please select departure date');
      return;
    }
    if (!formData.departureTime) {
      setError('Please select departure time');
      return;
    }
    if (!formData.price || isNaN(parseFloat(formData.price))) {
      setError('Please enter a valid price');
      return;
    }
    if (!formData.carModel.trim()) {
      setError('Please enter your car model');
      return;
    }

    setIsLoading(true);
    try {
      const selectedDate = new Date(`${formData.departureDate}T${formData.departureTime}`);
      let weekdayDates: Date[] = [];

      if (isRecurringWeekdays) {
        const day = selectedDate.getDay();
        const diffToMonday = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(selectedDate);
        monday.setDate(diffToMonday);

        for (let i = 0; i < 5; i++) {
          const wDay = new Date(monday);
          wDay.setDate(monday.getDate() + i);
          const [hours, minutes] = formData.departureTime.split(':').map(Number);
          wDay.setHours(hours, minutes, 0, 0);

          if (wDay.getTime() > Date.now()) {
            weekdayDates.push(wDay);
          }
        }
      } else {
        weekdayDates.push(selectedDate);
      }

      if (weekdayDates.length === 0) {
        throw new Error('All scheduled weekday dates for this week are in the past.');
      }

      let lastRideData: any = null;
      const simplifiedCoords = routeInfo ? simplifyDouglasPeucker(routeInfo.points, 20) : [];
      
      for (const date of weekdayDates) {
        const rideData = {
          pickupLocation: formData.pickupLocation,
          dropLocation: formData.dropLocation,
          departureTime: date.toISOString(),
          price: parseFloat(formData.price),
          availableSeats: formData.availableSeats,
          totalSeats: formData.availableSeats,
          carModel: formData.carModel,
          fuelType: formData.fuelType,
          detourRadiusMeters: formData.detourRadiusMeters ?? 0,
          routePolyline: (routeInfo as any)?.polyline || '',
          simplifiedCoordinates: simplifiedCoords,
          baselineDistanceMeters: routeInfo?.distanceMeters || 0,
          baselineDurationSeconds: routeInfo?.durationSeconds || 0,
        };
        await createRide(rideData);
        lastRideData = rideData;
      }

      setPostedRideData(lastRideData);

      // Show success message
      setError('');
      setTimeout(() => {
        setShowSuccess(true);
      }, 800);
    } catch (error: any) {
      console.error('[POST RIDE] Error creating ride:', error);
      setError(error.message || 'Failed to create ride. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Always allow pressing the button - validation shows inline errors via handleCreateRide
  const isFormValid = true;

  // --- All hooks must be called unconditionally before any early return ---
  const headerAnim = useFadeSlideIn(0, 16);
  const section1Anim = useFadeSlideIn(80, 20);
  const section2Anim = useFadeSlideIn(160, 20);
  const section3Anim = useFadeSlideIn(240, 20);
  const section4Anim = useFadeSlideIn(320, 20);
  const shimmerOpacity = useShimmer();

  const errorAnim = useRef(new Animated.Value(0)).current;
  const errorY = useRef(new Animated.Value(-8)).current;
  useEffect(() => {
    if (error) {
      Animated.parallel([
        Animated.spring(errorAnim, { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
        Animated.spring(errorY, { toValue: 0, speed: 20, bounciness: 4, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(errorAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      errorY.setValue(-8);
    }
  }, [error]);

  // Success State Screen (early return AFTER all hooks)
  if (showSuccess) {
    const pickupCity = postedRideData?.pickupLocation?.address?.split(',').slice(-2).join(',').trim() || 'Pickup Location';
    const dropoffCity = postedRideData?.dropLocation?.address?.split(',').slice(-2).join(',').trim() || 'Dropoff Location';
    const pickupDetail = postedRideData?.pickupLocation?.address?.split(',')[0] || '';
    const dropoffDetail = postedRideData?.dropLocation?.address?.split(',')[0] || '';

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} translucent={true} />
        <SuccessScreen
          pickupCity={pickupCity}
          dropoffCity={dropoffCity}
          pickupDetail={pickupDetail}
          dropoffDetail={dropoffDetail}
          rideData={postedRideData}
          onViewRides={handleViewMyRides}
          onPostAnother={() => { setShowSuccess(false); resetFormAndDetectAtlas(); }}
        />
      </SafeAreaView>
    );
  }

  // Regular Form State
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} translucent={true} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.headerWrapper, { opacity: headerAnim.opacity, transform: [{ translateY: headerAnim.translateY }] }]}>
          <PressableScale onPress={() => router.back()} style={styles.backButton} scaleValue={0.92}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
            </View>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Post a Ride</Text>
            <Text style={styles.headerSubtitle}>Post in seconds, save instantly</Text>
          </View>
        </Animated.View>

        {/* Mode Switcher: Car Pool vs Taxi Pool */}
        <Animated.View style={[{ opacity: headerAnim.opacity, transform: [{ translateY: headerAnim.translateY }], paddingHorizontal: 16, marginBottom: 8 }]}>
          <View style={styles.modeSwitcherContainer}>
            <TouchableOpacity
              style={[styles.modeSwitcherTab, postMode === 'car' && styles.modeSwitcherTabActive]}
              onPress={() => setPostMode('car')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="car"
                size={16}
                color={postMode === 'car' ? WARM_CORE.white : WARM_CORE.textSecondary}
              />
              <Text style={[styles.modeSwitcherText, postMode === 'car' && styles.modeSwitcherTextActive]}>Car Pool</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeSwitcherTab, postMode === 'taxi' && styles.modeSwitcherTabTaxi]}
              onPress={() => {
                setPostMode('taxi');
                router.push('/create-taxi-pool' as any);
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="taxi"
                size={16}
                color={postMode === 'taxi' ? WARM_CORE.white : WARM_CORE.textSecondary}
              />
              <Text style={[styles.modeSwitcherText, postMode === 'taxi' && styles.modeSwitcherTextActive]}>Taxi Pool</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ROUTE SECTION */}
        <Animated.View style={[styles.section, { opacity: section1Anim.opacity, transform: [{ translateY: section1Anim.translateY }] }]}>
          <Text style={styles.sectionTitle}>ROUTE</Text>

          {isDetectingLocation && (
            <Animated.View style={[styles.locationDetectOverlay, { opacity: shimmerOpacity }]}>
              <ActivityIndicator size="small" color={WARM_CORE.primary} />
              <Text style={styles.locationDetectText}>Detecting your location...</Text>
            </Animated.View>
          )}

          <View pointerEvents={isDetectingLocation ? 'none' : 'auto'}
                style={isDetectingLocation ? { opacity: 0.4 } : undefined}>
            <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 48 }}>
                <LocationSearchInput
                  label="Pickup Location"
                  value={formData.pickupLocation?.address || ''}
                  location={formData.pickupLocation}
                  onChange={(location) => setFormData(prev => ({ ...prev, pickupLocation: location }))}
                  onAddressChange={() => setError('')}
                  placeholder="Select your starting point"
                  containerStyle={styles.locationInputContainer}
                  isAtlasLocation={atlasLocation === 'pickup'}
                  readOnly={atlasLocation === 'pickup'}
                />
                <LocationSearchInput
                  label="Drop Location"
                  value={formData.dropLocation?.address || ''}
                  location={formData.dropLocation}
                  onChange={(location) => setFormData(prev => ({ ...prev, dropLocation: location }))}
                  onAddressChange={() => setError('')}
                  placeholder="Select your destination"
                  containerStyle={styles.locationInputContainer}
                  isAtlasLocation={atlasLocation === 'dropoff'}
                  readOnly={atlasLocation === 'dropoff'}
                />
              </View>
              <TouchableOpacity
                onPress={handleSwapRoute}
                activeOpacity={0.85}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  marginTop: -25,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: WARM_CORE.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: WARM_CORE.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 4,
                  elevation: 6,
                  zIndex: 999,
                }}
              >
                <MaterialCommunityIcons name="swap-vertical" size={20} color={WARM_CORE.white} />
              </TouchableOpacity>
            </View>

            {/* ROUTE PREVIEW CARD */}
            {routeInfo && formData.pickupLocation && formData.dropLocation && (
              <View style={{
                marginTop: 12,
                backgroundColor: WARM_CORE.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: WARM_CORE.border,
                padding: 12,
                overflow: 'hidden'
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="map-marker-distance" size={18} color={WARM_CORE.primary} />
                    <Text style={{ color: WARM_CORE.text, fontSize: 13, fontWeight: '700' }}>
                      {routeInfo.distance}  ·  {routeInfo.duration}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: 'rgba(212, 80, 10, 0.15)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 8
                  }}>
                    <Text style={{ color: WARM_CORE.primary, fontSize: 11, fontWeight: '800' }}>Route Map</Text>
                  </View>
                </View>

                {/* Map Preview Wrapper */}
                <View style={{
                  height: 120,
                  borderRadius: 10,
                  overflow: 'hidden',
                  backgroundColor: '#1E1E1E'
                }}>
                  {loadingRoute ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={WARM_CORE.primary} />
                    </View>
                  ) : (
                    <MapView
                      style={{ width: '100%', height: '100%' }}
                      provider={PROVIDER_GOOGLE}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      customMapStyle={darkMapStyle}
                      initialRegion={{
                        latitude: (formData.pickupLocation.latitude + formData.dropLocation.latitude) / 2,
                        longitude: (formData.pickupLocation.longitude + formData.dropLocation.longitude) / 2,
                        latitudeDelta: Math.max(Math.abs(formData.pickupLocation.latitude - formData.dropLocation.latitude) * 1.5, 0.05),
                        longitudeDelta: Math.max(Math.abs(formData.pickupLocation.longitude - formData.dropLocation.longitude) * 1.5, 0.05),
                      }}
                    >
                      <Marker 
                        coordinate={formData.pickupLocation}
                        pinColor="#22C55E"
                      />
                      <Marker 
                        coordinate={formData.dropLocation}
                        pinColor="#EF4444"
                      />
                      <Polyline 
                        coordinates={routeInfo.points}
                        strokeWidth={3}
                        strokeColor={WARM_CORE.primary}
                      />
                    </MapView>
                  )}
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* DATE & TIME SECTION */}
        <Animated.View style={[styles.section, { opacity: section2Anim.opacity, transform: [{ translateY: section2Anim.translateY }] }]}>
          <Text style={styles.sectionTitle}>DATE & TIME</Text>

          <View style={styles.dateTimeRow}>
            <PressableScale onPress={() => setShowDatePicker(true)} style={{ flex: 1 }}>
              <View style={styles.dateTimeCard}>
                <View style={styles.dateTimeIcon}>
                  <MaterialCommunityIcons name="calendar" size={20} color={WARM_CORE.primary} />
                </View>
                <View style={styles.dateTimeContent}>
                  <Text style={styles.dateTimeLabel}>Date</Text>
                  <Text style={[styles.dateTimeValue, !formData.departureDate && styles.placeholderText]}>
                    {formData.departureDate ? formatDate(formData.departureDate) : 'Select date'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
              </View>
            </PressableScale>

            <PressableScale onPress={() => setShowTimePicker(true)} style={{ flex: 1 }}>
              <View style={styles.dateTimeCard}>
                <View style={styles.dateTimeIcon}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={WARM_CORE.primary} />
                </View>
                <View style={styles.dateTimeContent}>
                  <Text style={styles.dateTimeLabel}>Time</Text>
                  <Text style={[styles.dateTimeValue, !formData.departureTime && styles.placeholderText]}>
                    {formData.departureTime ? formatTimeDisplay(formData.departureTime, false) : 'HH:MM'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
              </View>
            </PressableScale>
          </View>

          {getTimeRemaining() && (
            <View style={styles.timeRemainingCard}>
              <MaterialCommunityIcons name="clock-fast" size={16} color={WARM_CORE.primary} />
              <Text style={styles.timeRemainingText}>{getTimeRemaining()}</Text>
            </View>
          )}

          {/* Recurring Weekday schedule */}
          <Pressable
            style={styles.recurringToggleContainer}
            onPress={() => setIsRecurringWeekdays(!isRecurringWeekdays)}
          >
            <View style={[styles.checkbox, isRecurringWeekdays && styles.checkboxChecked]}>
              {isRecurringWeekdays && <MaterialCommunityIcons name="check" size={14} color="#FFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              Repeat on Weekdays (Mon-Fri)
            </Text>
          </Pressable>

          {isRecurringWeekdays && (
            <View style={styles.recurringHintCard}>
              <MaterialCommunityIcons name="information-outline" size={16} color={WARM_CORE.primary} />
              <Text style={styles.recurringHintText}>
                Creates matching rides for Mon-Fri at this time. Only future days will be posted.
              </Text>
            </View>
          )}
        </Animated.View>

        {/* PRICING & SEATS SECTION */}
        <Animated.View style={[styles.section, { opacity: section3Anim.opacity, transform: [{ translateY: section3Anim.translateY }] }]}>
          <Text style={styles.sectionTitle}>PRICING & SEATS</Text>

          <View style={styles.priceCard}>
            <View style={styles.priceIcon}>
              <MaterialCommunityIcons name="currency-inr" size={20} color={WARM_CORE.success} />
            </View>
            <View style={styles.priceContent}>
              <Text style={styles.priceLabel}>Price per seat</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="100"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={formData.price}
                onChangeText={value => handleInputChange('price', value)}
                keyboardType="decimal-pad"
                editable={!isLoading}
              />
            </View>
            <View style={styles.priceSuggestion}>
              <Text style={styles.priceSuggestionText}>₹80-₹120</Text>
              <Text style={styles.priceSuggestionHint}>suggested</Text>
            </View>
          </View>

          <View style={styles.seatsDropdownContainer}>
            <View style={styles.seatsDropdownHeader}>
              <Text style={styles.seatsLabel}>Available seats</Text>
              <Text style={styles.seatsSubtitle}>Choose from 2-6 based on your vehicle capacity</Text>
            </View>
            <PressableScale onPress={() => setShowSeatsDropdown(!showSeatsDropdown)} scaleValue={0.98}>
              <View style={styles.seatsDropdownButton}>
                <View style={styles.seatsDropdownButtonContent}>
                  <MaterialCommunityIcons name="seat" size={20} color={WARM_CORE.primary} />
                  <Text style={styles.seatsDropdownButtonText}>{formData.availableSeats} seats</Text>
                </View>
                <MaterialCommunityIcons
                  name={showSeatsDropdown ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
            </PressableScale>
            {showSeatsDropdown && (
              <View style={styles.seatsDropdownMenu}>
                {[2, 3, 4, 5, 6].map((seatOption) => (
                  <PressableScale
                    key={seatOption}
                    onPress={() => { setFormData(prev => ({ ...prev, availableSeats: seatOption })); setShowSeatsDropdown(false); }}
                    scaleValue={0.97}
                  >
                    <View style={[styles.seatsDropdownItem, formData.availableSeats === seatOption && styles.seatsDropdownItemActive]}>
                      <Text style={[styles.seatsDropdownItemText, formData.availableSeats === seatOption && styles.seatsDropdownItemTextActive]}>
                        {seatOption} seats
                      </Text>
                      {formData.availableSeats === seatOption && (
                        <MaterialCommunityIcons name="check" size={18} color={WARM_CORE.success} />
                      )}
                    </View>
                  </PressableScale>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* CAR INFO SECTION */}
        <Animated.View style={[styles.section, { opacity: section4Anim.opacity, transform: [{ translateY: section4Anim.translateY }] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>YOUR VEHICLE</Text>
            <TouchableOpacity
              style={styles.addCarInlineBtn}
              onPress={() => setShowAddCarModal(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus-circle" size={16} color={WARM_CORE.primary} style={{ marginRight: 4 }} />
              <Text style={styles.addCarInlineBtnText}>+ Add New Car</Text>
            </TouchableOpacity>
          </View>

          {/* Vehicle Dropdown Card */}
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowSavedCarsDropdown(prev => !prev)}
              activeOpacity={0.85}
            >
              <View style={styles.dropdownButtonLeft}>
                <View style={[styles.carIconBox, formData.fuelType === 'EV' && { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <MaterialCommunityIcons
                    name={formData.fuelType === 'EV' ? 'lightning-bolt' : 'car'}
                    size={20}
                    color={formData.fuelType === 'EV' ? '#10B981' : WARM_CORE.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.carSelectedTitle} numberOfLines={1}>
                    {formData.carModel || 'No Car Selected'}
                  </Text>
                  <Text style={styles.carSelectedSub}>
                    {formData.carModel ? `Fuel: ${formData.fuelType}` : 'Tap to select or add a car'}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name={showSavedCarsDropdown ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={WARM_CORE.textSecondary}
              />
            </TouchableOpacity>

            {showSavedCarsDropdown && (
              <View style={styles.dropdownContainer}>
                {savedCars.length > 0 ? (
                  savedCars.map((car) => {
                    const isSelected = formData.carModel === car.model;
                    return (
                      <TouchableOpacity
                        key={car.id}
                        style={[styles.dropdownOption, isSelected && styles.dropdownOptionActive]}
                        onPress={() => {
                          setFormData(prev => ({
                            ...prev,
                            carModel: car.model,
                            fuelType: car.fuelType || 'Petrol',
                          }));
                          setShowSavedCarsDropdown(false);
                        }}
                      >
                        <MaterialCommunityIcons
                          name={car.fuelType === 'EV' ? 'lightning-bolt' : 'gas-station'}
                          size={18}
                          color={car.fuelType === 'EV' ? '#10B981' : WARM_CORE.primary}
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.dropdownOptionText, isSelected && { fontWeight: '700', color: WARM_CORE.primary }]}>
                            {car.model} {car.color ? `(${car.color})` : ''}
                          </Text>
                        </View>
                        <View style={[styles.fuelBadgeMini, car.fuelType === 'EV' && { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                          <Text style={[styles.fuelBadgeMiniText, car.fuelType === 'EV' && { color: '#10B981' }]}>
                            {car.fuelType}
                          </Text>
                        </View>
                        {isSelected && (
                          <MaterialCommunityIcons name="check-circle" size={18} color={WARM_CORE.primary} style={{ marginLeft: 8 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: WARM_CORE.textSecondary, fontSize: 13 }}>No saved vehicles found.</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.dropdownOption, styles.addNewCarOption]}
                  onPress={() => {
                    setShowSavedCarsDropdown(false);
                    setShowAddCarModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="plus-circle" size={18} color={WARM_CORE.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.addNewCarOptionText}>+ Add a New Car</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Quick Fuel Type Adjuster */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.seatsLabel}>Fuel Type</Text>
            <View style={styles.fuelChipsRow}>
              {[
                { label: 'Petrol', icon: 'gas-station', value: 'Petrol' as const },
                { label: 'Diesel', icon: 'oil', value: 'Diesel' as const },
                { label: 'EV (Electric)', icon: 'lightning-bolt', value: 'EV' as const }
              ].map((fuel) => {
                const isSelected = formData.fuelType === fuel.value;
                return (
                  <TouchableOpacity
                    key={fuel.value}
                    style={[
                      styles.fuelChip,
                      isSelected && styles.fuelChipActive,
                      isSelected && fuel.value === 'EV' && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, fuelType: fuel.value }))}
                  >
                    <MaterialCommunityIcons
                      name={fuel.icon as any}
                      size={16}
                      color={isSelected ? (fuel.value === 'EV' ? '#10B981' : WARM_CORE.primary) : WARM_CORE.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[
                      styles.fuelChipText,
                      isSelected && styles.fuelChipTextActive,
                      isSelected && fuel.value === 'EV' && { color: '#10B981' }
                    ]}>
                      {fuel.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes Card */}
          <View style={[styles.optionalCard, styles.notesCard]}>
            <View style={styles.optionalIcon}>
              <MaterialCommunityIcons name="note-text" size={18} color={WARM_CORE.textSecondary} />
            </View>
            <TextInput
              style={styles.notesInput}
              placeholder="Add a note (music, no eating, pet-friendly...)"
              placeholderTextColor={WARM_CORE.textSecondary}
              value={formData.notes}
              onChangeText={value => handleInputChange('notes', value)}
              multiline
              maxLength={100}
              editable={!isLoading}
            />
          </View>

          {/* Detour Preferences chip selector */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.seatsLabel}>Detour Preference</Text>
            <Text style={styles.seatsSubtitle}>Max off-route distance you are willing to pick up passengers</Text>
            <View style={styles.detourChipsRow}>
              {[
                { label: 'No Detour', value: 0 },
                { label: '2 km', value: 2000 },
                { label: '5 km', value: 5000 },
                { label: '10 km', value: 10000 }
              ].map((opt) => {
                const isSelected = formData.detourRadiusMeters === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.detourChip, isSelected && styles.detourChipActive]}
                    onPress={() => setFormData(prev => ({ ...prev, detourRadiusMeters: opt.value }))}
                  >
                    <Text style={[styles.detourChipText, isSelected && styles.detourChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* Error Alert */}
        {error ? (
          <Animated.View style={[styles.errorBanner, { opacity: errorAnim, transform: [{ translateY: errorY }] }]}>
            <MaterialCommunityIcons name="alert-circle" size={18} color="#E11D48" />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        ) : null}

        {/* Post Ride Button */}
        <PostRideButton
          onPress={handleCreateRide}
          disabled={!isFormValid}
          isLoading={isLoading}
        />
      </ScrollView>

      {/* ADD NEW VEHICLE MODAL */}
      <Modal
        visible={showAddCarModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddCarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Vehicle</Text>
              <TouchableOpacity onPress={() => setShowAddCarModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={WARM_CORE.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView bounces={false} style={{ maxHeight: 380 }}>
              <Text style={styles.inputLabel}>Car Model</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Tata Nexon, Honda City"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={newCarModel}
                onChangeText={setNewCarModel}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Color (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Silver, Black"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={newCarColor}
                onChangeText={setNewCarColor}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Fuel Type</Text>
              <View style={styles.fuelChipsRow}>
                {[
                  { label: 'Petrol', icon: 'gas-station', value: 'Petrol' as const },
                  { label: 'Diesel', icon: 'oil', value: 'Diesel' as const },
                  { label: 'EV', icon: 'lightning-bolt', value: 'EV' as const }
                ].map((fuel) => {
                  const isSelected = newCarFuelType === fuel.value;
                  return (
                    <TouchableOpacity
                      key={fuel.value}
                      style={[
                        styles.fuelChip,
                        isSelected && styles.fuelChipActive,
                        isSelected && fuel.value === 'EV' && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }
                      ]}
                      onPress={() => setNewCarFuelType(fuel.value)}
                    >
                      <MaterialCommunityIcons
                        name={fuel.icon as any}
                        size={16}
                        color={isSelected ? (fuel.value === 'EV' ? '#10B981' : WARM_CORE.primary) : WARM_CORE.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[
                        styles.fuelChipText,
                        isSelected && styles.fuelChipTextActive,
                        isSelected && fuel.value === 'EV' && { color: '#10B981' }
                      ]}>
                        {fuel.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveCarButton, isSavingCar && { opacity: 0.7 }]}
              onPress={handleAddNewCar}
              disabled={isSavingCar}
              activeOpacity={0.85}
            >
              {isSavingCar ? (
                <ActivityIndicator color={WARM_CORE.white} size="small" />
              ) : (
                <Text style={styles.saveCarButtonText}>Save & Select Vehicle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showDatePicker && DateTimePicker != null && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
          maximumDate={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}
        />
      )}

      {showTimePicker && DateTimePicker != null && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
    </SafeAreaView>
  );
}

// Export wrapped in error boundary
export default function PostRideScreen() {
  return (
    <PostRideErrorBoundary>
      <PostRideScreenInner />
    </PostRideErrorBoundary>
  );
}

const styles = StyleSheet.create({
  /* CONTAINERS */
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  /* HEADER */
  headerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },

  /* MODE SWITCHER */
  modeSwitcherContainer: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  modeSwitcherTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeSwitcherTabActive: {
    backgroundColor: WARM_CORE.primary,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  modeSwitcherTabTaxi: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  modeSwitcherText: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  modeSwitcherTextActive: {
    color: WARM_CORE.white,
  },

  /* SECTIONS */
  section: {
    marginBottom: 28,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  /* LOCATION INPUT */
  locationInputContainer: {
    marginBottom: 12,
  },
  locationDetectOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  locationDetectText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  },

  /* DATE & TIME */
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateTimeCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateTimeIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateTimeContent: {
    flex: 1,
  },
  dateTimeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  placeholderText: {
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  },

  /* TIME OPTIONS */
  timeFormatContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  timeFormatLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  timeRemainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  timeRemainingText: {
    fontSize: 12,
    color: WARM_CORE.primary,
    fontWeight: '600',
    flex: 1,
  },

  /* PRO TIP */
  proTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  proTipText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    flex: 1,
  },

  /* PRICING SECTION */
  priceCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  priceIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceContent: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 3,
  },
  priceInput: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
    padding: 0,
  },
  priceSuggestion: {
    alignItems: 'center',
  },
  priceSuggestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.success,
  },
  priceSuggestionHint: {
    fontSize: 9,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  },

  /* SEATS DROPDOWN */
  seatsDropdownContainer: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  seatsDropdownHeader: {
    marginBottom: 12,
  },
  seatsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 2,
  },
  seatsSubtitle: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  },
  seatsDropdownButton: {
    backgroundColor: WARM_CORE.background,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seatsDropdownButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  seatsDropdownButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  seatsDropdownMenu: {
    backgroundColor: WARM_CORE.background,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  seatsDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  seatsDropdownItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  seatsDropdownItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.text,
  },
  seatsDropdownItemTextActive: {
    color: WARM_CORE.success,
    fontWeight: '600',
  },

  /* EARNINGS SUMMARY */
  earningsSummary: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  earningsSummaryLabel: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  earningsSummaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: WARM_CORE.success,
  },
  earningsEmoji: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: WARM_CORE.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningsEmojiText: {
    fontSize: 16,
  },

  /* OPTIONAL CARDS */
  optionalCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  optionalIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionalInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.text,
    padding: 0,
  },
  notesCard: {
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  notesInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.text,
    padding: 0,
    maxHeight: 80,
  },

  /* ERROR ALERT */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#E11D48',
    flex: 1,
  },

  /* BUTTONS */
  postButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
    overflow: 'hidden',
  },
  postButtonInner: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  postButtonDisabled: {
    backgroundColor: WARM_CORE.card,
    shadowOpacity: 0,
    elevation: 0,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.4,
  },

  /* SUCCESS STATE */
  successContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  /* Success Animation — Ola/Uber style with halo rings */
  successAnimationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 16,
    height: 180,
  },
  successCircleMain: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: WARM_CORE.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: WARM_CORE.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
    position: 'absolute',
  },
  /* Static ambient halo rings — always visible, soft green tint */
  successHalo1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.14)',
  },
  successHalo2: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  /* Ripple rings — animated outward, fade to transparent */
  successRipple: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: WARM_CORE.success,
  },

  /* Success Titles */
  successMainTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  successMainSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },

  /* Route Card */
  routeCardWrapper: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  routeHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeTimeline: {
    gap: 4,
  },
  routePoint: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  routePointCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  routePointContent: {
    flex: 1,
    justifyContent: 'center',
  },
  routePointLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  routePointAddress: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
    marginBottom: 2,
  },
  routePointCity: {
    fontSize: 11,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },
  routeConnector: {
    alignItems: 'center',
    paddingVertical: 4,
    marginVertical: 2,
  },
  connectorLine: {
    width: 2,
    height: 20,
    backgroundColor: WARM_CORE.border,
    marginBottom: 4,
  },
  connectorTime: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.text,
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },

  /* Ride Details Grid */
  rideDetailsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  detailBox: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  detailBoxIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailBoxValue: {
    fontSize: 17,
    fontWeight: '800',
    color: WARM_CORE.text,
    letterSpacing: -0.3,
  },

  /* Earnings Card - Premium */
  earningsCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  earningsContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  earningsValue: {
    fontSize: 28,
    fontWeight: '900',
    color: WARM_CORE.success,
    marginBottom: 3,
    letterSpacing: -0.5,
  },
  earningsSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },
  earningsIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningsIconText: {
    fontSize: 28,
  },

  /* Car Info Card */
  carInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 24,
  },
  carInfoContent: {
    flex: 1,
  },
  carInfoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  carInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  },

  /* Action Buttons */
  primaryButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: WARM_CORE.card,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
    letterSpacing: 0.3,
  },

  /* Info Box */
  infoBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    flex: 1,
    lineHeight: 16,
  },

  /* FORM PROGRESS INDICATOR */
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
    marginTop: -8,
  },
  progressDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: WARM_CORE.border,
  },
  progressDotDone: {
    backgroundColor: WARM_CORE.success,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginLeft: 6,
  },

  /* LIVE EARNINGS PREVIEW */
  earningsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  earningsPreviewLeft: {
    gap: 2,
  },
  earningsPreviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  earningsPreviewValue: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.success,
    letterSpacing: -0.5,
  },
  earningsPreviewRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earningsPreviewHint: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  detourChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  detourChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
  },
  detourChipActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
  },
  detourChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  detourChipTextActive: {
    color: WARM_CORE.white,
    fontWeight: '700',
  },
  recurringToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: WARM_CORE.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.card,
  },
  checkboxChecked: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  recurringHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.06)',
    borderColor: 'rgba(212, 80, 10, 0.15)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  recurringHintText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    lineHeight: 15,
  },

  /* DROPDOWN & FUEL SELECTION STYLES */
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  dropdownContainer: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    marginTop: 6,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownOptionText: {
    flex: 1,
    fontSize: 14,
    color: WARM_CORE.text,
  },
  fuelBadgeMini: {
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fuelBadgeMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  fuelChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  fuelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.card,
  },
  fuelChipActive: {
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    borderColor: WARM_CORE.primary,
  },
  addCarInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  addCarInlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  dropdownButtonLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  carIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carSelectedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  carSelectedSub: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 1,
  },
  dropdownOptionActive: {
    backgroundColor: 'rgba(212, 80, 10, 0.05)',
  },
  addNewCarOption: {
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    backgroundColor: 'rgba(212, 80, 10, 0.04)',
  },
  addNewCarOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: WARM_CORE.background,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: WARM_CORE.text,
  },
  saveCarButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveCarButtonText: {
    color: WARM_CORE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  fuelChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  fuelChipTextActive: {
    color: WARM_CORE.primary,
  },
});

