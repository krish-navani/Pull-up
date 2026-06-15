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
import { doc, onSnapshot, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';

import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { db, auth as firebaseAuth } from '@/utils/firebase';
import apiClient from '@/utils/backendApiClient';

interface Transaction {
  id: string;
  amount: number;
  type: 'ride_earning' | 'withdrawal' | 'refund' | 'adjustment';
  status: 'pending' | 'completed' | 'failed';
  referenceType: 'ride' | 'withdrawal' | 'booking';
  referenceId: string;
  createdAt: any;
}

export default function WalletScreen() {
  const router = useRouter();
  const { auth } = useAppContext();

  // Balances
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [lifetimeEarnings, setLifetimeEarnings] = useState(0);

  // Payout Method (UPI)
  const [upiId, setUpiId] = useState('');
  const [isUpiVerified, setIsUpiVerified] = useState(false);
  const [verifyingUpi, setVerifyingUpi] = useState(false);

  // Withdraw request
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  // Transaction History
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  useEffect(() => {
    if (!auth.user) return;

    // Part A & B: UID Match Verification Tracing
    const firebaseUid = firebaseAuth.currentUser?.uid;
    const profileId = auth.user?.id;
    console.log('Firebase UID:', firebaseUid);
    console.log('Profile ID:', profileId);
    console.log('Wallet Query UserId:', profileId);
    console.log('UID_MATCH =', firebaseUid === profileId);

    const triggerClear = async () => {
      try {
        console.log('[WALLET] Triggering clear balance clearance check via API...');
        await apiClient.post('/refresh-wallet', { userId: auth.user!.id });
      } catch (error) {
        console.warn('[WALLET] Initial clearance check failed:', error);
      }
    };
    triggerClear();

    // 1. Listen to driver's wallet document
    const walletRef = doc(db, 'wallets', auth.user.id);
    console.log('[COLLECTION] wallets');
    console.log('[QUERY] doc(db, "wallets", "' + auth.user.id + '")');
    const unsubWallet = onSnapshot(walletRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWalletBalance(data.walletBalance || 0);
        setPendingBalance(data.pendingBalance || 0);
        setLockedBalance(data.lockedBalance || 0);
        setLifetimeEarnings(data.lifetimeEarnings || 0);
      }
    }, (error) => {
      console.log('[COLLECTION] wallets');
      console.log('[QUERY] doc(db, "wallets", "' + auth.user!.id + '")');
      console.error('[PERMISSION ERROR] ' + error.message);
    });

    // 2. Listen to driver's user document to get UPI status
    const userRef = doc(db, 'users', auth.user.id);
    console.log('[COLLECTION] users');
    console.log('[QUERY] doc(db, "users", "' + auth.user.id + '")');
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.payoutMethod && data.payoutMethod.type === 'upi') {
          setUpiId(data.payoutMethod.upiId || '');
          setIsUpiVerified(data.payoutMethod.verified || false);
        }
      }
    }, (error) => {
      console.log('[COLLECTION] users');
      console.log('[QUERY] doc(db, "users", "' + auth.user!.id + '")');
      console.error('[PERMISSION ERROR] ' + error.message);
    });

    // 3. Listen to driver's transactions
    const txQuery = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', auth.user.id),
      orderBy('createdAt', 'desc')
    );
    console.log('[COLLECTION] walletTransactions');
    console.log('[QUERY] query(collection(db, "walletTransactions"), where("userId", "==", "' + auth.user.id + '"), orderBy("createdAt", "desc"))');

    const unsubTx = onSnapshot(txQuery, (snap) => {
      const txs: Transaction[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        txs.push({
          id: doc.id,
          amount: d.amount,
          type: d.type,
          status: d.status,
          referenceType: d.referenceType,
          referenceId: d.referenceId,
          createdAt: d.createdAt,
        });
      });
      setTransactions(txs);
      setLoadingTransactions(false);
    }, (error) => {
      console.log('[COLLECTION] walletTransactions');
      console.log('[QUERY] query(collection(db, "walletTransactions"), where("userId", "==", "' + auth.user!.id + '"), orderBy("createdAt", "desc"))');
      console.error('[PERMISSION ERROR] ' + error.message);
      setLoadingTransactions(false);
    });

    return () => {
      unsubWallet();
      unsubUser();
      unsubTx();
    };
  }, [auth.user]);

  const handleVerifyUpi = async () => {
    if (!auth.user) return;
    if (!upiId.trim()) {
      Alert.alert('Error', 'Please enter a UPI ID first.');
      return;
    }

    setVerifyingUpi(true);
    try {
      const res = await apiClient.post('/verify-upi', {
        userId: auth.user.id,
        upiId: upiId.trim(),
      });

      if (res.data?.success) {
        setIsUpiVerified(true);
        Alert.alert('Success', 'Your UPI ID has been verified successfully!');
      } else {
        throw new Error(res.data?.message || 'Verification failed');
      }
    } catch (err: any) {
      Alert.alert('UPI Verification Failed', err.message || 'Invalid UPI ID format. Ensure it follows name@bank.');
    } finally {
      setVerifyingUpi(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!auth.user) return;
    
    if (!isUpiVerified) {
      Alert.alert('Verification Required', 'Please add and verify your UPI ID first before requesting a withdrawal.');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to withdraw.');
      return;
    }

    if (amount < 100 || amount > 2000) {
      Alert.alert('Limit Error', 'Withdrawals must be between ₹100 and ₹2000 per request.');
      return;
    }

    if (amount > walletBalance) {
      Alert.alert('Insufficient Balance', 'You do not have enough withdrawable balance.');
      return;
    }

    setSubmittingWithdraw(true);
    try {
      const res = await apiClient.post('/request-withdrawal', {
        userId: auth.user.id,
        amount,
      });

      if (res.data?.success) {
        Alert.alert('Payout Requested', 'Your withdrawal request of ₹' + amount + ' has been submitted and is processing.');
        setWithdrawAmount('');
      } else {
        throw new Error(res.data?.message || 'Withdrawal request failed');
      }
    } catch (err: any) {
      Alert.alert('Withdrawal Failed', err.message || 'Failed to submit withdrawal request. Please try again.');
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  const formatTxDate = (timestamp: any) => {
    if (!timestamp) return '';
    let d: Date;
    if (timestamp instanceof Timestamp) {
      d = timestamp.toDate();
    } else if (timestamp.seconds) {
      d = new Date(timestamp.seconds * 1000);
    } else {
      d = new Date(timestamp);
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getTxTypeLabel = (type: string) => {
    switch (type) {
      case 'ride_earning': return 'Ride Earnings';
      case 'withdrawal': return 'Withdrawal';
      case 'refund': return 'Refund Payout';
      case 'adjustment': return 'Adjustment';
      default: return 'Transaction';
    }
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case 'ride_earning': return 'cash-plus';
      case 'withdrawal': return 'bank-transfer-out';
      case 'refund': return 'cash-refund';
      default: return 'swap-horizontal';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={WARM_CORE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          
          {/* Main withdrawable balance card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>WITHDRAWABLE BALANCE</Text>
            <Text style={styles.balanceAmount}>₹{walletBalance.toFixed(2)}</Text>
            
            <View style={styles.cardDivider} />
            
            <View style={styles.balancesGrid}>
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Escrow/Pending</Text>
                <Text style={styles.gridValue}>₹{pendingBalance.toFixed(2)}</Text>
              </View>
              <View style={styles.gridDivider} />
              <View style={styles.gridCell}>
                <Text style={styles.gridLabel}>Locked/Pending</Text>
                <Text style={styles.gridValue}>₹{lockedBalance.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Life stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <MaterialCommunityIcons name="trophy-outline" size={18} color={WARM_CORE.primary} />
              <Text style={styles.statLabel}>Lifetime Earnings</Text>
              <Text style={styles.statValue}>₹{lifetimeEarnings.toFixed(2)}</Text>
            </View>
          </View>

          {/* UPI ID Setup */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payout Method</Text>
            <Text style={styles.sectionDesc}>Specify your verified UPI ID where payouts will be credited.</Text>
            
            <View style={styles.upiInputRow}>
              <TextInput
                style={[styles.input, isUpiVerified && styles.inputDisabled]}
                placeholder="name@bank"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={upiId}
                onChangeText={(text) => {
                  setUpiId(text);
                  setIsUpiVerified(false); // reset verified on text change
                }}
                editable={!isUpiVerified && !verifyingUpi}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[
                  styles.verifyBtn,
                  isUpiVerified && styles.verifyBtnSuccess,
                  verifyingUpi && styles.disabledBtn
                ]}
                onPress={handleVerifyUpi}
                disabled={isUpiVerified || verifyingUpi}
              >
                {verifyingUpi ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.verifyBtnText}>
                    {isUpiVerified ? 'Verified' : 'Verify'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Withdrawal Request */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Withdraw Funds</Text>
            <Text style={styles.sectionDesc}>
              Daily Limit: ₹100 - ₹2,000 (Max 1 transfer per day).
            </Text>
            
            <View style={styles.withdrawRow}>
              <TextInput
                style={styles.withdrawInput}
                placeholder="Enter amount (₹)"
                placeholderTextColor={WARM_CORE.textSecondary}
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                editable={!submittingWithdraw}
              />
              <TouchableOpacity
                style={[styles.withdrawBtn, submittingWithdraw && styles.disabledBtn]}
                onPress={handleRequestWithdrawal}
                disabled={submittingWithdraw}
              >
                {submittingWithdraw ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.withdrawBtnText}>Request Payout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Transaction History */}
          <View style={styles.txSection}>
            <Text style={styles.txSectionTitle}>Transaction Ledger</Text>
            
            {loadingTransactions ? (
              <ActivityIndicator size="small" color={WARM_CORE.primary} style={{ marginTop: 20 }} />
            ) : transactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="swap-horizontal" size={36} color={WARM_CORE.textSecondary} />
                <Text style={styles.emptyText}>No transactions recorded yet.</Text>
              </View>
            ) : (
              transactions.map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={styles.txIconContainer}>
                    <MaterialCommunityIcons name={getTxIcon(tx.type)} size={20} color={WARM_CORE.primary} />
                  </View>
                  <View style={styles.txDetails}>
                    <Text style={styles.txLabel}>{getTxTypeLabel(tx.type)}</Text>
                    <Text style={styles.txDate}>{formatTxDate(tx.createdAt)}</Text>
                  </View>
                  <View style={styles.txAmountContainer}>
                    <Text style={[
                      styles.txAmount,
                      { color: tx.amount < 0 ? WARM_CORE.error : WARM_CORE.success }
                    ]}>
                      {tx.amount < 0 ? '-' : '+'}₹{Math.abs(tx.amount).toFixed(2)}
                    </Text>
                    <View style={[
                      styles.statusBadge,
                      tx.status === 'completed' ? styles.statusBadgeSuccess : tx.status === 'pending' ? styles.statusBadgePending : styles.statusBadgeFailed
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        { color: tx.status === 'completed' ? WARM_CORE.success : tx.status === 'pending' ? '#D97706' : WARM_CORE.error }
                      ]}>
                        {tx.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.background,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  scrollContainer: {
    padding: 20,
  },
  balanceCard: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 18,
  },
  balancesGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridCell: {
    flex: 1,
  },
  gridDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 16,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '700',
    marginLeft: 8,
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: WARM_CORE.text,
  },
  card: {
    backgroundColor: WARM_CORE.white,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    lineHeight: 16,
    marginBottom: 14,
  },
  upiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: WARM_CORE.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: WARM_CORE.text,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    marginRight: 10,
  },
  inputDisabled: {
    opacity: 0.8,
    backgroundColor: WARM_CORE.card,
    borderColor: WARM_CORE.border,
    color: WARM_CORE.textSecondary,
  },
  verifyBtn: {
    height: 48,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnSuccess: {
    backgroundColor: WARM_CORE.success,
  },
  verifyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  withdrawRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  withdrawInput: {
    flex: 1,
    height: 48,
    backgroundColor: WARM_CORE.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: WARM_CORE.text,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    marginRight: 10,
  },
  withdrawBtn: {
    height: 48,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  withdrawBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  txSection: {
    marginTop: 8,
    marginBottom: 30,
  },
  txSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: WARM_CORE.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  emptyText: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    marginTop: 8,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  txIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 2,
  },
  txDate: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
  },
  statusBadgeFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
});
