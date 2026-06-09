import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { sendNotification } from './notificationService';

export interface TaxiPool {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorImage?: string;
  creatorCourse: string;
  creatorDivision: string;
  destination: {
    address: string;
    latitude: number;
    longitude: number;
  };
  departureTime: string; // ISO String
  maxMembers: number;
  memberCount: number;
  notes?: string;
  status: 'OPEN' | 'FULL' | 'CLOSED' | 'CANCELLED';
  createdAt: any;
}

export interface PoolRequest {
  id: string;
  poolId: string;
  passengerId: string;
  passengerName: string;
  passengerImage?: string;
  passengerCourse: string;
  passengerDivision: string;
  status: 'requested' | 'accepted' | 'rejected' | 'payment_pending' | 'payment_completed';
  createdAt: any;
}

export interface PoolMember {
  id: string; // `${poolId}_${passengerId}`
  poolId: string;
  passengerId: string;
  passengerName: string;
  passengerImage?: string;
  passengerCourse: string;
  passengerDivision: string;
  joinedAt: string; // ISO String
}

/**
 * Create a new Taxi Pool
 */
export const createTaxiPool = async (
  poolData: Omit<TaxiPool, 'id' | 'memberCount' | 'status' | 'createdAt'>
): Promise<string> => {
  try {
    const poolsRef = collection(db, 'taxiPools');
    
    // 1. Add Taxi Pool document
    const docRef = await addDoc(poolsRef, {
      ...poolData,
      memberCount: 1, // Creator starts as the first member
      status: 'OPEN',
      createdAt: serverTimestamp()
    });

    const poolId = docRef.id;

    // 2. Add creator to poolMembers
    const memberRef = doc(db, 'poolMembers', `${poolId}_${poolData.creatorId}`);
    await setDoc(memberRef, {
      poolId,
      passengerId: poolData.creatorId,
      passengerName: poolData.creatorName,
      passengerImage: poolData.creatorImage || null,
      passengerCourse: poolData.creatorCourse,
      passengerDivision: poolData.creatorDivision,
      joinedAt: new Date().toISOString()
    });

    console.log('[TAXI POOL SERVICE] ✅ Created Taxi Pool with ID:', poolId);
    return poolId;
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error creating taxi pool:', error);
    throw error;
  }
};

/**
 * Subscribe to active taxi pools (OPEN or FULL) in real-time
 */
export const subscribeToActivePools = (
  onUpdate: (pools: TaxiPool[]) => void
): Unsubscribe => {
  const poolsRef = collection(db, 'taxiPools');
  
  // We want to fetch pools that are OPEN or FULL, sorted by departureTime
  const q = query(
    poolsRef, 
    where('status', 'in', ['OPEN', 'FULL']),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pools: TaxiPool[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        pools.push({
          id: doc.id,
          ...data,
          // Handle cases where timestamp isn't resolved yet
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
        } as TaxiPool);
      });
      console.log(`[TAXI POOL SERVICE] 🔄 Pools updated: ${pools.length} active pools`);
      onUpdate(pools);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to active pools:', error);
    }
  );
};

/**
 * Subscribe to a specific taxi pool in real-time
 */
export const subscribeToPoolDetails = (
  poolId: string,
  onUpdate: (pool: TaxiPool | null) => void
): Unsubscribe => {
  const poolRef = doc(db, 'taxiPools', poolId);

  return onSnapshot(
    poolRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
        } as TaxiPool);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to pool details:', error);
    }
  );
};

/**
 * Subscribe to requests for a specific pool (for creators)
 */
export const subscribeToPoolRequests = (
  poolId: string,
  onUpdate: (requests: PoolRequest[]) => void
): Unsubscribe => {
  const requestsRef = collection(db, 'poolRequests');
  const q = query(requestsRef, where('poolId', '==', poolId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const requests: PoolRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
        } as PoolRequest);
      });
      onUpdate(requests);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to pool requests:', error);
    }
  );
};

/**
 * Subscribe to requests made by a specific passenger
 */
export const subscribeToPassengerRequests = (
  passengerId: string,
  onUpdate: (requests: PoolRequest[]) => void
): Unsubscribe => {
  const requestsRef = collection(db, 'poolRequests');
  const q = query(requestsRef, where('passengerId', '==', passengerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const requests: PoolRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
        } as PoolRequest);
      });
      onUpdate(requests);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to passenger requests:', error);
    }
  );
};

/**
 * Subscribe to accepted members of a pool in real-time
 */
export const subscribeToPoolMembers = (
  poolId: string,
  onUpdate: (members: PoolMember[]) => void
): Unsubscribe => {
  const membersRef = collection(db, 'poolMembers');
  const q = query(membersRef, where('poolId', '==', poolId), orderBy('joinedAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const members: PoolMember[] = [];
      snapshot.forEach((doc) => {
        members.push({
          id: doc.id,
          ...doc.data()
        } as PoolMember);
      });
      onUpdate(members);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to pool members:', error);
    }
  );
};

/**
 * Create a join request for a taxi pool
 */
