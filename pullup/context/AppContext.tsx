import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import { Alert } from 'react-native';
import {
    AppContextType,
    AuthState,
    Booking,
    Chat,
    Message,
    Notification,
    Ride,
    User,
} from '../types';
import {
    getCurrentUser,
    loadUserFromStorage,
    logoutUser,
    onAuthStateChanged,
    OTPSignUpData,
    sendOTP,
    verifyOTPAndAutoAuth,
    verifyOTPAndCreateAccount,
    verifyOTPAndLogin,
} from '../utils/authService';
import {
    acceptBookingAsDriver,
    cancelBookingWithPenalty,
    createBookingInFirestore,
    getBookingByRideAndPassenger,
    getPassengerBookings,
    rejectBookingAsDriver,
} from '../utils/bookingService';
import {
    sendMessage as sendMessageToFirestore,
    subscribeToMessages
} from '../utils/chatService';
import {
    getDriverStats,
    getPassengerStats,
    getRideHistory,
    getUpcomingRide,
    getVehicleInfo,
    switchUserRole,
    updateUserProfile,
} from '../utils/profileService';
import { completeRide, createRideInFirestore, getAllRides, getAllRidesIncludingHistory, getDriverRides, startRide, startRideCleanupScheduler, stopRideCleanupScheduler } from '../utils/rideService';

interface State {
  auth: AuthState;
  rides: Ride[];
  bookings: Booking[];
  chats: Chat[];
  notifications: Notification[];
  authInitializing: boolean;
}

type Action =
  | { type: 'SET_AUTH_STATE'; payload: AuthState }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_USER'; payload: User }
  | { type: 'SWITCH_ROLE'; payload: 'driver' | 'passenger' }
  | { type: 'LOGOUT' }
  | { type: 'SET_RIDES'; payload: Ride[] }
  | { type: 'MERGE_RIDES'; payload: Ride[] }
  | { type: 'SET_BOOKINGS'; payload: Booking[] }
  | { type: 'CREATE_RIDE'; payload: Ride }
  | { type: 'CANCEL_RIDE'; payload: string }
  | { type: 'CREATE_BOOKING'; payload: Booking }
  | { type: 'UPDATE_BOOKING'; payload: Booking }
  | { type: 'CANCEL_BOOKING'; payload: string }
  | { type: 'SEND_MESSAGE'; payload: Message }
  | { type: 'MARK_MESSAGES_READ'; payload: string }
  | { type: 'UPDATE_CHAT_MESSAGES'; payload: { rideId: string; messages: Message[] } }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'timestamp' | 'read'> }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'LOAD_INITIAL_DATA'; payload: State };

