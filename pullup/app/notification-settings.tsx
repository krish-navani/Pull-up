import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/utils/firebase';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { auth, updateProfileData } = useAppContext();
  const user = auth.user;

  // Initialize switches from user's current settings
  const prefs = user?.notificationPreferences || {
    rideUpdates: true,
    paymentUpdates: true,
    chatUpdates: true,
    poolUpdates: true,
    marketingUpdates: false,
  };

  const [rideUpdates, setRideUpdates] = useState(prefs.rideUpdates);
  const [paymentUpdates, setPaymentUpdates] = useState(prefs.paymentUpdates);
  const [chatUpdates, setChatUpdates] = useState(prefs.chatUpdates);
  const [poolUpdates, setPoolUpdates] = useState(prefs.poolUpdates);
  const [marketingUpdates, setMarketingUpdates] = useState(prefs.marketingUpdates);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (key: string, value: boolean, setter: (val: boolean) => void) => {
    if (!user) return;
    setter(value);
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        [`notificationPreferences.${key}`]: value,
      });
      
      // Update local state in AppContext
      const updatedPrefs = {
        ...prefs,
        [key]: value,
      };
      await updateProfileData(user.id, {
        notificationPreferences: updatedPrefs,
      });
    } catch (error) {
      console.error('[NOTIF SETTINGS] Error saving preference:', error);
      // Rollback UI toggle state on error
      setter(!value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerRight}>
          {saving && <ActivityIndicator size="small" color={WARM_CORE.primary} />}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionSubtitle}>
          Choose the types of alerts and push notifications you would like to receive.
        </Text>

        {/* Preferences Cards */}
        <View style={styles.settingsGroup}>
          
          {/* Ride Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="car-cog" size={22} color={WARM_CORE.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Ride Notifications</Text>
              <Text style={styles.settingDescription}>
                Request approvals, driver status, starts, and cancellations
              </Text>
            </View>
            <Switch
              value={rideUpdates}
              onValueChange={(val) => handleToggle('rideUpdates', val, setRideUpdates)}
              trackColor={{ false: WARM_CORE.border, true: 'rgba(212, 80, 10, 0.4)' }}
              thumbColor={rideUpdates ? WARM_CORE.primary : '#A3A3A3'}
            />
          </View>

          {/* Payment Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="cash-register" size={22} color={WARM_CORE.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Payment Updates</Text>
              <Text style={styles.settingDescription}>
                Pending payments, success reports, and refund notifications
              </Text>
            </View>
            <Switch
              value={paymentUpdates}
              onValueChange={(val) => handleToggle('paymentUpdates', val, setPaymentUpdates)}
              trackColor={{ false: WARM_CORE.border, true: 'rgba(212, 80, 10, 0.4)' }}
              thumbColor={paymentUpdates ? WARM_CORE.primary : '#A3A3A3'}
            />
          </View>

          {/* Chat Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="message-text-outline" size={22} color={WARM_CORE.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Chat Notifications</Text>
              <Text style={styles.settingDescription}>
                Incoming chat room messages, system group alerts, and tags
              </Text>
            </View>
            <Switch
              value={chatUpdates}
              onValueChange={(val) => handleToggle('chatUpdates', val, setChatUpdates)}
              trackColor={{ false: WARM_CORE.border, true: 'rgba(212, 80, 10, 0.4)' }}
              thumbColor={chatUpdates ? WARM_CORE.primary : '#A3A3A3'}
            />
          </View>

          {/* Pool Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={WARM_CORE.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Pool Notifications</Text>
              <Text style={styles.settingDescription}>
                Join requests, driver/owner acceptances, and capacity updates
              </Text>
            </View>
            <Switch
              value={poolUpdates}
              onValueChange={(val) => handleToggle('poolUpdates', val, setPoolUpdates)}
              trackColor={{ false: WARM_CORE.border, true: 'rgba(212, 80, 10, 0.4)' }}
              thumbColor={poolUpdates ? WARM_CORE.primary : '#A3A3A3'}
            />
          </View>

          {/* Marketing Notifications */}
          <View style={styles.settingCard}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="tag-outline" size={22} color={WARM_CORE.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Announcements & Events</Text>
              <Text style={styles.settingDescription}>
                Promo offers, coordination notes, and Atlas campus announcements
              </Text>
            </View>
            <Switch
              value={marketingUpdates}
              onValueChange={(val) => handleToggle('marketingUpdates', val, setMarketingUpdates)}
              trackColor={{ false: WARM_CORE.border, true: 'rgba(212, 80, 10, 0.4)' }}
              thumbColor={marketingUpdates ? WARM_CORE.primary : '#A3A3A3'}
            />
          </View>

        </View>
      </ScrollView>
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
    backgroundColor: WARM_CORE.card,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  headerRight: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  settingsGroup: {
    gap: 12,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    lineHeight: 16,
  },
});
