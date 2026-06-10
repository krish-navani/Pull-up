import { useAppContext } from '@/context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { WARM_CORE } from '@/constants/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeToCreatorPools, subscribeToMemberPools, TaxiPool } from '@/utils/taxiPoolService';

type RideStatus = 'active' | 'in_progress' | 'completed' | 'cancelled';

const formatTime = (timeString: string) => {
  try {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return '';
  }
};

const getTimeRemaining = (departureTimeStr: string) => {
  try {
    const departureDate = new Date(departureTimeStr);
    const nowMs = new Date().getTime();
    const diffMs = departureDate.getTime() - nowMs;
    
    if (diffMs <= 0) return 'Ride starts soon';
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 24) {
      return `Starts in ${Math.floor(diffHours / 24)}d`;
    }
    if (diffHours > 0) {
      return `Starts in ${diffHours}h ${diffMins}m`;
    }
    return `Starts in ${diffMins}m`;
  } catch (e) {
    return 'Starts today';
  }
};

export default function DriverRidesScreen() {
  const router = useRouter();
  const { auth, rides, bookings, loadDriverRides, acceptBooking, rejectBooking, cancelRide, startRide, completeRide } = useAppContext();
  
  const [selectedStatus, setSelectedStatus] = useState<RideStatus>('active');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRideForDetails, setSelectedRideForDetails] = useState<string | null>(null);

  // Unified dashboard states
  const [activeTab, setActiveTab] = useState<'hosting' | 'riding'>('hosting');
  const [subTab, setSubTab] = useState<'car' | 'taxi'>('car');
  const [joinedTaxiPools, setJoinedTaxiPools] = useState<TaxiPool[]>([]);
  const [createdTaxiPools, setCreatedTaxiPools] = useState<TaxiPool[]>([]);

  // Entry animations
  const headerAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const contentAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(22) }).current;

  // Subscribe to taxi pools in real time
  useEffect(() => {
    if (!auth.user?.id) return;
    
    console.log('[DRIVER COMMUTES] Subscribing to member pools for:', auth.user.id);
    const unsubJoined = subscribeToMemberPools(auth.user.id, (pools) => {
      setJoinedTaxiPools(pools);
    });

    console.log('[DRIVER COMMUTES] Subscribing to creator pools for:', auth.user.id);
    const unsubCreated = subscribeToCreatorPools(auth.user.id, (pools) => {
      setCreatedTaxiPools(pools);
    });

    return () => {
      unsubJoined();
      unsubCreated();
    };
  }, [auth.user?.id]);

  // Stagger animation on mount
  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(headerAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(contentAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const fetchRides = useCallback(async (showIndicator = false) => {
    if (!auth.user) return;
    if (showIndicator) setIsLoading(true);
    try {
      await loadDriverRides(auth.user.id);
    } catch (e) {
      console.error('[DRIVER RIDES] Load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [auth.user, loadDriverRides]);

  // Load driver's rides on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchRides(true);
    }, [fetchRides])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRides(false);
    setIsRefreshing(false);
  };

  const handleRidePress = (rideId: string) => {
    setSelectedRideForDetails(rideId);
  };

  const closeRideDetails = () => {
    setSelectedRideForDetails(null);
  };

  const handleAcceptPassenger = async (passengerId: string) => {
    if (!selectedRideForDetails) return;
    try {
      await acceptBooking(selectedRideForDetails, passengerId);
    } catch (e) {
      console.error('[DRIVER RIDES] Accept passenger failed:', e);
    }
  };

  const handleRejectPassenger = async (passengerId: string) => {
    if (!selectedRideForDetails) return;
    try {
      await rejectBooking(selectedRideForDetails, passengerId);
    } catch (e) {
      console.error('[DRIVER RIDES] Reject passenger failed:', e);
    }
  };

  const handleCancelRide = async (rideId: string) => {
    try {
      await cancelRide(rideId);
      closeRideDetails();
    } catch (e) {
      console.error('[DRIVER RIDES] Cancel ride failed:', e);
    }
  };

  const handleStartRide = async (rideId: string) => {
    try {
      await startRide(rideId);
    } catch (e) {
      console.error('[DRIVER RIDES] Start ride failed:', e);
    }
  };

  const handleCompleteRide = async (rideId: string) => {
    try {
      await completeRide(rideId);
    } catch (e) {
      console.error('[DRIVER RIDES] Complete ride failed:', e);
    }
  };

  // Filter rides based on chosen tab status
  const filteredRides = rides
    .filter(ride => ride.driverId === auth.user?.id && ride.status === selectedStatus)
    .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

  const getDetailedRide = (rideId: string) => {
    return rides.find(r => r.id === rideId);
  };

  const getCurrentRidePassengers = (rideId: string) => {
    // Return all bookings associated with this ride
    return bookings.filter(b => b.rideId === rideId);
  };

  const getRideEarnings = (ride: any) => {
    const acceptedBookings = ride.bookedSeats.filter((bs: any) => bs.status === 'accepted').length;
    return acceptedBookings * ride.price;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Upcoming', color: WARM_CORE.primary, bgColor: 'rgba(212, 80, 10, 0.1)' };
      case 'in_progress':
        return { label: 'Ongoing', color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.1)' };
      case 'completed':
        return { label: 'Completed', color: WARM_CORE.success, bgColor: 'rgba(16, 185, 129, 0.1)' };
      case 'cancelled':
        return { label: 'Cancelled', color: WARM_CORE.error, bgColor: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { label: status, color: WARM_CORE.textSecondary, bgColor: WARM_CORE.border };
    }
  };

  const renderTaxiPoolCard = (pool: TaxiPool, isHosting: boolean) => {
    const seatsLeft = pool.maxMembers - pool.memberCount;
    const depTime = new Date(pool.departureTime);
    
    // Status colors
    let statusBg = 'rgba(16, 185, 129, 0.1)';
    let statusText = '#10B981';
    if (pool.status === 'FULL') {
      statusBg = 'rgba(245, 158, 11, 0.1)';
      statusText = '#F59E0B';
    } else if (pool.status === 'CANCELLED') {
      statusBg = 'rgba(239, 68, 68, 0.1)';
      statusText = '#EF4444';
    } else if (pool.status === 'CLOSED') {
      statusBg = 'rgba(107, 114, 128, 0.1)';
      statusText = '#6B7280';
    }

    return (
      <TouchableOpacity
        key={pool.id}
        style={styles.taxiPoolCard}
        onPress={() => router.push({ pathname: '/taxi-pool-details', params: { poolId: pool.id } } as any)}
        activeOpacity={0.85}
      >
        <View style={styles.taxiCardHeader}>
          <View style={styles.taxiCardHeaderLeft}>
            <View style={styles.taxiIconContainer}>
              <MaterialCommunityIcons name="taxi" size={20} color={WARM_CORE.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.taxiDestText} numberOfLines={1}>
                To {pool.destination.address.split(',')[0]}
              </Text>
              <Text style={styles.taxiTimeText}>
                {depTime.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {depTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
          
          <View style={[styles.taxiStatusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.taxiStatusText, { color: statusText }]}>
              {pool.status}
            </Text>
          </View>
        </View>

        <View style={styles.taxiCardBottom}>
          <View style={styles.taxiCardInfoGroup}>
            <View style={styles.taxiStatItem}>
              <MaterialCommunityIcons name="account-group-outline" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.taxiStatText}>{pool.memberCount}/{pool.maxMembers} members</Text>
            </View>
            <Text style={styles.taxiDotSeparator}>•</Text>
            <View style={styles.taxiStatItem}>
              <MaterialCommunityIcons name="account-multiple-plus" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.taxiStatText}>{seatsLeft} seats left</Text>
            </View>
          </View>

          <View style={styles.taxiDetailsAction}>
            <Text style={styles.taxiDetailsActionText}>
              {isHosting ? 'Manage Pool' : 'View Pool'}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={WARM_CORE.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Animated Header */}
      <Animated.View
        style={[
          styles.headerSection,
          {
            opacity: headerAnim.opacity,
            transform: [{ translateY: headerAnim.translateY }],
          },
        ]}
      >
        <Text style={styles.headerTitle}>My Commutes</Text>
        <Text style={styles.headerSubtitle}>Manage your driving and riding schedules</Text>
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: contentAnim.opacity,
          transform: [{ translateY: contentAnim.translateY }],
        }}
      >
        {/* Top Tab Selector (Hosting vs Riding) */}
        <View style={styles.topTabContainer}>
          <TouchableOpacity
            style={[styles.topTab, activeTab === 'hosting' && styles.topTabActive]}
            onPress={() => setActiveTab('hosting')}
            activeOpacity={0.8}
          >
            <Text style={[styles.topTabLabel, activeTab === 'hosting' && styles.topTabLabelActive]}>
              Hosting (Driving)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topTab, activeTab === 'riding' && styles.topTabActive]}
            onPress={() => setActiveTab('riding')}
            activeOpacity={0.8}
          >
            <Text style={[styles.topTabLabel, activeTab === 'riding' && styles.topTabLabelActive]}>
              Riding (Joined)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub Tab Selector (Only if Hosting is active) */}
        {activeTab === 'hosting' && (
          <View style={styles.subTabContainer}>
            <TouchableOpacity
              style={[styles.subTabButton, subTab === 'car' && styles.subTabButtonActive]}
              onPress={() => setSubTab('car')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="car" size={16} color={subTab === 'car' ? WARM_CORE.white : WARM_CORE.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.subTabText, subTab === 'car' && styles.subTabTextActive]}>Car Pools</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTabButton, subTab === 'taxi' && styles.subTabButtonActive]}
              onPress={() => setSubTab('taxi')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="taxi" size={16} color={subTab === 'taxi' ? WARM_CORE.white : WARM_CORE.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.subTabText, subTab === 'taxi' && styles.subTabTextActive]}>Taxi Pools</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status Tab Filter (Only if Hosting -> Car Pools is active) */}
        {activeTab === 'hosting' && subTab === 'car' && (
          <View style={styles.tabContainer}>
            {(['active', 'in_progress', 'completed', 'cancelled'] as RideStatus[]).map(status => {
              const isSelected = selectedStatus === status;
              let statusLabel = '';
              if (status === 'active') statusLabel = 'Upcoming';
              else if (status === 'in_progress') statusLabel = 'Ongoing';
              else statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
              
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.tab, isSelected && styles.tabActive]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <Text style={[styles.tabLabel, isSelected && styles.tabLabelActive]}>
                    {statusLabel}
                  </Text>
                  {isSelected && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={WARM_CORE.primary}
              progressBackgroundColor={WARM_CORE.card}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={WARM_CORE.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : activeTab === 'hosting' ? (
            subTab === 'car' ? (
              filteredRides.length > 0 ? (
                <View style={styles.ridesContainer}>
                  {filteredRides.map(ride => {
                    const statusBadge = getStatusBadge(ride.status);
                    const bookedCount = ride.bookedSeats.filter(
                      bs => bs.status === 'accepted' || bs.status === 'pending'
                    ).length;
                    const earnings = getRideEarnings(ride);

                    return (
                      <TouchableOpacity
                        key={ride.id}
                        style={styles.rideCard}
                        onPress={() => handleRidePress(ride.id)}
                        activeOpacity={0.7}
                      >
                        {/* Status Badge */}
                        <View style={[styles.statusBadge, { backgroundColor: statusBadge.bgColor }]}>
                          <MaterialCommunityIcons 
                            name={
                              ride.status === 'active' ? 'clock-outline' : 
                              ride.status === 'in_progress' ? 'play-circle-outline' :
                              'check-circle-outline'
                            } 
                            size={14} 
                            color={statusBadge.color} 
                          />
                          <Text style={[styles.statusText, { color: statusBadge.color }]}>
                            {statusBadge.label}
                          </Text>
                        </View>

                        {/* Route Info */}
                        <View style={styles.routeSection}>
                          <View style={styles.routeIndicator}>
                            <View style={styles.routeDot} />
                            <View style={styles.routeLine} />
                            <View style={styles.routeDot} />
                          </View>

                          <View style={styles.locationsContainer}>
                            <View>
                              <Text style={styles.locationLabel}>PICKUP</Text>
                              <Text style={styles.locationName} numberOfLines={1}>
                                {ride.pickupLocation.address}
                              </Text>
                            </View>
                            <View style={styles.locationDivider} />
                            <View>
                              <Text style={styles.locationLabel}>DROP-OFF</Text>
                              <Text style={styles.locationName} numberOfLines={1}>
                                {ride.dropLocation.address}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Time Remaining */}
                        {ride.status === 'active' && (
                          <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212, 80, 10, 0.08)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginBottom: 12}}>
                            <MaterialCommunityIcons name="clock-fast" size={16} color={WARM_CORE.primary} style={{marginRight: 8}} />
                            <Text style={{color: WARM_CORE.primary, fontSize: 12, fontWeight: '600'}}>{getTimeRemaining(ride.departureTime)}</Text>
                          </View>
                        )}

                        {/* Footer Info */}
                        <View style={styles.cardFooter}>
                          <View style={styles.infoGroup}>
                            <View style={styles.infoItem}>
                              <MaterialCommunityIcons name="clock-outline" size={16} color={WARM_CORE.textSecondary} />
                              <Text style={styles.infoText}>{formatTime(ride.departureTime)}</Text>
                            </View>
                            <Text style={styles.dotSeparator}>•</Text>
                            <View style={styles.infoItem}>
                              <MaterialCommunityIcons name="seat" size={16} color={WARM_CORE.textSecondary} />
                              <Text style={styles.infoText}>{bookedCount}/{ride.totalSeats}</Text>
                            </View>
                          </View>

                          <View style={styles.earningsBox}>
                            <Text style={styles.earningsLabel}>₹{earnings}</Text>
                            <Text style={styles.earningsDesc}>Total</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name={selectedStatus === 'active' ? 'plus-circle-outline' : 'check-circle-outline'}
                    size={56}
                    color={WARM_CORE.textSecondary}
                  />
                  <Text style={styles.emptyTitle}>
                    {selectedStatus === 'active' ? 'No Upcoming Rides' : `No ${selectedStatus} rides`}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {selectedStatus === 'active'
                      ? 'Post a new ride to get started'
                      : 'Your rides will appear here'}
                  </Text>
                </View>
              )
            ) : (
              createdTaxiPools.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={56} color={WARM_CORE.textSecondary} />
                  <Text style={styles.emptyTitle}>No Hosted Taxi Pools</Text>
                  <Text style={styles.emptySubtitle}>You haven't created any taxi pools yet</Text>
                  <TouchableOpacity
                    style={styles.bookNowButton}
                    onPress={() => router.push('/create-taxi-pool')}
                  >
                    <MaterialCommunityIcons name="plus" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                    <Text style={styles.bookNowButtonText}>Create a Taxi Pool</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.ridesContainer}>
                  {createdTaxiPools.map((pool) => renderTaxiPoolCard(pool, true))}
                </View>
              )
            )
          ) : (
            joinedTaxiPools.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="taxi" size={56} color={WARM_CORE.textSecondary} />
                <Text style={styles.emptyTitle}>No Joined Taxi Pools</Text>
                <Text style={styles.emptySubtitle}>You haven't joined any taxi pools yet</Text>
                <TouchableOpacity
                  style={styles.bookNowButton}
                  onPress={() => router.push('/(tabs)/home')}
                >
                  <MaterialCommunityIcons name="magnify" size={16} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                  <Text style={styles.bookNowButtonText}>Find Taxi Pools</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.ridesContainer}>
                {joinedTaxiPools.map((pool) => renderTaxiPoolCard(pool, false))}
              </View>
            )
          )}
        </ScrollView>
      </Animated.View>

      {/* RIDE DETAILS MODAL */}
      {selectedRideForDetails && (
        <RideDetailsModal
          ride={getDetailedRide(selectedRideForDetails)!}
          passengers={getCurrentRidePassengers(selectedRideForDetails)}
          earnings={getRideEarnings(getDetailedRide(selectedRideForDetails)!)}
          onClose={closeRideDetails}
          onAcceptPassenger={handleAcceptPassenger}
          onRejectPassenger={handleRejectPassenger}
          onCancelRide={handleCancelRide}
          onStartRide={handleStartRide}
          onCompleteRide={handleCompleteRide}
          router={router}
        />
      )}
    </SafeAreaView>
  );
}

