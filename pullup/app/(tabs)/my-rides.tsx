import { useAppContext } from '@/context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const getTimeRemaining = (departureTimeStr: string) => {
  try {
    const departureDate = new Date(departureTimeStr);
    const nowMs = new Date().getTime();
    const diffMs = departureDate.getTime() - nowMs;
    
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
    return '';
  }
};

function HostingCardWrapper({ children, style }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => Animated.spring(scale, { toValue: 0.975, damping: 14, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }).start();
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]} onTouchStart={onIn} onTouchEnd={onOut} onTouchCancel={onOut}>
      {children}
    </Animated.View>
  );
}

function PulsingRequestBar({ count }: { count: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }, { opacity: pulse }]}>
      <MaterialCommunityIcons name="bell-alert" size={16} color="#F59E0B" />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#B45309' }}>{count} pending request{count > 1 ? 's' : ''}</Text>
    </Animated.View>
  );
}

function SpringButton({ style, onPress, disabled, children }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => !disabled && Animated.spring(scale, { toValue: 0.95, damping: 14, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={style} onPressIn={onIn} onPressOut={onOut} onPress={onPress} disabled={disabled}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function MyRidesScreen() {
  const { bookings, rides, auth, acceptBooking, rejectBooking, cancelRide, loadDriverRides } = useAppContext();
  const [expandedRideId, setExpandedRideId] = useState<string | null>(null);
  const [processingBooking, setProcessingBooking] = useState<string | null>(null);
  const [cancelRideId, setCancelRideId] = useState<string | null>(null);
  const [isCancelingRide, setIsCancelingRide] = useState(false);

  // Animation refs
  const listFade = useRef(new Animated.Value(0)).current;
  const listSlide = useRef(new Animated.Value(24)).current;
  const emptyIconScale = useRef(new Animated.Value(0)).current;

  // Load driver rides on mount and when auth user changes
  useEffect(() => {
    if (auth.user?.id) {
      loadDriverRides(auth.user.id);
    }
  }, [auth.user?.id, loadDriverRides]);

  // Get rides where current user is the driver  
  const driverRides = (rides ?? []).filter(r => r.driverId === auth.user?.id);

  // Staggered list entry animation
  useEffect(() => {
    if (driverRides.length > 0) {
      listFade.setValue(0);
      listSlide.setValue(24);
      Animated.parallel([
        Animated.timing(listFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(listSlide, { toValue: 0, damping: 20, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [driverRides.length]);

  // Empty state spring icon
  useEffect(() => {
    if (driverRides.length === 0) {
      Animated.spring(emptyIconScale, { toValue: 1, damping: 10, stiffness: 150, mass: 0.8, useNativeDriver: true }).start();
    }
  }, [driverRides.length]);

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };



  // Render driver's rides (hosting view)
  const renderHostingRideCard = (ride: any) => {
    const pendingRequests = ride.bookedSeats.filter((b: any) => b.status === 'pending');
    const acceptedBookings = ride.bookedSeats.filter((b: any) => b.status === 'accepted');
    const isExpanded = expandedRideId === ride.id;

    return (
      <HostingCardWrapper key={ride.id} style={styles.hostingCard}>
        {/* Header - Clickable to expand */}
        <TouchableOpacity
          onPress={() => setExpandedRideId(isExpanded ? null : ride.id)}
          activeOpacity={0.7}
        >
          {/* Top Section: Status Badge and Time */}
          <View style={styles.cardTopSection}>
            <View style={styles.timeSection}>
              <Text style={styles.departureTime}>{formatTime(ride.departureTime)}</Text>
              <Text style={styles.departureDate}>
                {new Date(ride.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>

            <View style={styles.statusAndExpand}>
              <View style={[styles.statusBadge, { backgroundColor: '#D1FAE5' }]}>
                <Text style={[styles.statusText, { color: '#047857' }]}>Active</Text>
              </View>
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color="#0F172A"
              />
            </View>
          </View>

          {/* Middle Section: Route with indicator */}
          <View style={styles.routeSection}>
            <View style={styles.routeIndicator}>
              <View style={styles.routeDot} />
              <View style={styles.routeLine} />
              <View style={[styles.routeDot, { backgroundColor: '#94A3B8', borderColor: '#94A3B8' }]} />
            </View>

            <View style={styles.routeDetails}>
              <View style={styles.locationDetail}>
                <Text style={styles.locationLabel}>PICKUP</Text>
                <Text style={styles.locationName}>
                  {ride.pickupLocation.address.split(',')[0]}
                </Text>
              </View>
              <View style={styles.locationDetail}>
                <Text style={[styles.locationLabel, { color: '#6B7280' }]}>DROP-OFF</Text>
                <Text style={styles.locationName}>
                  {ride.dropLocation.address.split(',')[0]}
                </Text>
              </View>
            </View>
          </View>

          {/* Time Remaining */}
          {ride.status === 'active' && (
            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14, 165, 233, 0.1)', paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 12}}>
              <MaterialCommunityIcons name="clock-fast" size={16} color="#0EA5E9" style={{marginRight: 8}} />
              <Text style={{color: '#0EA5E9', fontSize: 12, fontWeight: '600'}}>{getTimeRemaining(ride.departureTime)}</Text>
            </View>
          )}

          {/* Bottom Section: Seats & Price */}
          <View style={styles.cardBottomSection}>
            <View style={styles.seatsIndicator}>
              <MaterialCommunityIcons name="car-seat" size={20} color="#FFFFFF" />
              <View style={styles.seatsStatus}>
                <Text style={styles.seatsBooked}>
                  {ride.totalSeats - ride.availableSeats}/{ride.totalSeats} booked
                </Text>
                <Text style={styles.seatsAvailable}>
                  {ride.availableSeats} available
                </Text>
              </View>
            </View>

            <View style={styles.priceSection}>
              <Text style={styles.price}>₹{ride.price}</Text>
              <Text style={styles.priceLabel}>Per Seat</Text>
            </View>
          </View>

          {/* Requests Alert Bar */}
          {pendingRequests.length > 0 && <PulsingRequestBar count={pendingRequests.length} />}
        </TouchableOpacity>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Pending Requests Section */}
            {pendingRequests.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color="#F59E0B" />
                  <Text style={styles.sectionTitle}>Pending Requests ({pendingRequests.length})</Text>
                </View>

                {pendingRequests.map((booking: any) => (
                  <View key={booking.passengerId} style={styles.requestItem}>
                    <View style={styles.passengerRow}>
                      <View style={styles.passengerAvatar}>
                        <Text style={styles.avatarText}>{booking.passengerName.charAt(0)}</Text>
                      </View>

                      <View style={styles.passengerDetails}>
                        <Text style={styles.passengerNameText}>{booking.passengerName}</Text>
                        <Text style={styles.passengerSubtext}>2nd Year • School of Design</Text>
                      </View>

                      <View style={styles.seatsRequestBadge}>
                        <Text style={styles.seatsRequestText}>{booking.seatsBooked}</Text>
                        <Text style={styles.seatsRequestLabel}>SEAT</Text>
                      </View>
                    </View>

                    <View style={styles.actionButtons}>
                      <SpringButton
                        style={[styles.acceptBtn, processingBooking === booking.passengerId && styles.buttonDisabled]}
                        onPress={async () => {
                          setProcessingBooking(booking.passengerId);
                          await new Promise(resolve => setTimeout(resolve, 500));
                          acceptBooking(ride.id, booking.passengerId);
                          setProcessingBooking(null);
                          setExpandedRideId(null);
                        }}
                        disabled={processingBooking !== null}
                      >
                        <MaterialCommunityIcons 
                          name={processingBooking === booking.passengerId ? 'loading' : 'check'} 
                          size={18} 
                          color="#FFFFFF" 
                        />
                        <Text style={styles.acceptBtnText}>
                          {processingBooking === booking.passengerId ? 'Accepting...' : 'Accept'}
                        </Text>
                      </SpringButton>

                      <SpringButton
                        style={[styles.rejectBtn, processingBooking === booking.passengerId && styles.buttonDisabled]}
                        onPress={async () => {
                          setProcessingBooking(booking.passengerId);
                          await new Promise(resolve => setTimeout(resolve, 500));
                          rejectBooking(ride.id, booking.passengerId);
                          setProcessingBooking(null);
                          setExpandedRideId(null);
                        }}
                        disabled={processingBooking !== null}
                      >
                        <MaterialCommunityIcons 
                          name={processingBooking === booking.passengerId ? 'loading' : 'close'} 
                          size={18} 
                          color="#FFFFFF" 
                        />
                        <Text style={styles.rejectBtnText}>
                          {processingBooking === booking.passengerId ? 'Rejecting...' : 'Reject'}
                        </Text>
                      </SpringButton>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Accepted Bookings Section */}
            {acceptedBookings.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="#10B981" />
                  <Text style={styles.sectionTitle}>Confirmed Passengers ({acceptedBookings.length})</Text>
                </View>

                {acceptedBookings.map((booking: any) => (
                  <View key={booking.passengerId} style={styles.acceptedItem}>
                    <View style={styles.passengerRow}>
                      <View style={[styles.passengerAvatar, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={styles.avatarText}>{booking.passengerName.charAt(0)}</Text>
                      </View>

                      <View style={styles.passengerDetails}>
                        <Text style={styles.passengerNameText}>{booking.passengerName}</Text>
                        <Text style={styles.passengerSubtext}>2nd Year • School of Design</Text>
                      </View>

                      <View style={[styles.seatsRequestBadge, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.seatsRequestText, { color: '#047857' }]}>
                          {booking.seatsBooked}
                        </Text>
                        <Text style={[styles.seatsRequestLabel, { color: '#047857' }]}>SEAT</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Ride Details Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="information" size={18} color="#0F172A" />
                <Text style={styles.sectionTitle}>Ride Details</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Car Model</Text>
                <Text style={styles.detailValue}>{ride.carModel}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Total Seats</Text>
                <Text style={styles.detailValue}>{ride.totalSeats}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Price per Seat</Text>
                <Text style={styles.detailValue}>₹{ride.price}</Text>
              </View>

              {ride.description && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{ride.description}</Text>
                </View>
              )}
            </View>

            {/* Cancel Ride Section */}
            {ride.status === 'active' && (
              <View style={[styles.section, styles.warningSection]}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="alert-octagon" size={18} color="#DC2626" />
                  <Text style={styles.sectionTitle}>Danger Zone</Text>
                </View>

                <View style={styles.cancelWarning}>
                  <MaterialCommunityIcons name="information" size={16} color="#DC2626" />
                  <Text style={styles.cancelWarningText}>
                    Cancelling will notify all {ride.bookedSeats.length} passenger{ride.bookedSeats.length !== 1 ? 's' : ''}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.cancelRideBtn}
                  onPress={() => setCancelRideId(ride.id)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="delete-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.cancelRideBtnText}>Cancel This Ride</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </HostingCardWrapper>
    );
  };

  // Handle ride cancellation
  const handleCancelRide = async () => {
    if (!cancelRideId) return;
    setIsCancelingRide(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      cancelRide(cancelRideId);
      setCancelRideId(null);
      setExpandedRideId(null);
    } catch (error) {
      console.error('Error cancelling ride:', error);
    } finally {
      setIsCancelingRide(false);
    }
  };

  // Get ride for cancel modal
  const rideToCancel = cancelRideId ? rides.find(r => r.id === cancelRideId) : null;

  return (
    <>
      {/* Cancel Ride Confirmation Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={cancelRideId !== null}
        onRequestClose={() => setCancelRideId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header with Icon and Title */}
            <View style={styles.modalIconWrapper}>
              <View style={styles.modalIconBackground}>
                <MaterialCommunityIcons name="alert-octagon" size={28} color="#DC2626" />
              </View>
            </View>

            <Text style={styles.modalTitle}>Cancel Ride?</Text>
            <Text style={styles.modalSubtitle}>This action will affect your passengers</Text>

            {rideToCancel && (
              <View style={styles.modalBody}>
                {/* Passengers Card */}
                <View style={styles.modalInfoSection}>
                  <View style={styles.infoHeader}>
                    <MaterialCommunityIcons name="account-group" size={18} color="#0F172A" />
                    <Text style={styles.infoTitle}>Passengers Affected</Text>
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoPrimaryValue}>{rideToCancel.bookedSeats.length}</Text>
                    <Text style={styles.infoSecondaryValue}>confirmed passenger{rideToCancel.bookedSeats.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {/* Notification Card */}
                <View style={styles.modalInfoSection}>
                  <View style={styles.infoHeader}>
                    <MaterialCommunityIcons name="bell" size={18} color="#0F172A" />
                    <Text style={styles.infoTitle}>They will receive</Text>
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoPrimaryValue}>Cancellation notification</Text>
                    <Text style={styles.infoSecondaryValue}>Instant update to all booked passengers</Text>
                  </View>
                </View>

                {/* Risk Card */}
                <View style={[styles.modalInfoSection, styles.riskCard]}>
                  <View style={styles.infoHeader}>
                    <MaterialCommunityIcons name="alert-circle" size={18} color="#DC2626" />
                    <Text style={[styles.infoTitle, { color: '#DC2626' }]}>Possible Consequence</Text>
                  </View>
                  <Text style={styles.riskText}>Passengers may quickly book alternative transportation</Text>
                </View>
              </View>
            )}

            {/* Divider */}
            <View style={styles.modalDivider} />

            {/* Action Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.modalSecondaryBtn, isCancelingRide && styles.buttonDisabled]}
                onPress={() => setCancelRideId(null)}
                disabled={isCancelingRide}
                activeOpacity={0.65}
              >
                <Text style={styles.modalSecondaryBtnText}>Keep Ride</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalPrimaryBtn, isCancelingRide && styles.buttonDisabled]}
                onPress={handleCancelRide}
                disabled={isCancelingRide}
                activeOpacity={0.7}
              >
                {isCancelingRide ? (
                  <>
                    <MaterialCommunityIcons name="loading" size={16} color="#FFFFFF" />
                    <Text style={styles.modalPrimaryBtnText}>Cancelling...</Text>
                  </>
                ) : (
                  <>
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.modalPrimaryBtnText}>Cancel Ride</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Main Content */}
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F8F5" />

        {/* Screen Title */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Rides</Text>
          <Text style={styles.headerSubtitle}>Manage your active rides</Text>
        </View>

        {/* Error Banner */}
        {auth.error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle" size={18} color="#FCA5A5" />
            <Text style={styles.errorBannerText}>{auth.error}</Text>
          </View>
        )}

        {/* Content */}
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {driverRides.length === 0 ? (
            <View style={styles.emptyState}>
              <Animated.View style={{ transform: [{ scale: emptyIconScale }] }}>
                <MaterialCommunityIcons 
                  name="plus-circle-outline" 
                  size={64} 
                  color="#D1D5DB" 
                />
              </Animated.View>
              <Text style={styles.emptyStateText}>No active rides</Text>
              <Text style={styles.emptyStateSubText}>
                Post a ride to start earning
              </Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: listFade, transform: [{ translateY: listSlide }] }}>
              {driverRides.map(ride => renderHostingRideCard(ride))}
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F5',
  } as ViewStyle,
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.5,
  } as TextStyle,
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  } as TextStyle,
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F8F5',
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  } as ViewStyle,
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  } as ViewStyle,
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 24,
    marginBottom: 16,
    marginTop: -4,
  } as ViewStyle,
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  } as TextStyle,

  /* Hosting Card - Expandable */
  hostingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  } as ViewStyle,

  /* Card Top Section */
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  } as ViewStyle,
  
  statusAndExpand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  timeSection: {
    alignItems: 'flex-start',
  } as ViewStyle,
  departureTime: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  } as TextStyle,
  departureDate: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  } as TextStyle,

  /* Route Section */
  routeSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F5',
    gap: 12,
  } as ViewStyle,
  routeIndicator: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  } as ViewStyle,
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#0F172A',
  } as ViewStyle,
  routeLine: {
    width: 2,
    height: 40,
    backgroundColor: '#E2E8F0',
  } as ViewStyle,
  routeDetails: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  } as ViewStyle,
  locationDetail: {
    justifyContent: 'center',
  } as ViewStyle,
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginBottom: 3,
  } as TextStyle,
  locationName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  } as TextStyle,

  /* Card Bottom Section */
  cardBottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  } as ViewStyle,

  /* Seats Indicator (for hosting) */
  seatsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  } as ViewStyle,
  seatsStatus: {
    flex: 1,
  } as ViewStyle,
  seatsBooked: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  } as TextStyle,
  seatsAvailable: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  } as TextStyle,

  /* Price Section */
  priceSection: {
    alignItems: 'flex-end',
  } as ViewStyle,
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  } as TextStyle,
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  } as TextStyle,

  /* Requests Bar */
  requestsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  } as ViewStyle,
  requestsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  } as TextStyle,

  /* Empty State */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  } as ViewStyle,
  emptyStateText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 20,
  } as TextStyle,
  emptyStateSubText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 10,
    fontWeight: '500',
    textAlign: 'center',
  } as TextStyle,

  /* Expanded Content */
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: '#F0F1F5',
    paddingHorizontal: 16,
    paddingVertical: 16,
  } as ViewStyle,

  /* Section */
  section: {
    marginBottom: 20,
  } as ViewStyle,
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  } as ViewStyle,
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  } as TextStyle,

  /* Request Item */
  requestItem: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  } as ViewStyle,
  
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  } as ViewStyle,

  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  } as ViewStyle,

  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  } as TextStyle,

  passengerDetails: {
    flex: 1,
  } as ViewStyle,

  passengerNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  } as TextStyle,

  passengerSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  } as TextStyle,

  seatsRequestBadge: {
    backgroundColor: '#FCD34D',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,

  seatsRequestText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  } as TextStyle,

  seatsRequestLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#92400E',
  } as TextStyle,

  /* Action Buttons */
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  } as ViewStyle,

  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  } as ViewStyle,

  acceptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,

  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  } as ViewStyle,

  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,

  /* Accepted Item */
  acceptedItem: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  } as ViewStyle,

  /* Detail Item */
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F5',
  } as ViewStyle,

  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  } as TextStyle,

  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 12,
  } as TextStyle,

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  } as ViewStyle,

  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  } as ViewStyle,

  /* Modal Icon Wrapper */
  modalIconWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  } as ViewStyle,

  modalIconBackground: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,

  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  } as TextStyle,

  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  } as TextStyle,

  modalBody: {
    marginBottom: 20,
  } as ViewStyle,

  /* Info Section */
  modalInfoSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  } as ViewStyle,

  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  } as ViewStyle,

  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  } as TextStyle,

  infoContent: {
    marginLeft: 28,
  } as ViewStyle,

  infoPrimaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  } as TextStyle,

  infoSecondaryValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  } as TextStyle,

  /* Risk Card */
  riskCard: {
    backgroundColor: '#2A2A2A',
    borderColor: '#6B4545',
  } as ViewStyle,

  riskText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#991B1B',
    marginLeft: 28,
    lineHeight: 18,
  } as TextStyle,

  /* Modal Divider */
  modalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: -24,
    marginBottom: 16,
  } as ViewStyle,

  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,

  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  } as ViewStyle,

  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  } as TextStyle,

  modalPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  } as ViewStyle,

  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,

  buttonDisabled: {
    opacity: 0.65,
  } as ViewStyle,

  warningSection: {
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
    borderRadius: 12,
    padding: 12,
  } as ViewStyle,

  cancelWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 8,
    padding: 10,
  } as ViewStyle,

  cancelWarningText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  } as TextStyle,

  cancelRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#DC2626',
  } as ViewStyle,

  cancelRideBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,
});
