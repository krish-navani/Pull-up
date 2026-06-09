import { useAppContext } from '@/context/AppContext';
import {
    clearReadNotifications,
    deleteNotification,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    Notification,
    subscribeToNotifications,
} from '@/utils/notificationService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { WARM_CORE } from '@/constants/theme';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  const router = useRouter();
  const { auth } = useAppContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  // Initialize notifications subscription
  useFocusEffect(
    useCallback(() => {
      if (!auth.user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Subscribe to real-time notifications
        const unsubFn = subscribeToNotifications(auth.user.id, (updatedNotifications) => {
          setNotifications(updatedNotifications);
          setLoading(false);
        });

        setUnsubscribe(() => unsubFn);
      } catch (error) {
        console.error('[NOTIFICATIONS] Error initializing:', error);
        setLoading(false);
      }

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }, [auth.user])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (auth.user) {
        const unsubFn = subscribeToNotifications(auth.user.id, (updatedNotifications) => {
          setNotifications(updatedNotifications);
          setRefreshing(false);
        });
        setUnsubscribe(() => unsubFn);
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] Error refreshing:', error);
      setRefreshing(false);
    }
  }, [auth.user]);

  const handleNotificationTap = useCallback(
    async (notification: Notification) => {
      // Mark as read
      if (!notification.read && auth.user) {
        try {
          await markNotificationAsRead(auth.user.id, notification.id);
        } catch (error) {
          console.error('[NOTIFICATIONS] Error marking as read:', error);
        }
      }

      // Navigate based on notification type
      if (notification.rideId) {
        router.push({
          pathname: '/ride-details',
          params: { rideId: notification.rideId },
        });
      }
    },
    [router, auth.user]
  );

  const handleDeleteNotification = useCallback(
    async (notificationId: string) => {
      if (!auth.user) return;

      try {
        await deleteNotification(auth.user.id, notificationId);
      } catch (error) {
        console.error('[NOTIFICATIONS] Error deleting notification:', error);
        Alert.alert('Error', 'Failed to delete notification');
      }
    },
    [auth.user]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!auth.user) return;

    try {
      await markAllNotificationsAsRead(auth.user.id);
      Alert.alert('Success', 'All notifications marked as read');
    } catch (error) {
      console.error('[NOTIFICATIONS] Error marking all as read:', error);
      Alert.alert('Error', 'Failed to mark notifications as read');
    }
  }, [auth.user]);

  const handleClearRead = useCallback(async () => {
    if (!auth.user) return;

    Alert.alert('Clear Read Notifications', 'This will delete all read notifications', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await clearReadNotifications(auth.user!.id);
            Alert.alert('Success', 'Read notifications cleared');
          } catch (error) {
            console.error('[NOTIFICATIONS] Error clearing read:', error);
            Alert.alert('Error', 'Failed to clear notifications');
          }
        },
        style: 'destructive',
      },
    ]);
  }, [auth.user]);

  const getNotificationIcon = (
    type: Notification['type']
  ): { icon: string; color: string; bgColor: string } => {
    switch (type) {
      case 'booking_request':
        return { icon: 'bell-circle', color: WARM_CORE.primary, bgColor: 'rgba(212, 80, 10, 0.12)' };
      case 'booking_accepted':
        return { icon: 'check-circle', color: WARM_CORE.success, bgColor: 'rgba(16, 185, 129, 0.12)' };
      case 'booking_rejected':
        return { icon: 'close-circle', color: WARM_CORE.error, bgColor: 'rgba(239, 68, 68, 0.12)' };
      case 'ride_started':
        return { icon: 'play-circle', color: '#8B5CF6', bgColor: 'rgba(139, 92, 246, 0.12)' };
      case 'ride_completed':
        return { icon: 'check-all', color: '#06B6D4', bgColor: 'rgba(6, 182, 212, 0.12)' };
      case 'ride_cancelled':
        return { icon: 'cancel', color: WARM_CORE.accent, bgColor: 'rgba(255, 122, 51, 0.12)' };
      case 'message':
        return { icon: 'message-text', color: WARM_CORE.accent, bgColor: 'rgba(255, 122, 51, 0.12)' };
      default:
        return { icon: 'bell', color: WARM_CORE.textSecondary, bgColor: WARM_CORE.border };
    }
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => {
    const { icon, color, bgColor } = getNotificationIcon(item.type);
    const timeAgo = getTimeAgo(item.createdAt?.toDate?.());

    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          !item.read && styles.unreadNotification,
        ]}
        onPress={() => handleNotificationTap(item)}
        activeOpacity={0.7}
      >
        {/* Icon Container */}
        <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
          <MaterialCommunityIcons name={icon as any} size={24} color={color} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={styles.timestamp}>{timeAgo}</Text>
        </View>

        {/* Delete Button */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteNotification(item.id)}
        >
          <MaterialCommunityIcons name="close" size={20} color={WARM_CORE.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasReadNotifications = notifications.some((n) => n.read);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Action Buttons */}
      {notifications.length > 0 && (
        <View style={styles.actionBar}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={handleMarkAllAsRead}
            >
              <MaterialCommunityIcons name="check-all" size={16} color={WARM_CORE.white} />
              <Text style={styles.actionButtonText}>Mark All Read</Text>
            </TouchableOpacity>
          )}
          {hasReadNotifications && (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={handleClearRead}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.actionButtonTextSecondary}>Clear Read</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Notifications List */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={WARM_CORE.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="bell-outline" size={48} color={WARM_CORE.textSecondary} />
          <Text style={styles.emptyText}>No notifications yet</Text>
          <Text style={styles.emptySubtext}>
            You{"'"}ll see booking updates, messages, and ride events here
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={WARM_CORE.primary}
              colors={[WARM_CORE.primary]}
            />
          }
          scrollEnabled={true}
        />
      )}

      {/* Unread Badge - Header */}
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// Helper function to format time ago
function getTimeAgo(date?: Date): string {
  if (!date) return 'Just now';

  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return 'Just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  if (secondsAgo < 604800) return `${Math.floor(secondsAgo / 86400)}d ago`;

  return date.toLocaleDateString();
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
    backgroundColor: WARM_CORE.card,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  headerRightPlaceholder: {
    width: 40,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  primaryButton: {
    backgroundColor: WARM_CORE.primary,
  },
  secondaryButton: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.white,
  },
  actionButtonTextSecondary: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  unreadNotification: {
    borderColor: WARM_CORE.primary,
    backgroundColor: WARM_CORE.card,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.primary,
    marginLeft: 8,
  },
  message: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
    marginTop: -4,
    marginRight: -8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: WARM_CORE.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  unreadBadge: {
    position: 'absolute',
    top: 56,
    right: 16,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
});