// RIDE DETAILS MODAL COMPONENT
interface RideDetailsModalProps {
  ride: any;
  passengers: any[];
  earnings: number;
  onClose: () => void;
  onAcceptPassenger: (bookingId: string) => Promise<void>;
  onRejectPassenger: (bookingId: string) => Promise<void>;
  onCancelRide: (rideId: string) => Promise<void>;
  onStartRide: (rideId: string) => Promise<void>;
  onCompleteRide: (rideId: string) => Promise<void>;
  router: any;
}

function RideDetailsModal({ ride, passengers, earnings, onClose, onAcceptPassenger, onRejectPassenger, onCancelRide, onStartRide, onCompleteRide, router }: RideDetailsModalProps) {
  const [processingBooking, setProcessingBooking] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <ScrollView
          style={styles.modalContent}
          contentContainerStyle={styles.modalContentPadded}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="chevron-down" size={28} color={WARM_CORE.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Ride Details</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* RIDE INFO SECTION */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionTitle}>ROUTE & TIMING</Text>
            
            <View style={styles.routeBox}>
              <View style={styles.fullRouteIndicator}>
                <View style={styles.fullRouteDot} />
                <View style={styles.fullRouteLine} />
                <View style={styles.fullRouteDot} />
              </View>

              <View style={styles.fullLocationsContainer}>
                <View>
                  <Text style={styles.routeLabelBold}>PICKUP</Text>
                  <Text style={styles.routeValueText}>{ride.pickupLocation.address}</Text>
                </View>
                <View style={styles.routeSpacing} />
                <View>
                  <Text style={styles.routeLabelBold}>DROP-OFF</Text>
                  <Text style={styles.routeValueText}>{ride.dropLocation.address}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* DATE, TIME & PRICE */}
          <View style={styles.modalSection}>
            <View style={styles.infoGridRow}>
              <View style={styles.infoGridItem}>
                <Text style={styles.infoGridLabel}>Date & Time</Text>
                <Text style={styles.infoGridValue}>{formatTime(ride.departureTime)}</Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={styles.infoGridLabel}>Price/Seat</Text>
                <Text style={styles.infoGridValue}>₹{ride.price}</Text>
              </View>
              <View style={styles.infoGridItem}>
                <Text style={styles.infoGridLabel}>Total Seats</Text>
                <Text style={styles.infoGridValue}>{ride.totalSeats}</Text>
              </View>
            </View>
          </View>

          {/* PASSENGER LIST SECTION */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionTitle}>PASSENGERS ({passengers.length})</Text>
            
            {passengers.length > 0 ? (
              <View style={styles.passengersList}>
                {passengers.map((passenger, index) => (
                  <View key={index} style={styles.passengerCard}>
                    <View style={styles.passengerAvatar}>
                      <Text style={styles.passengerAvatarText}>
                        {passenger.passengerName.charAt(0)}
                      </Text>
                    </View>

                    <View style={styles.passengerInfo}>
                      <Text style={styles.passengerName}>{passenger.passengerName}</Text>
                      <Text style={styles.passengerDetail}>{passenger.year} • {passenger.course}</Text>
                    </View>

                    {passenger.status === 'pending' ? (
                      <View style={styles.passengerActions}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.acceptButton]}
                          onPress={() => onAcceptPassenger(passenger.passengerId)}
                          disabled={processingBooking === passenger.passengerId}
                        >
                          <MaterialCommunityIcons name="check" size={16} color={WARM_CORE.white} />
                          <Text style={styles.actionButtonText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.rejectButton]}
                          onPress={() => onRejectPassenger(passenger.passengerId)}
                          disabled={processingBooking === passenger.passengerId}
                        >
                          <MaterialCommunityIcons name="close" size={16} color={WARM_CORE.white} />
                          <Text style={styles.actionButtonText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.statusIndicator,
                          {
                            backgroundColor:
                              passenger.status === 'accepted'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : passenger.status === 'pending'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusIndicatorText,
                            {
                              color:
                                passenger.status === 'accepted'
                                  ? WARM_CORE.success
                                  : passenger.status === 'pending'
                                  ? '#F59E0B'
                                  : WARM_CORE.error,
                            },
                          ]}
                        >
                          {passenger.status === 'pending' ? 'Ride Requested' : passenger.status.charAt(0).toUpperCase() + passenger.status.slice(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noPssengerState}>
                <MaterialCommunityIcons name="account-off" size={40} color={WARM_CORE.textSecondary} />
                <Text style={styles.noPassengerText}>No passengers yet</Text>
              </View>
            )}
          </View>

          {/* EARNINGS SECTION */}
          <View style={styles.modalSection}>
            <Text style={styles.sectionTitle}>EARNINGS BREAKDOWN</Text>
            
            <View style={styles.earningsBreakdown}>
              <View style={styles.earningsRow}>
                <Text style={styles.earningsRowLabel}>Confirmed Passengers</Text>
                <Text style={styles.earningsRowValue}>{passengers.length}</Text>
              </View>
              
              <View style={styles.earningsRow}>
                <Text style={styles.earningsRowLabel}>Price per Seat</Text>
                <Text style={styles.earningsRowValue}>₹{ride.price}</Text>
              </View>

              <View style={styles.earningsDivider} />

              <View style={styles.earningsRow}>
                <Text style={styles.earningsTotalLabel}>Total Savings</Text>
                <Text style={styles.earningsTotalValue}>₹{earnings}</Text>
              </View>
            </View>
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.actionButtonsSection}>
            {/* START RIDE BUTTON */}
            {ride.status === 'active' && (
              <TouchableOpacity 
                style={[styles.successButton, { flex: 1, marginBottom: 12 }, isStarting && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsStarting(true);
                  try {
                    await onStartRide(ride.id);
                    onClose();
                  } catch (error) {
                    console.error('Failed to start ride:', error);
                  } finally {
                    setIsStarting(false);
                  }
                }}
                disabled={isStarting || isCanceling}
              >
                <MaterialCommunityIcons 
                  name={isStarting ? "loading" : "play-circle-outline"} 
                  size={18} 
                  color={WARM_CORE.success} 
                  style={isStarting && { opacity: 0.5 }}
                />
                <Text style={styles.successButtonText}>{isStarting ? 'Starting...' : 'Start Ride'}</Text>
              </TouchableOpacity>
            )}

            {/* CHAT BUTTON */}
            {(ride.status === 'active' || ride.status === 'in_progress') && passengers.some(p => p.status === 'accepted') && (
              <TouchableOpacity 
                style={[styles.infoButton, { flex: 1, marginBottom: 12 }]}
                onPress={() => {
                  const firstAcceptedPassenger = passengers.find(p => p.status === 'accepted');
                  if (firstAcceptedPassenger) {
                    router.push({
                      pathname: '/chat',
                      params: {
                        rideId: ride.id,
                        bookingId: firstAcceptedPassenger.passengerId,
                      },
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="message-outline" size={18} color="#0EA5E9" />
                <Text style={styles.infoButtonText}>Chat with Passenger</Text>
              </TouchableOpacity>
            )}

            {/* FINISH RIDE BUTTON */}
            {ride.status === 'in_progress' && (
              <TouchableOpacity 
                style={[styles.successButton, { flex: 1, marginBottom: 12 }, isCompleting && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsCompleting(true);
                  try {
                    await onCompleteRide(ride.id);
                    onClose();
                  } catch (error) {
                    console.error('Failed to complete ride:', error);
                  } finally {
                    setIsCompleting(false);
                  }
                }}
                disabled={isCompleting || isCanceling}
              >
                <MaterialCommunityIcons 
                  name={isCompleting ? "loading" : "check-circle-outline"} 
                  size={18} 
                  color={WARM_CORE.success}
                  style={isCompleting && { opacity: 0.5 }}
                />
                <Text style={styles.successButtonText}>{isCompleting ? 'Completing...' : 'Finish Ride'}</Text>
              </TouchableOpacity>
            )}

            {/* CANCEL RIDE BUTTON */}
            {ride.status !== 'completed' && (
              <TouchableOpacity 
                style={[styles.dangerButton, { flex: 1 }, isCanceling && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsCanceling(true);
                  try {
                    await onCancelRide(ride.id);
                  } finally {
                    setIsCanceling(false);
                  }
                }}
                disabled={isCanceling || isStarting || isCompleting}
              >
                <MaterialCommunityIcons 
                  name={isCanceling ? "loading" : "trash-can-outline"} 
                  size={18} 
                  color={WARM_CORE.error} 
                  style={isCanceling && { opacity: 0.5 }}
                />
                <Text style={styles.dangerButtonText}>{isCanceling ? 'Canceling...' : 'Cancel Ride'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Header
  headerSection: {
    marginBottom: 16,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
  },

  // Tab Filter
  tabContainer: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: WARM_CORE.primary,
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  tabLabelActive: {
    color: WARM_CORE.primary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    width: '100%',
    backgroundColor: WARM_CORE.primary,
  },

  // Rides List
  ridesContainer: {
    gap: 12,
  },
  rideCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    overflow: 'hidden',
    padding: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Route Section in Card
  routeSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  routeIndicator: {
    alignItems: 'center',
    gap: 6,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.primary,
  },
  routeLine: {
    width: 2,
    height: 28,
    backgroundColor: WARM_CORE.border,
    marginVertical: 2,
  },
  locationsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.primary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationName: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  locationDivider: {
    height: 6,
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  },
  infoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  dotSeparator: {
    fontSize: 12,
    color: WARM_CORE.border,
  },
  earningsBox: {
    alignItems: 'flex-end',
  },
  earningsLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.success,
  },
  earningsDesc: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },

  // Loading State
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 16,
    color: WARM_CORE.textSecondary,
    marginTop: 16,
    fontWeight: '500',
  },

  // ===== MODAL / BOTTOM SHEET =====
  modalContainer: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  modalContent: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  modalContentPadded: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Modal Header
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  closeButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  },

  // Modal Sections
  modalSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Route Box (Modal)
  routeBox: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
  },
  fullRouteIndicator: {
    alignItems: 'center',
    gap: 8,
  },
  fullRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
  },
  fullRouteLine: {
    width: 2,
    height: 48,
    backgroundColor: WARM_CORE.border,
  },
  fullLocationsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  routeLabelBold: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  routeSpacing: {
    height: 8,
  },

  // Info Grid
  infoGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoGridItem: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 12,
    alignItems: 'center',
  },
  infoGridLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  infoGridValue: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  },

  // Passenger List
  passengersList: {
    gap: 10,
  },
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 14,
    gap: 12,
  },
  passengerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 2,
  },
  passengerDetail: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
  },
  passengerStatus: {
    alignItems: 'flex-end',
  },
  passengerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  acceptButton: {
    backgroundColor: WARM_CORE.success,
  },
  rejectButton: {
    backgroundColor: WARM_CORE.error,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
  },
  noPssengerState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noPassengerText: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    marginTop: 8,
  },

  // Earnings Breakdown
  earningsBreakdown: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 16,
    gap: 12,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  earningsRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  earningsDivider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginVertical: 4,
  },
  earningsTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  earningsTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.success,
  },

  // Action Buttons
  actionButtonsSection: {
    gap: 12,
    marginTop: 20,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  successButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  successButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.success,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.error,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0EA5E9',
  },
  /* ── Switcher Tabs ─────────────────────────────────────────────────────── */
  topTabContainer: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.card,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  topTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topTabActive: {
    borderBottomColor: WARM_CORE.primary,
  },
  topTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  topTabLabelActive: {
    color: WARM_CORE.primary,
    fontWeight: '800',
  },
  subTabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: WARM_CORE.background,
  },
  subTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  subTabButtonActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  subTabTextActive: {
    color: WARM_CORE.white,
    fontWeight: '700',
  },
  /* ── Taxi Pool Card ──────────────────────────────────────────────────────── */
  taxiPoolCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  taxiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  taxiCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  taxiIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taxiDestText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    letterSpacing: -0.2,
    marginBottom: 2,
    maxWidth: 180,
  },
  taxiTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  taxiStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  taxiStatusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  taxiCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  },
  taxiCardInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taxiStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taxiStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  taxiDotSeparator: {
    fontSize: 12,
    color: WARM_CORE.border,
  },
  taxiDetailsAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taxiDetailsActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  /* ── Book Now / Create Pool Buttons ──────────────────────────────────────── */
  bookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 8,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
    marginTop: 20,
  },
  bookNowButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
});
