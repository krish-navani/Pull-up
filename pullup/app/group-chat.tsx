import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  ViewStyle,
  TextStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, onSnapshot, updateDoc, deleteField, arrayUnion, collection } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import UserAvatar from '@/components/UserAvatar';
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
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { uploadImageToCloudinaryWithPublicId } from '@/utils/cloudinaryService';

export default function GroupChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { rideId, rideType } = params as { rideId: string; rideType: 'carpool' | 'taxipool' };
  
  const { auth, authInitializing } = useAppContext();
  
  // State
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [room, setRoom] = useState<GroupChatRoom | any>(null);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [memberStatuses, setMemberStatuses] = useState<{ [uid: string]: { status: string; lastSeen?: string } }>({});
  
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [muteVisible, setMuteVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Rich Messaging States
  const [messageLimit, setMessageLimit] = useState(30);
  const [activeLocationSharing, setActiveLocationSharing] = useState<{ messageId: string; expiresAt: string } | null>(null);
  const [attachmentPanelVisible, setAttachmentPanelVisible] = useState(false);
  const [destinationModalVisible, setDestinationModalVisible] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  // Typing Indicator States
  const typingTimeoutRef = useRef<any>(null);
  const isCurrentlyTyping = useRef(false);
  
  const flatListRef = useRef<FlatList>(null);

  // Predefined destinations for sharing
  const PREDEFINED_DESTINATIONS = [
    { name: 'Atlas University', latitude: 19.0596, longitude: 72.8295 },
    { name: 'University Main Gate', latitude: 19.0601, longitude: 72.8291 },
    { name: 'Hostel Block A', latitude: 19.0610, longitude: 72.8310 },
    { name: 'Kalyan Commute Point', latitude: 19.2437, longitude: 73.1350 },
    { name: 'Thane Station East', latitude: 19.1860, longitude: 72.9759 },
    { name: 'Mumbai Airport T2', latitude: 19.0896, longitude: 72.8656 }
  ];

  // 1. Subscribe to Chat Room Details and Messages (with pagination limit)
  useEffect(() => {
    if (!rideId || authInitializing || !auth.user) return;

    setLoading(true);
    const unsubRoom = subscribeToGroupChatRoom(rideId, (chatRoom) => {
      setRoom(chatRoom);
    });

    const unsubMessages = subscribeToGroupMessages(rideId, messageLimit, (chatMessages) => {
      setMessages(chatMessages);
      setLoading(false);
    });

    return () => {
      unsubRoom();
      unsubMessages();
    };
  }, [rideId, authInitializing, auth.user, messageLimit]);

  // 2. Subscribe to Ride/Pool Document and Members details
  useEffect(() => {
    if (!rideId || !rideType || authInitializing || !auth.user) return;

    if (rideType === 'carpool') {
      const rideRef = doc(db, 'rides', rideId);
      const unsubRide = onSnapshot(rideRef, (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as any;
          setRideDetails(data);
          
          const rideMembers = [];
          // Add Driver
          rideMembers.push({
            id: data?.driverId,
            fullName: data?.driverName,
            role: 'driver',
            image: null
          });
          
          // Add Confirmed Passengers
          if (data?.bookedSeats) {
            data.bookedSeats.forEach((seat: any) => {
              if (seat.status === 'confirmed' || seat.status === 'accepted') {
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
      const poolRef = doc(db, 'taxiPools', rideId);
      const unsubPool = onSnapshot(poolRef, (snap) => {
        if (snap.exists()) {
          setRideDetails({ id: snap.id, ...snap.data() });
        }
      });

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
  }, [rideId, rideType, authInitializing, auth.user, rideDetails?.creatorId]);

  // 3. Subscribe to member presence documents
  useEffect(() => {
    if (members.length === 0) return;

    const unsubs: (() => void)[] = [];
    members.forEach((member) => {
      if (!member.id) return;
      const userRef = doc(db, 'users', member.id);
      const unsubUser = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const userData = snap.data();
          setMemberStatuses(prev => ({
            ...prev,
            [member.id]: {
              status: userData.status || 'offline',
              lastSeen: userData.lastSeen || ''
            }
          }));
        }
      });
      unsubs.push(unsubUser);
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [members]);

  // 4. Update Muted status
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

  // 5. Read Receipts Syncer (update readBy on loaded unread messages)
  useEffect(() => {
    if (!rideId || !auth.user || messages.length === 0) return;

    const unreadMessageIds = messages
      .filter(msg => msg.senderId !== 'system' && msg.senderId !== auth.user?.id && (!msg.readBy || !msg.readBy.includes(auth.user!.id)))
      .map(msg => msg.id);

    if (unreadMessageIds.length === 0) return;

    unreadMessageIds.forEach(async (msgId) => {
      try {
        const msgRef = doc(db, 'rideChats', rideId, 'messages', msgId);
        await updateDoc(msgRef, {
          readBy: arrayUnion(auth.user!.id)
        });
      } catch (err) {
        console.warn('[GROUP CHAT] Failed to update readBy status for:', msgId, err);
      }
    });
  }, [messages, rideId, auth.user]);

  // 6. Live Location Sharing Background Updater (every 10s)
  useEffect(() => {
    if (!activeLocationSharing || !rideId) return;

    console.log('[LIVE LOCATION] Sharing active. Interval starting...');
    const interval = setInterval(async () => {
      // Check if expired
      if (activeLocationSharing.expiresAt !== 'ride_end') {
        const expiry = new Date(activeLocationSharing.expiresAt);
        if (new Date() > expiry) {
          console.log('[LIVE LOCATION] Sharing duration expired.');
          setActiveLocationSharing(null);
          return;
        }
      } else if (rideDetails && (rideDetails.status === 'completed' || rideDetails.status === 'cancelled')) {
        console.log('[LIVE LOCATION] Ride has ended. Stopping updates.');
        setActiveLocationSharing(null);
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[LIVE LOCATION] Foreground permission lost.');
          setActiveLocationSharing(null);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const msgRef = doc(db, 'rideChats', rideId, 'messages', activeLocationSharing.messageId);
        await updateDoc(msgRef, {
          'location.latitude': loc.coords.latitude,
          'location.longitude': loc.coords.longitude
        });
        console.log('[LIVE LOCATION] Shared coordinates updated successfully');
      } catch (e) {
        console.warn('[LIVE LOCATION] Failed to update shared location:', e);
      }
    }, 10000); // 10 second minimum interval

    return () => clearInterval(interval);
  }, [activeLocationSharing, rideId, rideDetails]);

  // Clean up typing status on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingStatus(false);
    };
  }, []);

  const setTypingStatus = async (isTyping: boolean) => {
    if (!rideId || !auth.user) return;
    try {
      const roomRef = doc(db, 'rideChats', rideId);
      await updateDoc(roomRef, {
        [`typing.${auth.user.id}`]: isTyping
      });
    } catch (e) {
      console.warn('[GROUP CHAT] Failed to update typing state:', e);
    }
  };

  const handleTextChange = (text: string) => {
    setMessageText(text);

    if (!isCurrentlyTyping.current) {
      isCurrentlyTyping.current = true;
      setTypingStatus(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTyping.current = false;
      setTypingStatus(false);
    }, 2500);
  };

  const handleSend = async () => {
    if (!messageText.trim() || !auth.user || sending) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isCurrentlyTyping.current = false;
    setTypingStatus(false);

    setSending(true);
    try {
      await sendGroupMessage(
        rideId,
        auth.user.id,
        auth.user.fullName,
        auth.user.profileImage || '',
        messageText,
        'text'
      );
      setMessageText('');
    } catch (err) {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  // Image Picking with Compression and 10MB limit enforcement
  const handlePickImage = async (useCamera = false) => {
    setAttachmentPanelVisible(false);
    try {
      const { status } = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission is required to choose photos/use camera.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const imageUri = result.assets[0].uri;

      // Check size (10 MB limit)
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists) {
        const sizeInMb = fileInfo.size / (1024 * 1024);
        if (sizeInMb > 10) {
          Alert.alert('File Too Large', 'Maximum upload limit is 10 MB. Please choose a smaller image.');
          return;
        }
      }

      setSending(true);
      // Upload compressed image
      const { secure_url, public_id } = await uploadImageToCloudinaryWithPublicId(imageUri, 'chat_attachments');

      await sendGroupMessage(
        rideId,
        auth.user!.id,
        auth.user!.fullName,
        auth.user!.profileImage || '',
        'Sent an image',
        'image',
        { imageUrl: secure_url, public_id }
      );
    } catch (err: any) {
      console.error('[GROUP CHAT] Image attach failed:', err);
      Alert.alert('Upload Failed', 'Could not upload selected image.');
    } finally {
      setSending(false);
    }
  };

  // Start Live Location Sharing
  const handleShareLiveLocation = async (durationMinutes: number | 'ride') => {
    setAttachmentPanelVisible(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to share live coordinates.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const expiresAt = durationMinutes === 'ride'
        ? 'ride_end'
        : new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

      setSending(true);
      const msgId = await sendGroupMessage(
        rideId,
        auth.user!.id,
        auth.user!.fullName,
        auth.user!.profileImage || '',
        'Shared live location',
        'location',
        {
          location: {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            durationMinutes: durationMinutes === 'ride' ? undefined : durationMinutes,
            expiresAt
          }
        }
      );

      setActiveLocationSharing({
        messageId: msgId,
        expiresAt
      });
      Alert.alert('Live Location Shared', 'Sharing location in real-time with other commuters.');
    } catch (err) {
      Alert.alert('Error', 'Failed to share location.');
    } finally {
      setSending(false);
    }
  };

  // Share Predefined Destination
  const handleShareDestination = async (dest: { name: string; latitude: number; longitude: number }) => {
    setDestinationModalVisible(false);
    setSending(true);
    try {
      await sendGroupMessage(
        rideId,
        auth.user!.id,
        auth.user!.fullName,
        auth.user!.profileImage || '',
        `Shared destination: ${dest.name}`,
        'destination',
        {
          destination: {
            address: dest.name,
            latitude: dest.latitude,
            longitude: dest.longitude
          }
        }
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to share destination.');
    } finally {
      setSending(false);
    }
  };

  // Share Ride Details Card
  const handleShareRideCard = async () => {
    setAttachmentPanelVisible(false);
    if (!rideDetails) return;
    setSending(true);
    try {
      const pickupAddr = rideType === 'carpool' ? rideDetails.pickupLocation?.address : 'Atlas University';
      const dropAddr = rideType === 'carpool' ? rideDetails.dropLocation?.address : rideDetails.destination?.address;

      await sendGroupMessage(
        rideId,
        auth.user!.id,
        auth.user!.fullName,
        auth.user!.profileImage || '',
        'Shared ride details',
        'ride_card',
        {
          rideCard: {
            rideId,
            rideType,
            pickupAddress: pickupAddr,
            dropAddress: dropAddr,
            price: rideDetails.price || 0,
            departureTime: rideDetails.departureTime || ''
          }
        }
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to share ride card.');
    } finally {
      setSending(false);
    }
  };

  // Load older messages for pagination
  const handleLoadOlder = () => {
    setMessageLimit(prev => prev + 30);
  };

  // Resolve Typing Banner text
  const typingBannerText = useMemo(() => {
    if (!room || !room.typing) return null;
    const typers = Object.keys(room.typing)
      .filter(uid => uid !== auth.user?.id && room.typing[uid] === true)
      .map(uid => {
        const member = members.find(m => m.id === uid);
        return member ? member.fullName.split(' ')[0] : 'Someone';
      });

    if (typers.length === 0) return null;
    if (typers.length === 1) return `${typers[0]} is typing...`;
    if (typers.length === 2) return `${typers[0]} and ${typers[1]} are typing...`;
    return 'Several people are typing...';
  }, [room, members, auth.user?.id]);

  const handleStartRide = async () => {
    setActionsVisible(false);
    try {
      if (rideType === 'carpool') {
        await startRide(rideId);
      } else {
        await updateTaxiPoolStatus(rideId, 'in_progress');
      }
      await sendGroupMessage(rideId, 'system', 'System', '', 'Ride has started', 'system');
      
      if (rideType === 'carpool') {
        router.push({ pathname: '/navigation', params: { rideId } });
      } else {
        router.push({ pathname: '/taxi-pool-details', params: { poolId: rideId } });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to start ride.');
    }
  };

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
        'system',
        { triggerUserId: auth.user.id }
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

  const handleMuteChat = async (hours: number | 'ride') => {
    if (!auth.user || !rideId) return;

    let expirationDate: Date;
    if (hours === 'ride') {
      if (rideDetails && rideDetails.departureTime) {
        expirationDate = new Date(new Date(rideDetails.departureTime).getTime() + 3 * 60 * 60 * 1000);
      } else {
        expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    } else {
      expirationDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    try {
      const userRef = doc(db, 'users', auth.user.id);
      await updateDoc(userRef, {
        [`mutedChats.${rideId}`]: expirationDate.toISOString(),
      });
      setIsMuted(true);
      setMuteVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to mute chat notifications.');
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
      setMuteVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to unmute chat notifications.');
    }
  };

  const statusInfo = useMemo(() => {
    const status = rideDetails?.status || 'active';
    switch (status) {
      case 'in_progress':
        return { text: 'In Progress', bg: 'rgba(255, 122, 51, 0.15)', border: WARM_CORE.accent, color: WARM_CORE.primary };
      case 'completed':
        return { text: 'Completed', bg: 'rgba(16, 185, 129, 0.15)', border: WARM_CORE.success, color: WARM_CORE.success };
      case 'cancelled':
      case 'CANCELLED':
        return { text: 'Cancelled', bg: 'rgba(239, 68, 68, 0.15)', border: WARM_CORE.error, color: WARM_CORE.error };
      case 'expired':
        return { text: 'Expired', bg: 'rgba(239, 68, 68, 0.15)', border: WARM_CORE.error, color: WARM_CORE.error };
      default:
        return { text: 'Upcoming Ride', bg: WARM_CORE.card, border: WARM_CORE.border, color: WARM_CORE.textSecondary };
    }
  }, [rideDetails?.status]);

  const isDriverOrHost = useMemo(() => {
    if (!auth.user) return false;
    return rideType === 'carpool'
      ? rideDetails?.driverId === auth.user.id
      : rideDetails?.creatorId === auth.user.id;
  }, [rideDetails, rideType, auth.user]);

  const status = rideDetails?.status || (rideType === 'carpool' ? 'active' : 'OPEN');
  const isChatWritable = useMemo(() => {
    return rideType === 'carpool'
      ? status === 'active' || status === 'expired' || status === 'in_progress'
      : status === 'OPEN' || status === 'FULL' || status === 'in_progress';
  }, [status, rideType]);

  const driverOrHostName = rideType === 'carpool'
    ? rideDetails?.driverName || 'Driver'
    : rideDetails?.creatorName || 'Host';

  const pickup = rideType === 'carpool' ? rideDetails?.pickupLocation?.address || 'Pickup' : 'Atlas University';
  const destination = rideType === 'carpool' ? rideDetails?.dropLocation?.address || 'Destination' : rideDetails?.destination?.address || 'Destination';

  const departureDate = useMemo(() => {
    if (!rideDetails?.departureTime) return 'Departure Time';
    const date = new Date(rideDetails.departureTime);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ' - ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, [rideDetails?.departureTime]);

  const formatMessageTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderBubbleContent = (item: GroupChatMessage, isCurrentUser: boolean) => {
    const textColor = isCurrentUser ? WARM_CORE.white : WARM_CORE.text;

    switch (item.type) {
      case 'image':
        return (
          <TouchableOpacity onPress={() => setFullscreenImageUri(item.imageUrl || null)} activeOpacity={0.9}>
            <ExpoImage
              source={{ uri: item.imageUrl }}
              style={styles.bubbleImage}
              contentFit="cover"
              transition={200}
            />
            {item.text && item.text !== 'Sent an image' && (
              <Text style={[styles.bubbleCaptionText, { color: textColor }]}>
                {item.text}
              </Text>
            )}
          </TouchableOpacity>
        );

      case 'location':
        if (!item.location) return null;
        return (
          <TouchableOpacity
            style={styles.bubbleCardContainer}
            onPress={() => {
              // Open in-app navigation map with sender's shared coordinates
              router.push({
                pathname: '/navigation',
                params: {
                  sharedLat: String(item.location!.latitude),
                  sharedLng: String(item.location!.longitude),
                  senderName: item.senderName,
                }
              } as any);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.bubbleCardHeader}>
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color={isCurrentUser ? '#FFF' : WARM_CORE.primary} />
              <Text style={[styles.bubbleCardHeaderText, { color: textColor }]}>Live Location Shared</Text>
            </View>
            <View style={styles.bubbleMapWrapper}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.bubbleMap}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{
                  latitude: item.location.latitude,
                  longitude: item.location.longitude,
                  latitudeDelta: 0.012,
                  longitudeDelta: 0.012,
                }}
              >
                <Marker coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }} />
              </MapView>
            </View>
            <Text style={[styles.bubbleCardSubtext, { color: isCurrentUser ? 'rgba(255,255,255,0.8)' : WARM_CORE.textSecondary }]}>
              Tap to track on map
            </Text>
          </TouchableOpacity>
        );

      case 'destination':
        if (!item.destination) return null;
        return (
          <View style={styles.bubbleCardContainer}>
            <View style={styles.bubbleCardHeader}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={isCurrentUser ? '#FFF' : WARM_CORE.primary} />
              <Text style={[styles.bubbleCardHeaderText, { color: textColor }]} numberOfLines={1}>
                {item.destination.address}
              </Text>
            </View>
            <View style={styles.bubbleMapWrapper}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.bubbleMap}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{
                  latitude: item.destination.latitude,
                  longitude: item.destination.longitude,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                <Marker coordinate={{ latitude: item.destination.latitude, longitude: item.destination.longitude }} />
              </MapView>
            </View>
          </View>
        );

      case 'ride_card':
        if (!item.rideCard) return null;
        const dispTime = item.rideCard.departureTime
          ? new Date(item.rideCard.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + new Date(item.rideCard.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '';
        return (
          <View style={styles.rideCardBubble}>
            <View style={styles.rideCardBadge}>
              <Text style={styles.rideCardBadgeText}>
                {item.rideCard.rideType === 'carpool' ? 'CarPool details' : 'TaxiPool details'}
              </Text>
            </View>
            <View style={styles.rideCardRoute}>
              <Text style={styles.rideCardRouteText} numberOfLines={1}>
                {item.rideCard.pickupAddress.split(',')[0]} ➔ {item.rideCard.dropAddress.split(',')[0]}
              </Text>
            </View>
            <Text style={styles.rideCardTime}>{dispTime}</Text>
            <View style={styles.rideCardFooter}>
              <Text style={styles.rideCardPrice}>₹{item.rideCard.price} per seat</Text>
              <TouchableOpacity
                style={styles.rideCardBtn}
                onPress={() => {
                  if (item.rideCard!.rideType === 'carpool') {
                    router.push({ pathname: '/ride-details', params: { rideId: item.rideCard!.rideId } });
                  } else {
                    router.push({ pathname: '/taxi-pool-details', params: { poolId: item.rideCard!.rideId } });
                  }
                }}
              >
                <Text style={styles.rideCardBtnText}>View Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      default:
        return (
          <Text style={[styles.messageText, isCurrentUser ? styles.textRight : styles.textLeft]}>
            {item.text}
          </Text>
        );
    }
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
      {status === 'in_progress' ? (
        <TouchableOpacity
          onPress={() => {
            if (rideType === 'carpool') {
              router.push({ pathname: '/navigation', params: { rideId } });
            } else {
              router.push({ pathname: '/taxi-pool-details', params: { poolId: rideId } });
            }
          }}
          style={[styles.statusBanner, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
        >
          <MaterialCommunityIcons name="map-marker-radius" size={14} color={statusInfo.color} />
          <Text style={[styles.statusBannerText, { color: statusInfo.color, textDecorationLine: 'underline', marginLeft: 4 }]}>
            Ride Ongoing: Tap to track navigation
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.statusBanner, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
          <MaterialCommunityIcons name="information-outline" size={14} color={statusInfo.color} />
          <Text style={[styles.statusBannerText, { color: statusInfo.color }]}>
            Ride Status: {statusInfo.text}
          </Text>
        </View>
      )}

      {/* Participants Row with Presence Indicators */}
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
            const presence = memberStatuses[item.id] || { status: 'offline' };
            const isOnline = presence.status === 'online' || presence.status === 'navigating' || presence.status === 'in_progress';
            
            return (
              <View style={styles.participantItem}>
                <View style={[styles.avatarCircle, isHost && styles.hostAvatarCircle]}>
                  <UserAvatar imageUrl={item.image} name={item.fullName} size={40} />
                  {isHost && (
                    <View style={styles.hostBadge}>
                      <MaterialCommunityIcons name="star" size={8} color={WARM_CORE.white} />
                    </View>
                  )}
                  {/* Presence indicator: online green dot, active/navigating orange dot, offline grey */}
                  <View style={[
                    styles.onlineDot,
                    { backgroundColor: isOnline ? '#10B981' : '#6B7280' }
                  ]} />
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
          ListHeaderComponent={
            messages.length >= 30 ? (
              <TouchableOpacity style={styles.loadOlderBtn} onPress={handleLoadOlder}>
                <Text style={styles.loadOlderText}>Load older messages</Text>
              </TouchableOpacity>
            ) : null
          }
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
                  <UserAvatar imageUrl={item.senderPhoto} name={item.senderName} size={32} style={{ marginRight: 8 }} />
                )}
                <View style={styles.messageBubbleContainer}>
                  {!isCurrentUser && <Text style={styles.messageSenderName}>{item.senderName}</Text>}
                  <View style={[
                    styles.messageBubble,
                    isCurrentUser ? styles.bubbleRight : styles.bubbleLeft,
                    item.type === 'image' && styles.bubbleImageContainer
                  ]}>
                    
                    {renderBubbleContent(item, isCurrentUser)}

                    {/* Delivery Status and Time ticks */}
                    <View style={styles.messageMetaFooter}>
                      <Text style={[styles.messageTime, isCurrentUser ? styles.timeRight : styles.timeLeft]}>
                        {formatMessageTime(item.createdAt)}
                      </Text>
                      {isCurrentUser && (
                        <View style={styles.ticksContainer}>
                          {item.createdAt === null ? (
                            // Local pending
                            <MaterialCommunityIcons name="check" size={12} color="rgba(255,255,255,0.5)" />
                          ) : item.readBy && item.readBy.length > 1 ? (
                            // Read by others (blue ticks)
                            <MaterialCommunityIcons name="check-all" size={12} color="#60A5FA" />
                          ) : (
                            // Server received (grey ticks)
                            <MaterialCommunityIcons name="check-all" size={12} color="rgba(255,255,255,0.6)" />
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Typing banner */}
      {typingBannerText && (
        <View style={styles.typingBanner}>
          <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginRight: 6 }} />
          <Text style={styles.typingBannerText}>{typingBannerText}</Text>
        </View>
      )}

      {/* Attachment Panel */}
      {attachmentPanelVisible && (
        <View style={styles.attachmentPanel}>
          <TouchableOpacity style={styles.attachmentItemBtn} onPress={() => handlePickImage(false)}>
            <View style={[styles.attachmentIconCircle, { backgroundColor: '#3B82F6' }]}>
              <MaterialCommunityIcons name="image" size={22} color="#FFF" />
            </View>
            <Text style={styles.attachmentLabel}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachmentItemBtn} onPress={() => handlePickImage(true)}>
            <View style={[styles.attachmentIconCircle, { backgroundColor: '#10B981' }]}>
              <MaterialCommunityIcons name="camera" size={22} color="#FFF" />
            </View>
            <Text style={styles.attachmentLabel}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachmentItemBtn} onPress={() => handleShareLiveLocation(30)}>
            <View style={[styles.attachmentIconCircle, { backgroundColor: '#8B5CF6' }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#FFF" />
            </View>
            <Text style={styles.attachmentLabel}>Live Loc</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.attachmentItemBtn} onPress={handleShareRideCard}>
            <View style={[styles.attachmentIconCircle, { backgroundColor: '#EC4899' }]}>
              <MaterialCommunityIcons name="card-text-outline" size={22} color="#FFF" />
            </View>
            <Text style={styles.attachmentLabel}>Ride Card</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.attachmentBtn}
            onPress={() => setAttachmentPanelVisible(prev => !prev)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons 
              name={attachmentPanelVisible ? "close" : "paperclip"} 
              size={22} 
              color={attachmentPanelVisible ? WARM_CORE.primary : WARM_CORE.textSecondary} 
            />
          </TouchableOpacity>

          <TextInput
            style={[styles.textInput, !isChatWritable && { opacity: 0.5 }]}
            value={messageText}
            onChangeText={handleTextChange}
            placeholder={isChatWritable ? "Type a message..." : "Chat is read-only"}
            placeholderTextColor={WARM_CORE.textSecondary}
            editable={isChatWritable && !sending}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!messageText.trim() || !isChatWritable) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!messageText.trim() || !isChatWritable || sending}
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

      {/* Fullscreen Image Preview Modal */}
      <Modal visible={!!fullscreenImageUri} transparent animationType="fade" onRequestClose={() => setFullscreenImageUri(null)}>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={styles.closeFullscreenBtn} onPress={() => setFullscreenImageUri(null)}>
            <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {fullscreenImageUri && (
            <ExpoImage
              source={{ uri: fullscreenImageUri }}
              style={styles.fullscreenImage}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>

      {/* Destination Select Modal */}
      <Modal visible={destinationModalVisible} transparent animationType="slide" onRequestClose={() => setDestinationModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDestinationModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share a Destination</Text>
            <FlatList
              data={PREDEFINED_DESTINATIONS}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => handleShareDestination(item)}
                >
                  <MaterialCommunityIcons name="map-marker-radius" size={22} color={WARM_CORE.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionText}>{item.name}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setDestinationModalVisible(false)}>
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Quick Actions Modal */}
      <Modal visible={actionsVisible} animationType="slide" transparent onRequestClose={() => setActionsVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionsVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ride Quick Actions</Text>

            {rideDetails?.status === 'in_progress' && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setActionsVisible(false);
                  if (rideType === 'carpool') {
                    router.push({ pathname: '/navigation', params: { rideId } });
                  } else {
                    router.push({ pathname: '/taxi-pool-details', params: { poolId: rideId } });
                  }
                }}
              >
                <MaterialCommunityIcons name="map-marker-radius" size={22} color={WARM_CORE.primary} />
                <Text style={styles.actionText}>Track Navigation</Text>
              </TouchableOpacity>
            )}

            {isDriverOrHost ? (
              <>
                {((rideType === 'carpool' && (rideDetails?.status === 'active' || rideDetails?.status === 'expired')) ||
                  (rideType === 'taxipool' && (rideDetails?.status === 'OPEN' || rideDetails?.status === 'FULL'))) && (
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

            {rideDetails?.status !== 'completed' && rideDetails?.status !== 'cancelled' && rideDetails?.status !== 'CANCELLED' && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setActionsVisible(false);
                  setMuteVisible(true);
                }}
              >
                <MaterialCommunityIcons
                  name={isMuted ? "bell" : "bell-off"}
                  size={22}
                  color={WARM_CORE.primary}
                />
                <Text style={styles.actionText}>
                  {isMuted ? "Unmute Notifications" : "Mute Notifications"}
                </Text>
              </TouchableOpacity>
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

      {/* Mute Modal */}
      <Modal visible={muteVisible} animationType="fade" transparent onRequestClose={() => setMuteVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMuteVisible(false)}>
          <View style={styles.sosModalContent}>
            <View style={[styles.sosIconContainer, { backgroundColor: 'rgba(212, 80, 10, 0.1)' }]}>
              <MaterialCommunityIcons name={isMuted ? "bell-off" : "bell"} size={48} color={WARM_CORE.primary} />
            </View>
            <Text style={styles.sosTitle}>{isMuted ? "Unmute Chat" : "Mute Chat"}</Text>
            <Text style={styles.sosSubtitle}>
              {isMuted 
                ? "You have currently muted push notifications for this chat. Would you like to unmute?" 
                : "Choose how long you want to mute push notifications for this chat. You will still receive messages in the chat room."}
            </Text>

            {isMuted ? (
              <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary }]} onPress={handleUnmuteChat}>
                <Text style={styles.sosBtnText}>Unmute Notifications</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: '100%', gap: 10 }}>
                <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary, marginBottom: 0 }]} onPress={() => handleMuteChat(1)}>
                  <Text style={styles.sosBtnText}>Mute for 1 Hour</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary, marginBottom: 0 }]} onPress={() => handleMuteChat(8)}>
                  <Text style={styles.sosBtnText}>Mute for 8 Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary, marginBottom: 0 }]} onPress={() => handleMuteChat(24)}>
                  <Text style={styles.sosBtnText}>Mute for 24 Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sosBtnItem, { backgroundColor: WARM_CORE.primary, marginBottom: 0 }]} onPress={() => handleMuteChat('ride')}>
                  <Text style={styles.sosBtnText}>Mute until ride ends</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.sosCancelBtn} onPress={() => setMuteVisible(false)}>
              <Text style={styles.sosCancelText}>Cancel</Text>
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
              <UserAvatar imageUrl={rideDetails?.driverImage || rideDetails?.creatorImage} name={driverOrHostName} size={64} style={{ marginRight: 12 }} />
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
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  headerDetails: {
    flex: 1,
    marginHorizontal: 12,
  } as ViewStyle,
  headerRoute: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  headerSubtitle: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  } as TextStyle,
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
  } as ViewStyle,
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
  participantsContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  participantsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  } as TextStyle,
  participantsList: {
    paddingHorizontal: 16,
    gap: 16,
  } as ViewStyle,
  participantItem: {
    alignItems: 'center',
    width: 60,
  } as ViewStyle,
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
  } as ViewStyle,
  hostAvatarCircle: {
    borderColor: WARM_CORE.primary,
    borderWidth: 1.5,
  } as ViewStyle,
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  } as any,
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  hostAvatarText: {
    color: WARM_CORE.primary,
  } as TextStyle,
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
  } as ViewStyle,
  onlineDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: WARM_CORE.background,
  } as ViewStyle,
  participantName: {
    fontSize: 10,
    color: WARM_CORE.text,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  } as TextStyle,
  messagesList: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  } as ViewStyle,
  loadOlderBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  } as ViewStyle,
  loadOlderText: {
    color: WARM_CORE.primary,
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 4,
  } as ViewStyle,
  systemMessageBubble: {
    backgroundColor: WARM_CORE.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  systemMessageText: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  } as ViewStyle,
  messageRowLeft: {
    alignSelf: 'flex-start',
  } as ViewStyle,
  messageRowRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  } as ViewStyle,
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
  } as ViewStyle,
  messageAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  messageBubbleContainer: {
    flex: 1,
  } as ViewStyle,
  messageSenderName: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  } as TextStyle,
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    minWidth: 70,
  } as ViewStyle,
  bubbleImageContainer: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 16,
  } as ViewStyle,
  bubbleLeft: {
    backgroundColor: WARM_CORE.card,
    borderTopLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  bubbleRight: {
    backgroundColor: WARM_CORE.primary,
    borderTopRightRadius: 4,
  } as ViewStyle,
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  } as TextStyle,
  textLeft: {
    color: WARM_CORE.text,
  } as TextStyle,
  textRight: {
    color: WARM_CORE.white,
  } as TextStyle,
  messageMetaFooter: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  } as ViewStyle,
  messageTime: {
    fontSize: 9,
  } as TextStyle,
  timeLeft: {
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  timeRight: {
    color: 'rgba(255, 255, 255, 0.7)',
  } as TextStyle,
  ticksContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
    gap: 10,
  } as ViewStyle,
  attachmentBtn: {
    padding: 6,
  } as ViewStyle,
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
  } as TextStyle,
  sendBtn: {
    backgroundColor: WARM_CORE.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  sendBtnDisabled: {
    backgroundColor: 'rgba(212, 80, 10, 0.4)',
  } as ViewStyle,
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  } as ViewStyle,
  modalContent: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 8,
    maxHeight: '80%',
  } as ViewStyle,
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 16,
    textAlign: 'center',
  } as TextStyle,
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: WARM_CORE.border,
    gap: 12,
  } as ViewStyle,
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  cancelModalBtn: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
  } as ViewStyle,
  cancelModalText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  sosModalContent: {
    backgroundColor: WARM_CORE.background,
    borderRadius: 24,
    padding: 24,
    margin: 20,
    alignSelf: 'center',
    width: '90%',
    alignItems: 'center',
  } as ViewStyle,
  sosIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  sosTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 8,
  } as TextStyle,
  sosSubtitle: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  } as TextStyle,
  sosBtnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  } as ViewStyle,
  sosBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  sosCancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignSelf: 'center',
  } as ViewStyle,
  sosCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  profileModalContent: {
    backgroundColor: WARM_CORE.background,
    borderRadius: 24,
    padding: 24,
    margin: 20,
    alignSelf: 'center',
    width: '90%',
  } as ViewStyle,
  profileModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 16,
    textAlign: 'center',
  } as TextStyle,
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  } as ViewStyle,
  profileAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  profileModalName: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  } as ViewStyle,
  verifiedText: {
    fontSize: 12,
    color: WARM_CORE.primary,
    fontWeight: '600',
  } as TextStyle,
  profileDetailsBlock: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  } as ViewStyle,
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  detailLabel: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  detailValue: {
    fontSize: 13,
    color: WARM_CORE.text,
    fontWeight: '700',
  } as TextStyle,
  
  // Rich Messaging Styles
  bubbleImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  } as any,
  bubbleCaptionText: {
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 4,
  } as TextStyle,
  bubbleCardContainer: {
    width: 200,
    padding: 2,
    gap: 6,
  } as ViewStyle,
  bubbleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 4,
  } as ViewStyle,
  bubbleCardHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
  bubbleCardSubtext: {
    fontSize: 11,
    paddingHorizontal: 4,
  } as TextStyle,
  bubbleMapWrapper: {
    height: 120,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  bubbleMap: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  rideCardBubble: {
    width: 220,
    padding: 10,
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    gap: 6,
  } as ViewStyle,
  rideCardBadge: {
    backgroundColor: 'rgba(212, 80, 10, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  } as ViewStyle,
  rideCardBadgeText: {
    color: WARM_CORE.primary,
    fontSize: 10,
    fontWeight: '800',
  } as TextStyle,
  rideCardRoute: {
    marginVertical: 2,
  } as ViewStyle,
  rideCardRouteText: {
    fontSize: 14,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  rideCardTime: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  rideCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: WARM_CORE.border,
    paddingTop: 6,
  } as ViewStyle,
  rideCardPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  rideCardBtn: {
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  } as ViewStyle,
  rideCardBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  } as TextStyle,
  typingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: 'rgba(212, 80, 10, 0.05)',
  } as ViewStyle,
  typingBannerText: {
    fontSize: 12,
    color: WARM_CORE.primary,
    fontWeight: '600',
  } as TextStyle,
  attachmentPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: WARM_CORE.card,
    borderTopWidth: 0.5,
    borderTopColor: WARM_CORE.border,
    paddingVertical: 14,
  } as ViewStyle,
  attachmentItemBtn: {
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  attachmentIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  } as ViewStyle,
  attachmentLabel: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  closeFullscreenBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  fullscreenImage: {
    width: '100%',
    height: '80%',
  } as any,
});
