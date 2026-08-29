import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Linking,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, updateDoc, Timestamp, collection, query, where, getDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { fetchRoute } from '@/utils/routeUtils';
import { calculateDistance, getRideDirectionType } from '@/utils/atlasLocationUtils';
import { GeofenceEngine } from '@/utils/geofenceEngine';
import { sendNotification } from '@/utils/notificationService';
import {
  subscribeToGroupMessages,
  sendGroupMessage,
  GroupChatMessage
} from '@/utils/rideGroupChatService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BACKGROUND_LOCATION_TASK,
  BG_TASK_RIDE_ID_KEY,
  BG_TASK_LAST_UPDATE_KEY,
  BG_LOCATION_CONFIG,
} from '@/utils/backgroundLocationTask';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Signal strength thresholds (milliseconds)
const SIGNAL_LIVE_MS   = 30_000;  // < 30s  → LIVE
const SIGNAL_WEAK_MS   = 90_000;  // 30–90s → WEAK
// > 90s → OFFLINE

type SignalStatus = 'live' | 'weak' | 'offline' | 'idle';

export default function NavigationScreen() {
  const router = useRouter();
  const { rideId, sharedLat, sharedLng, senderName } = useLocalSearchParams<{ rideId: string; sharedLat: string; sharedLng: string; senderName: string }>();
  const { auth, getRideById, completeRide } = useAppContext();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // Core states
  const [ride, setRide] = useState<any>(null);
  const [acceptedBookings, setAcceptedBookings] = useState<any[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number; heading?: number; speed?: number } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [routeDistance, setRouteDistance] = useState<string>('Calculating...');
  const [routeDuration, setRouteDuration] = useState<string>('Calculating...');
  const [distanceToDestKm, setDistanceToDestKm] = useState<number>(999);
  const [loading, setLoading] = useState(true);
  const [refreshingRoute, setRefreshingRoute] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);

  // Modals & Menu
  const [sosVisible, setSosVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [bgPermModalVisible, setBgPermModalVisible] = useState(false);
  const [showPassengerList, setShowPassengerList] = useState(false);

  // Passenger "Driver Arrived" confirmation modal
  const [driverArrivedModalVisible, setDriverArrivedModalVisible] = useState(false);
  const [arrivedBookingId, setArrivedBookingId] = useState<string | null>(null);
  const [confirmingPickup, setConfirmingPickup] = useState(false);

  // Panel expansion
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const finishRideAnim = useRef(new Animated.Value(1)).current;

  // Signal strength tracking
  const [signalStatus, setSignalStatus] = useState<SignalStatus>('idle');
  const signalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Foreground subscription ref (for UI marker updates)
  const fgSubRef = useRef<Location.LocationSubscription | null>(null);

  // Track whether background task is currently registered
  const bgTrackingActiveRef = useRef(false);

  // Driver profile image
  const [driverProfileImage, setDriverProfileImage] = useState<string | null>(null);

  // Group Chat state
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // Pulse animation for finish ride button when within range
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isDriver = useMemo(() => {
    if (!ride || !auth.user) return false;
    return ride.driverId === auth.user.id;
  }, [ride, auth.user]);

  const isWithin2km = useMemo(() => distanceToDestKm <= 2.0, [distanceToDestKm]);

  // Start pulsing finish ride button when within 2km
  useEffect(() => {
    if (isWithin2km && isDriver) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isWithin2km, isDriver]);

  const currentStageIndex = useMemo(() => {
    if (!ride) return 0;
    if (ride.status === 'completed') return 4;
    if (ride.status === 'in_progress') return 3;
    const hasPaidBookings = acceptedBookings.length > 0 && acceptedBookings.some(b => b.paymentStatus === 'paid');
    if (hasPaidBookings) return 2;
    const hasAcceptedBookings = acceptedBookings.length > 0 || (ride.bookedSeats && ride.bookedSeats.some((s: any) => s.status === 'accepted' || s.status === 'confirmed'));
    if (hasAcceptedBookings) return 1;
    return 0;
  }, [ride, acceptedBookings]);

  const stages = [
    { label: 'Created', icon: 'plus-circle' },
    { label: 'Accepted', icon: 'account-check' },
    { label: 'Paid', icon: 'cash-check' },
    { label: 'Transit', icon: 'swap-horizontal' },
    { label: 'Done', icon: 'checkbox-marked-circle' }
  ];

  // Fetch driver profile image
  useEffect(() => {
    if (!ride?.driverId) return;
    const fetchDriverProfile = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'publicProfiles', ride.driverId));
        if (userSnap.exists()) {
          setDriverProfileImage(userSnap.data()?.profileImage || null);
        }
      } catch {}
    };
    fetchDriverProfile();
  }, [ride?.driverId]);

  // Update presence status to navigating
  useEffect(() => {
    const currentUserId = auth.user?.id;
    if (!currentUserId) return;

    const setNavigationStatus = async (statusVal: 'navigating' | 'online') => {
      try {
        const userRef = doc(db, 'users', currentUserId);
        await updateDoc(userRef, { status: statusVal, lastSeen: new Date().toISOString() });
      } catch (err) {
        console.warn('[NAVIGATION] Failed to update presence status to:', statusVal, err);
      }
    };

    setNavigationStatus('navigating');

    return () => {
      setNavigationStatus('online');
    };
  }, [auth.user?.id]);

  // 1. Subscribe to ride document in real-time
  useEffect(() => {
    if (!rideId) return;
    const rideRef = doc(db, 'rides', rideId);
    const unsub = onSnapshot(rideRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRide({ id: docSnap.id, ...data });

        // If ride completed or cancelled, exit navigation
        if (data.status === 'completed' || data.status === 'cancelled') {
          Alert.alert('Ride Ended', `This ride has been ${data.status}.`);
          router.replace('/(tabs)/my-bookings');
        }

        // If passenger, track driver location updates from Firestore
        if (auth.user && data.driverId !== auth.user.id && data.currentLocation) {
          const liveLoc = data.liveLocation || data.currentLocation;
          setDriverLocation({
            latitude: liveLoc.latitude,
            longitude: liveLoc.longitude,
            heading: liveLoc.heading,
            speed: liveLoc.speed,
          });
        }
      } else {
        Alert.alert('Error', 'Ride not found.');
        router.back();
      }
      setLoading(false);
    }, (error) => {
      console.error('[NAVIGATION] Firestore ride subscription error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [rideId, auth.user]);

  // 2. Subscribe to accepted bookings (with notifiedArrived field)
  useEffect(() => {
    if (!rideId || !ride || !auth.user) return;

    const isDriverUser = ride.driverId === auth.user.id;
    const q = query(
      collection(db, 'bookings'),
      where('rideId', '==', rideId),
      where(isDriverUser ? 'driverId' : 'passengerId', '==', auth.user.id),
      where('status', 'in', ['accepted', 'confirmed'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAcceptedBookings(list);

      // Check if driver arrived notification was sent to this passenger
      if (!isDriverUser) {
        const myBooking = list.find((b: any) => b.passengerId === auth.user!.id);
        if (myBooking && (myBooking as any).notifiedArrived && !(myBooking as any).pickedUp && !driverArrivedModalVisible) {
          setArrivedBookingId(myBooking.id);
          setDriverArrivedModalVisible(true);
        }
      }
    }, (error) => {
      console.error('[NAVIGATION] Bookings subscription error:', error);
    });
    return () => unsub();
  }, [rideId, ride?.driverId, auth.user?.id]);

  // Map bookings to coordinate waypoints
  const waypoints = useMemo(() => {
    const wps: Array<{ latitude: number; longitude: number }> = [];
    acceptedBookings.forEach((b) => {
      const loc = b.passengerPickupLocation || b.passengerDropLocation;
      if (loc) {
        wps.push({ latitude: loc.latitude, longitude: loc.longitude });
      }
    });
    return wps;
  }, [acceptedBookings]);

  // ─── Stop background tracking helper ────────────────────────────────────────
  const stopBackgroundTracking = useCallback(async () => {
    try {
      if (fgSubRef.current) {
        fgSubRef.current.remove();
        fgSubRef.current = null;
      }
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('[NAVIGATION] ✅ Background location task stopped');
      }
      bgTrackingActiveRef.current = false;
      await AsyncStorage.removeItem(BG_TASK_RIDE_ID_KEY);
      if (signalIntervalRef.current) {
        clearInterval(signalIntervalRef.current);
        signalIntervalRef.current = null;
      }
      setSignalStatus('idle');
    } catch (err) {
      console.warn('[NAVIGATION] Error stopping background tracking:', err);
    }
  }, []);

  // ─── 3. Driver Location Watcher — Foreground + Background ───────────────────
  useEffect(() => {
    if (!ride || !isDriver) return;
    if (ride.status !== 'in_progress' && ride.status !== 'active') return;
    if (bgTrackingActiveRef.current) return;

    const startTracking = async () => {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Location Required', 'PullUp needs location access for navigation.', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        setBgPermModalVisible(true);
      }

      await AsyncStorage.setItem(BG_TASK_RIDE_ID_KEY, ride.id);

      const getAccuracyForSpeed = (speedMps: number | null): Location.LocationAccuracy => {
        const kmh = (speedMps ?? 0) * 3.6;
        return kmh >= 10 ? Location.Accuracy.High : Location.Accuracy.Balanced;
      };

      if (bgStatus === 'granted') {
        try {
          const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
          if (alreadyRegistered) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            ...BG_LOCATION_CONFIG,
          });
          bgTrackingActiveRef.current = true;
          console.log('[NAVIGATION] ✅ Background location task started for ride:', ride.id);
        } catch (bgErr) {
          console.error('[NAVIGATION] Failed to start background task:', bgErr);
        }
      }

      let lastWriteTime = 0;
      let lastAccuracy = Location.Accuracy.High;

      try {
        fgSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 8,
          },
          async (loc) => {
            const { latitude, longitude, heading, speed } = loc.coords;
            const now = Date.now();

            setDriverLocation({ latitude, longitude, heading: heading ?? 0, speed: speed ?? 0 });
            setCurrentSpeed(Math.round((speed ?? 0) * 3.6)); // convert m/s to km/h

            // Update distance to destination
            if (ride?.dropLocation) {
              const distKm = calculateDistance(latitude, longitude, ride.dropLocation.latitude, ride.dropLocation.longitude);
              setDistanceToDestKm(distKm);
            }

            const desiredAccuracy = getAccuracyForSpeed(speed);
            if (desiredAccuracy !== lastAccuracy && bgTrackingActiveRef.current) {
              lastAccuracy = desiredAccuracy;
              Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
                .then(() => Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                  accuracy: desiredAccuracy,
                  ...BG_LOCATION_CONFIG,
                }))
                .catch(e => console.warn('[NAVIGATION] Accuracy switch failed:', e));
            }

            if (now - lastWriteTime >= 10000) {
              lastWriteTime = now;
              const nowIso = new Date().toISOString();
              try {
                const rideRef = doc(db, 'rides', ride.id);
                await updateDoc(rideRef, {
                  currentLocation: { latitude, longitude, updatedAt: nowIso },
                  liveLocation: { latitude, longitude, heading: heading ?? 0, speed: speed ?? 0, updatedAt: nowIso },
                });
                await AsyncStorage.setItem(BG_TASK_LAST_UPDATE_KEY, nowIso);
              } catch (fsErr) {
                console.warn('[NAVIGATION] Foreground Firestore write failed:', fsErr);
              }

              try {
                const compResult = await GeofenceEngine.checkAndTriggerCompletion(
                  ride.id, { latitude, longitude }, 'carpool'
                );
                if (compResult.shouldComplete) {
                  await stopBackgroundTracking();
                  Alert.alert('Arrived!', compResult.message);
                  router.replace('/(tabs)/my-bookings');
                } else {
                  await GeofenceEngine.checkAndNotifyNearbyPickups(ride.id, { latitude, longitude });
                }
              } catch (geoErr) {
                console.error('[NAVIGATION] GeofenceEngine error:', geoErr);
              }
            }
          }
        );
      } catch (fgErr) {
        console.warn('[NAVIGATION] Foreground watcher error:', fgErr);
      }

      signalIntervalRef.current = setInterval(async () => {
        try {
          const lastUpdateStr = await AsyncStorage.getItem(BG_TASK_LAST_UPDATE_KEY);
          if (!lastUpdateStr) { setSignalStatus('offline'); return; }
          const ageMs = Date.now() - new Date(lastUpdateStr).getTime();
          if (ageMs < SIGNAL_LIVE_MS)       setSignalStatus('live');
          else if (ageMs < SIGNAL_WEAK_MS)  setSignalStatus('weak');
          else                              setSignalStatus('offline');
        } catch { setSignalStatus('offline'); }
      }, 5000);
    };

    startTracking();

    return () => {
      if (fgSubRef.current) { fgSubRef.current.remove(); fgSubRef.current = null; }
      if (signalIntervalRef.current) { clearInterval(signalIntervalRef.current); signalIntervalRef.current = null; }
    };
  }, [ride?.id, ride?.status, isDriver, stopBackgroundTracking]);

  // Auto-stop tracking when ride ends
  useEffect(() => {
    if (!ride) return;
    if ((ride.status === 'completed' || ride.status === 'cancelled') && bgTrackingActiveRef.current) {
      stopBackgroundTracking();
    }
  }, [ride?.status, stopBackgroundTracking]);

  // Camera Auto-centering
  useEffect(() => {
    if (!driverLocation || !autoFollow || !mapRef.current) return;
    mapRef.current.animateCamera({
      center: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
      pitch: isDriver ? 40 : 0,
      heading: isDriver && driverLocation.heading ? driverLocation.heading : 0,
      zoom: isDriver ? 18 : 16,
    }, { duration: 1200 });
  }, [driverLocation, autoFollow, isDriver]);

  // 4. Route fetch
  const refreshRouteInfo = async (currentCoords: { latitude: number; longitude: number }) => {
    if (!ride) return;
    setRefreshingRoute(true);
    try {
      const destination = { latitude: ride.dropLocation.latitude, longitude: ride.dropLocation.longitude };
      const result = await fetchRoute(currentCoords, destination, waypoints);
      if (result.success) {
        setRouteCoordinates(result.points);
        setRouteDistance(result.distance || 'N/A');
        setRouteDuration(result.duration || 'N/A');
      } else {
        setRouteCoordinates(result.points);
        setRouteDistance('N/A');
        setRouteDuration('N/A');
      }
    } catch (err) {
      console.error('[NAVIGATION] Route refresh error:', err);
    } finally {
      setRefreshingRoute(false);
    }
  };

  useEffect(() => {
    if (!ride) return;
    const startLoc = isDriver
      ? driverLocation || ride.pickupLocation
      : driverLocation || ride.currentLocation || ride.pickupLocation;
    if (startLoc) refreshRouteInfo({ latitude: startLoc.latitude, longitude: startLoc.longitude });
    const interval = setInterval(() => {
      const currentLoc = isDriver ? driverLocation : driverLocation || ride.currentLocation;
      if (currentLoc) refreshRouteInfo({ latitude: currentLoc.latitude, longitude: currentLoc.longitude });
    }, 120000);
    return () => clearInterval(interval);
  }, [ride?.id, isDriver, waypoints.length]);

  const handleRecenter = () => {
    setAutoFollow(true);
    const loc = isDriver ? driverLocation : driverLocation || ride?.currentLocation;
    if (loc) refreshRouteInfo({ latitude: loc.latitude, longitude: loc.longitude });
  };

  const handleGoogleMapsFallback = () => {
    if (!ride) return;
    const destCoords = `${ride.dropLocation.latitude},${ride.dropLocation.longitude}`;
    const wps = waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join('|');
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destCoords)}&waypoints=${encodeURIComponent(wps)}&travelmode=driving`;
    Linking.openURL(navUrl).catch(() => { Alert.alert('Error', 'Could not open Google Maps.'); });
  };

  // 6. Complete Ride — only allowed within 2km
  const handleCompleteRide = async () => {
    if (!ride) return;
    if (!isWithin2km) {
      Alert.alert(
        'Not There Yet',
        `You are ${distanceToDestKm.toFixed(1)} km from the destination. The ride can only be finished within 2 km of the destination.`
      );
      return;
    }
    Alert.alert(
      'Finish Ride?',
      'Are you sure you want to complete this ride?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish', style: 'default',
          onPress: async () => {
            try {
              await completeRide(ride.id);
              await stopBackgroundTracking();
              Alert.alert('🎉 Ride Complete!', 'Great job! Payments are being processed.');
              router.replace('/(tabs)/my-bookings');
            } catch {
              Alert.alert('Error', 'Failed to complete ride.');
            }
          }
        }
      ]
    );
  };

  // Passenger confirms boarding
  const handleConfirmBoarding = async () => {
    if (!ride || !auth.user || confirmingPickup) return;
    setConfirmingPickup(true);
    try {
      await GeofenceEngine.confirmPassengerPickup(
        ride.id,
        auth.user.id,
        auth.user.fullName || 'Passenger',
        ride.driverId
      );
      setDriverArrivedModalVisible(false);
      Alert.alert('✅ Confirmed!', 'The driver has been notified that you are on board.');
    } catch {
      Alert.alert('Error', 'Failed to confirm boarding. Please try again.');
    } finally {
      setConfirmingPickup(false);
    }
  };

  const togglePassengerPickedUp = async (bookingId: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        pickedUp: !currentVal,
        pickedUpAt: !currentVal ? new Date().toISOString() : null,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to update boarding status.');
    }
  };

  const togglePassengerDroppedOff = async (bookingId: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        droppedOff: !currentVal,
        droppedOffAt: !currentVal ? new Date().toISOString() : null,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to update drop-off status.');
    }
  };

  const handleConfirmBoarding2 = async () => {
    if (!ride) return;
    const unboarded = acceptedBookings.filter(b => !b.pickedUp);
    if (unboarded.length > 0) {
      Alert.alert('Passengers Not Boarded', `${unboarded.length} passenger(s) not yet confirmed. Proceed anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', onPress: () => doStartRide() }
      ]);
    } else {
      doStartRide();
    }
  };

  const doStartRide = async () => {
    if (!ride) return;
    try {
      await updateDoc(doc(db, 'rides', ride.id), {
        status: 'in_progress',
        pickupChecklistCompleted: true,
        startedAt: new Date().toISOString(),
        updatedAt: Timestamp.now()
      });

      // Send push notification to all accepted/confirmed passengers
      try {
        const passengerIds = acceptedBookings.map((b: any) => b.passengerId);
        for (const passengerId of passengerIds) {
          await sendNotification(
            passengerId,
            'ride_started',
            '🚀 Ride Started!',
            `Your ride with ${ride.driverName} has started. You can track their location in real-time.`,
            ride.id
          );
        }
      } catch (notifyErr) {
        console.warn('[NAVIGATION] Failed to send ride_started notifications:', notifyErr);
      }

      Alert.alert('🚀 Commute Started!', 'Ride is now in transit. Drive safe!');
    } catch {
      Alert.alert('Error', 'Failed to start ride.');
    }
  };

  // 7. Group Chat
  useEffect(() => {
    if (!rideId || !chatVisible) return;
    const unsub = subscribeToGroupMessages(rideId, (chatMessages) => {
      setMessages(chatMessages);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => unsub();
  }, [rideId, chatVisible]);

  const handleSendMessage = async () => {
    if (!chatText.trim() || !auth.user || sendingMessage) return;
    setSendingMessage(true);
    try {
      await sendGroupMessage(rideId, auth.user.id, auth.user.fullName, auth.user.profileImage || '', chatText);
      setChatText('');
    } catch { Alert.alert('Error', 'Failed to send message.'); }
    finally { setSendingMessage(false); }
  };

  // 8. SOS
  const triggerSOSAlert = async () => {
    setSosVisible(false);
    if (!auth.user) return;
    try {
      const locStr = driverLocation
        ? ` Location: https://maps.google.com/?q=${driverLocation.latitude},${driverLocation.longitude}`
        : '';
      await sendGroupMessage(rideId, 'system', 'System', '', `🚨 EMERGENCY SOS from ${auth.user.fullName}!${locStr}`, 'system', { triggerUserId: auth.user.id });
      Alert.alert('SOS Broadcasted', 'Emergency alert sent to group chat.');
    } catch { Alert.alert('Error', 'Failed to send emergency alert.'); }
  };

  // Panel toggle
  const togglePanel = () => {
    const target = panelExpanded ? 0 : 1;
    Animated.spring(panelAnim, { toValue: target, damping: 20, stiffness: 180, useNativeDriver: false }).start();
    setPanelExpanded(!panelExpanded);
  };

  const panelHeight = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [240, Math.min(SCREEN_H * 0.72, 600)],
  });

  // ── Shared Location View ────────────────────────────────────────────────────
  const sharedLatNum = sharedLat ? parseFloat(sharedLat) : null;
  const sharedLngNum = sharedLng ? parseFloat(sharedLng) : null;

  if (!rideId && sharedLatNum !== null && sharedLngNum !== null) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <View style={[styles.headerHUD, { top: insets.top + 10 }]}>
          <View style={styles.headerInfoRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerDestination} numberOfLines={1}>
                {senderName ? `${senderName}'s Live Location` : 'Shared Location'}
              </Text>
              <Text style={styles.headerRouteSub}>Real-time pin from group chat</Text>
            </View>
          </View>
        </View>
        <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} customMapStyle={warmMapStyle}
          initialRegion={{ latitude: sharedLatNum, longitude: sharedLngNum, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
          <Marker coordinate={{ latitude: sharedLatNum, longitude: sharedLngNum }} title={senderName || 'Shared Location'}>
            <View style={styles.personMarker}>
              <MaterialCommunityIcons name="account" size={20} color={WARM_CORE.white} />
            </View>
          </Marker>
        </MapView>
      </SafeAreaView>
    );
  }

  if (loading || !ride) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={WARM_CORE.primary} />
        <Text style={styles.loaderText}>Starting Navigation...</Text>
      </View>
    );
  }

  // ── Main Navigation Screen ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />

      {/* FULL SCREEN MAP */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={warmMapStyle}
        onPanDrag={() => setAutoFollow(false)}
        initialRegion={{
          latitude: driverLocation?.latitude || ride.pickupLocation.latitude,
          longitude: driverLocation?.longitude || ride.pickupLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Route Polyline — shadow layer + primary */}
        {routeCoordinates.length > 1 && (
          <>
            <Polyline coordinates={routeCoordinates} strokeColor="rgba(0,0,0,0.12)" strokeWidth={8} lineDashPattern={[0]} />
            <Polyline coordinates={routeCoordinates} strokeColor={WARM_CORE.primary} strokeWidth={5} />
          </>
        )}

        {/* Origin Marker */}
        <Marker coordinate={ride.pickupLocation} title="Start">
          <View style={styles.originMarker} />
        </Marker>

        {/* Destination Marker */}
        <Marker coordinate={ride.dropLocation} title="Destination">
          <View style={styles.destMarkerWrap}>
            <MaterialCommunityIcons name="flag-checkered" size={18} color={WARM_CORE.white} />
          </View>
        </Marker>

        {/* Passenger Waypoint Markers */}
        {acceptedBookings.map((booking: any, idx) => {
          const loc = booking.passengerPickupLocation || booking.passengerDropLocation;
          if (!loc) return null;
          const isPickedUp = booking.pickedUp;
          return (
            <Marker key={`pax-${idx}`} coordinate={loc} title={booking.passengerName}>
              <View style={[styles.passengerMarker, isPickedUp && styles.passengerMarkerDone]}>
                <MaterialCommunityIcons
                  name={isPickedUp ? 'account-check' : 'account-clock'}
                  size={14}
                  color={WARM_CORE.white}
                />
              </View>
            </Marker>
          );
        })}

        {/* Active Driver / Vehicle Marker — premium car icon */}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            rotation={driverLocation.heading ?? 0}
            title={ride.driverName}
          >
            <View style={styles.carMarkerWrap}>
              {/* Outer glow ring */}
              <View style={styles.carMarkerGlow} />
              {/* Car body */}
              <View style={styles.carMarkerBody}>
                {driverProfileImage ? (
                  <Image source={{ uri: driverProfileImage }} style={styles.carMarkerPhoto} />
                ) : (
                  <MaterialCommunityIcons name="car-sports" size={20} color={WARM_CORE.white} />
                )}
              </View>
              {/* Direction arrow */}
              <View style={styles.carMarkerArrow} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* TOP HEADER HUD */}
      <View style={[styles.headerHUD, { top: insets.top + 10 }]}>
        <View style={styles.headerInfoRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={WARM_CORE.text} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerDestination} numberOfLines={1}>
              → {ride.dropLocation.address.split(',')[0]}
            </Text>
            <Text style={styles.headerRouteSub}>
              ETA: {routeDuration} · {routeDistance} remaining
            </Text>
          </View>
          <TouchableOpacity onPress={handleGoogleMapsFallback} style={styles.menuButton}>
            <MaterialCommunityIcons name="google-maps" size={24} color={WARM_CORE.primary} />
          </TouchableOpacity>
        </View>

        {/* Signal badge + speed chip in one row */}
        <View style={styles.hudBadgeRow}>
          {isDriver && signalStatus !== 'idle' && (
            <View style={[
              styles.signalBadge,
              signalStatus === 'live' && styles.signalLive,
              signalStatus === 'weak' && styles.signalWeak,
              signalStatus === 'offline' && styles.signalOffline,
            ]}>
              <View style={[styles.signalDot,
                signalStatus === 'live' && { backgroundColor: '#16a34a' },
                signalStatus === 'weak' && { backgroundColor: '#ca8a04' },
                signalStatus === 'offline' && { backgroundColor: '#dc2626' },
              ]} />
              <Text style={styles.signalText}>
                {signalStatus === 'live' ? 'LIVE' : signalStatus === 'weak' ? 'WEAK' : 'OFFLINE'}
              </Text>
            </View>
          )}
          {isDriver && currentSpeed > 0 && (
            <View style={styles.speedChip}>
              <Text style={styles.speedValue}>{currentSpeed}</Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </View>
          )}
          {refreshingRoute && (
            <View style={styles.refreshChip}>
              <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginRight: 4 }} />
              <Text style={styles.refreshChipText}>Updating...</Text>
            </View>
          )}
        </View>
      </View>

      {/* FLOATING ACTION BUTTONS */}
      <View style={[styles.floatingContainer, { bottom: panelExpanded ? 440 : 210 }]}>
        {!autoFollow && (
          <TouchableOpacity onPress={handleRecenter} style={styles.floatingButton}>
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={WARM_CORE.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.floatingButton}>
          <MaterialCommunityIcons name={isMuted ? 'volume-off' : 'volume-high'} size={22} color={WARM_CORE.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSosVisible(true)} style={[styles.floatingButton, styles.sosButton]}>
          <MaterialCommunityIcons name="alert-octagon" size={24} color={WARM_CORE.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setChatVisible(true)} style={[styles.floatingButton, styles.chatButton]}>
          <MaterialCommunityIcons name="chat-processing-outline" size={22} color={WARM_CORE.white} />
        </TouchableOpacity>
      </View>

      {/* BOTTOM PANEL */}
      <Animated.View style={[styles.bottomPanel, { height: panelHeight }]}>
        {/* Handle */}
        <TouchableOpacity style={styles.panelHandle} onPress={togglePanel} activeOpacity={0.8}>
          <View style={styles.panelHandleBar} />
        </TouchableOpacity>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {/* Google Maps External Navigation Redirect */}
          <TouchableOpacity
            style={styles.googleMapsRedirectBtn}
            onPress={() => {
              const destLat = ride?.dropLocation?.latitude;
              const destLng = ride?.dropLocation?.longitude;
              if (destLat && destLng) {
                const url = Platform.select({
                  ios: `maps://app?daddr=${destLat},${destLng}`,
                  android: `google.navigation:q=${destLat},${destLng}`,
                }) || `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
                Linking.openURL(url).catch(() => {
                  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`);
                });
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="google-maps" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.googleMapsRedirectBtnText}>Open in Google Maps Navigation</Text>
          </TouchableOpacity>

          {/* Status row */}
          <View style={styles.panelStatusRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {ride.status === 'in_progress' ? '🚀 IN TRANSIT' : ride.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.etaText}>{routeDuration}</Text>
            <Text style={styles.distText}>{routeDistance}</Text>
          </View>

          {/* Route pill */}
          <View style={styles.routePill}>
            <View style={styles.routePillDot} />
            <Text style={styles.routePillText} numberOfLines={1}>
              {ride.pickupLocation.address.split(',')[0]}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={WARM_CORE.textSecondary} style={{ marginHorizontal: 4 }} />
            <Text style={styles.routePillDest} numberOfLines={1}>
              {ride.dropLocation.address.split(',')[0]}
            </Text>
          </View>

          {/* Progress Timeline */}
          <View style={styles.timelineContainer}>
            {stages.map((stage, idx) => {
              const isCompleted = idx < currentStageIndex;
              const isActive = idx === currentStageIndex;
              const color = isCompleted ? '#10B981' : isActive ? WARM_CORE.primary : '#9CA3AF';
              return (
                <React.Fragment key={stage.label}>
                  <View style={styles.timelineStep}>
                    <View style={[styles.timelineDot, { backgroundColor: color }]}>
                      <MaterialCommunityIcons name={stage.icon as any} size={10} color="#FFF" />
                    </View>
                    <Text style={[styles.timelineLabel, { color }]}>{stage.label}</Text>
                  </View>
                  {idx < stages.length - 1 && (
                    <View style={[styles.timelineLink, { backgroundColor: idx < currentStageIndex ? '#10B981' : WARM_CORE.border }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Passenger list */}
          {acceptedBookings.length > 0 && (
            <View style={styles.passengerSection}>
              <Text style={styles.sectionTitle}>Passengers & Boarding Status</Text>
              {acceptedBookings.map((b: any, idx: number) => {
                const phoneToCall = b.passengerPhone || b.phone || (b.passengerId ? auth.user?.phone : null);
                return (
                  <View key={idx} style={styles.passengerRow}>
                    <View style={[styles.passengerAvatar, b.pickedUp && { backgroundColor: '#10B981' }]}>
                      <Text style={styles.passengerAvatarText}>{(b.passengerName || 'P')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerName}>{b.passengerName}</Text>
                      <Text style={styles.passengerStatus}>
                        {b.droppedOff ? '✅ Dropped off' : b.pickedUp ? '🚗 On board' : b.notifiedArrived ? '🔔 Driver arrived' : b.notifiedNearby ? '📍 Driver nearby' : '⏳ Waiting'}
                      </Text>
                    </View>

                    {/* Phone Call button for Driver */}
                    {phoneToCall && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${phoneToCall}`)}
                        style={styles.callPassengerBtn}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="phone" size={16} color="#10B981" />
                        <Text style={styles.callPassengerBtnText}>Call</Text>
                      </TouchableOpacity>
                    )}

                    {isDriver && !b.pickedUp && (
                      <TouchableOpacity onPress={() => togglePassengerPickedUp(b.id, b.pickedUp)} style={styles.pickupBtn}>
                        <MaterialCommunityIcons name="check" size={16} color={WARM_CORE.primary} />
                        <Text style={styles.pickupBtnText}>Picked up</Text>
                      </TouchableOpacity>
                    )}
                    {isDriver && b.pickedUp && !b.droppedOff && (
                      <TouchableOpacity onPress={() => togglePassengerDroppedOff(b.id, b.droppedOff)} style={[styles.pickupBtn, { borderColor: '#10B981' }]}>
                        <MaterialCommunityIcons name="map-marker-check" size={16} color="#10B981" />
                        <Text style={[styles.pickupBtnText, { color: '#10B981' }]}>Drop off</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Passenger View — Driver Call Card */}
          {!isDriver && ride.driverName && (
            <View style={styles.driverContactCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverContactName}>Driver: {ride.driverName}</Text>
                <Text style={styles.driverContactSub}>Call driver to coordinate your pickup</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const num = ride.driverPhone || '9999999999';
                  Linking.openURL(`tel:${num}`);
                }}
                style={styles.callDriverBtn}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="phone" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.callDriverBtnText}>Call Driver</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Driver view — finish ride button */}
          {isDriver && ride.status === 'in_progress' && (
            <View style={styles.finishSection}>
              <Animated.View style={{ transform: [{ scale: isWithin2km ? pulseAnim : 1 }] }}>
                <TouchableOpacity
                  onPress={handleCompleteRide}
                  style={[styles.finishRideBtn, !isWithin2km && styles.finishRideBtnDisabled]}
                  activeOpacity={isWithin2km ? 0.8 : 1}
                >
                  <MaterialCommunityIcons
                    name={isWithin2km ? 'flag-checkered' : 'map-marker-distance'}
                    size={22}
                    color={isWithin2km ? WARM_CORE.white : '#9CA3AF'}
                    style={{ marginRight: 8 }}
                  />
                  <View>
                    <Text style={[styles.finishRideBtnText, !isWithin2km && { color: '#9CA3AF' }]}>
                      {isWithin2km ? '🎉 Finish Ride' : 'Finish Ride'}
                    </Text>
                    {!isWithin2km && (
                      <Text style={styles.finishRideSubtext}>
                        {distanceToDestKm.toFixed(1)} km to destination
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}

          {/* Driver CTA for starting */}
          {isDriver && ride.status !== 'in_progress' && ride.pickupChecklistCompleted !== true && acceptedBookings.length > 0 && (
            <TouchableOpacity onPress={handleConfirmBoarding2} style={styles.startRideCTA}>
              <MaterialCommunityIcons name="play-circle-outline" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.startRideCTAText}>Confirm Boarding & Start</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>

      {/* ─── PASSENGER: DRIVER ARRIVED MODAL ─────────────────────────────────── */}
      <Modal visible={driverArrivedModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDriverArrivedModalVisible(false)}>
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedContainer}>
            <View style={styles.arrivedIconWrap}>
              <MaterialCommunityIcons name="car-arrow-right" size={48} color={WARM_CORE.primary} />
            </View>
            <Text style={styles.arrivedTitle}>Your Driver Has Arrived!</Text>
            <Text style={styles.arrivedSubtitle}>
              {ride.driverName} is at your pickup location. Call to coordinate or confirm boarding.
            </Text>

            {/* Direct Call Driver Button */}
            <TouchableOpacity
              onPress={() => {
                const num = ride.driverPhone || '9999999999';
                Linking.openURL(`tel:${num}`);
              }}
              style={[styles.arrivedConfirmBtn, { backgroundColor: '#10B981', marginBottom: 10 }]}
            >
              <MaterialCommunityIcons name="phone" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.arrivedConfirmText}>Call Driver to Coordinate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmBoarding}
              style={styles.arrivedConfirmBtn}
              disabled={confirmingPickup}
            >
              {confirmingPickup ? (
                <ActivityIndicator color={WARM_CORE.white} />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
                  <Text style={styles.arrivedConfirmText}>Yes, I'm in the Car</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDriverArrivedModalVisible(false)} style={styles.arrivedDismiss}>
              <Text style={styles.arrivedDismissText}>Not yet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── BACKGROUND LOCATION PERMISSION MODAL ───────────────────────────── */}
      <Modal visible={bgPermModalVisible} animationType="slide" transparent={true} onRequestClose={() => setBgPermModalVisible(false)}>
        <View style={styles.bgPermOverlay}>
          <View style={styles.bgPermContainer}>
            <MaterialCommunityIcons name="map-marker-path" size={48} color={WARM_CORE.primary} />
            <Text style={styles.bgPermTitle}>Enable Background Location</Text>
            <Text style={styles.bgPermBody}>
              {'For passengers to see your location when the screen is locked, PullUp needs '}
              <Text style={{ fontWeight: '700' }}>{"\"Allow all the time\""}</Text>
              {' location access.\n\nSettings → Apps → PullUp → Permissions → Location → Allow all the time'}
            </Text>
            <TouchableOpacity style={styles.bgPermCTA} onPress={() => { Linking.openSettings(); setBgPermModalVisible(false); }}>
              <Text style={styles.bgPermCTAText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bgPermDismiss} onPress={() => setBgPermModalVisible(false)}>
              <Text style={styles.bgPermDismissText}>Continue without background tracking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>



      {/* ─── SOS MODAL ──────────────────────────────────────────────────────── */}
      <Modal visible={sosVisible} animationType="fade" transparent={true} onRequestClose={() => setSosVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSosVisible(false)}>
          <View style={styles.sosContainer}>
            <MaterialCommunityIcons name="alert-decagram" size={48} color={WARM_CORE.error} />
            <Text style={styles.sosTitle}>Emergency SOS</Text>
            <Text style={styles.sosDescription}>
              Call emergency services or broadcast your location to the ride group chat.
            </Text>
            <TouchableOpacity onPress={() => { setSosVisible(false); Linking.openURL('tel:112'); }} style={[styles.sosBtn, { backgroundColor: WARM_CORE.error }]}>
              <MaterialCommunityIcons name="phone" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Call Emergency (112)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={triggerSOSAlert} style={[styles.sosBtn, { backgroundColor: WARM_CORE.primary }]}>
              <MaterialCommunityIcons name="chat-alert-outline" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Share Location & Alert</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSosVisible(false)} style={styles.sosClose}>
              <Text style={styles.sosCloseText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── GROUP CHAT MODAL ───────────────────────────────────────────────── */}
      <Modal visible={chatVisible} animationType="slide" transparent={false} onRequestClose={() => setChatVisible(false)}>
        <SafeAreaView style={styles.chatContainer}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatCloseBtn}>
              <MaterialCommunityIcons name="close" size={24} color={WARM_CORE.text} />
            </TouchableOpacity>
            <Text style={styles.chatTitle}>Ride Group Chat</Text>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            ref={chatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatFeed}
            renderItem={({ item }) => {
              const isMe = item.senderId === auth.user?.id;
              const isSys = item.type === 'system';
              if (isSys) return (
                <View style={styles.systemMsgContainer}>
                  <Text style={styles.systemMsgText}>{item.text}</Text>
                </View>
              );
              return (
                <View style={[styles.msgRow, isMe ? styles.msgRight : styles.msgLeft]}>
                  {!isMe && (
                    <View style={styles.chatAvatar}>
                      {item.senderPhoto ? (
                        <Image source={{ uri: item.senderPhoto }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.chatAvatarText}>{item.senderName[0]}</Text>
                      )}
                    </View>
                  )}
                  <View style={styles.msgBubbleContainer}>
                    {!isMe && <Text style={styles.msgSenderName}>{item.senderName}</Text>}
                    <View style={[styles.msgBubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                      <Text style={[styles.msgText, isMe ? styles.textMe : styles.textOther]}>{item.text}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatText}
                onChangeText={setChatText}
                placeholder="Type a message..."
                placeholderTextColor={WARM_CORE.textSecondary}
              />
              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={!chatText.trim() || sendingMessage}
                style={[styles.chatSendBtn, !chatText.trim() && { opacity: 0.5 }]}
              >
                <MaterialCommunityIcons name="send" size={20} color={WARM_CORE.white} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ─── DRIVER BOARDING CHECKLIST (fullscreen overlay before ride starts) ─ */}
      {isDriver && ride && ride.pickupChecklistCompleted !== true && (
        <View style={[StyleSheet.absoluteFillObject, styles.boardingOverlay]}>
          <View style={[styles.boardingHeader, { paddingTop: insets.top + 20 }]}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={32} color={WARM_CORE.primary} />
            <Text style={styles.boardingTitle}>Passenger Boarding</Text>
            <Text style={styles.boardingSubtitle}>Confirm all passengers have boarded before starting</Text>
          </View>
          <FlatList
            data={acceptedBookings}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => togglePassengerPickedUp(item.id, item.pickedUp)}
                style={[styles.boardingPassengerRow, item.pickedUp && styles.boardingPassengerRowDone]}
              >
                <View style={[styles.boardingCheckbox, item.pickedUp && styles.boardingCheckboxDone]}>
                  {item.pickedUp && <MaterialCommunityIcons name="check" size={16} color={WARM_CORE.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boardingPassengerName}>{item.passengerName}</Text>
                  <Text style={styles.boardingPassengerSub}>{item.seatsBooked} seat{item.seatsBooked > 1 ? 's' : ''}</Text>
                </View>
                {item.pickedUp && (
                  <View style={styles.boardingOnboard}>
                    <Text style={styles.boardingOnboardText}>On board ✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            style={{ flex: 1 }}
          />
          <View style={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
            <TouchableOpacity onPress={handleConfirmBoarding2} style={styles.startRideCTA}>
              <MaterialCommunityIcons name="play-circle-outline" size={22} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.startRideCTAText}>Confirm Boarding & Start Commute</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// Custom map styling
const warmMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F8F4EF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E5650' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFF8F0' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F0E8D8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E0D0BC' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFF0E0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFE5C8' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#1E120D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C8DEFA' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6E5650' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E8DFD0' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D8EDD0' }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WARM_CORE.background },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: WARM_CORE.background },
  loaderText: { marginTop: 12, fontSize: 14, color: WARM_CORE.textSecondary, fontWeight: '600' },
  map: { width: SCREEN_W, height: SCREEN_H },

  // ─── Markers ───────────────────────────────────────────────────────────────
  originMarker: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#10B981', borderWidth: 3, borderColor: WARM_CORE.white,
    shadowColor: '#10B981', shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
  },
  destMarkerWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: WARM_CORE.primary, borderWidth: 3, borderColor: WARM_CORE.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: WARM_CORE.primary, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  passengerMarker: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#7C3AED', borderWidth: 2, borderColor: WARM_CORE.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C3AED', shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  passengerMarkerDone: { backgroundColor: '#10B981' },
  personMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: WARM_CORE.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: WARM_CORE.white,
  },
  // Premium car marker
  carMarkerWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  carMarkerGlow: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    backgroundColor: `${WARM_CORE.primary}30`,
    borderWidth: 2, borderColor: `${WARM_CORE.primary}60`,
  },
  carMarkerBody: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: WARM_CORE.primary, borderWidth: 3, borderColor: WARM_CORE.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: WARM_CORE.primary, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  carMarkerPhoto: { width: 40, height: 40, borderRadius: 20 },
  carMarkerArrow: {
    width: 0, height: 0, position: 'absolute', top: -8,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: WARM_CORE.primary,
  },

  // ─── Header HUD ────────────────────────────────────────────────────────────
  headerHUD: {
    position: 'absolute', left: 16, right: 16, zIndex: 10,
    backgroundColor: 'rgba(255, 252, 248, 0.97)',
    borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: WARM_CORE.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  headerInfoRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 6, marginRight: 6 },
  headerTextContainer: { flex: 1 },
  headerDestination: { fontSize: 16, fontWeight: '800', color: WARM_CORE.text },
  headerRouteSub: { fontSize: 11, color: WARM_CORE.textSecondary, marginTop: 2, fontWeight: '500' },
  menuButton: { padding: 6 },
  hudBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' },
  signalBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 5 },
  signalLive: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  signalWeak: { backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fde047' },
  signalOffline: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  signalDot: { width: 7, height: 7, borderRadius: 4 },
  signalText: { fontSize: 10, fontWeight: '800', color: '#1e293b', letterSpacing: 0.5 },
  speedChip: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: WARM_CORE.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 2 },
  speedValue: { fontSize: 14, fontWeight: '800', color: WARM_CORE.primary },
  speedUnit: { fontSize: 9, fontWeight: '700', color: WARM_CORE.primary, letterSpacing: 0.5 },
  refreshChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: WARM_CORE.card },
  refreshChipText: { fontSize: 10, color: WARM_CORE.primary, fontWeight: '600' },

  // ─── Floating Buttons ──────────────────────────────────────────────────────
  floatingContainer: { position: 'absolute', right: 16, zIndex: 5, gap: 12 },
  floatingButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: WARM_CORE.background, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: WARM_CORE.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 5, elevation: 3,
  },
  sosButton: { backgroundColor: WARM_CORE.error, borderColor: WARM_CORE.error },
  chatButton: { backgroundColor: WARM_CORE.primary, borderColor: WARM_CORE.primary },

  // ─── Bottom Panel ──────────────────────────────────────────────────────────
  bottomPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    borderTopWidth: 1, borderTopColor: WARM_CORE.border,
    overflow: 'hidden',
  },
  panelHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  panelHandleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: WARM_CORE.border },
  panelStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusBadge: { backgroundColor: `${WARM_CORE.primary}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', color: WARM_CORE.primary, letterSpacing: 0.8 },
  etaText: { fontSize: 18, fontWeight: '800', color: WARM_CORE.text },
  distText: { fontSize: 13, fontWeight: '600', color: WARM_CORE.textSecondary },
  routePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: WARM_CORE.card,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  routePillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 8 },
  routePillText: { fontSize: 12, color: WARM_CORE.textSecondary, fontWeight: '600', flex: 1 },
  routePillDest: { fontSize: 12, color: WARM_CORE.text, fontWeight: '700', flex: 1 },
  // Timeline
  timelineContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  timelineStep: { alignItems: 'center', width: 48 },
  timelineDot: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  timelineLabel: { fontSize: 8, fontWeight: '800', marginTop: 4, textAlign: 'center', letterSpacing: 0.3 },
  timelineLink: { height: 2, flex: 1, alignSelf: 'center', marginTop: -12 },
  // Expanded
  expandedContent: { flex: 1, marginTop: 8 },
  passengerSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: WARM_CORE.text, marginBottom: 10, letterSpacing: 0.3 },
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: WARM_CORE.border, gap: 12,
  },
  passengerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${WARM_CORE.primary}20`, justifyContent: 'center', alignItems: 'center',
  },
  passengerAvatarText: { fontSize: 15, fontWeight: '800', color: WARM_CORE.primary },
  passengerName: { fontSize: 14, fontWeight: '700', color: WARM_CORE.text },
  passengerStatus: { fontSize: 11, color: WARM_CORE.textSecondary, marginTop: 2 },
  pickupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: WARM_CORE.primary,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
  },
  pickupBtnText: { fontSize: 11, fontWeight: '700', color: WARM_CORE.primary },
  finishSection: { marginBottom: 16 },
  finishRideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16,
    shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  finishRideBtnDisabled: { backgroundColor: WARM_CORE.card, shadowOpacity: 0 },
  finishRideBtnText: { fontSize: 17, fontWeight: '800', color: WARM_CORE.white },
  finishRideSubtext: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', textAlign: 'center', marginTop: 2 },
  // CTA buttons
  startRideCTA: {
    backgroundColor: WARM_CORE.success, borderRadius: 14, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    shadowColor: WARM_CORE.success, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    marginTop: 8,
  },
  startRideCTADisabled: { backgroundColor: WARM_CORE.card },
  startRideCTAText: { color: WARM_CORE.white, fontWeight: '800', fontSize: 14 },

  // ─── Driver Arrived Modal ──────────────────────────────────────────────────
  arrivedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  arrivedContainer: {
    backgroundColor: WARM_CORE.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, alignItems: 'center', paddingBottom: 40,
  },
  arrivedIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: `${WARM_CORE.primary}15`, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  arrivedTitle: { fontSize: 22, fontWeight: '800', color: WARM_CORE.text, marginBottom: 8, textAlign: 'center' },
  arrivedSubtitle: { fontSize: 14, color: WARM_CORE.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  arrivedConfirmBtn: {
    width: '100%', backgroundColor: WARM_CORE.primary,
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    shadowColor: WARM_CORE.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    marginBottom: 12,
  },
  arrivedConfirmText: { fontSize: 16, fontWeight: '800', color: WARM_CORE.white },
  arrivedDismiss: { paddingVertical: 10 },
  arrivedDismissText: { fontSize: 13, color: WARM_CORE.textSecondary, fontWeight: '600' },

  // ─── Boarding Overlay ──────────────────────────────────────────────────────
  boardingOverlay: {
    backgroundColor: WARM_CORE.background, zIndex: 100,
    flexDirection: 'column',
  },
  boardingHeader: { padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: WARM_CORE.border },
  boardingTitle: { fontSize: 22, fontWeight: '800', color: WARM_CORE.text, marginTop: 8 },
  boardingSubtitle: { fontSize: 13, color: WARM_CORE.textSecondary, marginTop: 4, textAlign: 'center' },
  boardingPassengerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: WARM_CORE.border, gap: 14,
    borderRadius: 12, paddingHorizontal: 4,
  },
  boardingPassengerRowDone: { opacity: 0.7 },
  boardingCheckbox: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 2,
    borderColor: WARM_CORE.border, justifyContent: 'center', alignItems: 'center',
  },
  boardingCheckboxDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
  boardingPassengerName: { fontSize: 16, fontWeight: '700', color: WARM_CORE.text },
  boardingPassengerSub: { fontSize: 12, color: WARM_CORE.textSecondary, marginTop: 2 },
  boardingOnboard: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  boardingOnboardText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },

  // ─── Bg Perm Modal ─────────────────────────────────────────────────────────
  bgPermOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  bgPermContainer: {
    backgroundColor: WARM_CORE.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, alignItems: 'center', gap: 12,
  },
  bgPermTitle: { fontSize: 20, fontWeight: '800', color: WARM_CORE.text, textAlign: 'center' },
  bgPermBody: { fontSize: 14, color: WARM_CORE.textSecondary, textAlign: 'center', lineHeight: 22 },
  bgPermCTA: {
    backgroundColor: WARM_CORE.primary, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14, width: '100%', alignItems: 'center', marginTop: 8,
  },
  bgPermCTAText: { color: WARM_CORE.white, fontWeight: '700', fontSize: 15 },
  bgPermDismiss: { paddingVertical: 10 },
  bgPermDismissText: { fontSize: 12, color: WARM_CORE.textSecondary },

  // ─── Menu Modal ────────────────────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: 'rgba(30, 18, 13, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  menuContainer: { width: '100%', backgroundColor: WARM_CORE.background, borderRadius: 16, padding: 18, alignItems: 'center' },
  menuTitle: { fontSize: 16, fontWeight: '700', color: WARM_CORE.text, marginBottom: 16 },
  menuItem: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: WARM_CORE.card, marginBottom: 12,
  },
  menuItemText: { fontSize: 14, color: WARM_CORE.text, fontWeight: '600', marginLeft: 10 },
  menuCancel: { paddingVertical: 12 },
  menuCancelText: { fontSize: 13, color: WARM_CORE.textSecondary, fontWeight: '700' },

  // ─── SOS Modal ─────────────────────────────────────────────────────────────
  sosContainer: { width: '100%', backgroundColor: WARM_CORE.background, borderRadius: 20, padding: 20, alignItems: 'center' },
  sosTitle: { fontSize: 18, fontWeight: '700', color: WARM_CORE.error, marginTop: 10, marginBottom: 6 },
  sosDescription: { fontSize: 13, color: WARM_CORE.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  sosBtn: { width: '100%', height: 48, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  sosBtnText: { color: WARM_CORE.white, fontWeight: '700', fontSize: 14 },
  sosClose: { paddingVertical: 10 },
  sosCloseText: { fontSize: 13, color: WARM_CORE.textSecondary, fontWeight: '700' },

  // ─── Chat Modal ────────────────────────────────────────────────────────────
  chatContainer: { flex: 1, backgroundColor: WARM_CORE.background },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: WARM_CORE.border,
  },
  chatCloseBtn: { padding: 8 },
  chatTitle: { fontSize: 16, fontWeight: '700', color: WARM_CORE.text },
  chatFeed: { padding: 16 },
  systemMsgContainer: { alignItems: 'center', marginVertical: 10 },
  systemMsgText: {
    fontSize: 11, color: WARM_CORE.textSecondary, backgroundColor: WARM_CORE.card,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden',
  },
  msgRow: { flexDirection: 'row', marginBottom: 16, maxWidth: '80%' },
  msgLeft: { alignSelf: 'flex-start' },
  msgRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  chatAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: WARM_CORE.card, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  chatAvatarText: { fontSize: 14, fontWeight: '700', color: WARM_CORE.primary },
  msgBubbleContainer: { flexDirection: 'column' },
  msgSenderName: { fontSize: 10, color: WARM_CORE.textSecondary, marginBottom: 2, marginLeft: 4 },
  msgBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMe: { backgroundColor: WARM_CORE.primary, borderTopRightRadius: 2 },
  bubbleOther: { backgroundColor: WARM_CORE.card, borderTopLeftRadius: 2 },
  msgText: { fontSize: 13, lineHeight: 18 },
  textMe: { color: WARM_CORE.white },
  textOther: { color: WARM_CORE.text },
  chatInputRow: {
    flexDirection: 'row', padding: 12,
    borderTopWidth: 1, borderTopColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background, alignItems: 'center',
  },
  chatInput: {
    flex: 1, height: 40, borderRadius: 20, backgroundColor: WARM_CORE.card,
    paddingHorizontal: 16, color: WARM_CORE.text, fontSize: 14, marginRight: 10,
  },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: WARM_CORE.primary, justifyContent: 'center', alignItems: 'center' },

  // ─── Google Maps & Phone Action Styles ───────────────────────────────────
  googleMapsRedirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4500A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginTop: 4,
    shadowColor: '#D4500A',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  googleMapsRedirectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  callPassengerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginRight: 6,
  },
  callPassengerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginLeft: 4,
  },
  driverContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  driverContactName: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  driverContactSub: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  },
  callDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  callDriverBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
