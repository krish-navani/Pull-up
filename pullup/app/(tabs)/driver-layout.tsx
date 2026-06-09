import React, { useState } from 'react';
import {
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/context/AppContext';

import DriverHomeScreen from './driver-home';
import DriverRidesScreen from './driver-rides';
import PostRideScreen from './post-ride';
import ProfileScreen from './profile';
import RideHistoryScreen from './ride-history';

const Tab = createBottomTabNavigator();
const DummyScreen = () => null;

export default function DriverTabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { auth } = useAppContext();

  const [showPostMenu, setShowPostMenu] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'taxi' | 'car'>('car');

  const handleContinue = () => {
    setShowPostMenu(false);
    if (selectedMode === 'taxi') {
      router.push('/create-taxi-pool' as any);
    } else {
      router.push('/(tabs)/post-ride' as any);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: WARM_CORE.card,
            borderTopWidth: 1,
            borderTopColor: WARM_CORE.border,
            paddingBottom: insets.bottom,
            paddingTop: 0,
            height: 60 + insets.bottom,
          },
          tabBarActiveTintColor: WARM_CORE.primary,
          tabBarInactiveTintColor: WARM_CORE.textSecondary,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            marginTop: 2,
          },
          tabBarItemStyle: {
            paddingVertical: 4,
          },
        }}
      >
        <Tab.Screen
          name="driver-home"
          component={DriverHomeScreen}
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? 'home' : 'home-outline'}
                size={focused ? 26 : 24}
                color={color}
              />
            ),
          }}
        />

        <Tab.Screen
          name="driver-rides"
          component={DriverRidesScreen}
          options={{
            title: 'My Rides',
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? 'car' : 'car-outline'}
                size={focused ? 26 : 24}
                color={color}
              />
            ),
          }}
        />

        <Tab.Screen
          name="post-dummy"
          component={DummyScreen}
          options={{
            tabBarLabel: () => null,
            tabBarButton: () => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedMode('car');
                  setShowPostMenu(true);
                }}
                style={styles.customTabButton}
                activeOpacity={0.9}
              >
                <View style={styles.customTabButtonInner}>
                  <MaterialCommunityIcons name="plus" size={30} color={WARM_CORE.white} />
                </View>
              </TouchableOpacity>
            ),
          }}
        />

        <Tab.Screen
          name="ride-history"
          component={RideHistoryScreen}
          options={{
            title: 'History',
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name="history"
                size={focused ? 26 : 24}
                color={color}
              />
            ),
          }}
        />

        <Tab.Screen
          name="profile"
          component={ProfileScreen}
          options={{
            title: 'You',
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={focused ? 'account' : 'account-outline'}
                size={focused ? 26 : 24}
                color={color}
              />
            ),
          }}
        />

        {/* Hidden Post Ride Screen Tab so we can still navigate to it */}
        <Tab.Screen
          name="post-ride"
          component={PostRideScreen}
          options={{
            tabBarButton: () => null,
          }}
        />
      </Tab.Navigator>

      {/* Post a Ride / Taxi Pool Selection Bottom Sheet Modal */}
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
                    name="car" 
                    size={28} 
                    color={selectedMode === 'car' ? WARM_CORE.primary : WARM_CORE.textSecondary} 
                  />
                </View>
                <Text style={styles.cardTitle}>Car Pool</Text>
                <Text style={styles.cardDesc}>Offer empty seats in your car</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  customTabButton: {
    top: -16,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  } as ViewStyle,
  customTabButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
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
