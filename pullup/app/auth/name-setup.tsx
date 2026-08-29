import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WARM_CORE } from '@/constants/theme';
import { getNameFromEmail } from '@/utils/stringUtils';

export default function NameSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const emailFromParams = typeof params.email === 'string' ? params.email : '';
  const otpFromParams = typeof params.otp === 'string' ? params.otp : '';
  const isNewUserParam = typeof params.isNewUser === 'string' ? params.isNewUser : 'true';

  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (emailFromParams) {
      const autoName = getNameFromEmail(emailFromParams);
      if (autoName) {
        setFullName(autoName);
      }
    }
  }, [emailFromParams]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleContinue = () => {
    if (!fullName.trim()) {
      setError('Please enter your name');
      return;
    }

    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    router.push({
      pathname: '/auth/profile',
      params: {
        email: emailFromParams,
        otp: otpFromParams,
        isNewUser: isNewUserParam,
        fullName: fullName.trim(),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color={WARM_CORE.text} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Setup Profile</Text>
          <View style={styles.backButton} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabelContainer}>
            <Text style={styles.progressLabel}>Your Name</Text>
            <Text style={styles.progressStep}>STEP 2 OF 4</Text>
          </View>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '50%' }]} />
          </View>
        </View>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconSquare}>
            <MaterialCommunityIcons name="account-edit-outline" size={40} color={WARM_CORE.primary} />
          </View>
        </View>

        {/* Title Section */}
        <Animated.View style={[styles.titleContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.title}>Your university identity</Text>
          <Text style={styles.subtitle}>
            Your name is derived from your verified university email and cannot be changed.
          </Text>
        </Animated.View>

        {/* Input Form */}
        <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.label}>FULL NAME</Text>
          <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
            <MaterialCommunityIcons name="account-outline" size={20} color={WARM_CORE.textSecondary} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              placeholder="Firstname Lastname"
              placeholderTextColor={WARM_CORE.textSecondary}
              value={fullName}
              editable={false}
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Animated.View style={{ transform: [{ scale: buttonScale }], marginTop: 24 }}>
            <TouchableOpacity
              style={[styles.continueButton, !fullName.trim() ? styles.buttonDisabled : null]}
              onPress={handleContinue}
              disabled={!fullName.trim()}
            >
              <Text style={styles.buttonText}>Continue</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={WARM_CORE.white} />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  },
  progressSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  progressLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  progressStep: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
  },
  progressContainer: {
    height: 8,
    borderRadius: 12,
    backgroundColor: WARM_CORE.border,
    width: '100%',
  },
  progressBar: {
    height: 8,
    borderRadius: 12,
    backgroundColor: WARM_CORE.primary,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  iconSquare: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: WARM_CORE.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  titleContainer: {
    marginBottom: 32,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: WARM_CORE.deepAccent,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  formContainer: {
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 58,
    backgroundColor: WARM_CORE.card,
  },
  inputWrapperError: {
    borderColor: WARM_CORE.error,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  errorText: {
    fontSize: 13,
    color: WARM_CORE.error,
    fontWeight: '500',
  },
  continueButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
});