export const createJoinRequest = async (
  poolId: string,
  passenger: {
    id: string;
    fullName: string;
    profileImage?: string;
    course: string;
    division: string;
  },
  creatorId: string
): Promise<string> => {
  try {
    const requestsRef = collection(db, 'poolRequests');
    
    // Check if request already exists
    const q = query(
      requestsRef,
      where('poolId', '==', poolId),
      where('passengerId', '==', passenger.id)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingReq = snap.docs[0];
      const status = existingReq.data().status;
      if (status === 'requested') {
        throw new Error('Join request is already pending approval.');
      } else if (status === 'accepted') {
        throw new Error('You are already a member of this pool.');
      }
    }

    // Add new request
    const docRef = await addDoc(requestsRef, {
      poolId,
      passengerId: passenger.id,
      passengerName: passenger.fullName,
      passengerImage: passenger.profileImage || null,
      passengerCourse: passenger.course,
      passengerDivision: passenger.division,
      status: 'requested',
      createdAt: serverTimestamp()
    });

    console.log('[TAXI POOL SERVICE] ✅ Created Join Request:', docRef.id);

    // Send notification to pool creator (reuse standard booking_request or similar notification type)
    // We can pass the poolId as the rideId parameter
    try {
      await sendNotification(
        creatorId,
        'booking_request',
        'New Pool Request',
        `${passenger.fullName} requested to join your Taxi Pool`,
        poolId,
        docRef.id,
        passenger.id,
        passenger.fullName
      );
    } catch (notifErr) {
      console.warn('[TAXI POOL SERVICE] Notification dispatch failed:', notifErr);
    }

    return docRef.id;
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error requesting to join pool:', error);
    throw error;
  }
};

/**
 * Accept a passenger request (transactions ensure atomic count increment)
 */
export const acceptJoinRequest = async (
  requestId: string,
  poolId: string,
  passenger: {
    id: string;
    fullName: string;
    profileImage?: string;
    course: string;
    division: string;
  }
): Promise<void> => {
  const requestRef = doc(db, 'poolRequests', requestId);
  const poolRef = doc(db, 'taxiPools', poolId);
  const memberRef = doc(db, 'poolMembers', `${poolId}_${passenger.id}`);

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Get Pool Details
      const poolSnap = await transaction.get(poolRef);
      if (!poolSnap.exists()) {
        throw new Error('Pool not found');
      }

      const poolData = poolSnap.data() as TaxiPool;

      if (poolData.status !== 'OPEN') {
        throw new Error(`This pool is currently ${poolData.status} and cannot accept members.`);
      }
      if (poolData.memberCount >= poolData.maxMembers) {
        throw new Error('This pool has reached its maximum member capacity.');
      }

      // 2. Write Member
      transaction.set(memberRef, {
        poolId,
        passengerId: passenger.id,
        passengerName: passenger.fullName,
        passengerImage: passenger.profileImage || null,
        passengerCourse: passenger.course,
        passengerDivision: passenger.division,
        joinedAt: new Date().toISOString()
      });

      // 3. Update Request Status
      transaction.update(requestRef, { status: 'accepted' });

      // 4. Update Pool Member Count and Status if Full
      const newCount = poolData.memberCount + 1;
      const newStatus = newCount >= poolData.maxMembers ? 'FULL' : 'OPEN';
      
      transaction.update(poolRef, {
        memberCount: newCount,
        status: newStatus
      });
    });

    console.log('[TAXI POOL SERVICE] ✅ Request accepted successfully');

    // Notify passenger
    try {
      await sendNotification(
        passenger.id,
        'booking_accepted',
        'Pool Request Approved',
        `You have been accepted into the Taxi Pool!`,
        poolId,
        requestId
      );
    } catch (notifErr) {
      console.warn('[TAXI POOL SERVICE] Notification dispatch failed:', notifErr);
    }
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error accepting join request:', error);
    throw error;
  }
};

/**
 * Reject a join request
 */
export const rejectJoinRequest = async (
  requestId: string,
  passengerId: string,
  poolId: string
): Promise<void> => {
  try {
    const requestRef = doc(db, 'poolRequests', requestId);
    await updateDoc(requestRef, { status: 'rejected' });

    console.log('[TAXI POOL SERVICE] ✅ Request rejected');

    // Notify passenger
    try {
      await sendNotification(
        passengerId,
        'booking_rejected',
        'Pool Request Declined',
        `Your request to join the Taxi Pool was declined.`,
        poolId,
        requestId
      );
    } catch (notifErr) {
      console.warn('[TAXI POOL SERVICE] Notification dispatch failed:', notifErr);
    }
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error rejecting join request:', error);
    throw error;
  }
};

/**
 * Cancel Taxi Pool (Creator administrative cancel)
 */
export const cancelTaxiPool = async (
  poolId: string,
  creatorId: string
): Promise<void> => {
  try {
    const poolRef = doc(db, 'taxiPools', poolId);
    
    // Get members list to notify them
    const membersRef = collection(db, 'poolMembers');
    const qMembers = query(membersRef, where('poolId', '==', poolId));
    const membersSnap = await getDocs(qMembers);

    const requestsRef = collection(db, 'poolRequests');
    const qRequests = query(requestsRef, where('poolId', '==', poolId));
    const requestsSnap = await getDocs(qRequests);

    const batch = writeBatch(db);

    // 1. Update Pool Status to CANCELLED
    batch.update(poolRef, { status: 'CANCELLED' });

    // 2. Reject all pending requests
    requestsSnap.forEach((doc) => {
      if (doc.data().status === 'requested') {
        batch.update(doc.ref, { status: 'rejected' });
      }
    });

    await batch.commit();
    console.log('[TAXI POOL SERVICE] ✅ Taxi Pool Cancelled:', poolId);

    // 3. Notify all accepted members (excluding the creator)
    membersSnap.forEach(async (memberDoc) => {
      const memberData = memberDoc.data();
      if (memberData.passengerId !== creatorId) {
        try {
          await sendNotification(
            memberData.passengerId,
            'ride_cancelled',
            'Taxi Pool Cancelled',
            `The Taxi Pool creator cancelled the pool.`,
            poolId
          );
        } catch (notifErr) {
          console.warn('[TAXI POOL SERVICE] Notification dispatch failed:', notifErr);
        }
      }
    });
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error cancelling taxi pool:', error);
    throw error;
  }
};
