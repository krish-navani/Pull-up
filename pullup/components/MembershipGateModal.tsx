import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';

interface MembershipGateModalProps {
  visible: boolean;
  onClose: () => void;
  actionTitle?: string; // e.g. "join this carpool", "host a taxi pool", "join this taxi pool"
}

const { width } = Dimensions.get('window');

export default function MembershipGateModal({
  visible,
  onClose,
  actionTitle = 'join or host rides',
}: MembershipGateModalProps) {
  const router = useRouter();

  const handleGetPass = () => {
    onClose();
    router.push('/driver-subscription');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Badge Icon */}
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="shield-star" size={32} color={WARM_CORE.primary} />
          </View>

          <Text style={styles.title}>PullUp Pass Required</Text>
          <Text style={styles.description}>
            An active PullUp pass (₹250/month) is required to {actionTitle}. Get unlimited cost-sharing commute access with your college community.
          </Text>

          {/* Benefits Bullet Points */}
          <View style={styles.benefitsBox}>
            <View style={styles.benefitRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#16A34A" />
              <Text style={styles.benefitText}>Join verified student & faculty carpools</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#16A34A" />
              <Text style={styles.benefitText}>Create and join cost-split taxi pools</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#16A34A" />
              <Text style={styles.benefitText}>Live GPS tracking & in-app group chats</Text>
            </View>
          </View>

          {/* Actions */}
          <TouchableOpacity onPress={handleGetPass} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Get PullUp Pass — ₹250</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.secondaryBtn} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: Math.min(width - 40, 360),
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  benefitsBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 12,
    color: WARM_CORE.text,
    fontWeight: '500',
    flex: 1,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: WARM_CORE.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: WARM_CORE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: WARM_CORE.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
