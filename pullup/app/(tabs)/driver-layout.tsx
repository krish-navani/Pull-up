import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

import DriverHomeScreen from './driver-home';
import DriverRidesScreen from './driver-rides';
import PostRideScreen from './post-ride';
import ProfileScreen from './profile';

const Tab = createBottomTabNavigator();

export default function DriverTabLayout() {
  const insets = useSafeAreaInsets();

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
        name="post-ride"
        component={PostRideScreen}
        options={{
          title: 'Post',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'plus-circle' : 'plus-circle-outline'}
              size={focused ? 28 : 24}
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
