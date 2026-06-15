import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import {
  GroupChatMessage,
  GroupChatRoom,
  sendGroupMessage,
  subscribeToGroupMessages,
  subscribeToGroupChatRoom
} from '@/utils/rideGroupChatService';
import { cancelBookingWithPenalty, getBookingByRideAndPassenger } from '@/utils/bookingService';
import { startRide, completeRide } from '@/utils/rideService';
import { leaveTaxiPool, updateTaxiPoolStatus, subscribeToPoolMembers } from '@/utils/taxiPoolService';

export default function GroupChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { rideId, rideType } = params as { rideId: string; rideType: 'carpool' | 'taxipool' };
  
  const { auth } = useAppContext();
  
  // State
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [room, setRoom] = useState<GroupChatRoom | null>(null);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]); // To populate participants list
  
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  // 1. Subscribe to Chat Room Details and Messages
  useEffect(() => {
    if (!rideId) return;

    setLoading(true);
    const unsubRoom = subscribeToGroupChatRoom(rideId, (chatRoom) => {
      setRoom(chatRoom);
    });

    const unsubMessages = subscribeToGroupMessages(rideId, (chatMessages) => {
      setMessages(chatMessages);
      setLoading(false);
      // Auto-scroll to end
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      unsubRoom();
      unsubMessages();
    };
  }, [rideId]);

  // 2. Subscribe to Ride/Pool Document and Members details
  useEffect(() => {
    if (!rideId || !rideType) return;

    if (rideType === 'carpool') {
      // Subscribe to CarPool ride details
      const rideRef = doc(db, 'rides', rideId);
      const unsubRide = onSnapshot(rideRef, (snap) => {
        if (snap.exists()) {
          const data = snap.id ? { id: snap.id, ...snap.data() } as any : null;
          setRideDetails(data);
          
          // Map ride bookedSeats + driver to members list
          const rideMembers = [];
          // Add Driver
          rideMembers.push({
            id: data?.driverId,
            fullName: data?.driverName,
            role: 'driver',
            image: null // driver image could be retrieved or blank
          });
          
          // Add Accepted Passengers
          if (data?.bookedSeats) {
            data.bookedSeats.forEach((seat: any) => {
              if (seat.status === 'accepted') {
                rideMembers.push({
                  id: seat.passengerId,
                  fullName: seat.passengerName,
                  role: 'passenger',
                  image: null
                });
              }
            });
          }
          setMembers(rideMembers);
        }
      });
      return unsubRide;
    } else {
      // Subscribe to TaxiPool details
      const poolRef = doc(db, 'taxiPools', rideId);
      const unsubPool = onSnapshot(poolRef, (snap) => {
        if (snap.exists()) {
          setRideDetails({ id: snap.id, ...snap.data() });
        }
      });

      // Subscribe to Pool members
      const unsubMembers = subscribeToPoolMembers(rideId, (poolMembers) => {
        const taxiMembers = poolMembers.map((m) => ({
          id: m.passengerId,
          fullName: m.passengerName,
          role: m.passengerId === rideDetails?.creatorId ? 'creator' : 'member',
          image: m.passengerImage
        }));
        setMembers(taxiMembers);
      });

      return () => {
        unsubPool();
        unsubMembers();
      };
    }
  }, [rideId, rideType, rideDetails?.creatorId]);

  // 3. Auto-scroll on messages count change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!messageText.trim() || !auth.user || sending) return;

    setSending(true);
    try {
      await sendGroupMessage(
        rideId,
        auth.user.id,
        auth.user.fullName,
        auth.user.profileImage || '',
        messageText
      );
      setMessageText('');
    } catch (err) {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  // Quick Action: Start Ride
  const handleStartRide = async () => {
    setActionsVisible(false);
    try {
      if (rideType === 'carpool') {
        await startRide(rideId);
      } else {
        await updateTaxiPoolStatus(rideId, 'in_progress');
      }
      await sendGroupMessage(rideId, 'system', 'System', '', 'Ride has started', 'system');
      Alert.alert('Success', 'Ride has been started.');
    } catch (err) {
      Alert.alert('Error', 'Failed to start ride.');
    }
  };

  // Quick Action: Complete Ride
  const handleCompleteRide = async () => {
    setActionsVisible(false);
    try {
      if (rideType === 'carpool') {
        await completeRide(rideId);
      } else {
        await updateTaxiPoolStatus(rideId, 'completed');
      }
      await sendGroupMessage(rideId, 'system', 'System', '', 'Ride has completed', 'system');
      Alert.alert('Success', 'Ride completed successfully.');
    } catch (err) {
      Alert.alert('Error', 'Failed to complete ride.');
    }
  };

  // Quick Action: Leave Ride (Passenger/Member)
  const handleLeaveRide = async () => {
    setActionsVisible(false);
    if (!auth.user) return;

    Alert.alert(
      'Leave Ride Group',
      'Are you sure you want to leave this ride? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (rideType === 'carpool') {
                const booking = await getBookingByRideAndPassenger(rideId, auth.user!.id);
                if (booking) {
                  await cancelBookingWithPenalty(booking.id, rideId, auth.user!.id, rideDetails.departureTime);
                } else {
                  throw new Error('Booking not found');
                }
              } else {
                await leaveTaxiPool(rideId, auth.user!.id, auth.user!.fullName);
              }
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to leave the ride.');
            }
          }
        }
      ]
    );
  };

  // SOS Action handler
  const triggerSOSAlert = async () => {
    setSosVisible(false);
    if (!auth.user) return;
    try {
      await sendGroupMessage(
        rideId,
        'system',
        'System',
        '',
        `🚨 SOS alert from ${auth.user.fullName}! Check in immediately.`,
        'system'
      );
      Alert.alert('SOS Sent', 'An emergency alert has been broadcast to all group chat members.');
    } catch (err) {
      Alert.alert('Error', 'Failed to send emergency alert.');
    }
  };

  const callEmergencyNumber = () => {
    setSosVisible(false);
    Linking.openURL('tel:112');
  };

  // Get status text and colors
  const getRideStatusInfo = () => {
    const status = rideDetails?.status || 'active';
    switch (status) {
      case 'in_progress':
        return { text: 'In Progress', bg: 'rgba(255, 122, 51, 0.15)', border: WARM_CORE.accent, color: WARM_CORE.primary };
      case 'completed':
        return { text: 'Completed', bg: 'rgba(16, 185, 129, 0.15)', border: WARM_CORE.success, color: WARM_CORE.success };
      case 'cancelled':
      case 'CANCELLED':
        return { text: 'Cancelled', bg: 'rgba(239, 68, 68, 0.15)', border: WARM_CORE.error, color: WARM_CORE.error };
      default:
        return { text: 'Upcoming Ride', bg: WARM_CORE.card, border: WARM_CORE.border, color: WARM_CORE.textSecondary };
    }
  };

  const statusInfo = getRideStatusInfo();
  const isDriverOrHost = rideType === 'carpool'
    ? rideDetails?.driverId === auth.user?.id
    : rideDetails?.creatorId === auth.user?.id;

  const driverOrHostName = rideType === 'carpool'
    ? rideDetails?.driverName || 'Driver'
    : rideDetails?.creatorName || 'Host';

  const pickup = rideType === 'carpool' ? rideDetails?.pickupLocation?.address || 'Pickup' : 'Atlas University';
  const destination = rideType === 'carpool' ? rideDetails?.dropLocation?.address || 'Destination' : rideDetails?.destination?.address || 'Destination';

  const departureDate = rideDetails?.departureTime
    ? new Date(rideDetails.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ' - ' + new Date(rideDetails.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Departure Time';

  const formatMessageTime = (ts: any) => {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
        </TouchableOpacity>

        <View style={styles.headerDetails}>
          <Text style={styles.headerRoute} numberOfLines={1}>
            {pickup.split(',')[0]} ➔ {destination.split(',')[0]}
          </Text>
          <Text style={styles.headerSubtitle}>
            {driverOrHostName} · {departureDate}
          </Text>
        </View>

        <TouchableOpacity onPress={() => setActionsVisible(true)} style={styles.headerBtn}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color={WARM_CORE.text} />
        </TouchableOpacity>
      </View>

      {/* Ride Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
        <MaterialCommunityIcons name="information-outline" size={14} color={statusInfo.color} />
        <Text style={[styles.statusBannerText, { color: statusInfo.color }]}>
          Ride Status: {statusInfo.text}
        </Text>
      </View>

      {/* Participants Row */}
      <View style={styles.participantsContainer}>
        <Text style={styles.participantsLabel}>PARTICIPANTS ({members.length})</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.participantsList}
          renderItem={({ item }) => {
            const initials = item.fullName ? item.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'P';
            const isHost = item.role === 'driver' || item.role === 'creator';
            return (
              <View style={styles.participantItem}>
                <View style={[styles.avatarCircle, isHost && styles.hostAvatarCircle]}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.avatarImage} />
                  ) : (
                    <Text style={[styles.avatarText, isHost && styles.hostAvatarText]}>{initials}</Text>
                  )}
                  {isHost && (
                    <View style={styles.hostBadge}>
                      <MaterialCommunityIcons name="star" size={8} color={WARM_CORE.white} />
                    </View>
                  )}
                  {/* Mock Online Indicator */}
                  <View style={styles.onlineDot} />
                </View>
                <Text style={styles.participantName} numberOfLines={1}>
                  {item.fullName.split(' ')[0]}
                </Text>
              </View>
            );
          }}
        />
      </View>

      {/* Messages Feed */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={WARM_CORE.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isCurrentUser = item.senderId === auth.user?.id;
            const isSystem = item.type === 'system';

            if (isSystem) {
              return (
                <View style={styles.systemMessageContainer}>
                  <View style={styles.systemMessageBubble}>
                    <Text style={styles.systemMessageText}>{item.text}</Text>
                  </View>
                </View>
              );
            }

            const initials = item.senderName ? item.senderName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

            return (
              <View style={[styles.messageRow, isCurrentUser ? styles.messageRowRight : styles.messageRowLeft]}>
                {!isCurrentUser && (
                  <View style={styles.messageAvatar}>
                    {item.senderPhoto ? (
                      <Image source={{ uri: item.senderPhoto }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.messageAvatarText}>{initials}</Text>
                    )}
                  </View>
                )}
                <View style={styles.messageBubbleContainer}>
                  {!isCurrentUser && <Text style={styles.messageSenderName}>{item.senderName}</Text>}
                  <View style={[styles.messageBubble, isCurrentUser ? styles.bubbleRight : styles.bubbleLeft]}>
                    <Text style={[styles.messageText, isCurrentUser ? styles.textRight : styles.textLeft]}>
                      {item.text}
                    </Text>
                    <Text style={[styles.messageTime, isCurrentUser ? styles.timeRight : styles.timeLeft]}>
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Message Input Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachmentBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="paperclip" size={22} color={WARM_CORE.textSecondary} />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Type a message..."
            placeholderTextColor={WARM_CORE.textSecondary}
          />

          <TouchableOpacity
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!messageText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={WARM_CORE.white} />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color={WARM_CORE.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Quick Actions Modal */}
      <Modal visible={actionsVisible} animationType="slide" transparent onRequestClose={() => setActionsVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionsVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ride Quick Actions</Text>

            {isDriverOrHost ? (
              <>
                {rideDetails?.status === 'active' && (
                  <TouchableOpacity style={styles.actionItem} onPress={handleStartRide}>
                    <MaterialCommunityIcons name="play" size={22} color={WARM_CORE.primary} />
                    <Text style={styles.actionText}>Start Ride</Text>
                  </TouchableOpacity>
                )}
                {rideDetails?.status === 'in_progress' && (
                  <TouchableOpacity style={styles.actionItem} onPress={handleCompleteRide}>
                    <MaterialCommunityIcons name="checkbox-marked-circle" size={22} color={WARM_CORE.success} />
                    <Text style={styles.actionText}>Complete Ride</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.actionItem} onPress={() => { setActionsVisible(false); setProfileVisible(true); }}>
                  <MaterialCommunityIcons name="account-circle" size={22} color={WARM_CORE.primary} />
                  <Text style={styles.actionText}>View Host Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={() => { setActionsVisible(false); setSosVisible(true); }}>
                  <MaterialCommunityIcons name="alert-octagon" size={22} color={WARM_CORE.error} />
                  <Text style={[styles.actionText, { color: WARM_CORE.error }]}>Emergency Contact (SOS)</Text>
                </TouchableOpacity>

                {rideDetails?.status !== 'completed' && rideDetails?.status !== 'cancelled' && rideDetails?.status !== 'CANCELLED' && (
                  <TouchableOpacity style={styles.actionItem} onPress={handleLeaveRide}>
                    <MaterialCommunityIcons name="exit-run" size={22} color={WARM_CORE.textSecondary} />
                    <Text style={styles.actionText}>Leave Ride Group</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setActionsVisible(false)}>
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* SOS Modal */}
      <Modal visible={sosVisible} animationType="fade" transparent onRequestClose={() => setSosVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSosVisible(false)}>
          <View style={styles.sosModalContent}>
            <View style={styles.sosIconContainer}>
              <MaterialCommunityIcons name="alert-decagram" size={48} color={WARM_CORE.error} />
            </View>
            <Text style={styles.sosTitle}>Emergency SOS Status</Text>
            <Text style={styles.sosSubtitle}>
              Please select an action. You can directly place an emergency call to 112 or broadcast an SOS alert directly to your ride group chat.
            </Text>

            <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.error }]} onPress={callEmergencyNumber}>
              <MaterialCommunityIcons name="phone" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Call Emergency (112)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary }]} onPress={triggerSOSAlert}>
              <MaterialCommunityIcons name="bell-ring" size={20} color={WARM_CORE.white} style={{ marginRight: 8 }} />
              <Text style={styles.sosBtnText}>Alert Ride Group Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sosCancelBtn} onPress={() => setSosVisible(false)}>
              <Text style={styles.sosCancelText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Host Profile Modal */}
      <Modal visible={profileVisible} animationType="fade" transparent onRequestClose={() => setProfileVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setProfileVisible(false)}>
          <View style={styles.profileModalContent}>
            <Text style={styles.profileModalTitle}>Host Profile</Text>
            <View style={styles.profileModalHeader}>
              <View style={styles.profileAvatarLarge}>
                <MaterialCommunityIcons name="account" size={32} color={WARM_CORE.white} />
              </View>
              <View>
                <Text style={styles.profileModalName}>{driverOrHostName}</Text>
                <View style={styles.verifiedRow}>
                  <MaterialCommunityIcons name="check-decagram" size={14} color={WARM_CORE.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.verifiedText}>Verified Driver</Text>
                </View>
              </View>
            </View>

            <View style={styles.profileDetailsBlock}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Course</Text>
                <Text style={styles.detailValue}>{rideDetails?.creatorCourse || 'BBA'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Division</Text>
                <Text style={styles.detailValue}>{rideDetails?.creatorDivision || 'A'}</Text>
              </View>
              {rideType === 'carpool' && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Car</Text>
                  <Text style={styles.detailValue}>{rideDetails?.carModel} ({rideDetails?.carColor || 'Unknown'})</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.sosCancelBtn} onPress={() => setProfileVisible(false)}>
              <Text style={styles.sosCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDetails: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerRoute: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  participantsContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  },
  participantsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  participantsList: {
    paddingHorizontal: 16,
    gap: 16,
  },
  participantItem: {
    alignItems: 'center',
    width: 60,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  hostAvatarCircle: {
    borderColor: WARM_CORE.primary,
    borderWidth: 1.5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  hostAvatarText: {
    color: WARM_CORE.primary,
  },
  hostBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: WARM_CORE.primary,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: WARM_CORE.background,
  },
  onlineDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: WARM_CORE.background,
  },
  participantName: {
    fontSize: 10,
    color: WARM_CORE.text,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  messagesList: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  systemMessageBubble: {
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  systemMessageText: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  },
  messageRowLeft: {
    alignSelf: 'flex-start',
  },
  messageRowRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  messageAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  messageBubbleContainer: {
    flex: 1,
  },
  messageSenderName: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleLeft: {
    backgroundColor: WARM_CORE.card,
    borderTopLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  bubbleRight: {
    backgroundColor: WARM_CORE.primary,
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  textLeft: {
    color: WARM_CORE.text,
  },
  textRight: {
    color: WARM_CORE.white,
  },
  messageTime: {
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  timeLeft: {
    color: WARM_CORE.textSecondary,
  },
  timeRight: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
    gap: 10,
  },
  attachmentBtn: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: WARM_CORE.text,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  sendBtn: {
    backgroundColor: WARM_CORE.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(212, 80, 10, 0.4)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: WARM_CORE.border,
    gap: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  cancelModalBtn: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
  },
  cancelModalText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  sosModalContent: {
    backgroundColor: WARM_CORE.background,
    borderRadius: 24,
    padding: 24,
    margin: 20,
    alignSelf: 'center',
    width: '90%',
    alignItems: 'center',
  },
  sosIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sosTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 8,
  },
  sosSubtitle: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  sosBtnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  sosBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
  sosCancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
  },
  sosCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  profileModalContent: {
    backgroundColor: WARM_CORE.background,
    borderRadius: 24,
    padding: 24,
    margin: 20,
    alignSelf: 'center',
    width: '90%',
  },
  profileModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  profileAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileModalName: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: WARM_CORE.primary,
    fontWeight: '600',
  },
  profileDetailsBlock: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: WARM_CORE.text,
    fontWeight: '700',
  },
});
