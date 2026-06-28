import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import UserAvatar from '@/components/UserAvatar';
import { ATLAS_LOCATION, calculateDistance } from '@/utils/atlasLocationUtils';
import * as Location from 'expo-location';
import { fetchRoute } from '@/utils/routeUtils';
import {
  subscribeToPoolDetails,
  subscribeToPoolMembers,
  subscribeToPoolRequests,
  subscribeToPassengerRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  cancelTaxiPool,
  createJoinRequest,
  TaxiPool,
  PoolRequest,
  PoolMember
} from '@/utils/taxiPoolService';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';

// Custom Map style (reused from ride-details.tsx)
const warmMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#FFF8F0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E5650' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFF8F0' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#F4E9D9' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#1E120D' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#E8DCCB' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#FFE0CC' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#A33A08' }] }
];

// Real-time Pool Creator Row Component
function TaxiPoolCreatorRow({ creatorId, defaultName, defaultCourse, defaultDivision, defaultImage }: {
  creatorId: string;
  defaultName: string;
  defaultCourse: string;
  defaultDivision: string;
  defaultImage?: string | null;
}) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!creatorId) return;
    const userRef = doc(db, 'users', creatorId);
    const unsub = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      },
      (error) => {
        console.error('[REALTIME PROFILE] Error fetching pool creator profile:', creatorId, error);
      }
    );
    return () => unsub();
  }, [creatorId]);

  const displayName = profile?.fullName || defaultName || 'Creator';
  const displayCourse = profile?.course || defaultCourse || 'N/A';
  const displayDivision = profile?.division || defaultDivision || 'N/A';
  const displayImage = profile?.profileImage || defaultImage;

  return (
    <View style={styles.personRow}>
      <UserAvatar userId={creatorId} imageUrl={displayImage} name={displayName} size={44} />
      <View style={styles.personDetails}>
        <Text style={styles.personName}>{displayName}</Text>
        <Text style={styles.personSub}>{displayCourse} • Division {displayDivision}</Text>
      </View>
    </View>
  );
}

// Real-time Pool Member Row Component
function TaxiPoolMemberRow({ member, creatorId }: { member: PoolMember; creatorId: string }) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!member.passengerId) return;
    const userRef = doc(db, 'users', member.passengerId);
    const unsub = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      },
      (error) => {
        console.error('[REALTIME PROFILE] Error fetching pool member profile:', member.passengerId, error);
      }
    );
    return () => unsub();
  }, [member.passengerId]);

  const displayName = profile?.fullName || member.passengerName || 'Member';
  const displayCourse = profile?.course || member.passengerCourse || 'N/A';
  const displayDivision = profile?.division || member.passengerDivision || 'N/A';
  const displayImage = profile?.profileImage || member.passengerImage;

  return (
    <View style={styles.memberRow}>
      <UserAvatar userId={member.passengerId} imageUrl={displayImage} name={displayName} size={32} />
      <View style={styles.memberDetails}>
        <Text style={styles.memberName}>
          {displayName} {member.passengerId === creatorId ? '(Admin)' : ''}
        </Text>
        <Text style={styles.memberSub}>{displayCourse} • Div {displayDivision}</Text>
      </View>
    </View>
  );
}