const initialState: State = {
  auth: {
    isSignedIn: false,
    user: null,
    loading: false,
    error: null,
  },
  rides: [],
  bookings: [],
  chats: [],
  notifications: [],
  authInitializing: true,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

type ExtendedAction = Action | { type: 'SET_AUTH_INITIALIZING'; payload: boolean };
function appReducer(state: State, action: ExtendedAction): State {
  switch (action.type) {
        case 'SET_AUTH_INITIALIZING':
          return { ...state, authInitializing: action.payload };
    case 'SET_AUTH_STATE':
      return { ...state, auth: action.payload };
    case 'SET_LOADING':
      return {
        ...state,
        auth: { ...state.auth, loading: action.payload },
      };
    case 'SET_ERROR':
      return {
        ...state,
        auth: { ...state.auth, error: action.payload },
      };
    case 'SET_USER':
      return {
        ...state,
        auth: {
          ...state.auth,
          isSignedIn: true,
          user: action.payload,
          error: null,
        },
        bookings: [],
        rides: state.rides,
      };
    case 'SWITCH_ROLE':
      return {
        ...state,
        auth: {
          ...state.auth,
          user: state.auth.user ? { ...state.auth.user, role: action.payload } : null,
        },
      };
    case 'LOGOUT':
      return {
        ...state,
        auth: { isSignedIn: false, user: null, loading: false, error: null },
        rides: [],
      };
    case 'SET_RIDES':
      return {
        ...state,
        rides: action.payload,
      };
    case 'MERGE_RIDES':
      return {
        ...state,
        rides: [
          ...action.payload,
          ...state.rides.filter(sr => !action.payload.some(vr => vr.id === sr.id))
        ],
      };
    case 'SET_BOOKINGS': {
      const uniqueBookings = action.payload.filter(
        (b, index, self) => self.findIndex(o => o.id === b.id) === index
      );
      return {
        ...state,
        bookings: uniqueBookings,
      };
    }
    case 'CREATE_RIDE': {
      const rideExists = state.rides.some(r => r.id === action.payload.id);
      return {
        ...state,
        rides: rideExists ? state.rides : [action.payload, ...state.rides],
      };
    }
    case 'CANCEL_RIDE':
      return {
        ...state,
        rides: state.rides.map(ride =>
          ride.id === action.payload ? { ...ride, status: 'cancelled' as const } : ride
        ),
      };
    case 'CREATE_BOOKING': {
      // Update ride's booked seats
      const exists = state.bookings.some(b => b.id === action.payload.id);
      return {
        ...state,
        bookings: exists ? state.bookings : [...state.bookings, action.payload],
        rides: state.rides.map(ride => {
          if (ride.id === action.payload.rideId) {
            return {
              ...ride,
              bookedSeats: [
                ...ride.bookedSeats.filter(bs => bs.passengerId !== action.payload.passengerId),
                {
                  passengerId: action.payload.passengerId,
                  passengerName: state.auth.user?.fullName || 'Unknown',
                  seatsBooked: action.payload.seatsBooked,
                  status: 'pending' as const,
                  bookedAt: new Date().toISOString(),
                },
              ],
            };
          }
          return ride;
        }),
      };
    }
    case 'UPDATE_BOOKING':
      return {
        ...state,
        bookings: state.bookings.map(booking =>
          booking.id === action.payload.id ? action.payload : booking
        ),
        rides: state.rides.map(ride => {
          if (ride.id === action.payload.rideId) {
            // Update booking status and recalculate available seats
            const oldBooking = ride.bookedSeats.find(bs => bs.passengerId === action.payload.passengerId);
            let availableSeatsChange = 0;
            
            // If status changed to accepted, reduce available seats
            if (oldBooking && oldBooking.status !== 'accepted' && action.payload.status === 'accepted') {
              availableSeatsChange = -oldBooking.seatsBooked;
            }
            // If status changed from accepted to something else, increase available seats
            else if (oldBooking && oldBooking.status === 'accepted' && action.payload.status !== 'accepted') {
              availableSeatsChange = oldBooking.seatsBooked;
            }

            return {
              ...ride,
              availableSeats: Math.max(0, ride.availableSeats + availableSeatsChange),
              bookedSeats: ride.bookedSeats.map(bs =>
                bs.passengerId === action.payload.passengerId
                  ? { ...bs, status: action.payload.status }
                  : bs
              ),
            };
          }
          return ride;
        }),
      };
    case 'CANCEL_BOOKING': {
      const booking = state.bookings.find(b => b.id === action.payload);
      if (booking) {
        const departureTime = new Date(
          state.rides.find(r => r.id === booking.rideId)?.departureTime || ''
        );
        const now = new Date();
        const minutesBefore = (departureTime.getTime() - now.getTime()) / (1000 * 60);
        const penalty = minutesBefore <= 20 ? 50 : 0;

        return {
          ...state,
          bookings: state.bookings.map(b =>
            b.id === action.payload
              ? {
                  ...b,
                  status: 'cancelled' as const,
                  cancelledAt: new Date().toISOString(),
                  penaltyApplied: penalty,
                }
              : b
          ),
        };
      }
      return state;
    }
    case 'SEND_MESSAGE': {
      const { rideId, recipientId } = action.payload;
      const minId = action.payload.senderId < recipientId ? action.payload.senderId : recipientId;
      let chatId = rideId + '-' + minId;

      return {
        ...state,
        chats: state.chats.map(chat => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, action.payload],
              lastMessage: action.payload,
            };
          }
          return chat;
        }),
      };
    }
    case 'MARK_MESSAGES_READ':
      return {
        ...state,
        chats: state.chats.map(chat => {
          if (chat.id === action.payload) {
            return {
              ...chat,
              messages: chat.messages.map(msg => ({ ...msg, read: true })),
            };
          }
          return chat;
        }),
      };
    case 'UPDATE_CHAT_MESSAGES': {
      const { rideId, messages } = action.payload;
      const existingChat = state.chats.find(chat => chat.rideId === rideId);
      
      if (existingChat) {
        return {
          ...state,
          chats: state.chats.map(chat => {
            if (chat.rideId === rideId) {
              return {
                ...chat,
                messages,
                lastMessage: messages.length > 0 ? messages[messages.length - 1] : chat.lastMessage,
              };
            }
            return chat;
          }),
        };
      } else {
        // Create new chat if it doesn't exist
        const newChat: Chat = {
          id: rideId,
          rideId,
          driverId: '',
          driverName: '',
          passengerId: '',
          passengerName: '',
          messages,
          enabled: true,
          lastMessage: messages.length > 0 ? messages[messages.length - 1] : undefined,
        };
        return {
          ...state,
          chats: [...state.chats, newChat],
        };
      }
    }
    case 'ADD_NOTIFICATION': {
      const newNotification: Notification = {
        ...action.payload,
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        read: false,
      };
      return {
        ...state,
        notifications: [newNotification, ...state.notifications],
      };
    }
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(notif =>
          notif.id === action.payload ? { ...notif, read: true } : notif
        ),
      };
    case 'CLEAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: [],
      };
    case 'LOAD_INITIAL_DATA':
      return action.payload;
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Verify app configuration on startup (development only)
  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        const { verifyAppConfiguration } = require('../utils/debugService');
        verifyAppConfiguration().catch((error: any) => {
          console.error('[CONTEXT] Config verification failed:', error);
        });
      } catch (e) {}

      try {
        const { initializeIconValidation } = require('../utils/iconDebugger');
        initializeIconValidation().then((isValid: boolean) => {
          if (!isValid) console.warn('[ICON] Some icons may not be available.');
        });
      } catch (e) {}
    }
  }, []);

  // Start the expired-ride cleanup scheduler ONLY when the user is authenticated.
  // deleteExpiredRides() calls deleteDoc which requires auth — starting it before
  // sign-in causes a permission-denied error from Firestore.
  useEffect(() => {
    if (!state.auth.isSignedIn || !state.auth.user) {
      // If user just logged out, make sure scheduler is stopped
      stopRideCleanupScheduler();
      return;
    }

    startRideCleanupScheduler();

    return () => {
      stopRideCleanupScheduler();
    };
  }, [state.auth.isSignedIn, state.auth.user]);

  // Listen to Firebase auth state changes and restore from storage on startup
  useEffect(() => {
    dispatch({ type: 'SET_AUTH_INITIALIZING', payload: true });
    
    const initializeAuth = async () => {
      try {
        // First, try to load user from device storage (for offline persistence)
        console.log('[CONTEXT] Attempting to load user from storage...');
        const storedUser = await loadUserFromStorage();
        if (storedUser) {
          console.log('[CONTEXT] ✅ User loaded from storage:', {
            id: storedUser.id,
            email: storedUser.email,
            profileComplete: storedUser.profileComplete,
            role: storedUser.role,
            licenseVerified: storedUser.licenseVerified,
          });
          dispatch({ type: 'SET_USER', payload: storedUser });
          dispatch({ type: 'SET_AUTH_INITIALIZING', payload: false });
          
          // Always refresh from Firestore in the background to pick up any changes
          // (e.g., admin verified license, role changes, profile updates)
          console.log('[CONTEXT] 🔄 Background refresh from Firestore...');
          try {
            const { refreshUserFromFirestore } = require('../utils/authService');
            const freshUser = await refreshUserFromFirestore();
            if (freshUser) {
              console.log('[CONTEXT] 🔄 Fresh user data from Firestore:', {
                licenseVerified: freshUser.licenseVerified,
                licenseVerificationStatus: freshUser.licenseVerificationStatus,
                role: freshUser.role,
                profileComplete: freshUser.profileComplete,
              });
              
              // Only dispatch if data actually changed to avoid unnecessary re-renders
              const hasChanged = 
                storedUser.licenseVerified !== freshUser.licenseVerified ||
                storedUser.licenseVerificationStatus !== freshUser.licenseVerificationStatus ||
                storedUser.role !== freshUser.role ||
                storedUser.profileComplete !== freshUser.profileComplete;
              
              if (hasChanged) {
                console.log('[CONTEXT] 🔄 Data changed - updating context');
                dispatch({ type: 'SET_USER', payload: freshUser });
              } else {
                console.log('[CONTEXT] 🔄 No changes detected - skipping context update');
              }
            }
          } catch (refreshError) {
            console.warn('[CONTEXT] ⚠️ Background refresh failed (will use cached data):', refreshError);
          }
          return;
        }
        console.log('[CONTEXT] ℹ️ No user in storage, setting up Firebase auth listener');
      } catch (error) {
        console.error('[CONTEXT] Error loading from storage:', error);
        // Continue with Firebase auth anyway
      }

      // Then listen to Firebase auth state
      try {
        const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
          try {
            console.log('[CONTEXT] onAuthStateChanged fired, firebaseUser:', firebaseUser?.uid);
            if (firebaseUser) {
              console.log('[CONTEXT] User authenticated in Firebase, fetching user data...');
              const userData = await getCurrentUser();
              if (userData) {
                console.log('[CONTEXT] ✅ User data loaded from Firestore:', {
                  id: userData.id,
                  email: userData.email,
                  profileComplete: userData.profileComplete,
                  role: userData.role,
                });
                dispatch({ type: 'SET_USER', payload: userData });
              } else {
                console.log('[CONTEXT] ⚠️ No user data found in Firestore for authenticated user');
                dispatch({ type: 'LOGOUT' });
              }
            } else {
              console.log('[CONTEXT] ℹ️ User not authenticated, logging out');
              dispatch({ type: 'LOGOUT' });
            }
          } catch (error) {
            console.error('[CONTEXT] Error in onAuthStateChanged callback:', error);
            dispatch({ type: 'LOGOUT' });
          } finally {
            dispatch({ type: 'SET_AUTH_INITIALIZING', payload: false });
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('[CONTEXT] Error setting up Firebase auth listener:', error);
        dispatch({ type: 'SET_AUTH_INITIALIZING', payload: false });
        dispatch({ type: 'LOGOUT' });
        return undefined;
      }
    };

    let unsubscribe: (() => void) | undefined;
    initializeAuth().then(unsub => {
      unsubscribe = unsub;
    }).catch(error => {
      console.error('[CONTEXT] Critical error during auth initialization:', error);
      dispatch({ type: 'SET_AUTH_INITIALIZING', payload: false });
      // Don't show alert in production, just log
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        Alert.alert('Auth Error', 'Failed to initialize authentication. Please restart the app.');
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const sendOTPEmail = useCallback(async (email: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      console.log('[CONTEXT] sendOTPEmail called with:', email);
      const result = await sendOTP(email);
      console.log('[CONTEXT] sendOTP result:', result);
      dispatch({ type: 'SET_ERROR', payload: null });
      return result;
    } catch (error: any) {
      console.error('[CONTEXT] sendOTP ERROR:', error);
      const errorMessage = error.message || 'Failed to send OTP';
      console.error('[CONTEXT] Error message set to:', errorMessage);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const verifyOTPAndSignUp = useCallback(
    async (email: string, otp: string, signUpData: OTPSignUpData) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const user = await verifyOTPAndCreateAccount(email, otp, signUpData);
        dispatch({ type: 'SET_USER', payload: user });
        dispatch({ type: 'SET_ERROR', payload: null });
        return user;
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to verify OTP';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        throw error;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    []
  );

  const verifyOTPAndSignIn = useCallback(async (email: string, otp: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const user = await verifyOTPAndLogin(email, otp);
      dispatch({ type: 'SET_USER', payload: user });
      dispatch({ type: 'SET_ERROR', payload: null });
      return user;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to verify OTP';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const verifyOTPAndAutoAuthCallback = useCallback(async (email: string, otp: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await verifyOTPAndAutoAuth(email, otp);
      
      if (result.user) {
        // Existing user - auto login
        dispatch({ type: 'SET_USER', payload: result.user });
      }
      // For new users, don't set user yet - let profile form set it
      dispatch({ type: 'SET_ERROR', payload: null });
      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to verify OTP';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const switchRole = useCallback((role: 'driver' | 'passenger') => {
    dispatch({ type: 'SWITCH_ROLE', payload: role });
  }, []);

  const switchRolePersistent = useCallback(async (role: 'driver' | 'passenger') => {
    if (!state.auth.user) {
      throw new Error('No authenticated user');
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      console.log('[CONTEXT] 📍 switchRolePersistent called');
      console.log('[CONTEXT] 📍 Current user:', state.auth.user.id, state.auth.user.email);
      console.log('[CONTEXT] 📍 New role:', role);
      
      const updatedUser = await switchUserRole(state.auth.user.id, role);
      
      console.log('[CONTEXT] ✅ Role switched. Updated user state:', {
        id: updatedUser.id,
        role: updatedUser.role,
        licenseVerified: updatedUser.licenseVerified,
        licenseVerificationStatus: updatedUser.licenseVerificationStatus,
        profileComplete: updatedUser.profileComplete,
      });

      // Persist to AsyncStorage so cached user data stays in sync
      try {
        const { saveUserToStorage } = require('../utils/authService');
        await saveUserToStorage(updatedUser);
        console.log('[CONTEXT] ✅ Updated user persisted to storage');
      } catch (storageErr) {
        console.warn('[CONTEXT] ⚠️ Failed to persist role switch to storage:', storageErr);
      }

      dispatch({ type: 'SET_USER', payload: updatedUser });
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to switch role';
      console.error('[CONTEXT] ❌ switchRolePersistent error:', errorMessage);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.auth.user]);

  const logout = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await logoutUser();
      dispatch({ type: 'LOGOUT' });
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to logout' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const createRide = useCallback(
    async (rideData: Omit<Ride, 'id' | 'createdAt' | 'driverId' | 'driverName' | 'bookedSeats' | 'status'>) => {
      if (!state.auth.user) {
        console.error('[CONTEXT] createRide: No authenticated user');
        throw new Error('No authenticated user');
      }

      try {
        console.log('[CONTEXT] createRide called for driver:', state.auth.user.id);
        
        // Save to Firestore first
        const firestoreRideId = await createRideInFirestore(
          state.auth.user.id,
          state.auth.user.fullName,
          rideData
        );

        // Then dispatch local action with the Firestore ID
        const newRide: Ride = {
          ...rideData,
          id: firestoreRideId,
          driverId: state.auth.user.id,
          driverName: state.auth.user.fullName,
          createdAt: new Date().toISOString(),
          bookedSeats: [],
          status: 'active',
        };
        
        console.log('[CONTEXT] ✅ Ride created locally and in Firestore');
        dispatch({ type: 'CREATE_RIDE', payload: newRide });
      } catch (error: any) {
        console.error('[CONTEXT] ❌ createRide failed:', error);
        throw error;
      }
    },
    [state.auth.user]
  );

  const cancelRide = useCallback((rideId: string) => {
    dispatch({ type: 'CANCEL_RIDE', payload: rideId });
  }, []);

  const loadDriverRides = useCallback(
    async (driverId: string) => {
      try {
        console.log('[CONTEXT] Loading driver rides for:', driverId);
        const rides = await getDriverRides(driverId);
        dispatch({ type: 'SET_RIDES', payload: rides });
        console.log('[CONTEXT] ✅ Loaded', rides.length, 'driver rides');
      } catch (error: any) {
        console.error('[CONTEXT] ❌ Failed to load driver rides:', error);
      }
    },
    []
  );

  const loadAllAvailableRides = useCallback(
    async () => {
      try {
        console.log('[CONTEXT] Loading all available rides for passengers');
        const rides = await getAllRides();
        dispatch({ type: 'SET_RIDES', payload: rides });
        dispatch({ type: 'SET_ERROR', payload: null }); // Clear any previous errors
        console.log('[CONTEXT] ✅ Loaded', rides.length, 'available rides');
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to load available rides. Please check your network connection and try again.';
        console.error('[CONTEXT] ❌ Failed to load available rides:', error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    },
    []
  );

  // Load all rides including history for ride history view (all statuses: active, in_progress, completed, cancelled)
  const loadAllRidesIncludingHistory = useCallback(
    async () => {
      try {
        console.log('[CONTEXT] Loading all rides including history (all statuses)');
        const rides = await getAllRidesIncludingHistory();
        dispatch({ type: 'SET_RIDES', payload: rides });
        dispatch({ type: 'SET_ERROR', payload: null }); // Clear any previous errors
        console.log('[CONTEXT] ✅ Loaded', rides.length, 'rides including history');
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to load ride history. Please check your network connection and try again.';
        console.error('[CONTEXT] ❌ Failed to load rides with history:', error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    },
    []
  );

  const loadPassengerBookings = useCallback(
    async (passengerId: string) => {
      try {
        console.log('[CONTEXT] Loading passenger bookings for:', passengerId);
        const bookings = await getPassengerBookings(passengerId);
        dispatch({ type: 'SET_BOOKINGS', payload: bookings });

        // Fetch corresponding rides and merge them into local rides state
        if (bookings.length > 0) {
          const { getRideById } = require('../utils/rideService');
          const ridePromises = bookings.map(b => getRideById(b.rideId));
          const fetchedRides = await Promise.all(ridePromises);
          const validRides = fetchedRides.filter((r): r is Ride => r !== null);
          
          dispatch({ type: 'MERGE_RIDES', payload: validRides });
        }

        dispatch({ type: 'SET_ERROR', payload: null }); // Clear any previous errors
        console.log('[CONTEXT] ✅ Loaded', bookings.length, 'passenger bookings');
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to load your bookings. Please check your network connection and try again.';
        console.error('[CONTEXT] ❌ Failed to load passenger bookings:', error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    },
    []
  );

  const requestRide = useCallback(
    async (rideId: string, seatsBooked: number) => {
      if (!state.auth.user) {
        console.error('[CONTEXT] requestRide: No authenticated user');
        throw new Error('No authenticated user');
      }

      try {
        const ride = state.rides.find(r => r.id === rideId);
        if (!ride) {
          throw new Error('Ride not found');
        }

        console.log('[CONTEXT] Creating booking for ride:', rideId);

        // Save to Firestore first
        const bookingId = await createBookingInFirestore(
          rideId,
          state.auth.user.id,
          state.auth.user.fullName,
          state.auth.user.email,
          ride.driverId,
          seatsBooked,
          ride.price
        );

        // Create local booking object
        const newBooking: Booking = {
          id: bookingId,
          rideId,
          passengerId: state.auth.user.id,
          driverId: ride.driverId,
          seatsBooked,
          status: 'pending',
          bookedAt: new Date().toISOString(),
        };

        console.log('[CONTEXT] ✅ Booking created locally and in Firestore');
        dispatch({ type: 'CREATE_BOOKING', payload: newBooking });

        // Add notification for driver
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            type: 'ride_request',
            title: 'New Ride Request',
            body: `${state.auth.user.fullName} requested ${seatsBooked} seat(s)`,
            rideId,
            relatedUserId: state.auth.user.id,
          },
        });
      } catch (error: any) {
        console.error('[CONTEXT] ❌ requestRide failed:', error);
        throw error;
      }
    },
    [state.auth.user, state.rides]
  );

  const acceptBooking = useCallback(
    async (rideId: string, passengerId: string) => {
      try {
        // Query Firestore to find the booking by rideId and passengerId
        const booking = await getBookingByRideAndPassenger(rideId, passengerId);
        if (!booking) {
          throw new Error('Booking not found in Firestore');
        }

        const ride = state.rides.find(r => r.id === rideId);
        if (!ride) {
          throw new Error('Ride not found');
        }

        console.log('[CONTEXT] Driver accepting booking:', booking.id);

        // Update in Firestore
        await acceptBookingAsDriver(
          booking.id,
          rideId,
          passengerId,
          booking.seatsBooked,
          ride.availableSeats
        );

        // Update local state
        const updatedBooking: Booking = { ...booking, status: 'accepted' };
        dispatch({ type: 'UPDATE_BOOKING', payload: updatedBooking });

        // Create chat for accepted booking (chat will be added when first message is sent)
        // This is handled by the messaging system

        // Add notification
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            type: 'ride_accepted',
            title: 'Ride Accepted',
            body: `${state.auth.user?.fullName || 'Driver'} accepted your booking`,
            rideId,
            relatedUserId: state.auth.user?.id,
          },
        });

        console.log('[CONTEXT] ✅ Booking accepted');
      } catch (error: any) {
        console.error('[CONTEXT] ❌ acceptBooking failed:', error);
        throw error;
      }
    },
    [state.auth.user, state.rides]
  );

  const rejectBooking = useCallback(
    async (rideId: string, passengerId: string) => {
      try {
        // Query Firestore to find the booking by rideId and passengerId
        const booking = await getBookingByRideAndPassenger(rideId, passengerId);
        if (!booking) {
          throw new Error('Booking not found in Firestore');
        }

        console.log('[CONTEXT] Driver rejecting booking:', booking.id);

        // Update in Firestore
        await rejectBookingAsDriver(booking.id, rideId, passengerId);

        // Update local state
        const updatedBooking: Booking = { ...booking, status: 'rejected' };
        dispatch({ type: 'UPDATE_BOOKING', payload: updatedBooking });

        // Add notification
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            type: 'ride_rejected',
            title: 'Ride Rejected',
            body: `${state.auth.user?.fullName || 'Driver'} rejected your booking`,
            rideId,
            relatedUserId: state.auth.user?.id,
          },
        });

        console.log('[CONTEXT] ✅ Booking rejected');
      } catch (error: any) {
        console.error('[CONTEXT] ❌ rejectBooking failed:', error);
        throw error;
      }
    },
    [state.auth.user]
  );

  const cancelBooking = useCallback(
    async (bookingId: string) => {
      try {
        const booking = state.bookings.find(b => b.id === bookingId);
        if (!booking) {
          throw new Error('Booking not found');
        }

        const ride = state.rides.find(r => r.id === booking.rideId);
        if (!ride) {
          throw new Error('Ride not found');
        }

        console.log('[CONTEXT] Passenger cancelling booking:', bookingId);

        // Cancel with penalty in Firestore
        const penalty = await cancelBookingWithPenalty(
          bookingId,
          booking.rideId,
          booking.passengerId,
          ride.departureTime
        );

        // Update local state
        dispatch({
          type: 'CANCEL_BOOKING',
          payload: bookingId,
        });

        // Add notification
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            type: 'ride_cancelled',
            title: 'Booking Cancelled',
            body: penalty > 0 ? `Booking cancelled. Penalty: ₹${penalty}` : 'Your booking has been cancelled',
          },
        });

        console.log('[CONTEXT] ✅ Booking cancelled with penalty:', penalty);
      } catch (error: any) {
        console.error('[CONTEXT] ❌ cancelBooking failed:', error);
        throw error;
      }
    },
    [state.bookings, state.rides]
  );

  const sendMessage = useCallback(
    async (rideId: string, recipientId: string, content: string) => {
      if (!state.auth.user) return;

      try {
        // Send to Firestore
        await sendMessageToFirestore(
          rideId,
          state.auth.user.id,
          state.auth.user.fullName,
          recipientId,
          content,
          '' // Avatar URL - can be updated later
        );

        // Optimistic update for immediate UI feedback
        const newMessage: Message = {
          id: Math.random().toString(36).substring(7),
          senderId: state.auth.user.id,
          senderName: state.auth.user.fullName,
          recipientId,
          rideId,
          content,
          timestamp: new Date().toISOString(),
          read: false,
          messageType: 'text',
        };
        dispatch({ type: 'SEND_MESSAGE', payload: newMessage });
      } catch (error) {
        console.error('[APP_CONTEXT] Failed to send message:', error);
      }
    },
    [state.auth.user]
  );

  const getRideById = useCallback(
    (rideId: string) => {
      return state.rides.find(ride => ride.id === rideId);
    },
    [state.rides]
  );

  const getChat = useCallback(
    (rideId: string, userId: string) => {
      return state.chats.find(chat => chat.rideId === rideId);
    },
    [state.chats]
  );

  const subscribeToRideChat = useCallback(
    (rideId: string, onMessagesUpdate: (messages: Message[]) => void) => {
      // Subscribe to real-time messages from Firestore
      const unsubscribe = subscribeToMessages(rideId, (messages) => {
        // Convert Firestore messages to app Message type
        const convertedMessages = messages.map(msg => ({
          id: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderName,
          recipientId: msg.recipientId,
          rideId: msg.rideId,
          content: msg.content,
          timestamp: msg.timestamp instanceof Date 
            ? msg.timestamp.toISOString()
            : typeof msg.timestamp === 'string'
            ? msg.timestamp
            : new Date().toISOString(),
          read: msg.read ?? false,
          messageType: msg.messageType || 'text',
          senderAvatar: msg.senderAvatar,
        } as Message));

        // Update local state
        const firstMsg = convertedMessages[0];
        const chatId = firstMsg && rideId + '-' + (firstMsg.senderId < firstMsg.recipientId ? firstMsg.senderId : firstMsg.recipientId);
        dispatch({
          type: 'UPDATE_CHAT_MESSAGES',
          payload: { rideId, messages: convertedMessages },
        });

        // Call callback for UI updates
        onMessagesUpdate(convertedMessages);
      });

      return unsubscribe;
    },
    []
  );

  const markMessagesAsRead = useCallback((chatId: string) => {
    dispatch({ type: 'MARK_MESSAGES_READ', payload: chatId });
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
    },
    []
  );

  const markNotificationAsRead = useCallback((notificationId: string) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notificationId });
  }, []);

  const clearNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  // Profile-related methods
  const getProfileStats = useCallback(
    async (userId: string, role: 'driver' | 'passenger') => {
      try {
        if (role === 'driver') {
          return await getDriverStats(userId);
        } else {
          return await getPassengerStats(userId);
        }
      } catch (error) {
        console.error('[CONTEXT] ❌ Failed to get profile stats:', error);
        throw error;
      }
    },
    []
  );

  const getUpcomingRideData = useCallback(
    async (userId: string, role: 'driver' | 'passenger') => {
      try {
        return await getUpcomingRide(userId, role);
      } catch (error) {
        console.error('[CONTEXT] ❌ Failed to get upcoming ride:', error);
        return null;
      }
    },
    []
  );

  const getRideHistoryData = useCallback(
    async (userId: string, role: 'driver' | 'passenger', limit?: number) => {
      try {
        return await getRideHistory(userId, role, limit);
      } catch (error) {
        console.error('[CONTEXT] ❌ Failed to get ride history:', error);
        return [];
      }
    },
    []
  );

  const getVehicleInfoData = useCallback(
    async (driverId: string) => {
      try {
        return await getVehicleInfo(driverId);
      } catch (error) {
        console.error('[CONTEXT] ❌ Failed to get vehicle info:', error);
        return null;
      }
    },
    []
  );

  const updateProfileDataLocal = useCallback(
    async (userId: string, updates: Partial<User>) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const updatedUser = await updateUserProfile(userId, updates);
        dispatch({ type: 'SET_USER', payload: updatedUser });
        dispatch({ type: 'SET_ERROR', payload: null });
        
        // Also persist to AsyncStorage so cached data stays in sync
        try {
          const { saveUserToStorage } = require('../utils/authService');
          await saveUserToStorage(updatedUser);
        } catch (storageErr) {
          console.warn('[CONTEXT] Failed to persist updated user to storage:', storageErr);
        }
        
        return updatedUser;
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to update profile';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        throw error;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    []
  );

  const value: AppContextType = {
    auth: state.auth,
    authInitializing: state.authInitializing,
    rides: state.rides,
    userRides: state.rides.filter(r => r.driverId === state.auth.user?.id),
    bookings: state.bookings,
    chats: state.chats,
    notifications: state.notifications,
    sendOTPEmail,
    verifyOTPAndSignUp,
    verifyOTPAndSignIn,
    verifyOTPAndAutoAuth: verifyOTPAndAutoAuthCallback,
    logout,
    switchRole,
    switchRolePersistent,
    createRide,
    cancelRide,
    startRideLocal: (rideId: string) => {
      dispatch({
        type: 'UPDATE_BOOKING',
        payload: {
          id: rideId,
          rideId,
          passengerId: '',
          driverId: '',
          seatsBooked: 0,
          status: 'pending',
          bookedAt: new Date().toISOString(),
        },
      });
    },
    startRide: async (rideId: string) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        await startRide(rideId);
        
        // Update local state
        const updatedRides = state.rides.map(ride =>
          ride.id === rideId ? { ...ride, status: 'in_progress' as const } : ride
        );
        dispatch({ type: 'SET_RIDES', payload: updatedRides });
        
        dispatch({ type: 'SET_ERROR', payload: null });
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to start ride';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        throw error;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    completeRide: async (rideId: string) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        await completeRide(rideId);
        
        // Update local state
        const updatedRides = state.rides.map(ride =>
          ride.id === rideId ? { ...ride, status: 'completed' as const } : ride
        );
        dispatch({ type: 'SET_RIDES', payload: updatedRides });
        
        dispatch({ type: 'SET_ERROR', payload: null });
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to complete ride';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        throw error;
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    loadDriverRides,
    loadAllAvailableRides,
    loadAllRidesIncludingHistory,
    getRideById,
    requestRide,
    acceptBooking,
    rejectBooking,
    cancelBooking,
    loadPassengerBookings,
    sendMessage,
    subscribeToRideChat,
    getChat,
    markMessagesAsRead,
    addNotification,
    markNotificationAsRead,
    clearNotifications,
    getDriverStats,
    getPassengerStats,
    getUpcomingRide,
    getRideHistory,
    getVehicleInfo,
    updateProfileData: updateProfileDataLocal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
