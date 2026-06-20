import { useAppContext } from '@/context/AppContext';
import { getMessagesForRide, markAllMessagesAsRead, sendMessage, subscribeToMessages } from '@/utils/chatService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Timestamp, doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { WARM_CORE } from '@/constants/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientId: string;
  content: string;
  timestamp: Timestamp | any;
  read: boolean;
  messageType?: 'text' | 'system';
}

// ---------------------------------------------------------------------------
// Animated message bubble — extracted as a proper component to allow hooks
// ---------------------------------------------------------------------------
function MessageBubble({
  message,
  isCurrentUser,
  recipientAvatar,
  formatTime,
}: {
  message: Message;
  isCurrentUser: boolean;
  recipientAvatar: string;
  formatTime: (ts: any) => string;
}) {
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(bubbleAnim, {
      toValue: 1,
      damping: 16,
      stiffness: 240,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, []);

  const isSystemMessage = message.messageType === 'system';

  if (isSystemMessage) {
    return (
      <Animated.View
        style={[
          chatStyles.systemMessageContainer,
          { opacity: bubbleAnim, transform: [{ scale: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] },
        ]}
      >
        <View style={chatStyles.systemMessageBubble}>
          <MaterialCommunityIcons name="information" size={16} color={WARM_CORE.textSecondary} />
          <Text style={chatStyles.systemMessageText}>{message.content}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        chatStyles.messageBubbleContainer,
        isCurrentUser ? chatStyles.messageBubbleContainerRight : chatStyles.messageBubbleContainerLeft,
        {
          opacity: bubbleAnim,
          transform: [
            { scale: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            { translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      {!isCurrentUser && (
        <View style={chatStyles.avatarContainer}>
          {recipientAvatar ? (
            <Image source={{ uri: recipientAvatar }} style={chatStyles.avatar} />
          ) : (
            <View style={chatStyles.avatarPlaceholder}>
              <MaterialCommunityIcons name="account" size={16} color={WARM_CORE.primary} />
            </View>
          )}
        </View>
      )}

      <View
        style={[
          chatStyles.messageBubble,
          isCurrentUser
            ? chatStyles.messageBubbleRight
            : chatStyles.messageBubbleLeft,
        ]}
      >
        {!isCurrentUser && <Text style={chatStyles.senderName}>{message.senderName}</Text>}

        <Text
          style={[
            chatStyles.messageText,
            isCurrentUser ? chatStyles.messageTextRight : chatStyles.messageTextLeft,
          ]}
        >
          {message.content}
        </Text>

        <View style={chatStyles.messageFooter}>
          <Text
            style={[
              chatStyles.messageTime,
              isCurrentUser ? chatStyles.messageTimeRight : chatStyles.messageTimeLeft,
            ]}
          >
            {formatTime(message.timestamp)}
          </Text>

          {isCurrentUser && (
            <MaterialCommunityIcons
              name={message.read ? 'check-all' : 'check'}
              size={14}
              color={message.read ? WARM_CORE.primary : WARM_CORE.textSecondary}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { rideId, bookingId } = params as { rideId: string; bookingId?: string };

  const { rides, bookings, auth } = useAppContext();
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientName, setRecipientName] = useState('');
  const [recipientAvatar, setRecipientAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);
  const [showPhonePopup, setShowPhonePopup] = useState(false);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ── Entry animations ──────────────────────────────────────────────────────
  const headerAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(-12) }).current;
  const inputAnim  = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(16) }).current;

  useEffect(() => {
    Animated.stagger(60, [
      Animated.parallel([
        Animated.timing(headerAnim.opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(inputAnim.opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(inputAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // Get ride and booking details
  const ride = rides.find((r) => r.id === rideId);
  const booking = bookings.find((b) => b.id === bookingId);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [userPhone, setUserPhone] = useState('');

  // Check if chat is allowed:
  // - Chat is available once a booking is ACCEPTED (booking status), or when ride is in_progress/completed
  // - This lets passenger and driver communicate as soon as the driver accepts the booking
  const isChatAllowed = ride && (
    ride.status === 'in_progress' ||
    ride.status === 'completed' ||
    ride.status === 'expired' ||
    ride.status === 'no_show' ||
    (ride.status === 'active' && booking && booking.status === 'accepted')
  );

  const isChatWritable = ride && (
    ride.status === 'active' ||
    ride.status === 'expired' ||
    ride.status === 'in_progress'
  );

  useEffect(() => {
    const initializeChat = async () => {
      if (!ride || !auth.user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Determine if user is driver or passenger
        const isDriver = ride.driverId === auth.user.id;
        const isPassenger = booking && booking.passengerId === auth.user.id;

        // Only allow if user is involved in the ride
        if (!isDriver && !isPassenger) {
          console.log('[CHAT] User not authorized for this chat');
          setLoading(false);
          return;
        }

        // Set current user's phone
        if (auth.user?.phone) {
          setUserPhone(auth.user.phone);
        }

        // Recipient details will be fetched and updated in real-time by the recipient profile listener useEffect.

        // Load initial messages from Firestore
        const initialMessages = await getMessagesForRide(rideId);
        setMessages(initialMessages as Message[]);

        // Mark messages as read
        if (isChatAllowed && auth.user) {
          await markAllMessagesAsRead(rideId, auth.user.id);
        }

        // Subscribe to real-time updates
        const unsubFn = subscribeToMessages(rideId, (updatedMessages) => {
          setMessages(updatedMessages);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        });

        setUnsubscribe(() => unsubFn);
        setLoading(false);
      } catch (error) {
        console.error('[CHAT] Error initializing chat:', error);
        setLoading(false);
      }
    };

    initializeChat();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [rideId, bookingId, ride, booking, auth.user]);

  // Real-time recipient profile fetching
  useEffect(() => {
    if (!ride || !auth.user) return;

    const isDriver = ride.driverId === auth.user.id;
    const recipientId = isDriver
      ? (booking?.passengerId || ride.bookedSeats?.find(b => b.status === 'accepted')?.passengerId)
      : ride.driverId;

    if (!recipientId) return;

    // Set initial fallback name before firebase snapshot returns
    if (isDriver) {
      const acceptedBooking = ride.bookedSeats?.find(b => b.status === 'accepted');
      setRecipientName(acceptedBooking?.passengerName || 'Passenger');
    } else {
      setRecipientName(ride.driverName || 'Car Owner');
    }

    console.log('[CHAT] Subscribing to recipient profile:', recipientId);
    const userRef = doc(db, 'users', recipientId);
    const unsub = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setRecipientName(userData.fullName || 'User');
          setRecipientAvatar(userData.profileImage || '');
          if (userData.phone) {
            setRecipientPhone(userData.phone);
          }
          console.log('[CHAT] ✅ Recipient profile updated in real-time');
        }
      },
      (error) => {
        console.error('[CHAT] Error listening to recipient profile:', error);
      }
    );

    return () => unsub();
  }, [ride, booking, auth.user]);

  useEffect(() => {
    if (auth.user?.mutedChats && rideId) {
      const expiry = auth.user.mutedChats[rideId];
      if (expiry) {
        setIsMuted(new Date(expiry) > new Date());
      } else {
        setIsMuted(false);
      }
    }
  }, [auth.user, rideId]);

  const handleMuteChat = async (hours: number | 'ride') => {
    if (!auth.user || !rideId) return;

    let expirationDate: Date;
    if (hours === 'ride') {
      if (ride && ride.departureTime) {
        expirationDate = new Date(new Date(ride.departureTime).getTime() + 3 * 60 * 60 * 1000);
      } else {
        expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    } else {
      expirationDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const isoStr = expirationDate.toISOString();

    try {
      const userRef = doc(db, 'users', auth.user.id);
      await updateDoc(userRef, {
        [`mutedChats.${rideId}`]: isoStr,
      });

      setIsMuted(true);
      setShowMuteModal(false);
    } catch (error) {
      console.error('[CHAT] Error muting chat:', error);
    }
  };

  const handleUnmuteChat = async () => {
    if (!auth.user || !rideId) return;

    try {
      const userRef = doc(db, 'users', auth.user.id);
      await updateDoc(userRef, {
        [`mutedChats.${rideId}`]: deleteField(),
      });

      setIsMuted(false);
      setShowMuteModal(false);
    } catch (error) {
      console.error('[CHAT] Error unmuting chat:', error);
    }
  };

  const handlePhoneCall = useCallback(() => {
    if (!isChatAllowed) {
      alert('Phone numbers are only available after your booking is accepted');
      return;
    }
    if (!recipientPhone) {
      alert('Phone number not available');
      return;
    }
    // Show popup with phone options during active ride
    setShowPhonePopup(true);
  }, [recipientPhone, isChatAllowed]);

  const handleSendMessage = useCallback(async () => {
    if (!isChatAllowed || !messageText.trim() || !ride || !auth.user) {
      return;
    }

    try {
      setSending(true);
      const isDriver = ride.driverId === auth.user.id;
      
      let recipientId: string;
      if (isDriver) {
        // Driver: get passenger from ride's booked seats (accepted booking)
        const acceptedBooking = ride.bookedSeats?.find(b => b.status === 'accepted');
        recipientId = acceptedBooking?.passengerId || '';
        
        if (!recipientId) {
          console.error('[CHAT] No accepted passenger booking found');
          setSending(false);
          return;
        }
      } else {
        // Passenger: get driver from ride
        recipientId = ride.driverId;
      }

      // Send message to Firestore
      await sendMessage(rideId, auth.user.id, auth.user.fullName || 'User', recipientId, messageText, auth.user.profileImage || '');

      // Animate send button
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.8, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();

      setMessageText('');
      setSending(false);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('[CHAT] Error sending message:', error);
      setSending(false);
    }
  }, [isChatAllowed, messageText, ride, booking, auth.user, rideId]);

  const formatMessageTime = (timestamp: Timestamp | any) => {
    try {
      let date: Date;
      if (timestamp?.toDate) {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return '';
      }

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Now';
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (error) {
      return '';
    }
  };

  // Render message bubble — delegates to the MessageBubble component
  const renderMessageBubble = ({ item: message }: { item: Message }) => {
    const isCurrentUser = message.senderId === auth.user?.id;
    return (
      <MessageBubble
        message={message}
        isCurrentUser={isCurrentUser}
        recipientAvatar={recipientAvatar}
        formatTime={formatMessageTime}
      />
    );
  };

  const EmptyState = () => (
    <View style={chatStyles.emptyContainer}>
      <MaterialCommunityIcons name="message-outline" size={64} color={WARM_CORE.border} />
      <Text style={chatStyles.emptyTitle}>No messages yet</Text>
      <Text style={chatStyles.emptySubtitle}>Messages will appear here</Text>
      {isChatAllowed && (
        <View style={chatStyles.starterMessagesHint}>
          <MaterialCommunityIcons name="lightbulb-outline" size={16} color={WARM_CORE.accent} />
          <Text style={chatStyles.starterMessagesText}>
            Say hello! Share location or ask questions
          </Text>
        </View>
      )}
    </View>
  );


  return (
    <SafeAreaView style={chatStyles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={chatStyles.container}>
        {/* Header */}
        <Animated.View
          style={[
            chatStyles.header,
            { opacity: headerAnim.opacity, transform: [{ translateY: headerAnim.translateY }] },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={chatStyles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
          </TouchableOpacity>

          <View style={chatStyles.headerInfo}>
            <Text style={chatStyles.headerTitle}>{recipientName}</Text>
            <View style={chatStyles.statusContainer}>
              <View style={[chatStyles.statusIndicator, { backgroundColor: isChatAllowed ? WARM_CORE.success : WARM_CORE.textSecondary }]} />
              <Text style={chatStyles.statusText}>
                {isChatAllowed ? 'Available' : 'Unavailable'}
              </Text>
            </View>
          </View>

          {isChatAllowed && (
            <TouchableOpacity
              style={chatStyles.muteButton}
              onPress={() => setShowMuteModal(true)}
            >
              <MaterialCommunityIcons
                name={isMuted ? 'bell-off' : 'bell-outline'}
                size={20}
                color={WARM_CORE.primary}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={chatStyles.phoneButton}
            onPress={handlePhoneCall}
            disabled={!isChatAllowed}
          >
            <MaterialCommunityIcons
              name="phone"
              size={20}
              color={isChatAllowed && recipientPhone ? WARM_CORE.success : WARM_CORE.textSecondary}
            />
            {/* Badge indicator when phone is available */}
            {isChatAllowed && recipientPhone && (
              <View style={chatStyles.phoneAvailableBadge} />
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Restricted Banner */}
        {!isChatAllowed && (
          <View style={[chatStyles.restrictedBanner, {
            backgroundColor: ride?.status === 'cancelled' ? '#FEE2E2' : WARM_CORE.card,
            borderColor: ride?.status === 'cancelled' ? '#FCA5A5' : WARM_CORE.border,
            borderWidth: 0.5,
          }]}>
            <MaterialCommunityIcons
              name={ride?.status === 'cancelled' ? 'lock-outline' : 'clock-outline'}
              size={15}
              color={ride?.status === 'cancelled' ? '#EF4444' : WARM_CORE.textSecondary}
            />
            <Text style={[chatStyles.restrictedText, { color: ride?.status === 'cancelled' ? '#EF4444' : WARM_CORE.textSecondary }]}>
              {ride?.status === 'cancelled' ? 'Chat is no longer available' : 'Chat available once your booking is accepted'}
            </Text>
          </View>
        )}

        {/* Loading State */}
        {loading ? (
          <View style={chatStyles.loadingContainer}>
            <ActivityIndicator size="large" color={WARM_CORE.primary} />
            <Text style={chatStyles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <>
            {/* Messages List */}
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessageBubble}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                chatStyles.messagesContainer,
                messages.length === 0 && { flex: 1, justifyContent: 'center' },
              ]}
              onContentSizeChange={() => {
                if (messages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
              ListEmptyComponent={<EmptyState />}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.5}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
            />

            {/* Input Area */}
            <Animated.View
              style={[
                chatStyles.inputContainer,
                { opacity: inputAnim.opacity, transform: [{ translateY: inputAnim.translateY }] },
              ]}
            >
              <View style={chatStyles.inputWrapper}>
                {/* Text Input */}
                <TextInput
                  style={[
                    chatStyles.textInput,
                    (!isChatAllowed || !isChatWritable) && { opacity: 0.5 },
                  ]}
                  placeholder={isChatAllowed ? (isChatWritable ? "Message..." : "Chat is read-only") : "Chat ended"}
                  placeholderTextColor={WARM_CORE.textSecondary}
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  maxLength={500}
                  editable={isChatAllowed && isChatWritable && !sending}
                  scrollEnabled={false}
                />
              </View>

              {/* Send Button */}
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity
                  style={[
                    chatStyles.sendButton,
                    {
                      backgroundColor:
                        messageText.trim() && isChatAllowed && isChatWritable && !sending
                          ? WARM_CORE.primary
                          : WARM_CORE.border,
                    },
                  ]}
                  onPress={handleSendMessage}
                  disabled={!messageText.trim() || !isChatAllowed || !isChatWritable || sending}
                  activeOpacity={0.7}
                >
                  {sending ? (
                    <ActivityIndicator size={18} color={WARM_CORE.white} />
                  ) : (
                    <MaterialCommunityIcons
                      name="send"
                      size={18}
                      color={messageText.trim() && isChatAllowed ? WARM_CORE.white : WARM_CORE.textSecondary}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Mute Modal */}
      <Modal visible={showMuteModal} animationType="fade" transparent onRequestClose={() => setShowMuteModal(false)}>
        <TouchableOpacity style={chatStyles.phonePopupOverlay} activeOpacity={1} onPress={() => setShowMuteModal(false)}>
          <View style={chatStyles.phonePopupModal}>
            <TouchableOpacity
              style={chatStyles.phonePopupClose}
              onPress={() => setShowMuteModal(false)}
            >
              <MaterialCommunityIcons name="close" size={24} color={WARM_CORE.text} />
            </TouchableOpacity>

            <MaterialCommunityIcons name={isMuted ? "bell-off" : "bell"} size={48} color={WARM_CORE.primary} style={chatStyles.phonePopupIcon} />

            <Text style={chatStyles.phonePopupTitle}>
              {isMuted ? "Unmute Chat Notifications" : "Mute Chat Notifications"}
            </Text>

            <Text style={[chatStyles.phonePopupHint, { marginBottom: 20, textAlign: 'center', marginTop: 0 }]}>
              {isMuted 
                ? "You have currently muted push notifications for this chat. Would you like to unmute?" 
                : "Choose how long you want to mute push notifications for this chat."}
            </Text>

            {isMuted ? (
              <TouchableOpacity 
                style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary, width: '100%', marginLeft: 0, paddingVertical: 12 }]} 
                onPress={handleUnmuteChat}
              >
                <Text style={{ color: WARM_CORE.white, fontWeight: '600', fontSize: 16 }}>Unmute Notifications</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: '100%', gap: 10 }}>
                <TouchableOpacity 
                  style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary, marginLeft: 0, paddingVertical: 12 }]} 
                  onPress={() => handleMuteChat(1)}
                >
                  <Text style={{ color: WARM_CORE.white, fontWeight: '600', fontSize: 16 }}>Mute for 1 Hour</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary, marginLeft: 0, paddingVertical: 12 }]} 
                  onPress={() => handleMuteChat(8)}
                >
                  <Text style={{ color: WARM_CORE.white, fontWeight: '600', fontSize: 16 }}>Mute for 8 Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary, marginLeft: 0, paddingVertical: 12 }]} 
                  onPress={() => handleMuteChat(24)}
                >
                  <Text style={{ color: WARM_CORE.white, fontWeight: '600', fontSize: 16 }}>Mute for 24 Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary, marginLeft: 0, paddingVertical: 12 }]} 
                  onPress={() => handleMuteChat('ride')}
                >
                  <Text style={{ color: WARM_CORE.white, fontWeight: '600', fontSize: 16 }}>Mute until ride ends</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Phone Popup Modal - Show during active ride */}
      {showPhonePopup && isChatAllowed && (
        <View style={chatStyles.phonePopupOverlay}>
          <View style={chatStyles.phonePopupModal}>
            <TouchableOpacity
              style={chatStyles.phonePopupClose}
              onPress={() => setShowPhonePopup(false)}
            >
              <MaterialCommunityIcons name="close" size={24} color={WARM_CORE.text} />
            </TouchableOpacity>

            <MaterialCommunityIcons name="phone" size={48} color={WARM_CORE.primary} style={chatStyles.phonePopupIcon} />

            <Text style={chatStyles.phonePopupTitle}>
              {recipientName}
            </Text>

            {/* Recipient Phone */}
            <View style={chatStyles.phonePopupSection}>
              <Text style={chatStyles.phonePopupLabel}>
                Their Phone
              </Text>
              <View style={chatStyles.phonePopupNumber}>
                <Text style={chatStyles.phonePopupNumberText}>
                  {recipientPhone || 'Not available'}
                </Text>
                {recipientPhone && (
                  <TouchableOpacity
                    onPress={() => {
                      Linking.openURL(`tel:${recipientPhone}`);
                      setShowPhonePopup(false);
                    }}
                    style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.success }]}
                  >
                    <MaterialCommunityIcons name="phone-outline" size={18} color={WARM_CORE.white} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Divider */}
            <View style={chatStyles.phonePopupDivider} />

            {/* Your Phone */}
            <View style={chatStyles.phonePopupSection}>
              <Text style={chatStyles.phonePopupLabel}>
                Your Phone
              </Text>
              <View style={chatStyles.phonePopupNumber}>
                <Text style={chatStyles.phonePopupNumberText}>
                  {userPhone || 'Not available'}
                </Text>
                {userPhone && (
                  <TouchableOpacity
                    onPress={() => {
                      Linking.openURL(`tel:${userPhone}`);
                      setShowPhonePopup(false);
                    }}
                    style={[chatStyles.phonePopupCallButton, { backgroundColor: WARM_CORE.primary }]}
                  >
                    <MaterialCommunityIcons name="phone-outline" size={18} color={WARM_CORE.white} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={[chatStyles.phonePopupHint, { color: WARM_CORE.textSecondary }]}>
              📞 Tap the phone icon to make a call
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const chatStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    backgroundColor: WARM_CORE.card,
    borderBottomColor: WARM_CORE.border,
  },
  backButton: {
    padding: 6,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
    color: WARM_CORE.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '400',
    color: WARM_CORE.textSecondary,
  },
  phoneButton: {
    padding: 6,
    marginLeft: 12,
    position: 'relative',
  },
  phoneAvailableBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.success,
  },

  // Messages Container
  messagesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },

  // Message Bubbles
  messageBubbleContainer: {
    marginVertical: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  messageBubbleContainerLeft: {
    justifyContent: 'flex-start',
  },
  messageBubbleContainerRight: {
    justifyContent: 'flex-end',
  },

  avatarContainer: {
    width: 32,
    height: 32,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  messageBubbleLeft: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageBubbleRight: {
    backgroundColor: WARM_CORE.primary,
  },

  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.primary,
    marginBottom: 1,
  },

  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  messageTextLeft: {
    color: WARM_CORE.text,
  },
  messageTextRight: {
    color: WARM_CORE.white,
  },

  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    justifyContent: 'flex-end',
    gap: 2,
  },
  messageTime: {
    fontSize: 10,
  },
  messageTimeLeft: {
    color: WARM_CORE.textSecondary,
  },
  messageTimeRight: {
    color: 'rgba(255, 255, 255, 0.75)',
  },

  // System Messages
  systemMessageContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  systemMessageBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: WARM_CORE.card,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  systemMessageText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: WARM_CORE.textSecondary,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    color: WARM_CORE.text,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    color: WARM_CORE.textSecondary,
  },
  starterMessagesHint: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: WARM_CORE.card,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  },
  starterMessagesText: {
    fontSize: 12,
    flex: 1,
    color: WARM_CORE.textSecondary,
  },

  // Restricted Banner
  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
  },
  restrictedText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
  },

  // Input Container
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.background,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: WARM_CORE.card,
    borderColor: WARM_CORE.border,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 6,
    maxHeight: 100,
    color: WARM_CORE.text,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Phone Popup Styles
  phonePopupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  phonePopupModal: {
    width: '85%',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    backgroundColor: WARM_CORE.background,
    borderColor: WARM_CORE.border,
  },
  phonePopupClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  phonePopupIcon: {
    marginTop: 16,
    marginBottom: 16,
  },
  phonePopupTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 24,
    color: WARM_CORE.text,
  },
  phonePopupSection: {
    width: '100%',
    marginBottom: 16,
  },
  phonePopupLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: WARM_CORE.primary,
  },
  phonePopupNumber: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'space-between',
    backgroundColor: WARM_CORE.card,
    borderColor: WARM_CORE.border,
  },
  phonePopupNumberText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    color: WARM_CORE.text,
  },
  phonePopupCallButton: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phonePopupDivider: {
    height: 1,
    width: '100%',
    marginVertical: 20,
    backgroundColor: WARM_CORE.border,
  },
  phonePopupHint: {
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  muteButton: {
    padding: 6,
    marginLeft: 12,
  },
});
