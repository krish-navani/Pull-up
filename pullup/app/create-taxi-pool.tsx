import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { createTaxiPool } from '@/utils/taxiPoolService';
import LocationSearchInput from '@/components/LocationSearchInput';
import { Location } from '@/types';
import { fetchRoute } from '@/utils/routeUtils';
import apiClient from '@/utils/backendApiClient';

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ATLAS_LOCATION } from '@/utils/atlasLocationUtils';

// Lazy-load DateTimePicker to prevent crash if native module fails (e.g. on web)
let DateTimePicker: any = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch (e) {
  console.warn('[CREATE TAXI POOL] DateTimePicker not available:', e);
}

// ---------------------------------------------------------------------------
// Custom Pressable component with animated spring scaling
// ---------------------------------------------------------------------------
function PressableScale({ children, onPress, style, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const inVal = () => !disabled && Animated.spring(scale, { toValue: 0.96, speed: 50, bounciness: 3, useNativeDriver: true }).start();
  const outVal = () => !disabled && Animated.spring(scale, { toValue: 1, speed: 40, bounciness: 5, useNativeDriver: true }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={inVal}
        onPressOut={outVal}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function CreateTaxiPoolScreen() {
  const router = useRouter();
  const { auth } = useAppContext();
  
  const [pickup, setPickup] = useState<Location | null>({
    latitude: ATLAS_LOCATION.latitude,
    longitude: ATLAS_LOCATION.longitude,
    address: ATLAS_LOCATION.address,
    city: 'Mumbai',
  });
  const [destination, setDestination] = useState<Location | null>(null);
  const [atlasLocation, setAtlasLocation] = useState<'pickup' | 'dropoff'>('pickup');
  const [departureDate, setDepartureDate] = useState<string>('');
  const [departureTime, setDepartureTime] = useState<string>('');
  const [maxMembers, setMaxMembers] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [routeInfo, setRouteInfo] = useState<{
    points: any[];
    distance: string;
    duration: string;
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [taxiFareQuote, setTaxiFareQuote] = useState<any>(null);

  const handleSwapRoute = () => {
    const temp = pickup;
    setPickup(destination);
    setDestination(temp);
    setAtlasLocation(prev => prev === 'pickup' ? 'dropoff' : 'pickup');
    setError('');
  };

  useEffect(() => {
    if (!pickup || !destination) {
      setRouteInfo(null);
      return;
    }

    const loadRoutePreview = async () => {
      setLoadingRoute(true);
      try {
        const result = await fetchRoute(pickup, destination);

        if (result.success) {
          setRouteInfo({
            points: result.points,
            distance: result.distance || '0 km',
            duration: result.duration || '0 mins',
            distanceMeters: result.distanceMeters || 0,
            durationSeconds: result.durationSeconds || 0,
          });

          const quoteResponse = await apiClient.post('/fare/taxi-pool-quote', {
            pickupLocation: pickup,
            destination,
            maxMembers,
          });
          setTaxiFareQuote(quoteResponse.data);
        }
      } catch (err) {
        console.warn('[CREATE TAXI] Failed to fetch route preview:', err);
      } finally {
        setLoadingRoute(false);
      }
    };

    loadRoutePreview();
  }, [pickup, destination, maxMembers]);

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

  // ── Entrance animations ──────────────────────────────────────────────────
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlideY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(formSlideY, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      })
    ]).start();
  }, [auth.user]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dispHours = h % 12 || 12;
    return `${dispHours}:${minutes} ${ampm}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setDepartureDate(`${year}-${month}-${day}`);
      setError('');
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS !== 'ios') setShowTimePicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setDepartureTime(`${hours}:${minutes}`);
      setError('');
    }
  };

  const handleCreate = async () => {
    if (!auth.user) return;
    
    // Form Validations
    if (!pickup) {
      setError('Please select pickup location');
      return;
    }
    if (!destination) {
      setError('Please select a destination');
      return;
    }
    if (!taxiFareQuote?.pricing) {
      setError('Wait for the road fare estimate before creating the pool');
      return;
    }
    if (!departureDate) {
      setError('Please select departure date');
      return;
    }
    if (!departureTime) {
      setError('Please select departure time');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const departureDateTime = `${departureDate}T${departureTime}:00`;
      
      const poolId = await createTaxiPool({
        creatorId: auth.user.id,
        creatorName: auth.user.fullName,
        creatorImage: auth.user.profileImage || null,
        creatorCourse: auth.user.course || 'BBA',
        creatorDivision: auth.user.division || 'A',
        pickupLocation: {
          address: pickup.address,
          latitude: pickup.latitude,
          longitude: pickup.longitude
        },
        destination: {
          address: destination.address,
          latitude: destination.latitude,
          longitude: destination.longitude
        },
        departureTime: departureDateTime,
        maxMembers,
        notes: notes.trim() || null,
      } as any);

      Alert.alert(
        'Success',
        'Taxi Pool created successfully! It is now visible to all university commuters.',
        [
          {
            text: 'View Details',
            onPress: () => router.replace({ pathname: '/taxi-pool-details', params: { poolId } } as any)
          },
          {
            text: 'Go to Home',
            onPress: () => router.replace('/(tabs)/home' as any)
          }
        ]
      );
    } catch (err: any) {
      console.error('[CREATE TAXI] Failed to post pool:', err);
      setError(err.message || 'Failed to create taxi pool. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color={WARM_CORE.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Taxi Pool</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={WARM_CORE.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formSlideY }] }}>
            
            {/* ROUTE SECTION */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ROUTE</Text>
              
              <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 48 }}>
                  <LocationSearchInput
                    label="Pickup Location"
                    value={pickup?.address || ''}
                    location={pickup}
                    onChange={(location) => {
                      setPickup(location);
                      setError('');
                    }}
                    onAddressChange={() => setError('')}
                    placeholder="Search pickup locality or point"
                    containerStyle={styles.inputContainer}
                    isAtlasLocation={atlasLocation === 'pickup'}
                    readOnly={atlasLocation === 'pickup'}
                  />
                  <LocationSearchInput
                    label="Destination"
                    value={destination?.address || ''}
                    location={destination}
                    onChange={(location) => {
                      setDestination(location);
                      setError('');
                    }}
                    onAddressChange={() => setError('')}
                    placeholder="Search destination locality or point"
                    containerStyle={styles.inputContainer}
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
              {routeInfo && pickup && destination && (
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
                          latitude: (pickup.latitude + destination.latitude) / 2,
                          longitude: (pickup.longitude + destination.longitude) / 2,
                          latitudeDelta: Math.max(Math.abs(pickup.latitude - destination.latitude) * 1.5, 0.05),
                          longitudeDelta: Math.max(Math.abs(pickup.longitude - destination.longitude) * 1.5, 0.05),
                        }}
                      >
                        <Marker 
                          coordinate={pickup}
                          pinColor="#22C55E"
                        />
                        <Marker 
                          coordinate={destination}
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

            {/* DATE & TIME */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DEPARTURE TIME</Text>
              <View style={styles.row}>
                
                {/* Date Picker Button */}
                <PressableScale onPress={() => Platform.OS !== 'web' && setShowDatePicker(true)} style={{ flex: 1 }}>
                  <View style={styles.cardSelect}>
                    {Platform.OS === 'web' && React.createElement('input', {
                      type: 'date',
                      value: departureDate,
                      min: new Date().toISOString().split('T')[0],
                      onChange: (e: any) => { setDepartureDate(e.target.value); setError(''); },
                      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }
                    })}
                    <View style={styles.cardSelectIcon}>
                      <MaterialCommunityIcons name="calendar" size={20} color={WARM_CORE.primary} />
                    </View>
                    <View style={styles.cardSelectContent}>
                      <Text style={styles.cardSelectLabel}>Date</Text>
                      <Text style={[styles.cardSelectValue, !departureDate && styles.placeholder]}>
                        {departureDate ? formatDate(departureDate) : 'Select Date'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableScale>

                {/* Time Picker Button */}
                <PressableScale onPress={() => Platform.OS !== 'web' && setShowTimePicker(true)} style={{ flex: 1 }}>
                  <View style={styles.cardSelect}>
                    {Platform.OS === 'web' && React.createElement('input', {
                      type: 'time',
                      value: departureTime,
                      onChange: (e: any) => { setDepartureTime(e.target.value); setError(''); },
                      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }
                    })}
                    <View style={styles.cardSelectIcon}>
                      <MaterialCommunityIcons name="clock-outline" size={20} color={WARM_CORE.primary} />
                    </View>
                    <View style={styles.cardSelectContent}>
                      <Text style={styles.cardSelectLabel}>Time</Text>
                      <Text style={[styles.cardSelectValue, !departureTime && styles.placeholder]}>
                        {departureTime ? formatTime(departureTime) : 'HH:MM'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableScale>
              </View>
            </View>

            {/* CAPACITY SELECTOR */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MAXIMUM CAPACITY</Text>
              <Text style={styles.sectionSubtitle}>How many passengers can share this taxi? (Total including you)</Text>
              <View style={styles.capacityRow}>
                {[2, 3, 4, 5, 6].map(num => {
                  const isActive = maxMembers === num;
                  return (
                    <TouchableOpacity
                      key={num}
                      style={[styles.capacityButton, isActive && styles.capacityButtonActive]}
                      onPress={() => setMaxMembers(num)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.capacityText, isActive && styles.capacityTextActive]}>
                        {num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {auth.user?.homeFareEstimate ? (
              <View style={{ marginBottom: 16, padding: 14, borderRadius: 8, backgroundColor: 'rgba(212,80,10,0.06)', borderWidth: 1, borderColor: 'rgba(212,80,10,0.18)' }}>
                <Text style={{ color: WARM_CORE.text, fontSize: 14, fontWeight: '700' }}>Home planning estimate: ₹{auth.user.homeFareEstimate.taxiPoolPerMemberRupees} per member</Text>
                <Text style={{ color: WARM_CORE.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }}>Based on your approximate home-to-Atlas distance. This is not a guaranteed fare; the live route quote below is authoritative.</Text>
              </View>
            ) : null}
            {/* AUTHORITATIVE FARE ESTIMATE */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ESTIMATED SHARED TAXI FARE</Text>
              <Text style={styles.sectionSubtitle}>Calculated from the Google road route and locked when a rider requests to join.</Text>
              {taxiFareQuote?.pricing ? (
                <View style={styles.fareCard}>
                  <View style={styles.fareMetricsRow}>
                    <View style={styles.fareMetric}>
                      <MaterialCommunityIcons name="map-marker-distance" size={20} color={WARM_CORE.primary} />
                      <View>
                        <Text style={styles.fareMetricLabel}>Road distance</Text>
                        <Text style={styles.fareMetricValue}>{(taxiFareQuote.pricing.distanceMeters / 1000).toFixed(2)} km</Text>
                      </View>
                    </View>
                    <View style={styles.fareMetric}>
                      <MaterialCommunityIcons name="clock-outline" size={20} color={WARM_CORE.primary} />
                      <View>
                        <Text style={styles.fareMetricLabel}>Est. duration</Text>
                        <Text style={styles.fareMetricValue}>{Math.ceil(taxiFareQuote.pricing.durationSeconds / 60)} min</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.fareDivider} />
                  <View style={styles.fareAmountRow}>
                    <View>
                      <Text style={styles.fareAmountLabel}>Vehicle estimate</Text>
                      <Text style={styles.fareVehicleAmount}>₹{taxiFareQuote.totalVehicleFare}</Text>
                    </View>
                    <View style={styles.fareShareBlock}>
                      <Text style={styles.fareShareLabel}>Your estimated share</Text>
                      <Text style={styles.fareShareAmount}>₹{taxiFareQuote.perMemberFare}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.fareLoadingCard}>
                  <ActivityIndicator color={WARM_CORE.primary} />
                  <Text style={styles.fareLoadingText}>Calculating road fare...</Text>
                </View>
              )}
            </View>

            {/* NOTES */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>POOL NOTES (OPTIONAL)</Text>
              <View style={styles.notesContainer}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g. Meet near the main entrance gates, sharing Uber XL..."
                  placeholderTextColor={WARM_CORE.textSecondary}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                  maxLength={180}
                />
              </View>
            </View>

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && { opacity: 0.8 }]}
              onPress={handleCreate}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={WARM_CORE.white} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={20} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Create Taxi Pool</Text>
                </>
              )}
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && DateTimePicker != null ? (
        <Modal transparent animationType="slide" visible={showDatePicker || showTimePicker} onRequestClose={() => { setShowDatePicker(false); setShowTimePicker(false); }}>
          <View style={styles.pickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }}><Text style={styles.pickerCancel}>Cancel</Text></TouchableOpacity>
                <Text style={styles.pickerTitle}>{showDatePicker ? 'Select date' : 'Select time'}</Text>
                <TouchableOpacity onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }}><Text style={styles.pickerDone}>Done</Text></TouchableOpacity>
              </View>
              {showDatePicker ? <DateTimePicker value={departureDate ? new Date(`${departureDate}T00:00:00`) : new Date()} mode="date" display="spinner" minimumDate={new Date()} onChange={handleDateChange} /> : null}
              {showTimePicker ? <DateTimePicker value={departureTime ? new Date(`2026-01-01T${departureTime}:00`) : new Date()} mode="time" display="spinner" onChange={handleTimeChange} /> : null}
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS !== 'ios' && showDatePicker && DateTimePicker != null ? <DateTimePicker value={departureDate ? new Date(`${departureDate}T00:00:00`) : new Date()} mode="date" display="default" minimumDate={new Date()} onChange={handleDateChange} /> : null}
      {Platform.OS !== 'ios' && showTimePicker && DateTimePicker != null ? <DateTimePicker value={departureTime ? new Date(`2026-01-01T${departureTime}:00`) : new Date()} mode="time" display="default" onChange={handleTimeChange} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' } as ViewStyle,
  pickerSheet: { backgroundColor: WARM_CORE.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 } as ViewStyle,
  pickerHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: WARM_CORE.border } as ViewStyle,
  pickerTitle: { fontSize: 15, fontWeight: '700', color: WARM_CORE.text } as TextStyle,
  pickerCancel: { fontSize: 15, color: WARM_CORE.textSecondary } as TextStyle,
  pickerDone: { fontSize: 15, fontWeight: '700', color: WARM_CORE.primary } as TextStyle,
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    letterSpacing: -0.5,
  } as TextStyle,
  container: {
    flex: 1,
  } as ViewStyle,
  contentContainer: {
    padding: 24,
  } as ViewStyle,
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE8E8',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  } as ViewStyle,
  errorText: {
    color: WARM_CORE.error,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  } as TextStyle,
  section: {
    marginBottom: 24,
  } as ViewStyle,
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  } as TextStyle,
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    marginBottom: 12,
  } as TextStyle,
  inputContainer: {
    marginBottom: 0,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  cardSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    minHeight: 58,
  } as ViewStyle,
  cardSelectIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(214,80,10,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  } as ViewStyle,
  cardSelectContent: {
    flex: 1,
  } as ViewStyle,
  cardSelectLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    textTransform: 'uppercase',
  } as TextStyle,
  cardSelectValue: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginTop: 1,
  } as TextStyle,
  placeholder: {
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  } as ViewStyle,
  capacityButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  capacityButtonActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
  capacityText: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  capacityTextActive: {
    color: WARM_CORE.white,
  } as TextStyle,
  notesContainer: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 100,
  } as ViewStyle,
  notesInput: {
    flex: 1,
    fontSize: 14,
    color: WARM_CORE.text,
    fontWeight: '600',
    textAlignVertical: 'top',
    padding: 0,
  } as TextStyle,
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 16,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.5,
  } as TextStyle,
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 16,
    height: 54,
  } as ViewStyle,
  fareCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 16,
  } as ViewStyle,
  fareMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  fareMetric: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  } as ViewStyle,
  fareMetricLabel: { fontSize: 10, fontWeight: '600', color: WARM_CORE.textSecondary } as TextStyle,
  fareMetricValue: { marginTop: 2, fontSize: 15, fontWeight: '800', color: WARM_CORE.text } as TextStyle,
  fareDivider: { height: 1, backgroundColor: WARM_CORE.border, marginVertical: 16 } as ViewStyle,
  fareAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  } as ViewStyle,
  fareAmountLabel: { fontSize: 10, fontWeight: '700', color: WARM_CORE.textSecondary, textTransform: 'uppercase' } as TextStyle,
  fareVehicleAmount: { marginTop: 4, fontSize: 20, fontWeight: '800', color: WARM_CORE.text } as TextStyle,
  fareShareBlock: { alignItems: 'flex-end', flexShrink: 1 } as ViewStyle,
  fareShareLabel: { fontSize: 10, fontWeight: '700', color: WARM_CORE.textSecondary, textTransform: 'uppercase' } as TextStyle,
  fareShareAmount: { marginTop: 4, fontSize: 24, fontWeight: '800', color: WARM_CORE.primary } as TextStyle,
  fareLoadingCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  fareLoadingText: { marginLeft: 10, fontSize: 12, fontWeight: '600', color: WARM_CORE.textSecondary } as TextStyle,  priceSymbolContainer: {
    marginRight: 8,
  } as ViewStyle,
  priceSymbolText: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.primary,
  } as TextStyle,
  priceInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
    padding: 0,
  } as TextStyle,
});
