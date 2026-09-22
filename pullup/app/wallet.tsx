import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';

import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { db } from '@/utils/firebase';
import apiClient from '@/utils/backendApiClient';

interface RouteTransfer {
  id: string;
  transferId?: string;
  paymentId?: string;
  bookingId?: string;
  rideId?: string;
  grossAmountPaise?: number;
  platformFeePaise?: number;
  driverSharePaise?: number;
  status: 'processed' | 'pending_ride_completion' | 'pending_driver_onboarding' | 'failed' | 'reversed' | 'pending';
  createdAt?: any;
}

export default function WalletScreen() {
  const router = useRouter();
  const { auth } = useAppContext();

  // Razorpay Route Account state
  const [razorpayAccountId, setRazorpayAccountId] = useState<string>('');
  const [razorpayAccountStatus, setRazorpayAccountStatus] = useState<string>('unlinked');
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);
  const [savingAccount, setSavingAccount] = useState<boolean>(false);
  const [inputAccountId, setInputAccountId] = useState<string>('');

  // Transfer history
  const [transfers, setTransfers] = useState<RouteTransfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState<boolean>(true);

  // Total Lifetime Earnings from transfers
  const [totalLifetimeEarnings, setTotalLifetimeEarnings] = useState<number>(0);

  useEffect(() => {
    if (!auth.user) return;

    // 1. Fetch Razorpay Route Account Status
    const fetchAccountStatus = async () => {
      try {
        setLoadingAccount(true);
        const res = await apiClient.get('/driver/payout-account');
        if (res.data?.success) {
          setRazorpayAccountId(res.data.razorpayAccountId || '');
          setRazorpayAccountStatus(res.data.razorpayAccountStatus || 'unlinked');
          if (res.data.razorpayAccountId) {
            setInputAccountId(res.data.razorpayAccountId);
          }
        }
      } catch (err) {
        console.warn('[PAYOUT ACCOUNT] Failed to fetch account status:', err);
      } finally {
        setLoadingAccount(false);
      }
    };
    fetchAccountStatus();

    // 2. Listen to driver's user document for live Account updates
    const userRef = doc(db, 'users', auth.user.id);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.razorpayAccountId) {
          setRazorpayAccountId(data.razorpayAccountId);
          setRazorpayAccountStatus(data.razorpayAccountStatus || 'active');
        }
      }
    });

    // 3. Listen to driver's transfers collection in Firestore
    const transfersQuery = query(
      collection(db, 'transfers'),
      where('driverId', '==', auth.user.id),
      orderBy('createdAt', 'desc')
    );

    const unsubTransfers = onSnapshot(
      transfersQuery,
      (snap) => {
        const list: RouteTransfer[] = [];
        let totalEarningsPaise = 0;
        snap.forEach((docSnap) => {
          const t = { id: docSnap.id, ...docSnap.data() } as RouteTransfer;
          list.push(t);
          if (t.status === 'processed' && t.driverSharePaise) {
            totalEarningsPaise += t.driverSharePaise;
          }
        });
        setTransfers(list);
        setTotalLifetimeEarnings(totalEarningsPaise / 100);
        setLoadingTransfers(false);
      },
      (error) => {
        console.error('[TRANSFERS LISTEN ERROR]:', error.message);
        setLoadingTransfers(false);
      }
    );

    return () => {
      unsubUser();
      unsubTransfers();
    };
  }, [auth.user]);

  // Handle Linking or Creating Razorpay Route Account
  const handleSavePayoutAccount = async () => {
    if (!auth.user) return;
    setSavingAccount(true);
    try {
      const res = await apiClient.post('/driver/payout-account', {
        accountId: inputAccountId.trim() || undefined,
        name: auth.user.fullName,
        email: auth.user.email,
        phone: auth.user.phone,
      });

      if (res.data?.success) {
        setRazorpayAccountId(res.data.accountId);
        setRazorpayAccountStatus(res.data.status || 'active');
        Alert.alert(
          'Razorpay Account Configured 💳',
          `Your driver payout account (${res.data.accountId}) is linked. Earnings are transferred directly by Razorpay Route.`
        );
      } else {
        throw new Error(res.data?.message || 'Failed to setup payout account');
      }
    } catch (err: any) {
      Alert.alert('Setup Failed', err.message || 'Could not configure Razorpay payout account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleReconcilePayouts = async () => {
    if (!auth.user) return;
    try {
      setLoadingTransfers(true);
      const res = await apiClient.post('/driver/reconcile-payouts');
      if (res.data?.success) {
        Alert.alert('Reconciliation Complete 🔄', res.data.message || 'Driver payouts reconciled successfully.');
      } else {
        throw new Error(res.data?.message || 'Failed to reconcile payouts');
      }
    } catch (err: any) {
      Alert.alert('Reconciliation Error', err.message || 'Could not reconcile driver payouts');
    } finally {
      setLoadingTransfers(false);
    }
  };

  const renderTransferItem = ({ item }: { item: RouteTransfer }) => {
    const driverShare = (item.driverSharePaise || 0) / 100;
    const gross = (item.grossAmountPaise || 0) / 100;
    const platformFee = (item.platformFeePaise || 0) / 100;

    let statusColor = '#EAA315';
    let statusLabel = 'Pending Setup';
    let iconName: any = 'clock-outline';

    if (item.status === 'processed') {
      statusColor = '#10B981';
      statusLabel = 'Transferred to Bank';
      iconName = 'check-circle-outline';
    } else if (item.status === 'pending_ride_completion') {
      statusColor = '#3B82F6';
      statusLabel = 'Held in Escrow (Active Ride)';
      iconName = 'shield-clock-outline';
    } else if (item.status === 'failed') {
      statusColor = '#EF4444';
      statusLabel = 'Payout Pending Route Activation';
      iconName = 'alert-circle-outline';
    } else if (item.status === 'reversed') {
      statusColor = '#F59E0B';
      statusLabel = 'Reversed (Cancelled)';
      iconName = 'undo-variant';
    } else if (item.status === 'pending_driver_onboarding') {
      statusColor = '#8B5CF6';
      statusLabel = 'Awaiting Account Setup';
      iconName = 'account-clock-outline';
    }

    return (
      <View style={styles.txCard}>
        <View style={styles.txHeader}>
          <View style={styles.txTypeContainer}>
            <MaterialCommunityIcons name={iconName} size={22} color={statusColor} />
            <Text style={styles.txTitle}>Ride Payout</Text>
          </View>
          <Text style={styles.txAmount}>+₹{driverShare.toFixed(2)}</Text>
        </View>

        <View style={styles.txDetailsRow}>
          <Text style={styles.txDetailText}>Gross Fare: ₹{gross.toFixed(2)}</Text>
          <Text style={styles.txDetailText}>Fee: -₹{platformFee.toFixed(2)}</Text>
        </View>

        <View style={styles.txFooter}>
          <Text style={[styles.txStatus, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={styles.txDate}>
            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5F7" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Payouts & Earnings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Earnings Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <MaterialCommunityIcons name="shield-check" size={24} color="#FFFFFF" />
            <Text style={styles.balanceCardTag}>Direct Razorpay Route</Text>
          </View>
          <Text style={styles.balanceLabel}>Lifetime Direct Earnings</Text>
          <Text style={styles.balanceAmount}>₹{totalLifetimeEarnings.toFixed(2)}</Text>
          <Text style={styles.balanceSubtext}>
            No internal balances held. Rider payments are transferred directly to your bank account.
          </Text>
        </View>

        {/* Razorpay Linked Account Card */}
        <View style={styles.accountCard}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="bank-transfer" size={24} color={WARM_CORE.primary} />
            <Text style={styles.cardTitle}>Razorpay Payout Account</Text>
          </View>

          {loadingAccount ? (
            <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginVertical: 12 }} />
          ) : razorpayAccountId ? (
            <View style={styles.linkedInfoBox}>
              <View style={styles.statusBadge}>
                <MaterialCommunityIcons name="check-decagram" size={18} color="#10B981" />
                <Text style={styles.statusBadgeText}>Linked & Active</Text>
              </View>
              <Text style={styles.accountIdLabel}>Account ID:</Text>
              <Text style={styles.accountIdValue}>{razorpayAccountId}</Text>
            </View>
          ) : (
            <View style={styles.setupBox}>
              <Text style={styles.setupDesc}>
                Set up your Razorpay Linked Account to receive automated ride payout transfers directly to your bank.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Razorpay Account ID (e.g. acc_XXXXX) or leave blank to auto-create"
                value={inputAccountId}
                onChangeText={setInputAccountId}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.saveButton, savingAccount && { opacity: 0.7 }]}
                onPress={handleSavePayoutAccount}
                disabled={savingAccount}
              >
                {savingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Configure Payout Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Transfer History Section */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Payout Transfer History</Text>

          {loadingTransfers ? (
            <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginTop: 20 }} />
          ) : transfers.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="history" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No payout transfers recorded yet.</Text>
            </View>
          ) : (
            <FlatList
              data={transfers}
              keyExtractor={(item) => item.id}
              renderItem={renderTransferItem}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  contentContainer: {
    padding: 16,
  },
  balanceCard: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  balanceCardTag: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 4,
  },
  balanceSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  linkedInfoBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusBadgeText: {
    color: '#047857',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  accountIdLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  accountIdValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  setupBox: {
    marginTop: 4,
  },
  setupDesc: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  historySection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 8,
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  txTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 6,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  txDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txDetailText: {
    fontSize: 12,
    color: '#6B7280',
  },
  txFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  txStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  txDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
