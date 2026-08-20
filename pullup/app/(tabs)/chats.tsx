import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  ViewStyle,
  TextStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { db, auth } from '@/utils/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, limitToLast, orderBy } from 'firebase/firestore';

interface ChatRoomData {
  id: string;
  rideId: string;
  rideType: 'carpool' | 'taxipool';
  participants: string[];
  lastMessage: string;
  lastMessageTime: any;
  updatedAt: any;
  unreadCount?: number;
  metadata?: {
    title: string;
    pickupAddress: string;
    dropAddress: string;
    driverOrCreatorName: string;
    image?: string | null;
  };
}

export default function ChatsScreen() {
  const router = useRouter();
  const { auth: authState, firebaseAuthReady } = useAppContext();
  const [chatRooms, setChatRooms] = useState<ChatRoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomsMeta, setRoomsMeta] = useState<{ [key: string]: any }>({});

  const currentUserId = authState.user?.id;

  const canStartRealtimeListeners =
    firebaseAuthReady &&
    authState.isSignedIn &&
    !!auth.currentUser &&
    !!currentUserId;

  // 1. Subscribe to chat rooms
  useEffect(() => {
    if (!canStartRealtimeListeners) {
      setLoading(false);
      return;
    }

    console.log('[CHATS SCREEN] Subscribing to rideChats for user:', currentUserId);
    const chatsQuery = query(
      collection(db, 'rideChats'),
      where('participants', 'array-contains', currentUserId)
    );

    const unsubRooms = onSnapshot(chatsQuery, async (snapshot) => {
      const rooms: ChatRoomData[] = [];
      const fetchMetadataPromises: Promise<void>[] = [];

      snapshot.forEach((roomDoc) => {
        const roomData = roomDoc.data() as Omit<ChatRoomData, 'id'>;
        const roomId = roomDoc.id;

        rooms.push({
          id: roomId,
          ...roomData,
          unreadCount: 0 // Will compute dynamically
        });

        // Fetch metadata if not already cached
        if (!roomsMeta[roomId]) {
          const fetchMeta = async () => {
            try {
              const metaDocRef = doc(db, roomData.rideType === 'carpool' ? 'rides' : 'taxiPools', roomData.rideId);
              const metaSnap = await getDoc(metaDocRef);
              if (metaSnap.exists()) {
                const data = metaSnap.data();
                let title = 'Ride Group Chat';
                let pickup = '';
                let drop = '';
                let hostName = 'Host Commuter';
                let image = null;

                if (roomData.rideType === 'carpool') {
                  pickup = data.pickupLocation?.address || '';
                  drop = data.dropLocation?.address || '';
                  hostName = data.driverName || 'Driver';
                  // Simple titles
                  const pCity = data.pickupLocation?.city || '';
                  const dCity = data.dropLocation?.city || '';
                  title = pCity && dCity ? `${pCity} to ${dCity}` : 'CarPool Ride';
                } else {
                  pickup = data.pickupLocation?.address || '';
                  drop = data.destination?.address || '';
                  hostName = data.creatorName || 'Creator';
                  image = data.creatorImage || null;
                  const pCity = data.pickupLocation?.city || '';
                  const dCity = data.destination?.city || '';
                  title = pCity && dCity ? `${pCity} to ${dCity}` : 'TaxiPool Ride';
                }

                setRoomsMeta(prev => ({
                  ...prev,
                  [roomId]: { title, pickupAddress: pickup, dropAddress: drop, driverOrCreatorName: hostName, image }
                }));
              }
            } catch (err) {
              console.warn('[CHATS SCREEN] Failed to fetch room metadata for:', roomId, err);
            }
          };
          fetchMetadataPromises.push(fetchMeta());
        }
      });

      // Wait for any initial metadata queries
      if (fetchMetadataPromises.length > 0) {
        await Promise.all(fetchMetadataPromises);
      }

      setChatRooms(rooms);
      setLoading(false);
    }, (err) => {
      console.error('[CHATS SCREEN] Error listing chat rooms:', err);
      setLoading(false);
    });

    return () => unsubRooms();
  }, [canStartRealtimeListeners, currentUserId]);

  // 2. Subscribe to messages of each room to calculate specific unreadCounts dynamically
  useEffect(() => {
    if (chatRooms.length === 0 || !canStartRealtimeListeners) return;

    const messageUnsubs: { [roomId: string]: () => void } = {};

    chatRooms.forEach((room) => {
      const roomId = room.id;
      const msgsRef = collection(db, 'rideChats', roomId, 'messages');
      const msgsQuery = query(msgsRef, orderBy('createdAt', 'desc'), limitToLast(20));

      messageUnsubs[roomId] = onSnapshot(msgsQuery, (snapshot) => {
        let count = 0;
        snapshot.forEach((msgDoc) => {
          const msgData = msgDoc.data();
          const readBy = msgData.readBy || [];
          if (msgData.senderId !== 'system' && !readBy.includes(currentUserId)) {
            count++;
          }
        });

        setChatRooms(prevRooms =>
          prevRooms.map(r => r.id === roomId ? { ...r, unreadCount: count } : r)
        );
      }, (err) => {
        console.warn(`[CHATS SCREEN] Error counting messages for room ${roomId}:`, err);
      });
    });

    return () => {
      Object.values(messageUnsubs).forEach(unsub => unsub());
    };
  }, [chatRooms.length, canStartRealtimeListeners, currentUserId]);

  // Format Room List (merge metadata and sort client-side)
  const formattedRooms = useMemo(() => {
    return chatRooms.map(room => {
      const meta = roomsMeta[room.id];
      return {
        ...room,
        metadata: meta || {
          title: room.rideType === 'carpool' ? 'CarPool Chat' : 'TaxiPool Chat',
          pickupAddress: '',
          dropAddress: '',
          driverOrCreatorName: room.rideType === 'carpool' ? 'Driver' : 'Host',
          image: null
        }
      };
    }).sort((a, b) => {
      const tA = a.lastMessageTime?.toDate ? a.lastMessageTime.toDate().getTime() : (typeof a.lastMessageTime === 'string' ? new Date(a.lastMessageTime).getTime() : 0);
      const tB = b.lastMessageTime?.toDate ? b.lastMessageTime.toDate().getTime() : (typeof b.lastMessageTime === 'string' ? new Date(b.lastMessageTime).getTime() : 0);
      return tB - tA;
    });
  }, [chatRooms, roomsMeta]);

  // Filter based on search query
  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return formattedRooms;
    const q = searchQuery.toLowerCase();
    return formattedRooms.filter(room => {
      const title = room.metadata?.title?.toLowerCase() || '';
      const driver = room.metadata?.driverOrCreatorName?.toLowerCase() || '';
      const pickup = room.metadata?.pickupAddress?.toLowerCase() || '';
      const drop = room.metadata?.dropAddress?.toLowerCase() || '';
      const lastMsg = room.lastMessage?.toLowerCase() || '';
      return title.includes(q) || driver.includes(q) || pickup.includes(q) || drop.includes(q) || lastMsg.includes(q);
    });
  }, [formattedRooms, searchQuery]);

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleRoomPress = (room: ChatRoomData) => {
    router.push({
      pathname: '/group-chat',
      params: {
        rideId: room.rideId,
        rideType: room.rideType
      }
    } as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <Text style={styles.headerSubtitle}>Coordinate with your co-commuters</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#8A8A8A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#8A8A8A"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#8A8A8A" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Chats List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={WARM_CORE.primary} />
          <Text style={styles.loadingText}>Syncing chats...</Text>
        </View>
      ) : filteredRooms.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons 
            name={searchQuery ? "comment-search-outline" : "chat-processing-outline"} 
            size={72} 
            color={WARM_CORE.border} 
          />
          <Text style={styles.emptyTitle}>
            {searchQuery ? "No search results" : "Your Inbox is Empty"}
          </Text>
          <Text style={styles.emptyDesc}>
            {searchQuery 
              ? "We couldn't find any chats matching that query."
              : "Active ride-sharing chats will automatically appear here."}
          </Text>
          {!searchQuery && (
            <TouchableOpacity 
              style={styles.actionBtn}
              onPress={() => router.navigate('/(tabs)/home' as any)}
            >
              <Text style={styles.actionBtnText}>Find Commutes</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const hasUnread = item.unreadCount ? item.unreadCount > 0 : false;
            return (
              <TouchableOpacity
                style={[styles.chatRow, hasUnread && styles.chatRowUnread]}
                onPress={() => handleRoomPress(item)}
                activeOpacity={0.8}
              >
                {/* Avatar Icon */}
                <View style={[
                  styles.avatarWrapper,
                  item.rideType === 'carpool' ? styles.carpoolAvatar : styles.taxipoolAvatar
                ]}>
                  <MaterialCommunityIcons 
                    name={item.rideType === 'carpool' ? "car" : "taxi"} 
                    size={22} 
                    color="#FFFFFF" 
                  />
                </View>

                {/* Info Content */}
                <View style={styles.infoContent}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.chatTitle, hasUnread && styles.unreadText]} numberOfLines={1}>
                      {item.metadata?.title}
                    </Text>
                    <Text style={styles.chatTime}>
                      {formatRelativeTime(item.lastMessageTime)}
                    </Text>
                  </View>

                  <View style={styles.rowDetails}>
                    <Text style={styles.hostName}>
                      {item.rideType === 'carpool' ? 'CarPool' : 'TaxiPool'} · {item.metadata?.driverOrCreatorName}
                    </Text>
                  </View>

                  <Text style={[styles.lastMsgSnippet, hasUnread && styles.unreadMsgSnippet]} numberOfLines={1}>
                    {item.lastMessage || 'No messages yet'}
                  </Text>
                </View>

                {/* Unread Badge indicator */}
                {hasUnread && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  } as ViewStyle,
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: WARM_CORE.text,
    letterSpacing: -0.5,
  } as TextStyle,
  headerSubtitle: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  } as TextStyle,
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  } as ViewStyle,
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 12,
    height: 44,
  } as ViewStyle,
  searchInput: {
    flex: 1,
    color: WARM_CORE.text,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
    padding: 0,
  } as TextStyle,
  listContainer: {
    paddingBottom: 24,
  } as ViewStyle,
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  chatRowUnread: {
    backgroundColor: 'rgba(212, 80, 10, 0.03)',
  } as ViewStyle,
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  } as ViewStyle,
  carpoolAvatar: {
    backgroundColor: '#3B82F6', // Blue for carpools
  } as ViewStyle,
  taxipoolAvatar: {
    backgroundColor: WARM_CORE.primary, // Orange for taxi pools
  } as ViewStyle,
  infoContent: {
    flex: 1,
  } as ViewStyle,
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  } as ViewStyle,
  chatTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    flex: 1,
    marginRight: 8,
  } as TextStyle,
  unreadText: {
    color: WARM_CORE.text,
  } as TextStyle,
  chatTime: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  rowDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  } as ViewStyle,
  hostName: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
  } as TextStyle,
  lastMsgSnippet: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  unreadMsgSnippet: {
    color: WARM_CORE.text,
    fontWeight: '700',
  } as TextStyle,
  unreadBadge: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    paddingHorizontal: 5,
  } as ViewStyle,
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  } as TextStyle,
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  } as ViewStyle,
  loadingText: {
    color: WARM_CORE.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  } as TextStyle,
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginTop: 16,
    marginBottom: 8,
  } as TextStyle,
  emptyDesc: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 20,
  } as TextStyle,
  actionBtn: {
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 20,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  } as ViewStyle,
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  } as TextStyle,
});
