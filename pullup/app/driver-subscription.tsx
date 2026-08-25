import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RazorpayCheckout from 'react-native-razorpay';
import { doc, getDoc } from 'firebase/firestore';

import { useAppContext } from '@/context/AppContext';
import { WARM_CORE } from '@/constants/theme';
import { db } from '@/utils/firebase';
import apiClient from '@/utils/backendApiClient';

interface Plan {
  id: 'monthly' | 'quarterly' | 'yearly';
  name: string;
  price: number;
  duration: string;
  savings?: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly Pass',
    price: 250,
    duration: '30 Days',
  },
  {
    id: 'quarterly',
    name: 'Quarterly Saver',
    price: 700,
    duration: '90 Days',
    savings: 'Save ₹50',
    popular: true,
  },
  {
    id: 'yearly',
    name: 'Annual Pass',
    price: 2500,
    duration: '365 Days',
    savings: 'Save ₹500',
  },
];

export default function DriverSubscriptionScreen() {
  const router = useRouter();
  const { auth } = useAppContext();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly' | 'yearly'>('quarterly');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subscriptionExpiry, setSubscriptionExpiry] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive'>('inactive');

  const fetchSubscriptionStatus = async () => {
    if (!auth.user) return;
    try {
      const userRef = doc(db, 'users', auth.user.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData?.subscriptionStatus === 'active') {
          setStatus('active');
          if (userData.subscriptionExpiry) {
            const expDate = new Date(userData.subscriptionExpiry);
            setSubscriptionExpiry(expDate.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }));
          }
        } else {
          setStatus('inactive');
          setSubscriptionExpiry(null);
        }
      }
    } catch (error) {
      console.error('[SUBSCRIPTION] Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [auth.user]);

  const handleSubscribe = async () => {
    if (!auth.user) {
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/create-subscription', {
        userId: auth.user.id,
        planId: selectedPlan,
      });

      if (!res.data?.success || !res.data.orderId || !res.data.keyId || !res.data.amount) {
        throw new Error(res.data?.message || 'Failed to initialize subscription checkout');
      }

      const payment = await RazorpayCheckout.open({
        key: res.data.keyId,
        order_id: res.data.orderId,
        amount: res.data.amount,
        currency: 'INR',
        name: 'PullUp',
        description: `${selectedPlan} driver subscription`,
        prefill: {
          name: auth.user.fullName,
          email: auth.user.email,
          contact: auth.user.phone,
        },
        notes: { userId: auth.user.id, planId: selectedPlan },
        theme: { color: WARM_CORE.primary },
      });

      if (!payment.razorpay_payment_id || !payment.razorpay_order_id || !payment.razorpay_signature) {
        throw new Error('Razorpay did not return complete payment verification details.');
      }

      const verification = await apiClient.post('/verify-subscription', {
        userId: auth.user.id,
        planId: selectedPlan,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_signature: payment.razorpay_signature,
      });

      if (!verification.data?.success) {
        throw new Error(verification.data?.message || 'Payment verification failed');
      }

      await fetchSubscriptionStatus();
      Alert.alert(
        'Subscription active',
        'Your driver subscription payment was verified successfully.',
        [
          { text: 'Create TaxiPool', onPress: () => router.replace('/create-taxi-pool') },
          { text: 'Go Home', onPress: () => router.replace('/(tabs)/home') },
        ]
      );
    } catch (err: any) {
      console.error('[SUBSCRIPTION ERROR]', err);
      Alert.alert('Payment not completed', err?.description || err?.message || 'The payment was cancelled or failed.');
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={WARM_CORE.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={WARM_CORE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Subscription</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Current status banner */}
        <View style={[styles.statusCard, status === 'active' ? styles.statusActive : styles.statusInactive]}>
          <View style={styles.statusHeader}>
            <MaterialCommunityIcons
              name={status === 'active' ? 'check-decagram' : 'alert-decagram'}
              size={24}
              color={status === 'active' ? WARM_CORE.success : WARM_CORE.accent}
            />
            <Text style={[styles.statusText, { color: status === 'active' ? WARM_CORE.success : WARM_CORE.primary }]}>
              {status === 'active' ? 'ACTIVE SUBSCRIPTION' : 'SUBSCRIPTION REQUIRED'}
            </Text>
          </View>
          <Text style={styles.statusDescription}>
            {status === 'active'
              ? `Your plan is active and will expire on ${subscriptionExpiry}.`
              : 'You must maintain a monthly plan of ₹250 to host and post TaxiPool rides.'}
          </Text>
        </View>

        {/* Benefits lists */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>TaxiPool Privileges</Text>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>Create unlimited TaxiPool coordinates</Text>
          </View>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>100% Commission-free Taxi rides (keep all seat contributions)</Text>
          </View>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>Priority visibility on university route boards</Text>
          </View>
        </View>

        <Text style={styles.plansSectionTitle}>Choose a Plan</Text>

        {/* Plan list selector */}
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              activeOpacity={0.8}
              style={[
                styles.planCard,
                isSelected && styles.planCardSelected,
                plan.popular && { borderLeftWidth: 5, borderLeftColor: WARM_CORE.primary },
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              <View style={styles.planInfo}>
                <View style={styles.planRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.popular && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>POPULAR</Text>
                    </View>
                  )}
                  {plan.savings && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>{plan.savings}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDuration}>Duration: {plan.duration}</Text>
              </View>
              <View style={styles.planPriceContainer}>
                <Text style={styles.planPrice}>₹{plan.price}</Text>
                <MaterialCommunityIcons
                  name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={22}
                  color={isSelected ? WARM_CORE.primary : WARM_CORE.textSecondary}
                />
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.subscribeBtn, submitting && styles.disabledBtn]}
          disabled={submitting}
          onPress={handleSubscribe}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.subscribeBtnText}>
              {status === 'active' ? 'Extend Subscription' : 'Subscribe & Unlock'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
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
  statusCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusInactive: {
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    borderColor: 'rgba(212, 80, 10, 0.2)',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  statusDescription: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    lineHeight: 18,
  },
  benefitsCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  benefitText: {
    fontSize: 13,
    color: WARM_CORE.text,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },
  plansSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: WARM_CORE.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  planCardSelected: {
    borderColor: WARM_CORE.primary,
    backgroundColor: 'rgba(212, 80, 10, 0.03)',
  },
  planInfo: {
    flex: 1,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginRight: 8,
  },
  popularBadge: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  popularText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  savingsBadge: {
    backgroundColor: WARM_CORE.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  savingsText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  planDuration: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
  },
  planPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginRight: 12,
  },
  subscribeBtn: {
    backgroundColor: WARM_CORE.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  subscribeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
