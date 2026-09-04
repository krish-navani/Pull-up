import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WARM_CORE } from '@/constants/theme';
import { getCurrentUser, saveUserToStorage } from '@/utils/authService';
import { auth } from '@/utils/firebase';
import { syncUserSession } from '@/utils/userSessionService';

const UNIVERSITY_DOMAIN = '@atlasskilltech.university';

export default function ReviewerAccessScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith(UNIVERSITY_DOMAIN) || !password) {
      setError('Enter the Atlas reviewer email and password supplied in Google Play.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await credential.user.getIdToken(true);
      await syncUserSession(credential.user.uid);
      const user = await getCurrentUser();
      if (!user || user.id !== credential.user.uid) {
        throw new Error('Reviewer profile could not be loaded.');
      }
      await saveUserToStorage(user);
      router.replace('/(tabs)/home');
    } catch (signInError: any) {
      console.error('[REVIEWER AUTH] Sign-in failed:', signInError?.code || signInError?.message);
      setError('Reviewer credentials could not be verified. Check the email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={25} color={WARM_CORE.text} />
        </TouchableOpacity>
        <View style={styles.content}>
          <MaterialCommunityIcons name="shield-account" size={48} color={WARM_CORE.primary} />
          <Text style={styles.title}>Reviewer access</Text>
          <Text style={styles.subtitle}>Secure access for the account supplied in Google Play Console.</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Atlas reviewer email"
            placeholderTextColor={WARM_CORE.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={WARM_CORE.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={signIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WARM_CORE.background },
  container: { flex: 1 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', margin: 16 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80 },
  title: { marginTop: 18, fontSize: 28, fontWeight: '700', color: WARM_CORE.text },
  subtitle: { marginTop: 8, marginBottom: 28, fontSize: 15, lineHeight: 22, color: WARM_CORE.textSecondary },
  input: { height: 54, borderWidth: 1, borderColor: WARM_CORE.border, backgroundColor: WARM_CORE.card, color: WARM_CORE.text, borderRadius: 8, paddingHorizontal: 16, marginBottom: 14, fontSize: 16 },
  error: { color: WARM_CORE.error, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  button: { height: 54, borderRadius: 8, backgroundColor: WARM_CORE.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

