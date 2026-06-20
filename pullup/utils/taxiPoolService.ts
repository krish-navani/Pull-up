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
import {
  initializeGroupChat,
  addParticipantToGroupChat,
  removeParticipantFromGroupChat
} from './rideGroupChatService';

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
  status: 'OPEN' | 'FULL' | 'CLOSED' | 'CANCELLED' | 'in_progress' | 'completed';
  createdAt: any;
  currentLocation?: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  };
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

    // Strip undefined values — Firestore rejects them (e.g. creatorImage: undefined)
    const sanitize = (obj: Record<string, any>): Record<string, any> => {
      return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
      );
    };

    // Sanitize destination sub-object too
    const sanitizedData = {
      ...sanitize(poolData as Record<string, any>),
      destination: sanitize(poolData.destination as Record<string, any>),
      // Ensure optional fields use null instead of undefined
      creatorImage: poolData.creatorImage ?? null,
      notes: (poolData as any).notes ?? null,
      price: (poolData as any).price ?? 40,
    };

    // 1. Add Taxi Pool document
    const docRef = await addDoc(poolsRef, {
      ...sanitizedData,
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
      passengerImage: poolData.creatorImage ?? null,
      passengerCourse: poolData.creatorCourse,
      passengerDivision: poolData.creatorDivision,
      joinedAt: new Date().toISOString()
    });

    // 3. Initialize group chat for the pool
    try {
      await initializeGroupChat(poolId, 'taxipool', poolData.creatorId, poolData.creatorName, poolData.creatorImage ?? undefined);
    } catch (chatErr) {
      console.warn('[TAXI POOL SERVICE] Failed to initialize group chat:', chatErr);
    }

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

  // NOTE: Only filtering by status (single field) to avoid composite index requirements.
  // Sorting by createdAt is done client-side below.
  const q = query(
    poolsRef,
    where('status', 'in', ['OPEN', 'FULL'])
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

      // Sort by createdAt descending (most recent first) client-side
      pools.sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
  // NOTE: Single field filter only — composite index not available. Sort client-side.
  const q = query(requestsRef, where('poolId', '==', poolId));

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
      // Sort by createdAt descending client-side
      requests.sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
  // NOTE: Single field filter only — composite index not available. Sort client-side.
  const q = query(membersRef, where('poolId', '==', poolId));

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
      // Sort by joinedAt ascending client-side
      members.sort((a, b) => {
        if (!a.joinedAt) return 1;
        if (!b.joinedAt) return -1;
        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      });
      onUpdate(members);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to pool members:', error);
    }
  );
};

/**
 * Subscribe to taxi pools created by a specific user (for creator dashboard)
 */
export const subscribeToCreatorPools = (
  creatorId: string,
  onUpdate: (pools: TaxiPool[]) => void
): Unsubscribe => {
  const poolsRef = collection(db, 'taxiPools');
  const q = query(poolsRef, where('creatorId', '==', creatorId));

  return onSnapshot(
    q,
    (snapshot) => {
      const pools: TaxiPool[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        pools.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
        } as TaxiPool);
      });
      // Sort newest first
      pools.sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      console.log(`[TAXI POOL SERVICE] 🔄 Creator pools updated: ${pools.length}`);
      onUpdate(pools);
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to creator pools:', error);
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
        passenger.fullName,
        '/taxi-pool-details'
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

    // Add passenger to group chat participants list
    try {
      await addParticipantToGroupChat(poolId, passenger.id, passenger.fullName);
    } catch (chatErr) {
      console.warn('[TAXI POOL SERVICE] Failed to add passenger to group chat:', chatErr);
    }

    // Notify passenger
    try {
      await sendNotification(
        passenger.id,
        'booking_accepted',
        'Pool Request Approved',
        `You have been accepted into the Taxi Pool!`,
        poolId,
        requestId,
        undefined,
        undefined,
        '/taxi-pool-details'
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
        requestId,
        undefined,
        undefined,
        '/taxi-pool-details'
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
            poolId,
            undefined,
            undefined,
            undefined,
            '/taxi-pool-details'
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

/**
 * Subscribe to taxi pools where the user is a passenger/member in real-time
 */
export const subscribeToMemberPools = (
  passengerId: string,
  onUpdate: (pools: TaxiPool[]) => void
): Unsubscribe => {
  const membersRef = collection(db, 'poolMembers');
  const q = query(membersRef, where('passengerId', '==', passengerId));

  return onSnapshot(
    q,
    async (snapshot) => {
      const poolIds: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        poolIds.push(data.poolId);
      });

      if (poolIds.length === 0) {
        onUpdate([]);
        return;
      }

      try {
        const poolsRef = collection(db, 'taxiPools');
        const qPools = query(poolsRef, where('__name__', 'in', poolIds.slice(0, 30)));
        const poolsSnap = await getDocs(qPools);
        const pools: TaxiPool[] = [];
        poolsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter out pools created by the user (since they will be in the Hosting tab)
          if (data.creatorId !== passengerId) {
            pools.push({
              id: docSnap.id,
              ...data,
              createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
            } as TaxiPool);
          }
        });
        
        // Sort newest first
        pools.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        onUpdate(pools);
      } catch (err) {
        console.error('[TAXI POOL SERVICE] Error fetching member pools details:', err);
      }
    },
    (error) => {
      console.error('[TAXI POOL SERVICE] Error subscribing to member pools:', error);
    }
  );
};

