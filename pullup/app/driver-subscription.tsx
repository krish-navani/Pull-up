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
    name: 'Monthly Driver Pass',
    price: 250,
    duration: 'Renews monthly',
  },
];

export default function DriverSubscriptionScreen() {
  const router = useRouter();
  const { auth } = useAppContext();

  const [selectedPlan] = useState<'monthly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const status = String(subscription?.status || 'inactive');
  const isActive = status === 'active';
  const isPausable = ['active', 'authenticated'].includes(status);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await apiClient.get('/subscriptions/autopay/status');
      setSubscription(response.data?.subscription || null);
    } catch (error) {
      console.error('[AUTOPAY] Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth.user) fetchSubscriptionStatus();
  }, [auth.user?.id]);

  const handleSubscribe = async () => {
    if (!auth.user) {
      Alert.alert('Error', 'Please log in first.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/subscriptions/autopay/create');
      const data = response.data;
      if (!data?.subscriptionId || !data?.keyId || !data?.amount) {
        throw new Error(data?.message || 'AutoPay authorization could not be initialized.');
      }
      const payment = await RazorpayCheckout.open({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        amount: data.amount,
        currency: data.currency || 'INR',
        name: 'PullUp',
        description: 'Monthly Driver Pass AutoPay mandate',
        prefill: {
          name: auth.user.fullName,
          email: auth.user.email,
          contact: auth.user.phone,
        },
        notes: { userId: auth.user.id, product: 'driver_monthly_autopay' },
        theme: { color: WARM_CORE.primary },
        readonly: { name: true, email: true },
      });
      if (!payment.razorpay_payment_id || !payment.razorpay_subscription_id || !payment.razorpay_signature) {
        throw new Error('Razorpay did not return complete mandate authorization details.');
      }
      await apiClient.post('/subscriptions/autopay/verify', {
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_subscription_id: payment.razorpay_subscription_id,
        razorpay_signature: payment.razorpay_signature,
      });
      await fetchSubscriptionStatus();
      Alert.alert('AutoPay authorized', 'Your monthly mandate was authorized. Subscription state will update from Razorpay webhooks.');
    } catch (err: any) {
      console.error('[AUTOPAY ERROR]', err);
      Alert.alert('AutoPay not enabled', err?.description || err?.message || 'Authorization was cancelled or failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const mutateAutopay = async (action: 'pause' | 'cancel') => {
    if (!subscription?.id) return;
    const title = action === 'pause' ? 'Pause AutoPay?' : 'Cancel AutoPay?';
    const message = action === 'pause'
      ? 'Future debits will pause according to Razorpay mandate rules.'
      : 'The mandate will be cancelled at the end of the current billing cycle where supported.';
    Alert.alert(title, message, [
      { text: 'Keep Active', style: 'cancel' },
      {
        text: action === 'pause' ? 'Pause' : 'Cancel',
        style: action === 'cancel' ? 'destructive' : 'default',
        onPress: async () => {
          setSubmitting(true);
          try {
            await apiClient.post('/subscriptions/autopay/' + action, { subscriptionId: subscription.id });
            await fetchSubscriptionStatus();
          } catch (error: any) {
            Alert.alert('Could not update AutoPay', error?.message || 'Please try again.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
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
        <View style={[styles.statusCard, isActive ? styles.statusActive : styles.statusInactive]}>
          <View style={styles.statusHeader}>
            <MaterialCommunityIcons
              name={isActive ? 'check-decagram' : 'shield-key-outline'}
              size={24}
              color={isActive ? WARM_CORE.success : WARM_CORE.accent}
            />
            <Text style={[styles.statusText, { color: isActive ? WARM_CORE.success : WARM_CORE.primary }]}>
              {status.toUpperCase().replace('_', ' ')}
            </Text>
          </View>
          <Text style={styles.statusDescription}>
            {isActive
              ? '₹' + ((subscription?.amountPaise || 25000) / 100).toFixed(0) + ' monthly · next debit ' +
                (subscription?.nextChargeAt ? new Date(subscription.nextChargeAt * 1000).toLocaleDateString() : 'awaiting Razorpay schedule')
              : 'Enable AutoPay only after reviewing the ₹250 monthly amount. Razorpay will ask you to explicitly authorize the mandate.'}
          </Text>
        </View>

        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Monthly Driver Pass</Text>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="cash-sync" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>₹250 billed monthly after explicit UPI AutoPay, card, or eMandate authorization</Text>
          </View>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="calendar-clock" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>Status and next debit are synchronized from signed Razorpay webhooks</Text>
          </View>
          <View style={styles.benefitRow}>
            <MaterialCommunityIcons name="car-multiple" size={20} color={WARM_CORE.primary} />
            <Text style={styles.benefitText}>Required only for the recurring Taxi Pool hosting product, never individual ride payments</Text>
          </View>
        </View>

        <View style={[styles.planCard, styles.planCardSelected]}>
          <View style={styles.planInfo}>
            <Text style={styles.planName}>Monthly Driver Pass</Text>
            <Text style={styles.planDuration}>Renews monthly until paused or cancelled</Text>
          </View>
          <Text style={styles.planPrice}>₹250</Text>
        </View>

        <TouchableOpacity
          style={[styles.subscribeBtn, (submitting || isActive) && styles.disabledBtn]}
          disabled={submitting || isActive}
          onPress={handleSubscribe}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={styles.subscribeBtnText}>{isActive ? 'AutoPay Active' : 'Enable AutoPay'}</Text>
          )}
        </TouchableOpacity>

        {subscription?.id ? (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            {isPausable ? (
              <TouchableOpacity style={[styles.subscribeBtn, { flex: 1, marginTop: 0, backgroundColor: WARM_CORE.accent }]} onPress={() => mutateAutopay('pause')} disabled={submitting}>
                <Text style={styles.subscribeBtnText}>Pause</Text>
              </TouchableOpacity>
            ) : null}
            {!['cancelled', 'completed'].includes(status) ? (
              <TouchableOpacity style={[styles.subscribeBtn, { flex: 1, marginTop: 0, backgroundColor: '#B91C1C' }]} onPress={() => mutateAutopay('cancel')} disabled={submitting}>
                <Text style={styles.subscribeBtnText}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {status === 'payment_failed' || status === 'halted' ? (
          <Text style={[styles.statusDescription, { color: '#B91C1C', marginTop: 12 }]}>
            The last debit failed. Re-authorize AutoPay or update the mandate in Razorpay Checkout.
          </Text>
        ) : null}      </ScrollView>
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
