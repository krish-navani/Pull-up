// Seed Data for PullUp Admin Panel
// Matches exact Firestore database structure from the React Native app

const ATLAS_LOCATION = {
  latitude: 19.0707255,
  longitude: 72.8752988,
  address: 'Atlas SkillTech University, Mumbai',
  city: 'Mumbai'
};

const MUMBAI_LOCATIONS = [
  { latitude: 19.0760, longitude: 72.8777, address: 'CST Station, Mumbai', city: 'Mumbai' },
  { latitude: 19.0176, longitude: 72.8562, address: 'Dadar Station, Mumbai', city: 'Mumbai' },
  { latitude: 19.0590, longitude: 72.8381, address: 'Bandra West, Mumbai', city: 'Mumbai' },
  { latitude: 19.1197, longitude: 72.9051, address: 'Powai, Mumbai', city: 'Mumbai' },
  { latitude: 19.0886, longitude: 72.8656, address: 'Sion, Mumbai', city: 'Mumbai' },
  { latitude: 19.0330, longitude: 72.8411, address: 'Mahim, Mumbai', city: 'Mumbai' },
  { latitude: 19.1075, longitude: 72.8263, address: 'Juhu Beach, Mumbai', city: 'Mumbai' },
  { latitude: 19.1136, longitude: 72.8697, address: 'Andheri East, Mumbai', city: 'Mumbai' },
  { latitude: 19.0452, longitude: 72.8195, address: 'Pali Hill, Bandra, Mumbai', city: 'Mumbai' },
  { latitude: 19.1286, longitude: 72.9187, address: 'Hiranandani Gardens, Powai', city: 'Mumbai' },
  { latitude: 19.0955, longitude: 72.8422, address: 'Santacruz West, Mumbai', city: 'Mumbai' },
  { latitude: 19.0624, longitude: 72.8891, address: 'Chembur, Mumbai', city: 'Mumbai' },
  { latitude: 19.1388, longitude: 72.8354, address: 'Versova, Mumbai', city: 'Mumbai' },
  { latitude: 19.0728, longitude: 72.8826, address: 'Kurla West, Mumbai', city: 'Mumbai' },
  { latitude: 19.2183, longitude: 72.9781, address: 'Thane West', city: 'Thane' },
  { latitude: 19.1854, longitude: 72.9746, address: 'Mulund West, Mumbai', city: 'Mumbai' },
  { latitude: 19.2094, longitude: 72.8656, address: 'Borivali East, Mumbai', city: 'Mumbai' },
  { latitude: 19.0458, longitude: 72.8718, address: 'Wadala, Mumbai', city: 'Mumbai' },
];

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Arnav', 'Dhruv', 'Kabir', 'Ananya', 'Diya', 'Myra', 'Sara', 'Aadhya', 'Isha', 'Kiara', 'Riya', 'Priya', 'Neha'];
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Joshi', 'Desai', 'Mehta', 'Shah', 'Gupta', 'Verma', 'Nair', 'Iyer', 'Rao', 'Reddy', 'Malhotra', 'Kapoor', 'Thakur', 'Bhat', 'Pillai', 'Menon'];
const COURSES = ['BBA', 'BCA', 'B.Tech', 'MBA', 'B.Des', 'B.Sc IT', 'BMS', 'BA Film', 'B.Arch', 'M.Tech'];
const DIVISIONS = ['A', 'B', 'C', 'D'];
const YEARS = ['FY', 'SY', 'TY', 'Final'];
const CAR_MODELS = ['Maruti Swift', 'Hyundai i20', 'Honda City', 'Tata Nexon', 'Hyundai Creta', 'Maruti Baleno', 'Kia Seltos', 'Toyota Innova', 'Mahindra XUV300', 'Volkswagen Polo', 'Maruti Dzire', 'Hyundai Venue', 'Tata Altroz', 'Honda Amaze', 'Renault Kwid'];
const CAR_COLORS = ['White', 'Silver', 'Black', 'Red', 'Blue', 'Grey', 'Maroon', 'Brown', 'Beige', 'Green'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function generatePhone() { return '+91' + (7000000000 + Math.floor(Math.random() * 3000000000)); }

function generateUserId(index) { return 'seed_user_' + String(index).padStart(3, '0'); }

function futureTime(hoursFromNow) {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

function pastTime(hoursAgo) {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
}

function generateSeedData() {
  const users = [];
  const rides = [];
  const bookings = [];

  // Generate 20 users (10 drivers, 10 passengers)
  for (let i = 0; i < 20; i++) {
    const fn = FIRST_NAMES[i];
    const ln = randomFrom(LAST_NAMES);
    const isDriver = i < 10;
    const emailPrefix = fn.toLowerCase() + '.' + ln.toLowerCase();
    users.push({
      id: generateUserId(i),
      email: emailPrefix + '@atlasskilltech.university',
      fullName: fn + ' ' + ln,
      year: randomFrom(YEARS),
      course: randomFrom(COURSES),
      division: randomFrom(DIVISIONS),
      role: isDriver ? 'driver' : 'passenger',
      phone: generatePhone(),
      profileImage: null,
      licenseVerified: isDriver,
      profileComplete: true,
      createdAt: pastTime(randomInt(48, 720)),
      updatedAt: pastTime(randomInt(1, 48)),
      ...(isDriver ? {
        licenseImageUri: 'https://placehold.co/600x400/1e293b/0ea5e9?text=License+' + fn,
        licenseVerificationStatus: 'verified',
        licenseUploadedAt: pastTime(randomInt(48, 720)),
        licenseConfirmed: true,
      } : {})
    });
  }

  // Generate 18 rides
  const rideConfigs = [
    // 8 active rides (future departure)
    ...Array(8).fill(null).map((_, i) => ({ status: 'active', hoursOffset: randomInt(1, 48), driverIdx: i % 10 })),
    // 4 in_progress rides
    ...Array(4).fill(null).map((_, i) => ({ status: 'in_progress', hoursOffset: -randomInt(0, 1), driverIdx: (i + 3) % 10 })),
    // 4 completed rides  
    ...Array(4).fill(null).map((_, i) => ({ status: 'completed', hoursOffset: -randomInt(6, 72), driverIdx: (i + 5) % 10 })),
    // 2 cancelled rides
    ...Array(2).fill(null).map((_, i) => ({ status: 'cancelled', hoursOffset: -randomInt(2, 24), driverIdx: (i + 8) % 10 })),
  ];

  rideConfigs.forEach((cfg, i) => {
    const driver = users[cfg.driverIdx];
    const toAtlas = i % 2 === 0;
    const loc = MUMBAI_LOCATIONS[i % MUMBAI_LOCATIONS.length];
    const pickup = toAtlas ? loc : { ...ATLAS_LOCATION, city: 'Mumbai' };
    const drop = toAtlas ? { ...ATLAS_LOCATION, city: 'Mumbai' } : loc;
    const totalSeats = randomInt(2, 4);
    const bookedCount = cfg.status === 'active' ? randomInt(0, 2) : randomInt(1, Math.min(3, totalSeats));
    const availableSeats = Math.max(0, totalSeats - bookedCount);

    const bookedSeats = [];
    const rideId = 'seed_ride_' + String(i).padStart(3, '0');

    for (let b = 0; b < bookedCount; b++) {
      const passengerIdx = 10 + ((i + b) % 10);
      const passenger = users[passengerIdx];
      const bStatus = cfg.status === 'completed' ? 'accepted' : cfg.status === 'cancelled' ? 'cancelled' : (b === 0 ? 'accepted' : 'pending');
      bookedSeats.push({
        passengerId: passenger.id,
        passengerName: passenger.fullName,
        seatsBooked: 1,
        status: bStatus,
        bookedAt: pastTime(randomInt(1, 24)),
      });

      bookings.push({
        id: 'seed_booking_' + String(rides.length * 10 + b).padStart(3, '0'),
        rideId: rideId,
        passengerId: passenger.id,
        passengerName: passenger.fullName,
        passengerEmail: passenger.email,
        driverId: driver.id,
        seatsBooked: 1,
        pricePerSeat: randomInt(30, 80),
        totalPrice: randomInt(30, 80),
        status: bStatus,
        bookedAt: pastTime(randomInt(1, 24)),
        createdAt: pastTime(randomInt(1, 24)),
        updatedAt: pastTime(randomInt(0, 12)),
      });
    }

    const depTime = cfg.hoursOffset >= 0 ? futureTime(cfg.hoursOffset) : pastTime(-cfg.hoursOffset);

    rides.push({
      id: rideId,
      driverId: driver.id,
      driverName: driver.fullName,
      pickupLocation: pickup,
      dropLocation: drop,
      departureTime: depTime,
      price: randomInt(30, 100),
      availableSeats: availableSeats,
      totalSeats: totalSeats,
      carModel: CAR_MODELS[i % CAR_MODELS.length],
      carColor: CAR_COLORS[i % CAR_COLORS.length],
      description: toAtlas ? 'Heading to Atlas campus, can pick up on the way.' : 'Leaving Atlas, heading home. Join if on the route!',
      createdAt: pastTime(randomInt(1, 48)),
      status: cfg.status,
      bookedSeats: bookedSeats,
      ...(cfg.status === 'in_progress' ? { startedAt: pastTime(randomInt(0, 1)) } : {}),
      ...(cfg.status === 'completed' ? { startedAt: pastTime(-cfg.hoursOffset + 1), completedAt: pastTime(-cfg.hoursOffset) } : {}),
    });
  });

  return { users, rides, bookings };
}

// Expose globally
window.generateSeedData = generateSeedData;