/**
 * Leave a Taxi Pool (Passenger-initiated leave)
 */
export const leaveTaxiPool = async (
  poolId: string,
  passengerId: string,
  passengerName: string
): Promise<void> => {
  const poolRef = doc(db, 'taxiPools', poolId);
  const memberRef = doc(db, 'poolMembers', `${poolId}_${passengerId}`);
  
  // Find request document for this passenger in this pool
  const requestsRef = collection(db, 'poolRequests');
  const q = query(requestsRef, where('poolId', '==', poolId), where('passengerId', '==', passengerId));
  
  try {
    const querySnap = await getDocs(q);
    
    await runTransaction(db, async (transaction) => {
      // 1. Get Pool details
      const poolSnap = await transaction.get(poolRef);
      if (!poolSnap.exists()) {
        throw new Error('Pool not found');
      }
      
      const poolData = poolSnap.data() as TaxiPool;
      
      // 2. Delete member document
      transaction.delete(memberRef);
      
      // 3. Update Request status to rejected/cancelled
      querySnap.forEach((d) => {
        transaction.update(d.ref, { status: 'rejected' });
      });
      
      // 4. Update member count and open status
      const newCount = Math.max(1, poolData.memberCount - 1);
      transaction.update(poolRef, {
        memberCount: newCount,
        status: 'OPEN' // Always make it OPEN since count went down
      });
    });
    
    // 5. Remove from group chat
    try {
      await removeParticipantFromGroupChat(poolId, passengerId, passengerName);
    } catch (chatErr) {
      console.warn('[TAXI POOL SERVICE] Chat leave failed:', chatErr);
    }
    
    console.log('[TAXI POOL SERVICE] ✅ Member left taxi pool successfully');
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error leaving taxi pool:', error);
    throw error;
  }
};

/**
 * Update Taxi Pool Status
 */
export const updateTaxiPoolStatus = async (
  poolId: string,
  status: 'OPEN' | 'FULL' | 'CLOSED' | 'CANCELLED' | 'in_progress' | 'completed'
): Promise<void> => {
  try {
    const poolRef = doc(db, 'taxiPools', poolId);
    await updateDoc(poolRef, { status });
    console.log('[TAXI POOL SERVICE] ✅ Updated pool status to:', status);
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error updating pool status:', error);
    throw error;
  }
};

/**
 * Start Taxi Pool Ride
 */
export const startTaxiPoolRide = async (poolId: string): Promise<void> => {
  try {
    const poolRef = doc(db, 'taxiPools', poolId);
    await updateDoc(poolRef, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });
    console.log('[TAXI POOL SERVICE] ✅ Taxi pool started');
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error starting taxi pool ride:', error);
    throw error;
  }
};

/**
 * Complete Taxi Pool Ride
 */
export const completeTaxiPoolRide = async (poolId: string): Promise<void> => {
  try {
    const poolRef = doc(db, 'taxiPools', poolId);
    await updateDoc(poolRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    console.log('[TAXI POOL SERVICE] ✅ Taxi pool completed');
  } catch (error) {
    console.error('[TAXI POOL SERVICE] Error completing taxi pool ride:', error);
    throw error;
  }
};


