import { useAppContext } from '@/context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

import DriverTabLayout from './driver-layout';
import HomeScreen from './home';
import MyBookingsScreen from './my-bookings';
import ProfileScreen from './profile';
import RideHistoryScreen from './ride-history';

const Tab = createBottomTabNavigator();

export default function TabLayout() {
  const { auth } = useAppContext();
  const insets = useSafeAreaInsets();

  // Show driver layout if user role is driver
  if (auth.user?.role === 'driver') {
    return <DriverTabLayout />;
  }

  return (
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
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tab.Screen
        name="home"
        component={HomeScreen}
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
        name="my-bookings"
        component={MyBookingsScreen}
        options={{
          title: 'My Bookings',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'calendar-check' : 'calendar-check-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
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
              name={focused ? 'history' : 'history'}
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
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account' : 'account-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}