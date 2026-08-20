import { useAppContext } from '@/context/AppContext';
import {
    ANIMATION_TIMINGS,
    createFadeAnimation,
    createShakeAnimation,
    createSlideAnimation
} from '@/utils/animationConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

const UNIVERSITY_DOMAIN = '@atlasskilltech.university';

// Progress Bar Component
const ProgressBar = ({ step, totalSteps, label }: { step: number; totalSteps: number; label: string }) => {
  const animatedValue = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: (step / totalSteps) * 100,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [step, totalSteps, animatedValue]);

  const width = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressSection}>
      <View style={styles.progressLabelContainer}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressStep}>STEP {step} OF {totalSteps}</Text>
      </View>
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, { width }]} />
      </View>
    </View>
  );
};

export default function SignupScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { sendOTPEmail, auth, verifyOTPAndAutoAuth } = useAppContext();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const otpInputs = [0, 1, 2, 3];
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Animations
  const titleFade = useRef(createFadeAnimation(0)).current;
  const subtitleSlide = useRef(createSlideAnimation(20)).current;
  const formFade = useRef(createFadeAnimation(0)).current;
  const errorShake = useRef(createShakeAnimation()).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Animate in on mount
  useEffect(() => {
    Animated.sequence([
      Animated.timing(titleFade.opacity, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(subtitleSlide.slideY, {
          toValue: 0,
          duration: ANIMATION_TIMINGS.STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(formFade.opacity, {
          toValue: 1,
          duration: ANIMATION_TIMINGS.MEDIUM,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Shake animation when error appears
  useEffect(() => {
    if (error) {
      errorShake.shake();
    }
  }, [error]);

  const handleGoBack = () => {
    // Only allow back navigation if not currently verifying
    if (isVerifying || isSendingOTP) {
      return;
    }
    
    // Clear OTP state, error, and verifying flag when going back
    setOtp(['', '', '', '']);
    setError('');
    setIsVerifying(false);
    setStep('email');
    // Focus back on email input
    setTimeout(() => {
      otpRefs.current[0]?.focus?.();
    }, 100);
  };

  const validateEmail = (text: string): boolean => {
    return !!(text && !text.includes('@'));
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (error) setError('');
  };

  const handleSendOTP = async () => {
    if (!validateEmail(email)) {
      setError('Please enter a valid email (without @domain)');
      return;
    }

    try {
      // Animate button press
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 0.95,
          duration: ANIMATION_TIMINGS.FAST,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: ANIMATION_TIMINGS.STANDARD,
          useNativeDriver: true,
        }),
      ]).start();

      setIsSendingOTP(true);
      // Clear previous OTP state when sending new OTP
      setOtp(['', '', '', '']);
      setError('');
      
      console.log('[SIGNUP] Sending OTP to:', email + UNIVERSITY_DOMAIN);
      const result = await sendOTPEmail(email + UNIVERSITY_DOMAIN);
      console.log('[SIGNUP] OTP send result:', result);
      
      setStep('otp');
    } catch (err: any) {
      console.error('[SIGNUP] OTP send error:', {
        message: err.message || err,
        code: err.code,
      });
      
      // Provide more specific error messages
      let errorMsg = 'Failed to send OTP. Please try again.';
      if (err.message?.includes('credentials')) {
        errorMsg = 'Email service not configured. Please contact support.';
      } else if (err.message?.includes('network') || err.message?.includes('NetworkError')) {
        errorMsg = 'Network error. Please check your internet connection.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setError(errorMsg);
    } finally {
      setIsSendingOTP(false);
    }
  };


  const handleOtpChange = (value: string, idx: number) => {
    // Handle pasting or multiple digits
    if (value.length > 1) {
      const digits = value.replace(/[^0-9]/g, '').split('');
      if (digits.length > 1) {
        const newOtp = [...otp];
        let filledCount = 0;
        digits.forEach((digit, i) => {
          if (idx + i < 4) {
            newOtp[idx + i] = digit;
            filledCount++;
          }
        });
        setOtp(newOtp);
        const nextFocusIndex = Math.min(idx + filledCount, 3);
        otpRefs.current[nextFocusIndex]?.focus();
        if (error) setError('');
        return;
      }
      
      // If user typed a new digit over an existing one, take the newly typed digit (last char)
      const cleaned = value.replace(/[^0-9]/g, '');
      if (cleaned.length > 0) {
        value = cleaned.charAt(cleaned.length - 1);
      } else {
        value = '';
      }
    } else {
      // Single character input
      if (value && !/^[0-9]$/.test(value)) return;
    }

    const newOtp = [...otp];
    newOtp[idx] = value;
    setOtp(newOtp);

    // Only move forward if a digit was entered
    if (value && idx < 3) {
      otpRefs.current[idx + 1]?.focus();
    }
    if (error) setError('');
  };

  const handleVerifyOTP = async () => {
    if (otp.some(digit => digit === '')) {
      setError('Please enter all 4 OTP digits');
      return;
    }

    const otpCode = otp.join('');
    setIsVerifying(true);
    setError('');

    // Animate button press
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: ANIMATION_TIMINGS.FAST,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      // Verify OTP and check if user is new or existing
      console.log('[SIGNUP] verifyOTPAndAutoAuth called with email:', email + UNIVERSITY_DOMAIN);
      const result = await verifyOTPAndAutoAuth(email, otpCode);
      
      console.log('[SIGNUP] verifyOTPAndAutoAuth result:', {
        isNewUser: result.isNewUser,
        hasUser: !!result.user,
        userEmail: result.user?.email,
        profileComplete: result.user?.profileComplete,
      });
      
      if (result.isNewUser) {
        console.log('[SIGNUP] New user detected, navigating to name setup');
        router.push({
          pathname: '/auth/name-setup' as any,
          params: { 
            email: email + UNIVERSITY_DOMAIN, 
            otp: otpCode,
            isNewUser: 'true'
          },
        });
      } else {
        console.log('[SIGNUP] Existing user detected, navigating to home');
        // Existing user - they are logged in, navigate to home
        router.replace('/(tabs)/home');
      }
    } catch (err: any) {
      setIsVerifying(false);
      console.error('[SIGNUP] ❌ verifyOTPAndAutoAuth failed:', err);
      // Show specific error messages
      if (err.message.includes('expired')) {
        setError('OTP has expired. Request a new one.');
      } else if (err.message.includes('used')) {
        setError('OTP has already been used.');
      } else if (err.message.includes('exceeded')) {
        setError('Too many attempts. Request a new OTP.');
      } else if (err.message.includes('Invalid')) {
        setError('Invalid OTP. Please check and try again.');
      } else {
        setError(err.message || 'Failed to verify OTP. Please try again.');
      }
    }
  };

  const isEmailValid = validateEmail(email);

  // Clear loading states when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      // Prevent hardware back button only when there's nothing to go back to
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          // On OTP step, go back to email within the same screen
          if (step === 'otp') {
            handleGoBack();
            return true;
          }
          // On email step, check if we can go back to previous screen
          if (navigation?.canGoBack()) {
            navigation.goBack();
            return true;
          }
          // Can't go back, prevent default
          return true;
        }
      );

      return () => {
        // Clear loading states when screen loses focus
        setIsVerifying(false);
        setIsSendingOTP(false);
        backHandler.remove();
      };
    }, [step, navigation])
  );

  if (step === 'otp') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleGoBack}
              >
                <MaterialCommunityIcons name="chevron-left" size={30} color={WARM_CORE.text} />
              </TouchableOpacity>
              <Text style={styles.screenTitle}>OTP Verification</Text>
              <View style={styles.backButton} />
            </View>

            <ProgressBar step={2} totalSteps={3} label="Almost there!" />

            <View style={styles.iconContainer}>
              <View style={styles.iconSquare}>
                <MaterialCommunityIcons name="email-outline" size={40} color={WARM_CORE.primary} />
              </View>
            </View>

            <View style={styles.titleContainer}>
              <Text style={styles.title}>Verify Email</Text>
              <Animated.Text
                style={[
                  styles.subtitle,
                  {
                    opacity: formFade.opacity,
                    transform: [{ translateY: subtitleSlide.slideY }],
                  },
                ]}
              >
                We sent an OTP to {'\n'}
                <Text
                  style={styles.emailText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {email}{UNIVERSITY_DOMAIN}
                </Text>
              </Animated.Text>
            </View>

            <Animated.View
              style={[
                styles.formContainer,
                {
                  opacity: formFade.opacity,
                  transform: [{ translateY: subtitleSlide.slideY }],
                },
              ]}
            >
              <View style={styles.otpBoxesContainer}>
                {otpInputs.map((_, idx) => (
                  <TextInput
                    key={idx}
                    ref={(ref) => {
                      otpRefs.current[idx] = ref;
                    }}
                    style={[styles.otpBox, error && styles.inputError]}
                    value={otp[idx]}
                    onChangeText={value => handleOtpChange(value, idx)}
                    keyboardType="numeric"
                    maxLength={4}
                    selectTextOnFocus
                    editable={!isVerifying}
                    returnKeyType={idx === 3 ? 'done' : 'next'}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
                        otpRefs.current[idx - 1]?.focus();
                        const newOtp = [...otp];
                        newOtp[idx - 1] = '';
                        setOtp(newOtp);
                      }
                    }}
                  />
                ))}
              </View>

              {error && (
                <Animated.View
                  style={[
                    styles.errorContainer,
                    { transform: [{ translateX: errorShake.translateX }] },
                  ]}
                >
                  <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              )}

              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    otp.some(digit => digit === '') || isVerifying ? styles.buttonDisabled : null,
                  ]}
                  onPress={handleVerifyOTP}
                  disabled={otp.some(digit => digit === '') || isVerifying}
                >
                  {isVerifying ? (
                    <ActivityIndicator color={WARM_CORE.white} />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Verify</Text>
                      <MaterialCommunityIcons name="arrow-right" size={20} color={WARM_CORE.white} />
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Didn&apos;t receive OTP?</Text>
              <TouchableOpacity onPress={handleGoBack}>
                <Text style={styles.resendLink}>Resend</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <View style={styles.backButton} />
            <Text style={styles.screenTitle}>Login</Text>
            <View style={styles.backButton} />
          </View>

          <ProgressBar step={1} totalSteps={3} label="Get Started!" />

          <View style={styles.iconContainer}>
            <View style={styles.iconSquare}>
              <MaterialCommunityIcons name="car" size={40} color={WARM_CORE.primary} />
            </View>
          </View>

          <View style={styles.titleContainer}>
            <Animated.Text style={[styles.title, { opacity: titleFade.opacity }]}>
              Join PullUp!
            </Animated.Text>
            <Animated.Text
              style={[
                styles.subtitle,
                {
                  opacity: formFade.opacity,
                  transform: [{ translateY: subtitleSlide.slideY }],
                },
              ]}
            >
              Exclusive community for{'\n'}
              <Text style={styles.universityText}>Atlas SkillTech University</Text>
              {' '}students
            </Animated.Text>
          </View>

          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formFade.opacity,
                transform: [{ translateY: subtitleSlide.slideY }],
              },
            ]}
          >
            <View style={styles.labelContainer}>
              <Text style={styles.label}>University Email</Text>
            </View>

            <View style={[styles.inputWrapper, error && styles.inputWrapperError]}>
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="email-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="your.name"
                placeholderTextColor="#8A8A8A"
                value={email}
                onChangeText={handleEmailChange}
                editable={!isSendingOTP}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.domainSuffix}>{UNIVERSITY_DOMAIN}</Text>
            </View>

            {/* Verification Message - matching exact image style */}
            <View style={styles.verificationBanner}>
              <MaterialCommunityIcons name="shield-check" size={18} color={WARM_CORE.success} />
              <Text style={styles.verificationBannerText}>Verify your student status instantly via OTP</Text>
            </View>

            {error && (
              <Animated.View
                style={[
                  styles.errorContainer,
                  { transform: [{ translateX: errorShake.translateX }] },
                ]}
              >
                <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !isEmailValid || isSendingOTP ? styles.buttonDisabled : null,
                ]}
                onPress={handleSendOTP}
                disabled={!isEmailValid || isSendingOTP}
              >
                {isSendingOTP ? (
                  <ActivityIndicator color={WARM_CORE.white} />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Send OTP</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color={WARM_CORE.white} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By confirming, you agree to our{' '}
              <Text style={styles.link}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.link}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 0,
    paddingBottom: 40,
  },
  progressContainer: {
    height: 8,
    borderRadius: 12,
    backgroundColor: WARM_CORE.border,
    width: '100%',
  } as ViewStyle,
  progressBar: {
    height: 8,
    borderRadius: 12,
    backgroundColor: WARM_CORE.primary,
  },
  progressSection: {
    paddingHorizontal: 24,
    paddingBottom: 30,
  } as ViewStyle,
  progressLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  progressStep: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
  } as TextStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 32,
    paddingHorizontal: 24,
  } as ViewStyle,
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
    flex: 1,
    textAlign: 'center',
  } as TextStyle,
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 24,
  } as ViewStyle,
  iconSquare: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: WARM_CORE.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  titleContainer: {
    marginBottom: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
  } as ViewStyle,
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.deepAccent,
    marginBottom: 12,
    letterSpacing: -0.3,
  } as TextStyle,
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    lineHeight: 24,
    textAlign: 'center'
  } as TextStyle,
  universityText: {
    fontStyle: 'italic',
    color: WARM_CORE.primary,
    fontWeight: '600',
  } as TextStyle,
  emailText: {
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  formContainer: {
    marginBottom: 40,
    paddingHorizontal: 24,
  } as ViewStyle,
  labelContainer: {
    marginBottom: 12,
  } as ViewStyle,
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  } as TextStyle,
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 60,
    backgroundColor: WARM_CORE.card,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  inputWrapperError: {
    borderColor: WARM_CORE.error,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  inputIcon: {
    marginRight: 10,
  } as ViewStyle,
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: WARM_CORE.text,
    padding: 0,
  } as TextStyle,
  domainSuffix: {
    fontSize: 15,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginLeft: 2,
  } as TextStyle,
  successIcon: {
    marginLeft: 8,
  } as ViewStyle,
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 20,
    gap: 10,
  } as ViewStyle,
  verificationBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    flex: 1,
  } as TextStyle,
  verificationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E6F4EA',
    borderRadius: 8,
  } as ViewStyle,
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.success,
    marginRight: 10,
  } as ViewStyle,
  verificationText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.success,
  } as TextStyle,
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    marginBottom: 24,
    paddingHorizontal: 24,
  } as ViewStyle,
  otpBox: {
    width: 56,
    height: 56,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 12,
    backgroundColor: WARM_CORE.card,
    fontSize: 24,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginHorizontal: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    letterSpacing: 2,
  } as TextStyle,
  otpHighlight: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 1,
  } as TextStyle,
  inputError: {
    borderColor: WARM_CORE.error,
    backgroundColor: WARM_CORE.background,
  } as TextStyle,
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FDE8E8',
    borderRadius: 8,
  } as ViewStyle,
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.error,
    marginLeft: 8,
    flex: 1,
  } as TextStyle,
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 30,
    paddingVertical: 24,
    marginTop: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  } as ViewStyle,
  buttonDisabled: {
    backgroundColor: '#E5DED5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  } as ViewStyle,
  buttonText: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.3,
  } as TextStyle,
  footer: {
    marginTop: 'auto',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  } as ViewStyle,
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  } as TextStyle,
  link: {
    color: WARM_CORE.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  } as TextStyle,
  resendLink: {
    color: WARM_CORE.primary,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
  } as TextStyle,
});
