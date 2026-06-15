import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAppContext } from '@/context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';
import { useRouter } from 'expo-router';

import HomeScreen from './home';
import MyBookingsScreen from './my-bookings';
import ProfileScreen from './profile';
import RideHistoryScreen from './ride-history';
import PostRideScreen from './post-ride';

const Tab = createBottomTabNavigator();
const DummyScreen = () => null;

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────
// Built from scratch so every slot gets an explicit flex:1.
// The navigator's default distribution is unreliable when mixing custom
// tabBarButton overrides with hidden tabs.
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'taxi' | 'car'>('taxi');
  const router = useRouter();
  const { auth } = useAppContext();

  const handleContinue = () => {
    setShowPostMenu(false);
    if (selectedMode === 'taxi') {
      router.push('/create-taxi-pool' as any);
    } else {
      const isLicenseVerified =
        auth.user?.licenseVerified === true ||
        auth.user?.licenseVerificationStatus === 'verified';
      if (!isLicenseVerified) {
        if (auth.user?.licenseVerificationStatus === 'pending') {
          Alert.alert(
            'Verification Pending',
            'Your driving license is currently under review. You can post a CarPool once it is approved.',
            [{ text: 'OK' }]
          );
        } else if (auth.user?.licenseVerificationStatus === 'rejected') {
          Alert.alert(
            'License Rejected',
            'Your driving license was not approved. Please upload a valid license.',
            [
              { text: 'Re-upload', onPress: () => router.push('/auth/license-upload' as any) },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        } else {
          Alert.alert(
            'License Required',
            'You need to upload and verify your driving license to host a CarPool.',
            [
              { text: 'Upload License', onPress: () => router.push('/auth/license-upload' as any) },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }
      } else {
        router.push('/(tabs)/post-ride' as any);
      }
    }
  };

  // Visible tabs in order — excludes the hidden post-ride screen
  const TABS = [
    { name: 'home',        label: 'Home',    activeIcon: 'home',            inactiveIcon: 'home-outline' },
    { name: 'my-bookings', label: 'Rides',   activeIcon: 'car',             inactiveIcon: 'car-outline' },
    { name: 'ride-history',label: 'History', activeIcon: 'history',         inactiveIcon: 'history' },
    { name: 'profile',     label: 'You',     activeIcon: 'account',         inactiveIcon: 'account-outline' },
  ];

  const BAR_HEIGHT = 60;

  return (
    <>
      {/* ── Tab Bar ── */}
      <View
        style={[
          tabBarStyles.bar,
          {
            height: BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* LEFT: Home */}
        {(() => {
          const t = TABS[0];
          const route = state.routes.find((r: any) => r.name === t.name);
          const focused = route ? state.index === state.routes.indexOf(route) : false;
          const color = focused ? WARM_CORE.primary : WARM_CORE.textSecondary;
          return (
            <TouchableOpacity
              key={t.name}
              style={tabBarStyles.tabItem}
              onPress={() => route && navigation.navigate(t.name)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={(focused ? t.activeIcon : t.inactiveIcon) as any}
                size={focused ? 26 : 24}
                color={color}
              />
              <Text style={[tabBarStyles.label, { color }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })()}

        {/* LEFT-CENTER: Rides */}
        {(() => {
          const t = TABS[1];
          const route = state.routes.find((r: any) => r.name === t.name);
          const focused = route ? state.index === state.routes.indexOf(route) : false;
          const color = focused ? WARM_CORE.primary : WARM_CORE.textSecondary;
          return (
            <TouchableOpacity
              key={t.name}
              style={tabBarStyles.tabItem}
              onPress={() => route && navigation.navigate(t.name)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={(focused ? t.activeIcon : t.inactiveIcon) as any}
                size={focused ? 26 : 24}
                color={color}
              />
              <Text style={[tabBarStyles.label, { color }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })()}

        {/* CENTER: "+" FAB — same flex:1 slot, button floats up */}
        <View style={tabBarStyles.fabSlot}>
          <TouchableOpacity
            style={tabBarStyles.fabButton}
            onPress={() => {
              setSelectedMode('taxi');
              setShowPostMenu(true);
            }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus" size={30} color={WARM_CORE.white} />
          </TouchableOpacity>
        </View>

        {/* RIGHT-CENTER: History */}
        {(() => {
          const t = TABS[2];
          const route = state.routes.find((r: any) => r.name === t.name);
          const focused = route ? state.index === state.routes.indexOf(route) : false;
          const color = focused ? WARM_CORE.primary : WARM_CORE.textSecondary;
          return (
            <TouchableOpacity
              key={t.name}
              style={tabBarStyles.tabItem}
              onPress={() => route && navigation.navigate(t.name)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={(focused ? t.activeIcon : t.inactiveIcon) as any}
                size={focused ? 26 : 24}
                color={color}
              />
              <Text style={[tabBarStyles.label, { color }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })()}

        {/* RIGHT: You */}
        {(() => {
          const t = TABS[3];
          const route = state.routes.find((r: any) => r.name === t.name);
          const focused = route ? state.index === state.routes.indexOf(route) : false;
          const color = focused ? WARM_CORE.primary : WARM_CORE.textSecondary;
          return (
            <TouchableOpacity
              key={t.name}
              style={tabBarStyles.tabItem}
              onPress={() => route && navigation.navigate(t.name)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={(focused ? t.activeIcon : t.inactiveIcon) as any}
                size={focused ? 26 : 24}
                color={color}
              />
              <Text style={[tabBarStyles.label, { color }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })()}
      </View>

      {/* ── Post a Ride Modal ── */}
      <Modal
        transparent
        visible={showPostMenu}
        animationType="slide"
        onRequestClose={() => setShowPostMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPostMenu(false)} />

          <View style={styles.bottomSheet}>
            <View style={styles.handleBar} />

            <Text style={styles.modalTitle}>Post a ride</Text>
            <Text style={styles.modalSubtitle}>Pick how you{"'"}re travelling.</Text>

            <View style={styles.cardRow}>
              <TouchableOpacity
                style={[styles.postCard, selectedMode === 'taxi' && styles.postCardActive]}
                onPress={() => setSelectedMode('taxi')}
                activeOpacity={0.9}
              >
                <View style={[styles.cardHeader, selectedMode === 'taxi' && styles.cardHeaderActive]}>
                  <MaterialCommunityIcons
                    name="taxi"
                    size={28}
                    color={selectedMode === 'taxi' ? WARM_CORE.primary : WARM_CORE.textSecondary}
                  />
                </View>
                <Text style={styles.cardTitle}>Taxi Pool</Text>
                <Text style={styles.cardDesc}>Split a cab – anyone can post</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.postCard, selectedMode === 'car' && styles.postCardActive]}
                onPress={() => setSelectedMode('car')}
                activeOpacity={0.9}
              >
                <View style={[styles.cardHeader, selectedMode === 'car' && styles.cardHeaderActive]}>
                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={28}
                    color={selectedMode === 'car' ? WARM_CORE.primary : WARM_CORE.textSecondary}
                  />
                </View>
                <Text style={styles.cardTitle}>Car Pool</Text>
                <Text style={styles.cardDesc}>License required</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.continueButtonText}>
                {selectedMode === 'taxi' ? 'Publish Taxi Pool' : 'Offer Seats'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Tab Bar Styles ───────────────────────────────────────────────────────────
const tabBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',           // five slots in a row
    alignItems: 'center',           // vertically center all items
    backgroundColor: WARM_CORE.card,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  } as ViewStyle,

  // Every regular tab: flex:1 so all four take equal width
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  } as ViewStyle,

  // The center slot also flex:1 — keeps symmetry identical to other slots
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // overflow visible so the raised circle isn't clipped
    overflow: 'visible',
  } as ViewStyle,

  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Raise above the bar
    marginTop: -24,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  } as ViewStyle,

  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.1,
  } as TextStyle,
});

// ─── Layout ──────────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="home"         component={HomeScreen} />
        <Tab.Screen name="my-bookings"  component={MyBookingsScreen} />
        <Tab.Screen name="ride-history" component={RideHistoryScreen} />
        <Tab.Screen name="profile"      component={ProfileScreen} />
        {/* Hidden — navigated to programmatically; never appears in tab bar */}
        <Tab.Screen
          name="post-ride"
          component={PostRideScreen}
          options={{ tabBarButton: () => null }}
        />
      </Tab.Navigator>
    </View>
  );
}

// ─── Modal / Sheet Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 18, 13, 0.4)',
    justifyContent: 'flex-end',
  } as ViewStyle,
  bottomSheet: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  } as ViewStyle,
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WARM_CORE.border,
    alignSelf: 'center',
    marginBottom: 20,
  } as ViewStyle,
  modalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: WARM_CORE.text,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-condensed',
    letterSpacing: -0.8,
  } as TextStyle,
  modalSubtitle: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginBottom: 24,
  } as TextStyle,
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  } as ViewStyle,
  postCard: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'flex-start',
    minHeight: 120,
  } as ViewStyle,
  postCardActive: {
    borderColor: WARM_CORE.primary,
    backgroundColor: '#FFFBF7',
  } as ViewStyle,
  cardHeader: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(110,86,80,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  } as ViewStyle,
  cardHeaderActive: {
    backgroundColor: 'rgba(212,80,10,0.08)',
  } as ViewStyle,
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 4,
  } as TextStyle,
  cardDesc: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '600',
    lineHeight: 14,
  } as TextStyle,
  continueButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,
  continueButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.2,
  } as TextStyle,
});