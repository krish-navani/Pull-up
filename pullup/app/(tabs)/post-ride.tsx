import LocationSearchInput from '@/components/LocationSearchInput';
import { useAppContext } from '@/context/AppContext';
import { Location } from '@/types';
import { WARM_CORE } from '@/constants/theme';
import { ATLAS_LOCATION, isWithinAtlasRadius, validateRideDirections } from '@/utils/atlasLocationUtils';
import { getCurrentLocation } from '@/utils/locationUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
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
    notes: '',
  });
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showSeatsDropdown, setShowSeatsDropdown] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const hasDetectedLocation = useRef(false);
  const isDetectingRef = useRef(false);

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
      notes: '',
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
    if (auth.user?.licenseVerificationStatus && auth.user.licenseVerificationStatus !== 'verified') {
      if (auth.user.licenseVerificationStatus === 'pending') {
        setError('Your driving license is still under verification. You will be able to post rides once approved.');
      } else if (auth.user.licenseVerificationStatus === 'rejected') {
        setError('Your license was not approved. Please contact support for more information.');
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
      const departureDateTime = new Date(`${formData.departureDate}T${formData.departureTime}`);
      const rideData = {
        pickupLocation: formData.pickupLocation,
        dropLocation: formData.dropLocation,
        departureTime: departureDateTime.toISOString(),
        price: parseFloat(formData.price),
        availableSeats: formData.availableSeats,
        totalSeats: formData.availableSeats,
        carModel: formData.carModel,
      };
      
      // Await the async createRide function
      await createRide(rideData);
      setPostedRideData(rideData);

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
            <LocationSearchInput
              label="Pickup Location"
              value={formData.pickupLocation?.address || ''}
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
              onChange={(location) => setFormData(prev => ({ ...prev, dropLocation: location }))}
              onAddressChange={() => setError('')}
              placeholder="Select your destination"
              containerStyle={styles.locationInputContainer}
              isAtlasLocation={atlasLocation === 'dropoff'}
              readOnly={atlasLocation === 'dropoff'}
            />
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
          <Text style={styles.sectionTitle}>CAR INFO</Text>

          <View style={styles.optionalCard}>
            <View style={styles.optionalIcon}>
              <MaterialCommunityIcons name="car" size={18} color={WARM_CORE.textSecondary} />
            </View>
            <TextInput
              style={styles.optionalInput}
              placeholder="Car model (e.g., Toyota Camry)"
              placeholderTextColor={WARM_CORE.textSecondary}
              value={formData.carModel}
              onChangeText={value => handleInputChange('carModel', value)}
              editable={!isLoading}
            />
          </View>

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
});

