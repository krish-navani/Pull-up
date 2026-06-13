import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';

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
  
  const [destination, setDestination] = useState<Location | null>(null);
  const [departureDate, setDepartureDate] = useState<string>('');
  const [departureTime, setDepartureTime] = useState<string>('');
  const [maxMembers, setMaxMembers] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [price, setPrice] = useState<string>('40');
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [error, setError] = useState('');

  // ── Entrance animations ──────────────────────────────────────────────────
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlideY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const checkSubscription = async () => {
      if (!auth.user) {
        setCheckingSubscription(false);
        return;
      }
      try {
        const userRef = doc(db, 'users', auth.user.id);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData?.subscriptionStatus !== 'active') {
            Alert.alert(
              'Subscription Required',
              'You need an active TaxiPool subscription (₹250/month) to create a TaxiPool.',
              [
                {
                  text: 'Subscribe Now',
                  onPress: () => router.replace('/driver-subscription')
                },
                {
                  text: 'Go Back',
                  onPress: () => router.back()
                }
              ],
              { cancelable: false }
            );
            return;
          }
        }
      } catch (err) {
        console.error('[CREATE TAXI] Subscription check failed:', err);
      } finally {
        setCheckingSubscription(false);
      }
    };

    checkSubscription();

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
    setShowDatePicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setDepartureDate(`${year}-${month}-${day}`);
      setError('');
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
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
    if (!destination) {
      setError('Please select a destination');
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

    // Pre-check subscription status immediately before creation
    try {
      const userRef = doc(db, 'users', auth.user.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData?.subscriptionStatus !== 'active') {
          Alert.alert(
            'Subscription Required',
            'Your subscription has expired or is inactive. Please subscribe to continue.',
            [{ text: 'Subscribe', onPress: () => router.push('/driver-subscription') }]
          );
          setIsLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error('[CREATE TAXI] Pre-check failed:', err);
    }

    try {
      const departureDateTime = `${departureDate}T${departureTime}:00`;
      
      const poolId = await createTaxiPool({
        creatorId: auth.user.id,
        creatorName: auth.user.fullName,
        creatorImage: auth.user.profileImage || undefined,
        creatorCourse: auth.user.course || 'BBA',
        creatorDivision: auth.user.division || 'A',
        destination: {
          address: destination.address,
          latitude: destination.latitude,
          longitude: destination.longitude
        },
        departureTime: departureDateTime,
        maxMembers,
        notes: notes.trim() || undefined,
        price: parseInt(price, 10) || 40
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

  if (checkingSubscription) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ marginTop: 12, color: WARM_CORE.text, fontSize: 14 }}>Checking subscription status...</Text>
      </SafeAreaView>
    );
  }

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
            
            {/* DESTINATION */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DESTINATION</Text>
              <LocationSearchInput
                label="Where to?"
                value={destination?.address || ''}
                onChange={(location) => {
                  setDestination(location);
                  setError('');
                }}
                onAddressChange={() => setError('')}
                placeholder="Search destination landmark or locality"
                containerStyle={styles.inputContainer}
              />
            </View>

            {/* DATE & TIME */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DEPARTURE TIME</Text>
              <View style={styles.row}>
                
                {/* Date Picker Button */}
                <PressableScale onPress={() => setShowDatePicker(true)} style={{ flex: 1 }}>
                  <View style={styles.cardSelect}>
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
                <PressableScale onPress={() => setShowTimePicker(true)} style={{ flex: 1 }}>
                  <View style={styles.cardSelect}>
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

            {/* ESTIMATED PRICE */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ESTIMATED FARE / PRICE PER SEAT</Text>
              <Text style={styles.sectionSubtitle}>Enter the estimated price per seat for the shared cab</Text>
              <View style={styles.priceInputRow}>
                <View style={styles.priceSymbolContainer}>
                  <Text style={styles.priceSymbolText}>₹</Text>
                </View>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  value={price}
                  onChangeText={(val) => setPrice(val.replace(/[^0-9]/g, ''))}
                  placeholder="40"
                  placeholderTextColor={WARM_CORE.textSecondary}
                />
              </View>
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

      {/* DatePicker Overlay */}
      {showDatePicker && DateTimePicker != null && (
        <DateTimePicker
          value={departureDate ? new Date(`${departureDate}T00:00:00`) : new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={handleDateChange}
        />
      )}

      {/* TimePicker Overlay */}
      {showTimePicker && DateTimePicker != null && (
        <DateTimePicker
          value={departureTime ? new Date(`2026-01-01T${departureTime}:00`) : new Date()}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  priceSymbolContainer: {
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