// Real-time Pool Join Request Row Component
function TaxiPoolRequestRow({
  req,
  actionLoading,
  handleRejectRequest,
  handleAcceptRequest,
}: {
  req: PoolRequest;
  actionLoading: string | null;
  handleRejectRequest: (requestId: string, passengerId: string) => Promise<void>;
  handleAcceptRequest: (requestId: string, passenger: any) => Promise<void>;
}) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!req.passengerId) return;
    const userRef = doc(db, 'users', req.passengerId);
    const unsub = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      },
      (error) => {
        console.error('[REALTIME PROFILE] Error fetching request passenger profile:', req.passengerId, error);
      }
    );
    return () => unsub();
  }, [req.passengerId]);

  const displayName = profile?.fullName || req.passengerName || 'Passenger';
  const displayCourse = profile?.course || req.passengerCourse || 'N/A';
  const displayDivision = profile?.division || req.passengerDivision || 'N/A';
  const displayImage = profile?.profileImage || req.passengerImage;

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestProfile}>
        <UserAvatar userId={req.passengerId} imageUrl={displayImage} name={displayName} size={32} />
        <View style={styles.requestMeta}>
          <Text style={styles.reqName}>{displayName}</Text>
          <Text style={styles.reqSub}>{displayCourse} • Div {displayDivision}</Text>
        </View>
      </View>
      
      <View style={styles.requestActions}>
        {actionLoading === req.id ? (
          <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ paddingHorizontal: 24 }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => handleRejectRequest(req.id, req.passengerId)}
              activeOpacity={0.8}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleAcceptRequest(req.id, {
                id: req.passengerId,
                fullName: displayName,
                profileImage: displayImage || null,
                course: displayCourse,
                division: displayDivision
              })}
              activeOpacity={0.8}
            >
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export default function TaxiPoolDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { auth } = useAppContext();
  const poolId = typeof params.poolId === 'string' ? params.poolId : '';

  const [pool, setPool] = useState<TaxiPool | null>(null);
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [requests, setRequests] = useState<PoolRequest[]>([]);
  const [userRequests, setUserRequests] = useState<PoolRequest[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // tracks loading per action button
  const [isJoinLoading, setIsJoinLoading] = useState(false);

  const mapRef = useRef<MapView>(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const hudTranslateY = useRef(new Animated.Value(-150)).current;
  const insets = useSafeAreaInsets();

  const navigationStops = useMemo(() => {
    if (!pool) return [];
    return [{
      type: 'final' as const,
      latitude: pool.destination.latitude,
      longitude: pool.destination.longitude,
      address: pool.destination.address || 'Atlas Hub',
      label: 'Go to Atlas Hub',
    }];
  }, [pool]);

  useEffect(() => {
    if (pool?.status === 'in_progress') {
      Animated.spring(hudTranslateY, {
        toValue: 0,
        damping: 15,
        stiffness: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(hudTranslateY, {
        toValue: -150,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [pool?.status]);

  // Driver GPS Foreground location watcher to tilt/rotate camera
  useEffect(() => {
    const isCreator = pool?.creatorId === auth.user?.id;
    if (!pool || pool.status !== 'in_progress' || !isCreator) return;

    let sub: Location.LocationSubscription | null = null;

    const startLocWatch = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      try {
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,
            distanceInterval: 2,
          },
          (loc) => {
            const { latitude, longitude, heading } = loc.coords;
            if (heading !== null && heading !== undefined) {
              setDriverHeading(heading);
            }
            if (mapRef.current) {
              mapRef.current.animateCamera({
                center: { latitude, longitude },
                pitch: 45,
                heading: heading || 0,
                zoom: 18,
              }, { duration: 800 });
            }
          }
        );
      } catch (err) {
        console.warn('Error starting taxi navigation map tracking:', err);
      }
    };

    startLocWatch();

    return () => {
      if (sub) sub.remove();
    };
  }, [pool?.status, pool?.creatorId, auth.user?.id]);

  // Passenger live GPS tracker centering camera on creator currentLocation
  useEffect(() => {
    const isCreator = pool?.creatorId === auth.user?.id;
    if (!pool || pool.status !== 'in_progress' || isCreator || !pool.currentLocation) return;

    const { latitude, longitude } = pool.currentLocation;
    if (mapRef.current) {
      mapRef.current.animateCamera({
        center: { latitude, longitude },
        zoom: 16,
      }, { duration: 1000 });
    }
  }, [pool?.currentLocation, pool?.status, pool?.creatorId, auth.user?.id]);
  const infoSlideY = useRef(new Animated.Value(30)).current;
  const infoOpacity = useRef(new Animated.Value(0)).current;
  const taxiPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(taxiPulseAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [taxiPulseAnim]);

  // Stagger entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(infoOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(infoSlideY, {
        toValue: 0,
        damping: 18,
        stiffness: 160,
        mass: 1,
        useNativeDriver: true,
      })
    ]).start();
  }, [pool]);

  // Subscribe to Firestore updates in real-time
  useEffect(() => {
    if (!poolId || !auth.user) return;

    console.log('[POOL DETAILS] Subscribing to pool:', poolId);
    const unsubDetails = subscribeToPoolDetails(poolId, (updatedPool) => {
      setPool(updatedPool);
    });

    const unsubMembers = subscribeToPoolMembers(poolId, (updatedMembers) => {
      setMembers(updatedMembers);
    });

    const unsubUserRequests = subscribeToPassengerRequests(auth.user.id, (updatedUserReqs) => {
      setUserRequests(updatedUserReqs);
    });

    return () => {
      unsubDetails();
      unsubMembers();
      unsubUserRequests();
    };
  }, [poolId, auth.user]);

  // Subscribe to pending requests ONLY if current user is the pool creator
  useEffect(() => {
    if (!poolId || !pool || !auth.user || pool.creatorId !== auth.user.id) return;

    console.log('[POOL DETAILS] Creator detected, subscribing to requests list...');
    const unsubRequests = subscribeToPoolRequests(poolId, (updatedRequests) => {
      setRequests(updatedRequests);
    });

    return () => {
      unsubRequests();
    };
  }, [poolId, pool, auth.user]);

  // Fetch route and fit map bounds
  useEffect(() => {
    if (!pool) return;

    const loadRoute = async () => {
      setIsLoadingRoute(true);
      try {
        // We always draw route between Atlas hub and the destination chosen
        const result = await fetchRoute(
          ATLAS_LOCATION,
          pool.destination,
          'AIzaSyCIZ1Lccen5Ek7-0cXIU3Pxv5he7vhmZ6Y'
        );
        setRouteCoordinates(result.points);

        if (mapRef.current && typeof (mapRef.current as any).fitToCoordinates === 'function' && result.points && result.points.length > 1) {
          setTimeout(() => {
            try {
              (mapRef.current as any)?.fitToCoordinates(result.points, {
                edgePadding: { top: 100, right: 50, bottom: 280, left: 50 },
                animated: true,
              });
            } catch (err) {
              console.warn('[POOL DETAILS] Error fitting coordinates:', err);
            }
          }, 400);
        }
      } catch (err) {
        console.warn('[POOL DETAILS] Failed to fetch route coordinates:', err);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    loadRoute();
  }, [pool]);

  // Start location watching for creator if pool is in_progress
  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    const isUserCreator = pool?.creatorId === auth.user?.id;

    if (isUserCreator && pool?.status === 'in_progress') {
      console.log('[POOL DETAILS] Creator watching location for in-progress pool...');
      const startWatching = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Foreground location permission is required for live tracking.');
          return;
        }

        try {
          watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            async (loc) => {
              const { latitude, longitude } = loc.coords;
              console.log('[POOL DETAILS] Watch position update:', latitude, longitude);
              
              // Update pool document in Firestore
              const poolRef = doc(db, 'taxiPools', pool.id);
              await updateDoc(poolRef, {
                currentLocation: {
                  latitude,
                  longitude,
                  updatedAt: new Date().toISOString(),
                },
              });

              // Check distance to destination
              const distanceToDest = calculateDistance(
                latitude,
                longitude,
                pool.destination.latitude,
                pool.destination.longitude
              );
              
              // Also check distance to Atlas SkillTech University (college) if destination is college
              const distanceToAtlas = calculateDistance(
                latitude,
                longitude,
                ATLAS_LOCATION.latitude,
                ATLAS_LOCATION.longitude
              );

              // Auto-complete if creator is within 2 km of destination or ATLAS_LOCATION
              if (distanceToDest <= 2.0 || distanceToAtlas <= 2.0) {
                console.log('[POOL DETAILS] Creator within 2km geofence. Completing Taxi Pool.');
                try {
                  const { completeTaxiPoolRide } = require('@/utils/taxiPoolService');
                  await completeTaxiPoolRide(pool.id);
                  Alert.alert('Arrived!', 'You have arrived within 2km of your destination. Taxi Pool ride completed!');
                } catch (completeErr) {
                  console.error('[POOL DETAILS] Auto-complete failed:', completeErr);
                }
              }
            }
          );
        } catch (err) {
          console.error('[POOL DETAILS] Location watching error:', err);
        }
      };

      startWatching();
    }

    return () => {
      if (watcher) {
        console.log('[POOL DETAILS] Cleaning up creator location watcher.');
        watcher.remove();
      }
    };
  }, [pool?.creatorId, auth.user?.id, pool?.id, pool?.status]);

  if (!pool) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={WARM_CORE.primary} />
        <Text style={styles.loadingText}>Loading pool details...</Text>
      </SafeAreaView>
    );
  }

  const isCreator = pool.creatorId === auth.user?.id;
  const userRequest = userRequests.find((r) => r.poolId === pool.id);
  const requestStatus = isCreator ? 'accepted' : (userRequest?.status || 'idle');

  const handleJoinRequest = async () => {
    if (!auth.user) return;
    setIsJoinLoading(true);
    try {
      await createJoinRequest(
        pool.id,
        {
          id: auth.user.id,
          fullName: auth.user.fullName,
          profileImage: auth.user.profileImage || undefined,
          course: auth.user.course || 'BBA',
          division: auth.user.division || 'A',
        },
        pool.creatorId
      );
      Alert.alert('Success', 'Your request to join the Taxi Pool has been submitted!');
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Failed to submit request.');
    } finally {
      setIsJoinLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string, passenger: any) => {
    setActionLoading(requestId);
    try {
      await acceptJoinRequest(requestId, pool.id, passenger);
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Could not approve passenger.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectRequest = async (requestId: string, passengerId: string) => {
    setActionLoading(requestId);
    try {
      await rejectJoinRequest(requestId, passengerId, pool.id);
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Could not decline passenger.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTaxiPool = async () => {
    try {
      const { startTaxiPoolRide } = require('@/utils/taxiPoolService');
      await startTaxiPoolRide(pool.id);
      Alert.alert('Ride Started', 'You have started the taxi pool ride! Live tracking is now active.');
    } catch (err) {
      Alert.alert('Error', 'Failed to start Taxi Pool ride.');
    }
  };

  const handleCompleteTaxiPool = async () => {
    try {
      const { completeTaxiPoolRide } = require('@/utils/taxiPoolService');
      await completeTaxiPoolRide(pool.id);
      Alert.alert('Ride Completed', 'You have finished the taxi pool ride!');
    } catch (err) {
      Alert.alert('Error', 'Failed to complete Taxi Pool ride.');
    }
  };

  const handleCancelPool = () => {
    Alert.alert(
      'Cancel Taxi Pool',
      'Are you sure you want to cancel this pool? This action cannot be undone and all members will be notified.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              if (auth.user) {
                await cancelTaxiPool(pool.id, auth.user.id);
                router.replace('/(tabs)/home');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to cancel Taxi Pool.');
            }
          },
        },
      ]
    );
  };

  const formattedTime = new Date(pool.departureTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const formattedDate = new Date(pool.departureTime).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {pool && pool.status === 'in_progress' && (
        <Animated.View
          style={[
            styles.navHudContainer,
            {
              transform: [{ translateY: hudTranslateY }],
              top: insets.top + 10,
            },
          ]}
        >
          <View style={styles.navHudCard}>
            <View style={styles.navHudRow}>
              <View style={styles.navHudIconBox}>
                <MaterialCommunityIcons
                  name="flag-checkered"
                  size={28}
                  color={WARM_CORE.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.navHudNext}>
                  {pool.creatorId === auth.user?.id ? 'ROUTE TARGET' : 'LIVE TRACKING'}
                </Text>
                <Text style={styles.navHudLabel} numberOfLines={2}>
                  {navigationStops[0]?.label || 'Heading to Atlas Hub'}
                </Text>
                <Text style={styles.navHudAddress} numberOfLines={1}>
                  {navigationStops[0]?.address || 'Atlas Hub'}
                </Text>
              </View>
            </View>

            {/* Actions for host / driver */}
            {pool.creatorId === auth.user?.id ? (
              <TouchableOpacity
                style={[styles.navHudConfirmButton, { marginTop: 12 }]}
                onPress={handleCompleteTaxiPool}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                <Text style={styles.navHudConfirmText}>
                  Finish Taxi Pool
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.passengerStatusRow, { marginTop: 12 }]}>
                <View style={styles.passengerStatusIndicator} />
                <Text style={styles.passengerStatusText}>
                  Live tracking active: heading to Atlas Hub
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Google Maps View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={warmMapStyle}
          initialRegion={{
            latitude: (ATLAS_LOCATION.latitude + pool.destination.latitude) / 2,
            longitude: (ATLAS_LOCATION.longitude + pool.destination.longitude) / 2,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }}
          rotateEnabled={pool.status === 'in_progress'}
          pitchEnabled={pool.status === 'in_progress'}
        >
          {/* Atlas Marker */}
          <Marker
            coordinate={{ latitude: ATLAS_LOCATION.latitude, longitude: ATLAS_LOCATION.longitude }}
            title="Atlas SkillTech University"
            description="University Hub"
          >
            <View style={styles.hubMarker}>
              <MaterialCommunityIcons name="school" size={16} color={WARM_CORE.white} />
            </View>
          </Marker>

          {/* Destination Marker */}
          <Marker
            coordinate={{ latitude: pool.destination.latitude, longitude: pool.destination.longitude }}
            title="Destination"
            description={pool.destination.address}
          >
            <View style={styles.destMarker}>
              <MaterialCommunityIcons name="flag-checkered" size={16} color={WARM_CORE.white} />
            </View>
          </Marker>

          {/* Polyline path */}
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={WARM_CORE.primary}
              strokeWidth={4}
            />
          )}

          {/* Live tracking Taxi Marker */}
          {pool.status === 'in_progress' && pool.currentLocation && (
            <Marker
              coordinate={{
                latitude: pool.currentLocation.latitude,
                longitude: pool.currentLocation.longitude,
              }}
              title={`${pool.creatorName}'s Taxi`}
              description="Live Location"
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
            >
              <View style={styles.movingTaxiMarker}>
                <Animated.View
                  style={[
                    styles.movingTaxiPulse,
                    {
                      transform: [
                        {
                          scale: taxiPulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.8],
                          }),
                        },
                      ],
                      opacity: taxiPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 0],
                      }),
                    },
                  ]}
                />
                <View style={styles.movingTaxiInner}>
                  <MaterialCommunityIcons name="taxi" size={14} color={WARM_CORE.white} />
                </View>
              </View>
            </Marker>
          )}
        </MapView>

        {/* Back Button Floating on Map */}
        <TouchableOpacity
          style={styles.floatingBackButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
        </TouchableOpacity>
      </View>

      {/* Scrollable details panel */}
      <Animated.View
        style={[
          styles.detailsPanel,
          {
            opacity: infoOpacity,
            transform: [{ translateY: infoSlideY }],
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.dragIndicator} />

          {/* Destination & Departure info */}
          <View style={styles.headerSection}>
            <Text style={styles.destText}>{pool.destination.address}</Text>
            <View style={styles.timeBadgeRow}>
              <View style={styles.badge}>
                <MaterialCommunityIcons name="calendar" size={14} color={WARM_CORE.primary} />
                <Text style={styles.badgeText}>{formattedDate}</Text>
              </View>
              <View style={styles.badge}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={WARM_CORE.primary} />
                <Text style={styles.badgeText}>{formattedTime}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: pool.status === 'OPEN' ? 'rgba(16,185,129,0.12)' : 'rgba(217,119,6,0.12)' }]}>
                <Text style={[styles.badgeText, { color: pool.status === 'OPEN' ? WARM_CORE.success : '#D97706', fontWeight: '700' }]}>
                  {pool.status}
                </Text>
              </View>
            </View>
          </View>

          {pool.notes ? (
            <View style={styles.notesCard}>
              <MaterialCommunityIcons name="format-quote-open" size={20} color={WARM_CORE.primary} style={{ marginBottom: 4 }} />
              <Text style={styles.notesText}>{pool.notes}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* Creator Details */}
          <Text style={styles.sectionLabel}>Pool Creator</Text>
          <TaxiPoolCreatorRow
            creatorId={pool.creatorId}
            defaultName={pool.creatorName}
            defaultCourse={pool.creatorCourse}
            defaultDivision={pool.creatorDivision}
            defaultImage={pool.creatorImage}
          />

          <View style={styles.divider} />

          {/* Members List */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Accepted Members</Text>
            <Text style={styles.membersCount}>{pool.memberCount} / {pool.maxMembers}</Text>
          </View>
          
          {members.length > 0 ? (
            <View style={styles.membersList}>
              {members.map((member) => (
                <TaxiPoolMemberRow
                  key={member.id}
                  member={member}
                  creatorId={pool.creatorId}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyLabel}>No members added yet.</Text>
          )}

          {/* CREATOR SECTION: Incoming requests list */}
          {isCreator && pool.status === 'OPEN' && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Incoming Join Requests</Text>
              
              {requests.filter(r => r.status === 'requested').length > 0 ? (
                <View style={styles.requestsContainer}>
                  {requests.filter(r => r.status === 'requested').map((req) => (
                    <TaxiPoolRequestRow
                      key={req.id}
                      req={req}
                      actionLoading={actionLoading}
                      handleRejectRequest={handleRejectRequest}
                      handleAcceptRequest={handleAcceptRequest}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyLabel}>No pending requests.</Text>
              )}
            </>
          )}

          {/* BOTTOM CTAS */}
          <View style={{ marginTop: 24, marginBottom: 20 }}>
            {(isCreator || members.some(m => m.passengerId === auth.user?.id)) && (
              <TouchableOpacity
                style={[styles.joinButton, { marginBottom: 12 }]}
                onPress={() => router.push({ pathname: '/group-chat' as any, params: { rideId: pool.id, rideType: 'taxipool' } })}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="message-text" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                <Text style={styles.joinText}>Group Chat</Text>
              </TouchableOpacity>
            )}

            {isCreator ? (
              pool.status !== 'CANCELLED' && pool.status !== 'completed' && (
                <View style={{ gap: 12 }}>
                  {pool.status !== 'in_progress' ? (
                    <TouchableOpacity
                      style={[styles.joinButton, { backgroundColor: WARM_CORE.success }]}
                      onPress={handleStartTaxiPool}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="play" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.joinText}>Start Taxi Pool</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.joinButton, { backgroundColor: WARM_CORE.primary }]}
                      onPress={handleCompleteTaxiPool}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="check" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.joinText}>Finish Taxi Pool</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.cancelPoolButton}
                    onPress={handleCancelPool}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="cancel" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                    <Text style={styles.cancelPoolText}>Cancel Taxi Pool</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              requestStatus === 'idle' && pool.status === 'OPEN' && (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={handleJoinRequest}
                  disabled={isJoinLoading}
                  activeOpacity={0.85}
                >
                  {isJoinLoading ? (
                    <ActivityIndicator color={WARM_CORE.white} size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="plus" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.joinText}>Request to Join Pool</Text>
                    </>
                  )}
                </TouchableOpacity>
              )
            )}

            {/* Non-creator feedback badges */}
            {!isCreator && requestStatus === 'requested' && (
              <View style={[styles.statusFeedbackBox, { backgroundColor: WARM_CORE.card }]}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={WARM_CORE.textSecondary} />
                <Text style={[styles.statusFeedbackText, { color: WARM_CORE.text }]}>
                  Waiting for pool owner approval.
                </Text>
              </View>
            )}

            {!isCreator && requestStatus === 'rejected' && (
              <View style={[styles.statusFeedbackBox, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 0.5 }]}>
                <MaterialCommunityIcons name="close-circle-outline" size={20} color={WARM_CORE.error} />
                <Text style={[styles.statusFeedbackText, { color: WARM_CORE.error }]}>
                  Join Request Declined
                </Text>
              </View>
            )}

            {pool.status === 'completed' && (
              <View style={[styles.statusFeedbackBox, { backgroundColor: WARM_CORE.card, borderColor: WARM_CORE.success, borderWidth: 0.5 }]}>
                <MaterialCommunityIcons name="check-circle" size={20} color={WARM_CORE.success} />
                <Text style={[styles.statusFeedbackText, { color: WARM_CORE.success }]}>
                  Taxi Pool Completed
                </Text>
              </View>
            )}

            {pool.status === 'CANCELLED' && (
              <View style={[styles.statusFeedbackBox, { backgroundColor: WARM_CORE.card, borderColor: WARM_CORE.error, borderWidth: 0.5 }]}>
                <MaterialCommunityIcons name="close-circle" size={20} color={WARM_CORE.error} />
                <Text style={[styles.statusFeedbackText, { color: WARM_CORE.error }]}>
                  Taxi Pool Cancelled
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  mapContainer: {
    height: '42%',
    position: 'relative',
  } as ViewStyle,
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingBackButton: {
    position: 'absolute',
    top: 48,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  } as ViewStyle,
  hubMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  } as ViewStyle,
  destMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.accent,
    borderWidth: 2,
    borderColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  } as ViewStyle,
  detailsPanel: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
    overflow: 'hidden',
  } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 10,
  } as ViewStyle,
  dragIndicator: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WARM_CORE.border,
    alignSelf: 'center',
    marginBottom: 16,
  } as ViewStyle,
  headerSection: {
    marginBottom: 16,
  } as ViewStyle,
  destText: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    lineHeight: 28,
    marginBottom: 10,
  } as TextStyle,
  timeBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  } as ViewStyle,
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  } as ViewStyle,
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  notesCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  notesText: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    lineHeight: 18,
    fontStyle: 'italic',
  } as TextStyle,
  divider: {
    height: 0.5,
    backgroundColor: WARM_CORE.border,
    marginVertical: 16,
  } as ViewStyle,
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  } as TextStyle,
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  } as ViewStyle,
  membersCount: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  } as ViewStyle,
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.white,
  } as TextStyle,
  personDetails: {
    flex: 1,
  } as ViewStyle,
  personName: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  personSub: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  } as TextStyle,
  membersList: {
    gap: 12,
  } as ViewStyle,
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    padding: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  } as ViewStyle,
  avatarImgSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarTextSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  memberDetails: {
    flex: 1,
  } as ViewStyle,
  memberName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  memberSub: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  emptyLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    paddingVertical: 10,
  } as TextStyle,
  requestsContainer: {
    gap: 12,
  } as ViewStyle,
  requestCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    gap: 12,
  } as ViewStyle,
  requestProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  requestMeta: {
    flex: 1,
  } as ViewStyle,
  reqName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  reqSub: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: WARM_CORE.border,
    paddingTop: 12,
  } as ViewStyle,
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  } as ViewStyle,
  declineBtn: {
    backgroundColor: WARM_CORE.background,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  declineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  approveBtn: {
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  approveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  cancelPoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.error,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: WARM_CORE.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  } as ViewStyle,
  cancelPoolText: {
    fontSize: 14,
    fontWeight: '800',
    color: WARM_CORE.white,
  } as TextStyle,
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.primary,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,
  joinText: {
    fontSize: 14,
    fontWeight: '800',
    color: WARM_CORE.white,
  } as TextStyle,
  statusFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  statusFeedbackText: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
  movingTaxiMarker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  movingTaxiInner: {
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
  } as ViewStyle,
  movingTaxiPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WARM_CORE.accent,
    zIndex: 1,
  } as ViewStyle,
  navHudContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  navHudCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  navHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navHudIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navHudNext: {
    fontSize: 10,
    fontWeight: '800',
    color: WARM_CORE.primary,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  navHudLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    lineHeight: 20,
  },
  navHudAddress: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  },
  navHudConfirmButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navHudConfirmText: {
    color: WARM_CORE.white,
    fontSize: 13,
    fontWeight: '700',
  },
  passengerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
    paddingVertical: 6,
  },
  passengerStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WARM_CORE.success,
    marginRight: 6,
  },
  passengerStatusText: {
    color: WARM_CORE.success,
    fontSize: 12,
    fontWeight: '600',
  },
});
