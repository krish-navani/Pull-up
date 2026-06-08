/**
 * Database Manager for PullUp Admin Panel
 * Handles Firebase operations: flush and seed database
 */

// Global Firebase references
let g_db = null;
let g_auth = null;

// Wait for Firebase to be initialized
function initializeDBManager() {
  console.log('🔄 dbManager: Checking Firebase...');
  
  // Wait for Firebase to be available
  const checkFirebase = setInterval(() => {
    try {
      if (firebase && firebase.firestore && firebase.auth) {
        g_db = firebase.firestore();
        g_auth = firebase.auth();
        clearInterval(checkFirebase);
        console.log('✅ dbManager: Firebase ready, current user:', g_auth.currentUser?.uid);
        setupDatabaseFunctions();
      }
    } catch (e) {
      console.log('⏳ dbManager: Waiting for Firebase...', e.message);
    }
  }, 100);
}

function setupDatabaseFunctions() {
  console.log('🔧 dbManager: Setting up database functions for user:', g_auth.currentUser?.uid);
  
  // ============================================
  // FLUSH DATABASE - Delete all data
  // ============================================
  window.flushDatabase = async function() {
    console.log('🗑️ Flush Database clicked, auth:', g_auth.currentUser?.uid);
    
    if (!confirm('⚠️ WARNING: This will DELETE ALL data from the database!\n\nAre you sure? This cannot be undone.')) {
      return;
    }

    const collections = ['users', 'rides', 'bookings', 'messages', 'chats', 'notifications'];
    let totalDeleted = 0;

    try {
      // Ensure user is authenticated
      const currentUser = g_auth.currentUser;
      if (!currentUser) {
        console.error('❌ Not authenticated. Current user:', currentUser);
        alert('❌ Not authenticated. Please refresh the page.');
        return;
      }

      console.log('✅ User authenticated as:', currentUser.uid);

      for (const collectionName of collections) {
        console.log(`Deleting from ${collectionName}...`);
        try {
          const docs = await g_db.collection(collectionName).get();
          console.log(`  Found ${docs.size} documents in ${collectionName}`);
          
          if (docs.size === 0) continue;
          
          const batch = g_db.batch();
          let count = 0;

          docs.forEach((doc) => {
            batch.delete(doc.ref);
            count++;
          });

          await batch.commit();
          totalDeleted += count;
          console.log(`✅ Deleted ${count} documents from '${collectionName}'`);
        } catch (collectionError) {
          console.log(`⚠️ Skipping ${collectionName}: ${collectionError.message}`);
        }
      }

      console.log(`✅ Database flushed! Total documents deleted: ${totalDeleted}`);
      alert(`✅ Database flushed successfully!\n\nTotal documents deleted: ${totalDeleted}`);
    } catch (error) {
      console.error('❌ Error flushing database:', error);
      alert(`❌ Error flushing database:\n${error.message}`);
    }
  };

  // ============================================
  // SEED DATABASE - Add dummy data
  // ============================================

  // Seed data configuration
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
    // Locations outside Mumbai (30-40 km)
    { latitude: 19.2183, longitude: 72.9781, address: 'Thane West, Thane', city: 'Thane' },
    { latitude: 19.4738, longitude: 72.7905, address: 'Virar, Palghar', city: 'Virar' },
    { latitude: 19.3031, longitude: 72.7922, address: 'Bhayandar, Thane', city: 'Bhayandar' },
    { latitude: 19.5064, longitude: 72.9517, address: 'Kalyan, Thane', city: 'Kalyan' },
    { latitude: 19.1897, longitude: 72.6355, address: 'Navi Mumbai, Kharghar', city: 'Navi Mumbai' },
    { latitude: 19.4344, longitude: 73.1305, address: 'Murbad, Thane', city: 'Murbad' },
    { latitude: 18.9891, longitude: 72.8256, address: 'Panvel, Raigad', city: 'Panvel' },
  ];

  const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Arnav', 'Dhruv', 'Kabir', 'Ananya', 'Diya', 'Myra', 'Sara', 'Aadhya'];
  const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Joshi', 'Desai', 'Mehta', 'Shah', 'Gupta', 'Verma'];
  const COURSES = ['BBA', 'BCA', 'B.Tech', 'MBA', 'B.Des', 'B.Sc IT', 'BMS'];
  const DIVISIONS = ['A', 'B', 'C', 'D'];
  const YEARS = ['FY', 'SY', 'TY', 'Final'];
  const CAR_MODELS = ['Maruti Swift', 'Hyundai i20', 'Honda City', 'Tata Nexon', 'Hyundai Creta', 'Maruti Baleno', 'Kia Seltos', 'Toyota Innova'];
  const CAR_COLORS = ['White', 'Silver', 'Black', 'Red', 'Blue', 'Grey', 'Maroon', 'Brown'];

  // Helper functions
  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generatePhone() {
    return '+91' + (7000000000 + Math.floor(Math.random() * 3000000000));
  }

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

  window.seedDatabase = async function() {
    console.log('🌱 Seed Database clicked, auth:', g_auth.currentUser?.uid);
    
    if (!confirm('This will seed the database with 18 dummy rides and 15 users.\n\nProceed?')) {
      return;
    }

    try {
      // Ensure user is authenticated
      const currentUser = g_auth.currentUser;
      if (!currentUser) {
        console.error('❌ Not authenticated. Current user:', currentUser);
        alert('❌ Not authenticated. Please refresh the page.');
        return;
      }

      console.log('✅ User authenticated as:', currentUser.uid);

      // Create progress indicator
      const progressEl = document.getElementById('seedProgress');
      if (progressEl) {
        progressEl.style.display = 'block';
        progressEl.innerHTML = '<p style="color: #60a5fa;">🔄 Generating seed data...</p>';
      }

      // Generate users (15 users: 8 drivers + 7 passengers)
      const users = [];
      for (let i = 0; i < 15; i++) {
        const fn = FIRST_NAMES[i % FIRST_NAMES.length];
        const ln = randomFrom(LAST_NAMES);
        const isDriver = i < 8;
        const emailPrefix = fn.toLowerCase() + '.' + ln.toLowerCase();
        
        users.push({
          id: 'seed_user_' + String(i).padStart(3, '0'),
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
          createdAt: pastTime(randomInt(1, 7 * 24)), // Created 1-7 days ago
          updatedAt: pastTime(randomInt(0, 24)), // Updated 0-24 hours ago
          ...(isDriver ? {
            licenseImageUri: 'https://placehold.co/600x400/1e293b/0ea5e9?text=License+' + fn,
            licenseVerificationStatus: 'verified',
            licenseUploadedAt: pastTime(randomInt(1, 7 * 24)), // Uploaded 1-7 days ago
            licenseConfirmed: true,
          } : {})
        });
      }

      // Save users
      if (progressEl) {
        progressEl.innerHTML += '<p style="color: #60a5fa;">👥 Saving users...</p>';
      }
      
      for (const user of users) {
        await g_db.collection('users').doc(user.id).set(user);
      }
      console.log(`✅ Created ${users.length} users`);

      // Generate 18 rides
      const rides = [];
      const rideConfigs = [
        // 8 active rides (departure 0-5 hours from now, today only)
        ...Array(8).fill(null).map((_, i) => ({ status: 'active', hoursOffset: randomInt(0, 5), driverIdx: i % 8 })),
        // 5 in_progress rides (started 0-5 hours ago, today only)
        ...Array(5).fill(null).map((_, i) => ({ status: 'in_progress', hoursOffset: -randomInt(0, 5), driverIdx: (i + 2) % 8 })),
        // 4 completed rides (completed 0-5 hours ago, today only)
        ...Array(4).fill(null).map((_, i) => ({ status: 'completed', hoursOffset: -randomInt(0, 5), driverIdx: (i + 4) % 8 })),
        // 1 cancelled ride (cancelled 0-5 hours ago, today only)
        { status: 'cancelled', hoursOffset: -randomInt(0, 5), driverIdx: 7 },
      ];

      if (progressEl) {
        progressEl.innerHTML += '<p style="color: #60a5fa;">🚗 Generating rides...</p>';
      }

      for (let i = 0; i < rideConfigs.length; i++) {
        const cfg = rideConfigs[i];
        const driver = users[cfg.driverIdx];
        // Ensure both pickup and drop use actual locations from MUMBAI_LOCATIONS
        const pickupIdx = i % MUMBAI_LOCATIONS.length;
        const dropIdx = (i + Math.floor(MUMBAI_LOCATIONS.length / 2)) % MUMBAI_LOCATIONS.length;
        const pickup = MUMBAI_LOCATIONS[pickupIdx];
        const drop = MUMBAI_LOCATIONS[dropIdx];
        const totalSeats = randomInt(2, 4);
        const bookedCount = cfg.status === 'active' ? randomInt(0, 2) : randomInt(1, Math.min(3, totalSeats));
        const availableSeats = Math.max(0, totalSeats - bookedCount);

        const bookedSeats = [];

        for (let b = 0; b < bookedCount; b++) {
          const passengerIdx = 8 + ((i + b) % 7);
          const passenger = users[passengerIdx];
          const bStatus = cfg.status === 'completed' ? 'accepted' : cfg.status === 'cancelled' ? 'cancelled' : (b === 0 ? 'accepted' : 'pending');
          
          bookedSeats.push({
            passengerId: passenger.id,
            passengerName: passenger.fullName,
            seatsBooked: 1,
            status: bStatus,
            bookedAt: pastTime(randomInt(0, 5)), // Booked within last 5 hours, today only
          });
        }

        const depTime = cfg.hoursOffset >= 0 ? futureTime(cfg.hoursOffset) : pastTime(-cfg.hoursOffset);

        const ride = {
          driverId: driver.id,
          driverName: driver.fullName,
          pickupLocation: pickup,
          dropLocation: drop,
          departureTime: depTime,
          price: randomInt(30, 100),
          availableSeats: availableSeats,
          totalSeats: totalSeats,
          carModel: randomFrom(CAR_MODELS),
          carColor: randomFrom(CAR_COLORS),
          description: 'Ride from ' + pickup.address + ' to ' + drop.address,
          createdAt: pastTime(randomInt(0, 5)),
          status: cfg.status,
          bookedSeats: bookedSeats,
          ...(cfg.status === 'in_progress' ? { startedAt: pastTime(randomInt(0, 5)) } : {}),
          ...(cfg.status === 'completed' ? { 
            startedAt: pastTime(randomInt(1, 5)), 
            completedAt: pastTime(randomInt(0, 4)) 
          } : {}),
        };

        rides.push(ride);
      }

      // Save rides
      if (progressEl) {
        progressEl.innerHTML += '<p style="color: #60a5fa;">💾 Saving rides...</p>';
      }

      for (const ride of rides) {
        await g_db.collection('rides').add(ride);
      }
      console.log(`✅ Created ${rides.length} rides`);

      if (progressEl) {
        progressEl.innerHTML = `
          <p style="color: #22c55e; font-weight: bold;">✅ Database seeded successfully!</p>
          <p style="color: #94a3b8;">📊 Summary:</p>
          <ul style="color: #cbd5e1; margin-left: 20px;">
            <li>✓ ${users.length} users created (8 drivers + 7 passengers)</li>
            <li>✓ ${rides.length} rides created</li>
            <li>✓ Ride statuses: 8 Active, 5 In Progress, 4 Completed, 1 Cancelled</li>
            <li>✓ Multiple bookings with various statuses</li>
            <li>✓ Realistic locations across Mumbai & Thane</li>
          </ul>
        `;
      }

      alert(`✅ Database seeded successfully!\n\nCreated:\n• ${users.length} users (8 drivers + 7 passengers)\n• ${rides.length} rides`);
      console.log('✅ Seed complete:', { usersCount: users.length, ridesCount: rides.length });
    } catch (error) {
      console.error('❌ Error seeding database:', error);
      const progressEl = document.getElementById('seedProgress');
      if (progressEl) {
        progressEl.innerHTML = `<p style="color: #ef4444;">❌ Error: ${error.message}</p>`;
      }
      alert(`❌ Error seeding database:\n${error.message}`);
    }
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDBManager);
} else {
  initializeDBManager();
}
