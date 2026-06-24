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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, updateDoc, Timestamp, collection, query, where } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { fetchRoute } from '@/utils/routeUtils';
import { calculateDistance, getRideDirectionType } from '@/utils/atlasLocationUtils';
import { GeofenceEngine } from '@/utils/geofenceEngine';
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

// Signal strength thresholds (milliseconds)
const SIGNAL_LIVE_MS   = 30_000;  // < 30s  → 🟢 LIVE
const SIGNAL_WEAK_MS   = 90_000;  // 30–90s → 🟡 WEAK
// > 90s → 🔴 OFFLINE

type SignalStatus = 'live' | 'weak' | 'offline' | 'idle';

export default function NavigationScreen() {
  const router = useRouter();
  const { rideId, sharedLat, sharedLng, senderName } = useLocalSearchParams<{ rideId: string; sharedLat: string; sharedLng: string; senderName: string }>();
  const { auth, getRideById, completeRide } = useAppContext();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // States
  const [ride, setRide] = useState<any>(null);
  const [acceptedBookings, setAcceptedBookings] = useState<any[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number; heading?: number; speed?: number } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [routeDistance, setRouteDistance] = useState<string>('Calculating...');
  const [routeDuration, setRouteDuration] = useState<string>('Calculating...');
  const [loading, setLoading] = useState(true);
  const [refreshingRoute, setRefreshingRoute] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Modals & Menu
  const [menuVisible, setMenuVisible] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [bgPermModalVisible, setBgPermModalVisible] = useState(false);

  // Signal strength tracking
  const [signalStatus, setSignalStatus] = useState<SignalStatus>('idle');
  const signalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Foreground subscription ref (for UI marker updates)
  const fgSubRef = useRef<Location.LocationSubscription | null>(null);

  // Track whether background task is currently registered
  const bgTrackingActiveRef = useRef(false);

  // Group Chat state
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  const isDriver = useMemo(() => {
    if (!ride || !auth.user) return false;
    return ride.driverId === auth.user.id;
  }, [ride, auth.user]);

  const currentStageIndex = useMemo(() => {
    if (!ride) return 0;
    if (ride.status === 'completed') return 4;
    if (ride.status === 'in_progress') return 3;
    
    const hasPaidBookings = acceptedBookings.length > 0 && acceptedBookings.some(b => b.paymentStatus === 'paid');
    if (hasPaidBookings) return 2;
    
    const hasAcceptedBookings = acceptedBookings.length > 0 || (ride.bookedSeats && ride.bookedSeats.some((s: any) => s.status === 'accepted' || s.status === 'confirmed'));
    if (hasAcceptedBookings) return 1;
    
    return 0; // Created
  }, [ride, acceptedBookings]);

  const stages = [
    { label: 'Created', icon: 'plus-circle' },
    { label: 'Accepted', icon: 'account-check' },
    { label: 'Paid', icon: 'cash-check' },
    { label: 'Transit', icon: 'swap-horizontal' },
    { label: 'Completed', icon: 'checkbox-marked-circle' }
  ];

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

  // 2. Subscribe to accepted bookings
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
      const list = snap.docs.map(doc => doc.data());
      setAcceptedBookings(list);
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

  // ─── Stop background tracking helper (used in multiple places) ────────────
  const stopBackgroundTracking = useCallback(async () => {
    try {
      // Remove foreground subscription
      if (fgSubRef.current) {
        fgSubRef.current.remove();
        fgSubRef.current = null;
      }

      // Stop background task if it's registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log('[NAVIGATION] ✅ Background location task stopped');
      }
      bgTrackingActiveRef.current = false;

      // Clear stored rideId so the task doesn't fire on a stale ride
      await AsyncStorage.removeItem(BG_TASK_RIDE_ID_KEY);

      // Clear signal interval
      if (signalIntervalRef.current) {
        clearInterval(signalIntervalRef.current);
        signalIntervalRef.current = null;
      }
      setSignalStatus('idle');
    } catch (err) {
      console.warn('[NAVIGATION] Error stopping background tracking:', err);
    }
  }, []);

  // ─── 3. Driver Location Watcher — Foreground + Background ─────────────────
  useEffect(() => {
    if (!ride || !isDriver) return;

    // Only start tracking on active/in_progress rides
    if (ride.status !== 'in_progress' && ride.status !== 'active') return;

    // Prevent double-registration when ride document re-triggers this effect
    if (bgTrackingActiveRef.current) return;

    const startTracking = async () => {
      // ── Step 1: Foreground permission ──────────────────────────────────────
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert(
          'Location Required',
          'PullUp needs "While Using the App" location access for navigation. Please enable it in Settings.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      // ── Step 2: Background permission ─────────────────────────────────────
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        // Show explanation modal — don't block navigation, just warn
        setBgPermModalVisible(true);
        console.warn('[NAVIGATION] Background location permission denied — tracking will pause when app is backgrounded');
        // Fall through: still start foreground-only tracking
      }

      // ── Step 3: Persist rideId for background task ─────────────────────────
      await AsyncStorage.setItem(BG_TASK_RIDE_ID_KEY, ride.id);

      // ── Step 4: Determine initial accuracy based on speed ─────────────────
      const getAccuracyForSpeed = (speedMps: number | null): Location.LocationAccuracy => {
        const kmh = (speedMps ?? 0) * 3.6;
        return kmh >= 10 ? Location.Accuracy.High : Location.Accuracy.Balanced;
      };

      // ── Step 5: Start background OS-level location updates ─────────────────
      if (bgStatus === 'granted') {
        try {
          // Stop any stale registration first
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

      // ── Step 6: Foreground subscription for smooth map UI ─────────────────
      // Runs in parallel with background task. Updates the map marker in real time.
      let lastWriteTime = 0;
      let lastAccuracy = Location.Accuracy.High;

      try {
        fgSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,   // 4s — smooth UI without hammering GPS
            distanceInterval: 10, // or every 10m
          },
          async (loc) => {
            const { latitude, longitude, heading, speed } = loc.coords;
            const now = Date.now();

            // Update map marker immediately
            setDriverLocation({ latitude, longitude, heading: heading ?? 0, speed: speed ?? 0 });

            // Battery-aware accuracy: switch accuracy tier based on speed
            const desiredAccuracy = getAccuracyForSpeed(speed);
            if (desiredAccuracy !== lastAccuracy && bgTrackingActiveRef.current) {
              lastAccuracy = desiredAccuracy;
              console.log('[NAVIGATION] Switching accuracy to:', desiredAccuracy === Location.Accuracy.High ? 'High' : 'Balanced');
              // Restart background task with new accuracy (fire-and-forget)
              Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
                .then(() => Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                  accuracy: desiredAccuracy,
                  ...BG_LOCATION_CONFIG,
                }))
                .catch(e => console.warn('[NAVIGATION] Accuracy switch failed:', e));
            }

            // Foreground Firestore write throttled to match bg task interval
            if (now - lastWriteTime >= 10000) {
              lastWriteTime = now;
              const nowIso = new Date().toISOString();
              try {
                const rideRef = doc(db, 'rides', ride.id);
                await updateDoc(rideRef, {
                  currentLocation: { latitude, longitude, updatedAt: nowIso },
                  liveLocation: {
                    latitude, longitude,
                    heading: heading ?? 0,
                    speed: speed ?? 0,
                    updatedAt: nowIso,
                  },
                });
                // Cache timestamp for signal indicator
                await AsyncStorage.setItem(BG_TASK_LAST_UPDATE_KEY, nowIso);
              } catch (fsErr) {
                console.warn('[NAVIGATION] Foreground Firestore write failed:', fsErr);
              }

              // Geofence check on each throttled write
              try {
                const compResult = await GeofenceEngine.checkAndTriggerCompletion(
                  ride.id,
                  { latitude, longitude },
                  'carpool'
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

      // ── Step 7: Signal strength polling interval (for HUD badge) ───────────
      signalIntervalRef.current = setInterval(async () => {
        try {
          const lastUpdateStr = await AsyncStorage.getItem(BG_TASK_LAST_UPDATE_KEY);
          if (!lastUpdateStr) {
            setSignalStatus('offline');
            return;
          }
          const ageMs = Date.now() - new Date(lastUpdateStr).getTime();
          if (ageMs < SIGNAL_LIVE_MS)       setSignalStatus('live');
          else if (ageMs < SIGNAL_WEAK_MS)  setSignalStatus('weak');
          else                              setSignalStatus('offline');
        } catch {
          setSignalStatus('offline');
        }
      }, 5000);
    };

    startTracking();

    return () => {
      // Cleanup when navigating away — stop foreground sub but keep BG task alive
      // BG task stops automatically via the ride status onSnapshot listener below
      if (fgSubRef.current) {
        fgSubRef.current.remove();
        fgSubRef.current = null;
      }
      if (signalIntervalRef.current) {
        clearInterval(signalIntervalRef.current);
        signalIntervalRef.current = null;
      }
    };
  }, [ride?.id, ride?.status, isDriver, stopBackgroundTracking]);

  // ─── Auto-stop tracking when ride ends (from onSnapshot) ──────────────────
  useEffect(() => {
    if (!ride) return;
    if ((ride.status === 'completed' || ride.status === 'cancelled') && bgTrackingActiveRef.current) {
      console.log('[NAVIGATION] Ride ended — stopping background tracking');
      stopBackgroundTracking();
    }
  }, [ride?.status, stopBackgroundTracking]);

  // Camera Auto-centering and rotation
  useEffect(() => {
    if (!driverLocation || !autoFollow || !mapRef.current) return;

    mapRef.current.animateCamera({
      center: {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
      },
      pitch: isDriver ? 45 : 0,
      heading: isDriver && driverLocation.heading ? driverLocation.heading : 0,
      zoom: isDriver ? 18 : 16,
    }, { duration: 1000 });
  }, [driverLocation, autoFollow, isDriver]);

  // 4. Periodically Fetch Route & ETA (every 2 minutes)
  const refreshRouteInfo = async (currentCoords: { latitude: number; longitude: number }) => {
    if (!ride) return;
    setRefreshingRoute(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyCIZ1Lccen5Ek7-0cXIU3Pxv5he7vhmZ6Y';
      
      const destination = {
        latitude: ride.dropLocation.latitude,
        longitude: ride.dropLocation.longitude,
      };

      const result = await fetchRoute(
        currentCoords,
        destination,
        apiKey,
        waypoints
      );

      if (result.success) {
        setRouteCoordinates(result.points);
        setRouteDistance(result.distance || 'N/A');
        setRouteDuration(result.duration || 'N/A');
      } else {
        // Fallback straight line
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

  // Run initial route fetch and set up 2-minute interval
  useEffect(() => {
    if (!ride) return;

    const startLoc = isDriver
      ? driverLocation || ride.pickupLocation
      : driverLocation || ride.currentLocation || ride.pickupLocation;

    if (startLoc) {
      refreshRouteInfo({ latitude: startLoc.latitude, longitude: startLoc.longitude });
    }

    const interval = setInterval(() => {
      const currentLoc = isDriver
        ? driverLocation
        : driverLocation || ride.currentLocation;
      if (currentLoc) {
        refreshRouteInfo({ latitude: currentLoc.latitude, longitude: currentLoc.longitude });
      }
    }, 120000); // 2 minutes

    return () => clearInterval(interval);
  }, [ride?.id, isDriver, waypoints.length]);

  // Handle local Directions Refresh manually on recenter
  const handleRecenter = () => {
    setAutoFollow(true);
    const loc = isDriver ? driverLocation : driverLocation || ride?.currentLocation;
    if (loc) {
      refreshRouteInfo({ latitude: loc.latitude, longitude: loc.longitude });
    }
  };

  // 5. Open in Google Maps Fallback
  const handleGoogleMapsFallback = () => {
    setMenuVisible(false);
    if (!ride) return;

    const destCoords = `${ride.dropLocation.latitude},${ride.dropLocation.longitude}`;
    const wps = waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join('|');
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destCoords)}&waypoints=${encodeURIComponent(wps)}&travelmode=driving`;

    Linking.openURL(navUrl).catch((err) => {
      Alert.alert('Error', 'Could not open external Google Maps.');
    });
  };

  // 6. Complete Ride
  const handleCompleteRide = async () => {
    if (!ride) return;
    try {
      await completeRide(ride.id);
      Alert.alert('Arrived!', 'You have completed the carpool!');
      router.replace('/(tabs)/my-bookings');
    } catch (err) {
      Alert.alert('Error', 'Failed to complete ride.');
    }
  };

  // 7. Group Chat Integration (Modal subscription)
  useEffect(() => {
    if (!rideId || !chatVisible) return;
    const unsub = subscribeToGroupMessages(rideId, (chatMessages) => {
      setMessages(chatMessages);
      setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => unsub();
  }, [rideId, chatVisible]);

  const handleSendMessage = async () => {
    if (!chatText.trim() || !auth.user || sendingMessage) return;
    setSendingMessage(true);
    try {
      await sendGroupMessage(
        rideId,
        auth.user.id,
        auth.user.fullName,
        auth.user.profileImage || '',
        chatText
      );
      setChatText('');
    } catch (err) {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  // 8. SOS Action Alerts
  const triggerSOSAlert = async () => {
    setSosVisible(false);
    if (!auth.user) return;
    try {
      const locStr = driverLocation
        ? ` Location: https://maps.google.com/?q=${driverLocation.latitude},${driverLocation.longitude}`
        : '';
      await sendGroupMessage(
        rideId,
        'system',
        'System',
        '',
        `🚨 EMERGENCY SOS from ${auth.user.fullName}! DISTRESS ALERT.${locStr}`,
        'system',
        { triggerUserId: auth.user.id }
      );
      Alert.alert('SOS Broadcasted', 'An emergency alert and location link have been sent to the group chat.');
    } catch (err) {
      Alert.alert('Error', 'Failed to send emergency alert.');
    }
  };

  const callEmergencyNumber = () => {
    setSosVisible(false);
    Linking.openURL('tel:112');
  };

  // ── Shared Location View Mode (from chat live-location bubble) ────────────
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
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={warmMapStyle}
          initialRegion={{
            latitude: sharedLatNum,
            longitude: sharedLngNum,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
        >
          <Marker coordinate={{ latitude: sharedLatNum, longitude: sharedLngNum }} title={senderName || 'Shared Location'}>
            <View style={[styles.carMarker, { backgroundColor: WARM_CORE.primary, width: 36, height: 36, borderRadius: 18 }]}>
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
        <Text style={styles.loaderText}>Initializing In-App Navigation...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} translucent={true} />

      {/* TOP HEADER HUD */}
      <View style={[styles.headerHUD, { top: insets.top + 10 }]}>
        <View style={styles.headerInfoRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerDestination} numberOfLines={1}>
              {ride.dropLocation.address.split(',')[0]}
            </Text>
            <Text style={styles.headerRouteSub}>
              ETA: {routeDuration} · Remaining: {routeDistance}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
            <MaterialCommunityIcons name="dots-vertical" size={24} color={WARM_CORE.text} />
          </TouchableOpacity>
        </View>
        
        {refreshingRoute && (
          <View style={styles.refreshBadge}>
            <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginRight: 6 }} />
            <Text style={styles.refreshText}>Updating route...</Text>
          </View>
        )}

        {/* Signal Strength HUD — visible to driver while tracking */}
        {isDriver && signalStatus !== 'idle' && (
          <View style={[
            styles.signalBadge,
            signalStatus === 'live'    && styles.signalLive,
            signalStatus === 'weak'    && styles.signalWeak,
            signalStatus === 'offline' && styles.signalOffline,
          ]}>
            <View style={[
              styles.signalDot,
              signalStatus === 'live'    && { backgroundColor: '#16a34a' },
              signalStatus === 'weak'    && { backgroundColor: '#ca8a04' },
              signalStatus === 'offline' && { backgroundColor: '#dc2626' },
            ]} />
            <Text style={styles.signalText}>
              {signalStatus === 'live'    && '🟢 LIVE'}
              {signalStatus === 'weak'    && '🟡 WEAK SIGNAL'}
              {signalStatus === 'offline' && '🔴 LOCATION OFFLINE'}
            </Text>
          </View>
        )}
      </View>

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
        {/* Route Polyline */}
        {routeCoordinates.length > 1 && (
          <>
            <Polyline coordinates={routeCoordinates} strokeColor={WARM_CORE.border} strokeWidth={6} />
            <Polyline coordinates={routeCoordinates} strokeColor={WARM_CORE.primary} strokeWidth={4} />
          </>
        )}

        {/* Origin Marker */}
        <Marker coordinate={ride.pickupLocation} title="Origin">
          <View style={styles.originMarker} />
        </Marker>

        {/* Destination Marker */}
        <Marker coordinate={ride.dropLocation} title="Destination">
          <View style={styles.destMarker}>
            <MaterialCommunityIcons name="flag-checkered" size={16} color={WARM_CORE.white} />
          </View>
        </Marker>

        {/* Intermediate Passenger Waypoints */}
        {waypoints.map((wp, idx) => (
          <Marker key={`wp-${idx}`} coordinate={wp} title={`Passenger Stop`}>
            <View style={styles.waypointMarker}>
              <MaterialCommunityIcons name="account" size={12} color={WARM_CORE.white} />
            </View>
          </Marker>
        ))}

        {/* Active Driver / Vehicle Marker */}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            rotation={driverLocation.heading}
            title={ride.driverName}
            description={isDriver ? "You" : "Driver"}
          >
            <View style={styles.carMarker}>
              <MaterialCommunityIcons name="navigation" size={24} color={WARM_CORE.primary} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* FLOATING ACTION BUTTONS */}
      <View style={styles.floatingContainer}>
        {/* Recenter */}
        {!autoFollow && (
          <TouchableOpacity onPress={handleRecenter} style={styles.floatingButton}>
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={WARM_CORE.primary} />
          </TouchableOpacity>
        )}

        {/* Mute GUIDANCE */}
        <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.floatingButton}>
          <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={22} color={WARM_CORE.textSecondary} />
        </TouchableOpacity>

        {/* EMERGENCY SOS */}
        <TouchableOpacity onPress={() => setSosVisible(true)} style={[styles.floatingButton, styles.sosButton]}>
          <MaterialCommunityIcons name="alert-octagon" size={24} color={WARM_CORE.white} />
        </TouchableOpacity>

        {/* GROUP CHAT */}
        <TouchableOpacity onPress={() => setChatVisible(true)} style={[styles.floatingButton, styles.chatButton]}>
          <MaterialCommunityIcons name="chat-processing-outline" size={22} color={WARM_CORE.white} />
        </TouchableOpacity>
      </View>

      {/* RIDE PROGRESS SUMMARY CARD */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStatusBadge}>
            <Text style={styles.summaryStatusText}>
              {ride.status === 'in_progress' ? 'IN TRANSIT' : ride.status.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.summaryEtaText}>{routeDuration} ({routeDistance})</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.routeDetails}>
          <View style={styles.routeDotLine}>
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.success }]} />
            <View style={styles.routeLine} />
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.primary }]} />
          </View>
          <View style={styles.routeTextContainer}>
            <Text style={styles.routeText} numberOfLines={1}>Origin: {ride.pickupLocation.address}</Text>
            <Text style={[styles.routeText, { marginTop: 12 }]} numberOfLines={1}>Destination: {ride.dropLocation.address}</Text>
          </View>
        </View>

        {/* PROGRESS TIMELINE */}
        <View style={styles.timelineContainer}>
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isActive = idx === currentStageIndex;
            const color = isCompleted ? '#10B981' : isActive ? WARM_CORE.primary : '#6B7280';
            
            return (
              <React.Fragment key={stage.label}>
                <View style={styles.timelineStep}>
                  <View style={[styles.timelineDot, { backgroundColor: color, shadowColor: color, elevation: isActive ? 4 : 0 }]}>
                    <MaterialCommunityIcons name={stage.icon as any} size={12} color="#FFF" />
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

        {isDriver && (
          <TouchableOpacity onPress={handleCompleteRide} style={styles.actionCTA}>
            <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
            <Text style={styles.actionCTAText}>Complete Ride</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* BACKGROUND PERMISSION EXPLANATION MODAL */}
      <Modal visible={bgPermModalVisible} animationType="slide" transparent={true} onRequestClose={() => setBgPermModalVisible(false)}>
        <View style={styles.bgPermOverlay}>
          <View style={styles.bgPermContainer}>
            <MaterialCommunityIcons name="map-marker-path" size={48} color={WARM_CORE.primary} />
            <Text style={styles.bgPermTitle}>Enable Background Location</Text>
            <Text style={styles.bgPermBody}>
              {'For passengers to see your location when your screen is locked or you switch apps, PullUp needs '}
              <Text style={{ fontWeight: '700' }}>{"\"Allow all the time\""}</Text>
              {' location access.\n\nGo to:\nSettings \u2192 Apps \u2192 PullUp \u2192 Permissions \u2192 Location \u2192 Allow all the time'}
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

      {/* OPTIONS MENU MODAL */}
      <Modal visible={menuVisible} animationType="fade" transparent={true} onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Navigation Options</Text>
            <TouchableOpacity onPress={handleGoogleMapsFallback} style={styles.menuItem}>
              <MaterialCommunityIcons name="google-maps" size={22} color={WARM_CORE.primary} />
              <Text style={styles.menuItemText}>Open in Google Maps (External)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.menuCancel}>
              <Text style={styles.menuCancelText}>Close Menu</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* SOS EMERGENCY ACTION MODAL */}
      <Modal visible={sosVisible} animationType="fade" transparent={true} onRequestClose={() => setSosVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSosVisible(false)}>
          <View style={styles.sosContainer}>
            <MaterialCommunityIcons name="alert-decagram" size={48} color={WARM_CORE.error} />
            <Text style={styles.sosTitle}>Emergency SOS Actions</Text>
            <Text style={styles.sosDescription}>
              Triggering SOS alerts provides options to call state medical/police services or broadcast coordinates to your ride group chat.
            </Text>

            <TouchableOpacity onPress={callEmergencyNumber} style={[styles.sosBtn, { backgroundColor: WARM_CORE.error }]}>
              <MaterialCommunityIcons name="phone" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Call Emergency (112)</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={triggerSOSAlert} style={[styles.sosBtn, { backgroundColor: WARM_CORE.primary }]}>
              <MaterialCommunityIcons name="chat-alert-outline" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Share Location & Alert Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSosVisible(false)} style={styles.sosClose}>
              <Text style={styles.sosCloseText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GROUP CHAT MODAL OVERLAY */}
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

              if (isSys) {
                return (
                  <View style={styles.systemMsgContainer}>
                    <Text style={styles.systemMsgText}>{item.text}</Text>
                  </View>
                );
              }

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
                placeholder="Type a message to the group..."
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
    </SafeAreaView>
  );
}

