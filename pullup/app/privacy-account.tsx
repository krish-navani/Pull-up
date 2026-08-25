import { WARM_CORE } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import apiClient from '@/utils/backendApiClient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_OTP_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || 'https://backend-eight-gamma-77.vercel.app';

export default function PrivacyAccountScreen() {
  const router = useRouter();
  const { auth, logout } = useAppContext();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    if (confirmation.trim().toUpperCase() !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      await apiClient.post('/account-deletion/confirm', {});
      await logout();
      router.replace('/auth/signup');
    } catch (error: any) {
      console.error('[ACCOUNT-DELETION] In-app deletion failed:', error);
      Alert.alert('Deletion not completed', error?.message || 'Please try again. Your account has not been deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Privacy & Account', headerShadowVisible: false, headerStyle: { backgroundColor: WARM_CORE.background } }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Privacy & Account</Text>
        <Text style={styles.subtitle}>Manage your privacy information and PullUp account.</Text>

        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(`${PUBLIC_BASE_URL}/privacy`)}>
          <View style={styles.iconBox}><MaterialCommunityIcons name="shield-lock-outline" size={22} color={WARM_CORE.primary} /></View>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Privacy Policy</Text><Text style={styles.rowSubtitle}>How PullUp collects, uses, and retains data</Text></View>
          <MaterialCommunityIcons name="open-in-new" size={19} color={WARM_CORE.textSecondary} />
        </TouchableOpacity>

        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>Delete Account</Text>
          <Text style={styles.warning}>Deleting your PullUp account permanently removes your account and associated data. This action cannot be undone.</Text>
          <Text style={styles.detail}>Active requests will be cancelled. Shared completed ride and financial records may be retained only in anonymized form where required for other users, disputes, or legal obligations.</Text>
          {!showConfirmation ? (
            <TouchableOpacity style={styles.outlineDangerButton} onPress={() => setShowConfirmation(true)}>
              <MaterialCommunityIcons name="delete-outline" size={19} color={WARM_CORE.error} />
              <Text style={styles.outlineDangerText}>Delete Account</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmationBox}>
              <Text style={styles.confirmLabel}>Type DELETE to confirm for {auth.user?.email || 'this account'}</Text>
              <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" editable={!deleting} placeholder="DELETE" placeholderTextColor={WARM_CORE.textSecondary} style={styles.input} />
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} disabled={deleting} onPress={() => { setShowConfirmation(false); setConfirmation(''); }}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.deleteButton, confirmation.trim().toUpperCase() !== 'DELETE' && styles.disabled]} disabled={deleting || confirmation.trim().toUpperCase() !== 'DELETE'} onPress={deleteAccount}>
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteText}>Delete permanently</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity onPress={() => Linking.openURL(`${PUBLIC_BASE_URL}/delete-account`)}><Text style={styles.externalLink}>Open external account deletion page</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WARM_CORE.background }, content: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 26, fontWeight: '800', color: WARM_CORE.text }, subtitle: { marginTop: 6, marginBottom: 24, fontSize: 14, lineHeight: 20, color: WARM_CORE.textSecondary },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: WARM_CORE.card, borderWidth: 1, borderColor: WARM_CORE.border, borderRadius: 8 },
  iconBox: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(212,80,10,0.08)', alignItems: 'center', justifyContent: 'center' }, rowText: { flex: 1 }, rowTitle: { fontSize: 15, fontWeight: '700', color: WARM_CORE.text }, rowSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16, color: WARM_CORE.textSecondary },
  dangerSection: { marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: WARM_CORE.border }, dangerTitle: { fontSize: 18, fontWeight: '800', color: WARM_CORE.error }, warning: { marginTop: 10, fontSize: 14, lineHeight: 21, fontWeight: '700', color: WARM_CORE.text }, detail: { marginTop: 10, fontSize: 12, lineHeight: 19, color: WARM_CORE.textSecondary },
  outlineDangerButton: { height: 48, marginTop: 18, borderRadius: 8, borderWidth: 1, borderColor: WARM_CORE.error, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, outlineDangerText: { color: WARM_CORE.error, fontWeight: '800' }, confirmationBox: { marginTop: 18 }, confirmLabel: { fontSize: 13, fontWeight: '700', color: WARM_CORE.text }, input: { height: 48, marginTop: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: WARM_CORE.border, borderRadius: 8, color: WARM_CORE.text, backgroundColor: WARM_CORE.card, fontWeight: '700' }, buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, cancelButton: { flex: 1, height: 46, borderRadius: 8, borderWidth: 1, borderColor: WARM_CORE.border, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: WARM_CORE.text, fontWeight: '700' }, deleteButton: { flex: 1.5, height: 46, borderRadius: 8, backgroundColor: WARM_CORE.error, alignItems: 'center', justifyContent: 'center' }, deleteText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: 0.45 }, externalLink: { marginTop: 24, textAlign: 'center', color: WARM_CORE.primary, textDecorationLine: 'underline', fontSize: 13, fontWeight: '600' },
});