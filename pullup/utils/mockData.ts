import { Booking, Ride } from '../types';

export function generateMockRides(): Ride[] {
  const now = new Date();

  return [
    {
      id: 'ride-1',
      driverId: 'driver-1',
      driverName: 'Soham Bhosale',
      pickupLocation: {
        latitude: 19.1755629,
        longitude: 72.877972,
        address: 'NNP, Goregaon',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1231776,
        longitude: 72.8335405,
        address: 'Bhavans College, Andheri',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 2 * 60 * 60000).toISOString(),
      price: 150,
      availableSeats: 2,
      totalSeats: 4,
      carModel: 'Honda City Silver',
      carColor: 'Silver',
      description: 'AC car, music system available',
      createdAt: new Date(now.getTime() - 30 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [
        {
          passengerId: 'passenger-1',
          passengerName: 'Priya Desai',
          seatsBooked: 2,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 15 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-2',
      driverId: 'driver-2',
      driverName: 'Arjun Verma',
      pickupLocation: {
        latitude: 19.0760,
        longitude: 72.8777,
        address: 'Lower Parel Station',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0826,
        longitude: 72.8124,
        address: 'Powai Lake',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 1.5 * 60 * 60000).toISOString(),
      price: 120,
      availableSeats: 3,
      totalSeats: 4,
      carModel: 'Toyota Innova White',
      carColor: 'White',
      description: 'Spacious SUV, good for luggage',
      createdAt: new Date(now.getTime() - 20 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [
        {
          passengerId: 'passenger-2',
          passengerName: 'Anjali Singh',
          seatsBooked: 1,
          status: 'pending',
          bookedAt: new Date(now.getTime() - 10 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-3',
      driverId: 'driver-3',
      driverName: 'Nikita Patel',
      pickupLocation: {
        latitude: 19.0895,
        longitude: 72.8656,
        address: 'Worli Sea Face',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1136,
        longitude: 72.8697,
        address: 'NESCO Goregaon',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 3.5 * 60 * 60000).toISOString(),
      price: 200,
      availableSeats: 4,
      totalSeats: 4,
      carModel: 'BMW 3 Series Black',
      carColor: 'Black',
      description: 'Premium ride, air suspension',
      createdAt: new Date(now.getTime() - 40 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [],
    },
    {
      id: 'ride-4',
      driverId: 'driver-4',
      driverName: 'Aditya Kumar',
      pickupLocation: {
        latitude: 19.0176,
        longitude: 72.8479,
        address: 'Marine Drive, IMAX Junction',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0826,
        longitude: 72.8124,
        address: 'Powai Tech Park',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 45 * 60000).toISOString(),
      price: 100,
      availableSeats: 2,
      totalSeats: 5,
      carModel: 'Hyundai Venue Blue',
      carColor: 'Blue',
      description: 'Budget friendly, comfortable',
      createdAt: new Date(now.getTime() - 25 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [
        {
          passengerId: 'passenger-3',
          passengerName: 'Neha Gupta',
          seatsBooked: 3,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-5',
      driverId: 'driver-5',
      driverName: 'Meera Reddy',
      pickupLocation: {
        latitude: 19.0944,
        longitude: 72.8260,
        address: 'BKC, Bandra',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1136,
        longitude: 72.8697,
        address: 'Goregaon Station East',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 90 * 60000).toISOString(),
      price: 180,
      availableSeats: 3,
      totalSeats: 4,
      carModel: 'Maruti Swift Red',
      carColor: 'Red',
      description: 'Quick commute, music available',
      createdAt: new Date(now.getTime() - 35 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [],
    },
    // Completed Rides
    {
      id: 'ride-completed-1',
      driverId: 'driver-6',
      driverName: 'Raj Patel',
      pickupLocation: {
        latitude: 19.1175,
        longitude: 72.8263,
        address: 'CST Station, Fort',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0760,
        longitude: 72.8777,
        address: 'Lower Parel, Mumbai',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() - 3 * 24 * 60 * 60000).toISOString(),
      price: 160,
      availableSeats: 0,
      totalSeats: 4,
      carModel: 'Maruti Baleno Silver',
      carColor: 'Silver',
      description: 'Comfortable ride, good driver',
      createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60000).toISOString(),
      status: 'completed',
      bookedSeats: [
        {
          passengerId: 'user-1',
          passengerName: 'You',
          seatsBooked: 1,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 4 * 24 * 60 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-completed-2',
      driverId: 'driver-7',
      driverName: 'Pooja Sharma',
      pickupLocation: {
        latitude: 19.0826,
        longitude: 72.8124,
        address: 'Powai Tech Park',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1136,
        longitude: 72.8697,
        address: 'NESCO Goregaon',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() - 2 * 24 * 60 * 60000).toISOString(),
      price: 140,
      availableSeats: 0,
      totalSeats: 5,
      carModel: 'Toyota Innova White',
      carColor: 'White',
      description: 'Spacious SUV, professional driver',
      createdAt: new Date(now.getTime() - 2.5 * 24 * 60 * 60000).toISOString(),
      status: 'completed',
      bookedSeats: [
        {
          passengerId: 'user-1',
          passengerName: 'You',
          seatsBooked: 2,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 2.5 * 24 * 60 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-completed-3',
      driverId: 'driver-8',
      driverName: 'Vikram Singh',
      pickupLocation: {
        latitude: 19.0944,
        longitude: 72.8260,
        address: 'BKC, Bandra',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1231776,
        longitude: 72.8335405,
        address: 'Bhavans College, Andheri',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() - 7 * 24 * 60 * 60000).toISOString(),
      price: 130,
      availableSeats: 0,
      totalSeats: 4,
      carModel: 'Honda City Red',
      carColor: 'Red',
      description: 'Quick commute, safe driver',
      createdAt: new Date(now.getTime() - 7.5 * 24 * 60 * 60000).toISOString(),
      status: 'completed',
      bookedSeats: [
        {
          passengerId: 'user-1',
          passengerName: 'You',
          seatsBooked: 1,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 7.5 * 24 * 60 * 60000).toISOString(),
        },
      ],
    },
    // Cancelled Rides
    {
      id: 'ride-cancelled-1',
      driverId: 'driver-9',
      driverName: 'Deepak Sharma',
      pickupLocation: {
        latitude: 19.0760,
        longitude: 72.8777,
        address: 'Lower Parel Station',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0944,
        longitude: 72.8260,
        address: 'BKC, Bandra',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() - 1 * 24 * 60 * 60000).toISOString(),
      price: 150,
      availableSeats: 0,
      totalSeats: 4,
      carModel: 'Hyundai Elite i20 Blue',
      carColor: 'Blue',
      description: 'Budget friendly ride',
      createdAt: new Date(now.getTime() - 1.5 * 24 * 60 * 60000).toISOString(),
      status: 'cancelled',
      bookedSeats: [
        {
          passengerId: 'user-1',
          passengerName: 'You',
          seatsBooked: 1,
          status: 'cancelled',
          bookedAt: new Date(now.getTime() - 1.5 * 24 * 60 * 60000).toISOString(),
          cancelledAt: new Date(now.getTime() - 1.2 * 24 * 60 * 60000).toISOString(),
        },
      ],
    },
    {
      id: 'ride-cancelled-2',
      driverId: 'driver-10',
      driverName: 'Neha Desai',
      pickupLocation: {
        latitude: 19.1755629,
        longitude: 72.877972,
        address: 'NNP, Goregaon',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0826,
        longitude: 72.8124,
        address: 'Powai Lake',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() - 5 * 24 * 60 * 60000).toISOString(),
      price: 170,
      availableSeats: 0,
      totalSeats: 5,
      carModel: 'Maruti Swift Yellow',
      carColor: 'Yellow',
      description: 'Quick ride, AC available',
      createdAt: new Date(now.getTime() - 5.5 * 24 * 60 * 60000).toISOString(),
      status: 'cancelled',
      bookedSeats: [
        {
          passengerId: 'user-1',
          passengerName: 'You',
          seatsBooked: 3,
          status: 'cancelled',
          bookedAt: new Date(now.getTime() - 5.5 * 24 * 60 * 60000).toISOString(),
          cancelledAt: new Date(now.getTime() - 5.3 * 24 * 60 * 60000).toISOString(),
          penaltyApplied: 25,
        },
      ],
    },
  ];
}

export function generateMockBookings(userId: string): Booking[] {
  const now = new Date();

  return [
    // Bookings as passenger
    {
      id: 'booking-1',
      rideId: 'ride-1',
      passengerId: userId,
      driverId: 'driver-1',
      seatsBooked: 2,
      status: 'accepted',
      bookedAt: new Date(now.getTime() - 2 * 60 * 60000).toISOString(),
    },
    {
      id: 'booking-2',
      rideId: 'ride-2',
      passengerId: userId,
      driverId: 'driver-2',
      seatsBooked: 1,
      status: 'pending',
      bookedAt: new Date(now.getTime() - 30 * 60000).toISOString(),
    },
    {
      id: 'booking-3',
      rideId: 'ride-4',
      passengerId: userId,
      driverId: 'driver-4',
      seatsBooked: 2,
      status: 'accepted',
      bookedAt: new Date(now.getTime() - 1 * 60 * 60000).toISOString(),
    },
    {
      id: 'booking-4',
      rideId: 'ride-3',
      passengerId: userId,
      driverId: 'driver-3',
      seatsBooked: 1,
      status: 'rejected',
      bookedAt: new Date(now.getTime() - 45 * 60000).toISOString(),
    },
    // Completed bookings
    {
      id: 'booking-completed-1',
      rideId: 'ride-completed-1',
      passengerId: userId,
      driverId: 'driver-6',
      seatsBooked: 1,
      status: 'accepted',
      bookedAt: new Date(now.getTime() - 4 * 24 * 60 * 60000).toISOString(),
    },
    {
      id: 'booking-completed-2',
      rideId: 'ride-completed-2',
      passengerId: userId,
      driverId: 'driver-7',
      seatsBooked: 2,
      status: 'accepted',
      bookedAt: new Date(now.getTime() - 2.5 * 24 * 60 * 60000).toISOString(),
    },
    {
      id: 'booking-completed-3',
      rideId: 'ride-completed-3',
      passengerId: userId,
      driverId: 'driver-8',
      seatsBooked: 1,
      status: 'accepted',
      bookedAt: new Date(now.getTime() - 7.5 * 24 * 60 * 60000).toISOString(),
    },
    // Cancelled bookings
    {
      id: 'booking-cancelled-1',
      rideId: 'ride-cancelled-1',
      passengerId: userId,
      driverId: 'driver-9',
      seatsBooked: 1,
      status: 'cancelled',
      bookedAt: new Date(now.getTime() - 1.5 * 24 * 60 * 60000).toISOString(),
      cancelledAt: new Date(now.getTime() - 1.2 * 24 * 60 * 60000).toISOString(),
    },
    {
      id: 'booking-cancelled-2',
      rideId: 'ride-cancelled-2',
      passengerId: userId,
      driverId: 'driver-10',
      seatsBooked: 3,
      status: 'cancelled',
      bookedAt: new Date(now.getTime() - 5.5 * 24 * 60 * 60000).toISOString(),
      cancelledAt: new Date(now.getTime() - 5.3 * 24 * 60 * 60000).toISOString(),
      penaltyApplied: 25,
    },
  ];
}

export function generateMockDriverRides(userId: string): Ride[] {
  const now = new Date();

  const passengerNames = ['Priya Desai', 'Anjali Singh', 'Neha Gupta', 'Raj Kumar', 'Vikram Patel', 'Aditi Sharma'];
  const departments = ['EC', 'IT', 'ME', 'CE', 'EE', 'CS'];

  return [
    {
      id: `driver-ride-${userId}-1`,
      driverId: userId,
      driverName: 'You (Current Driver)',
      pickupLocation: {
        latitude: 19.0176,
        longitude: 72.8479,
        address: 'Marine Drive, IMAX Junction',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0944,
        longitude: 72.8260,
        address: 'BKC Gate 1, Bandra',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 1.5 * 60 * 60000).toISOString(),
      price: 150,
      availableSeats: 1,
      totalSeats: 4,
      carModel: 'Toyota Fortuner White',
      carColor: 'White',
      description: 'Spacious SUV, AirCond, good music',
      createdAt: new Date(now.getTime() - 20 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [
        {
          passengerId: 'passenger-test-1',
          passengerName: 'Priya Desai',
          seatsBooked: 2,
          status: 'pending',
          bookedAt: new Date(now.getTime() - 10 * 60000).toISOString(),
        },
        {
          passengerId: 'passenger-test-2',
          passengerName: 'Anjali Singh',
          seatsBooked: 1,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
        },
      ],
    },
    {
      id: `driver-ride-${userId}-2`,
      driverId: userId,
      driverName: 'You (Current Driver)',
      pickupLocation: {
        latitude: 19.0760,
        longitude: 72.8777,
        address: 'Lower Parel Station',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.0826,
        longitude: 72.8124,
        address: 'Powai Tech Park',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 4 * 60 * 60000).toISOString(),
      price: 120,
      availableSeats: 4,
      totalSeats: 4,
      carModel: 'Honda City Silver',
      carColor: 'Silver',
      description: 'Comfortable city car, A/C working',
      createdAt: new Date(now.getTime() - 15 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [],
    },
    {
      id: `driver-ride-${userId}-3`,
      driverId: userId,
      driverName: 'You (Current Driver)',
      pickupLocation: {
        latitude: 19.0895,
        longitude: 72.8656,
        address: 'Worli Sea Face',
        city: 'Mumbai',
      },
      dropLocation: {
        latitude: 19.1136,
        longitude: 72.8697,
        address: 'NESCO Goregaon',
        city: 'Mumbai',
      },
      departureTime: new Date(now.getTime() + 6 * 60 * 60000).toISOString(),
      price: 180,
      availableSeats: 2,
      totalSeats: 5,
      carModel: 'Hyundai Creta Black',
      carColor: 'Black',
      description: 'Premium ride, new car, music system',
      createdAt: new Date(now.getTime() - 25 * 60000).toISOString(),
      status: 'active',
      bookedSeats: [
        {
          passengerId: 'passenger-test-3',
          passengerName: 'Neha Gupta',
          seatsBooked: 1,
          status: 'pending',
          bookedAt: new Date(now.getTime() - 8 * 60000).toISOString(),
        },
        {
          passengerId: 'passenger-test-4',
          passengerName: 'Raj Kumar',
          seatsBooked: 2,
          status: 'pending',
          bookedAt: new Date(now.getTime() - 3 * 60000).toISOString(),
        },
        {
          passengerId: 'passenger-test-5',
          passengerName: 'Vikram Patel',
          seatsBooked: 1,
          status: 'accepted',
          bookedAt: new Date(now.getTime() - 1 * 60000).toISOString(),
        },
      ],
    },
  ];
}

export function calculateCancellationPenalty(departureTime: string): number {
  const now = new Date();
  const departTime = new Date(departureTime);
  const minutesBefore = (departTime.getTime() - now.getTime()) / (1000 * 60);

  // If 20 minutes or less before departure, apply 50% penalty
  if (minutesBefore <= 20) {
    return 50;
  }

  // No penalty if more than 20 minutes before departure
  return 0;
}

export function getTimeUntilDeparture(departureTime: string): string {
  const now = new Date();
  const departTime = new Date(departureTime);
  const diff = departTime.getTime() - now.getTime();

  if (diff < 0) return 'Departed';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatDate(date: string): string {
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return d.toLocaleDateString('en-IN', options);
}

export function formatTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