// Custom map styling
const warmMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#FFF8F0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E5650' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFF8F0' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F4E9D9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E8DCCB' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#1E120D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D4E8FC' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6E5650' }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WARM_CORE.background,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  headerHUD: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255, 248, 240, 0.95)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  headerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerDestination: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  headerRouteSub: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  menuButton: {
    padding: 6,
  },
  refreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    paddingTop: 6,
  },
  refreshText: {
    fontSize: 11,
    color: WARM_CORE.primary,
    fontWeight: '600',
  },
  originMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: WARM_CORE.success,
    borderWidth: 2,
    borderColor: WARM_CORE.white,
  },
  destMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carMarker: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingContainer: {
    position: 'absolute',
    right: 16,
    bottom: 250,
    zIndex: 5,
    gap: 12,
  },
  floatingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  sosButton: {
    backgroundColor: WARM_CORE.error,
    borderColor: WARM_CORE.error,
  },
  chatButton: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
  },
  summaryCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    backgroundColor: WARM_CORE.background,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryStatusBadge: {
    backgroundColor: 'rgba(255, 122, 51, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  summaryStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.primary,
    letterSpacing: 1,
  },
  summaryEtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  divider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginVertical: 12,
  },
  routeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  routeDotLine: {
    alignItems: 'center',
    marginRight: 12,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeLine: {
    width: 2,
    height: 18,
    backgroundColor: WARM_CORE.border,
    marginVertical: 2,
  },
  routeTextContainer: {
    flex: 1,
  },
  routeText: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  },
  actionCTA: {
    backgroundColor: WARM_CORE.success,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCTAText: {
    color: WARM_CORE.white,
    fontWeight: '700',
    fontSize: 14,
  },
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  timelineStep: {
    alignItems: 'center',
    width: 50,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  timelineLink: {
    height: 2,
    flex: 1,
    alignSelf: 'center',
    marginTop: -14, // align with center of the dots
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 18, 13, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuContainer: {
    width: '100%',
    backgroundColor: WARM_CORE.background,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 16,
  },
  menuItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: WARM_CORE.card,
    marginBottom: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: WARM_CORE.text,
    fontWeight: '600',
    marginLeft: 10,
  },
  menuCancel: {
    paddingVertical: 12,
  },
  menuCancelText: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    fontWeight: '700',
  },
  sosContainer: {
    width: '100%',
    backgroundColor: WARM_CORE.background,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  sosTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.error,
    marginTop: 10,
    marginBottom: 6,
  },
  sosDescription: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  sosBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  sosBtnText: {
    color: WARM_CORE.white,
    fontWeight: '700',
    fontSize: 14,
  },
  sosClose: {
    paddingVertical: 10,
  },
  sosCloseText: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    fontWeight: '700',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  chatCloseBtn: {
    padding: 8,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  chatFeed: {
    padding: 16,
  },
  systemMsgContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  systemMsgText: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '80%',
  },
  msgLeft: {
    alignSelf: 'flex-start',
  },
  msgRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  chatAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  msgBubbleContainer: {
    flexDirection: 'column',
  },
  msgSenderName: {
    fontSize: 10,
    color: WARM_CORE.textSecondary,
    marginBottom: 2,
    marginLeft: 4,
  },
  msgBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: WARM_CORE.primary,
    borderTopRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: WARM_CORE.card,
    borderTopLeftRadius: 2,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 18,
  },
  textMe: {
    color: WARM_CORE.white,
  },
  textOther: {
    color: WARM_CORE.text,
  },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 16,
    color: WARM_CORE.text,
    fontSize: 14,
    marginRight: 10,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Signal Strength HUD ─────────────────────────────────────────────────
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  signalLive: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  signalWeak: {
    backgroundColor: '#fef9c3',
    borderWidth: 1,
    borderColor: '#fde047',
  },
  signalOffline: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.3,
  },

  // ─── Background Permission Modal ──────────────────────────────────────────
  bgPermOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  bgPermContainer: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  bgPermTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
  },
  bgPermBody: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  bgPermCTA: {
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  bgPermCTAText: {
    color: WARM_CORE.white,
    fontWeight: '700',
    fontSize: 15,
  },
  bgPermDismiss: {
    paddingVertical: 10,
  },
  bgPermDismissText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
  },
});
