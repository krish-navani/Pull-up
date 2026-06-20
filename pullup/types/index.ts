/**
 * User and Authentication Types
 */
export interface NotificationPreferences {
  rideUpdates: boolean;
  paymentUpdates: boolean;
  chatUpdates: boolean;
  poolUpdates: boolean;
  marketingUpdates: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  year: 'First Year' | 'Second Year' | 'Third Year' | 'Fourth Year' | 'Fifth Year' | 'Honors Degree';
  course: string;
  division: string;
  role: 'driver' | 'passenger';
  phone?: string;
  profileImage?: string | null;
  licenseVerified?: boolean;
  profileComplete: boolean;
  createdAt?: string;
  updatedAt?: string;
  expoPushToken?: string | null;
  notificationPreferences?: NotificationPreferences;
  mutedChats?: {
    [chatId: string]: string; // ISO string for mute expiration
  };
  // Driver-specific fields
  licenseImageUri?: string;
  licenseVerificationStatus?: 'pending' | 'verified' | 'rejected';
  licenseUploadedAt?: string;
  licenseConfirmed?: boolean;
}

export interface AuthState {
  isSignedIn: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
}

/**
 * Ride and Location Types
 */
export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
}

export interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  pickupLocation: Location;
  dropLocation: Location;
  departureTime: string; // ISO date
  price: number;
  availableSeats: number;
  totalSeats: number;
  carModel: string;
  carColor?: string;
  description?: string;
  createdAt: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show';
  startedAt?: string; // When driver started the ride
  completedAt?: string; // When driver completed the ride
  bookedSeats: BookingInfo[];
  currentLocation?: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  };
}

/**
 * Booking Types
 */
export interface BookingInfo {
  passengerId: string;
  passengerName: string;
  seatsBooked: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  bookedAt: string;
  cancelledAt?: string;
  penaltyApplied?: number;
  pickedUp?: boolean;
  droppedOff?: boolean;
  paymentStatus?: 'pending' | 'paid' | 'failed';
  totalPrice?: number;
  orderId?: string;
}

export interface Booking {
  id: string;
  rideId: string;
  passengerId: string;
  driverId: string;
  seatsBooked: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  bookedAt: string;
  cancelledAt?: string;
  penaltyApplied?: number;
  passengerPickupLocation?: Location;
  passengerDropLocation?: Location;
  pickedUp?: boolean;
  droppedOff?: boolean;
  paymentStatus?: 'pending' | 'paid' | 'failed';
  totalPrice?: number;
  orderId?: string;
}

/**
 * Chat Types
 */
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  rideId: string;
  content: string;
  timestamp: string;
  read: boolean;
  messageType?: 'text' | 'system';
  senderAvatar?: string;
}

export interface Chat {
  id: string;
  rideId: string;
  driverId: string;
  driverName: string;
  passengerId: string;
  passengerName: string;
  messages: Message[];
  enabled: boolean;
  lastMessage?: Message;
}

/**
 * Notification Types
 */
export interface Notification {
  id: string;
  type:
  | 'ride_request'
  | 'ride_accepted'
  | 'ride_rejected'
  | 'ride_cancelled'
  | 'message';
  title: string;
  body: string;
  rideId?: string;
  relatedUserId?: string;
  timestamp: string;
  read: boolean;
}

/**
 * App Context Types
 */
export interface DriverStats {
  totalRides: number;
  completedRides: number;
  totalEarnings: number;
  passengersServed: number;
  averageRating: number;
  acceptanceRate: number;
}

export interface PassengerStats {
  totalRides: number;
  completedRides: number;
  totalSpent: number;
  totalSavings: number;
  averageRating: number;
  cancelledRides: number;
}

export interface UpcomingRide {
  type: 'driver' | 'passenger';
  rideId: string;
  route: string;
  time: string;
  departureTime: string;
  price: number;
  seatsAvailable?: number;
  driverName?: string;
}

export interface AppContextType {
  // Auth
  auth: AuthState;
  authInitializing: boolean;
  sendOTPEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyOTPAndSignUp: (email: string, otp: string, signUpData: any) => Promise<User>;
  verifyOTPAndSignIn: (email: string, otp: string) => Promise<User>;
  verifyOTPAndAutoAuth: (email: string, otp: string) => Promise<{ user: User | null; isNewUser: boolean }>;
  logout: () => Promise<void>;
  switchRole: (role: 'driver' | 'passenger') => void;
  switchRolePersistent: (role: 'driver' | 'passenger') => Promise<void>;

  // Rides
  rides: Ride[];
  userRides: Ride[];
  createRide: (rideData: Omit<Ride, 'id' | 'createdAt' | 'driverId' | 'driverName' | 'bookedSeats' | 'status'>) => void;
  cancelRide: (rideId: string) => void;
  startRide: (rideId: string) => Promise<void>;
  startRideLocal: (rideId: string) => void;
  completeRide: (rideId: string) => Promise<void>;
  loadDriverRides: (driverId: string) => Promise<void>;
  loadAllAvailableRides: () => Promise<void>;
  loadAllRidesIncludingHistory: () => Promise<void>;
  getRideById: (rideId: string) => Ride | undefined;

  // Bookings
  bookings: Booking[];
  requestRide: (rideId: string, seatsBooked: number, pickupLocation?: any, dropLocation?: any) => Promise<void>;
  acceptBooking: (rideId: string, passengerId: string) => Promise<void>;
  rejectBooking: (rideId: string, passengerId: string) => Promise<void>;
  cancelBooking: (bookingId: string) => Promise<void>;
  loadPassengerBookings: (passengerId: string) => Promise<void>;

  // Chat
  chats: Chat[];
  sendMessage: (rideId: string, recipientId: string, content: string) => Promise<void>;
  subscribeToRideChat: (rideId: string, onMessagesUpdate: (messages: Message[]) => void) => () => void;
  getChat: (rideId: string, userId: string) => Chat | undefined;
  markMessagesAsRead: (chatId: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  clearNotifications: () => void;

  // Profile
  getDriverStats: (driverId: string) => Promise<DriverStats>;
  getPassengerStats: (passengerId: string) => Promise<PassengerStats>;
  getUpcomingRide: (userId: string, role: 'driver' | 'passenger') => Promise<UpcomingRide | null>;
  getRideHistory: (userId: string, role: 'driver' | 'passenger', limit?: number) => Promise<any[]>;
  getVehicleInfo: (driverId: string) => Promise<any>;
  updateProfileData: (userId: string, updates: Partial<User>) => Promise<User>;
}
