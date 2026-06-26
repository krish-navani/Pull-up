import { useAppContext } from '@/context/AppContext';
import {
  ANIMATION_TIMINGS,
  createFadeAnimation,
  createShakeAnimation,
  createSlideAnimation,
} from '@/utils/animationConfig';
import { uploadImageToCloudinary } from '@/utils/cloudinaryService';
import { getNameFromEmail } from '@/utils/stringUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Image,
  Pressable,
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
import LocationSearchInput from '@/components/LocationSearchInput';
import { Location as PullUpLocation } from '@/types';

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

interface FormData {
  fullName: string;
  phone: string;
  year: 'First Year' | 'Second Year' | 'Third Year' | 'Fourth Year' | 'Fifth Year' | 'Honors Degree' | '';
  course: string;
  division: string;
  appId: string;
  homeAddress: PullUpLocation | null;
  role?: 'driver' | 'passenger';
}

const YEARS: { label: string; value: 'First Year' | 'Second Year' | 'Third Year' | 'Fourth Year' | 'Fifth Year' | 'Honors Degree' }[] = [
  { label: 'First Year', value: 'First Year' },
  { label: 'Second Year', value: 'Second Year' },
  { label: 'Third Year', value: 'Third Year' },
  { label: 'Fourth Year', value: 'Fourth Year' },
  { label: 'Fifth Year', value: 'Fifth Year' },
  { label: 'Honors Degree', value: 'Honors Degree' },
];

const COURSES = ['BBA', 'BDes', 'BTech', 'B.Tech (CSE)', 'B.Tech (Mechanical)', 'B.Tech (Civil)', 'B.Tech (Electrical)'];
const DIVISIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { verifyOTPAndSignUp, auth } = useAppContext();

  const emailFromParams = typeof params.email === 'string' ? params.email : '';
  const otpFromParams = typeof params.otp === 'string' ? params.otp : '';
  const isNewUserParam = typeof params.isNewUser === 'string' ? params.isNewUser === 'true' : false;

  // Debug logging
  useEffect(() => {
    console.log('[PROFILE] Screen mounted with params:', {
      emailFromParams,
      otpFromParams,
      isNewUserParam,
      hasEmail: !!emailFromParams,
    });
  }, [emailFromParams, otpFromParams, isNewUserParam]);

  // Initialize ALL state hooks FIRST (unconditionally)
  const [role, setRole] = useState<'driver' | 'passenger'>('passenger');
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    phone: '',
    year: '',
    course: '',
    division: '',
    appId: '',
    homeAddress: null,
  });

  // Automatically prefill fullName from email and lock it
  useEffect(() => {
    if (emailFromParams) {
      const parsedName = getNameFromEmail(emailFromParams);
      console.log('[PROFILE] Auto-fetched name from email:', parsedName);
      setFormData(prev => ({
        ...prev,
        fullName: parsedName
      }));
    }
  }, [emailFromParams]);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [showDivisionDropdown, setShowDivisionDropdown] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [dropdownPressedYear, setDropdownPressedYear] = useState(false);
  const [dropdownPressedCourse, setDropdownPressedCourse] = useState(false);
  const [dropdownPressedDivision, setDropdownPressedDivision] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Animations
  const titleFade = useRef(createFadeAnimation(0)).current;
  const formSlide = useRef(createSlideAnimation(20)).current;
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
      Animated.timing(formSlide.slideY, {
        toValue: 0,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Shake animation when error appears
  useEffect(() => {
    if (error) {
      errorShake.shake();
    }
  }, [error]);

  // Redirect if not a new user (after all hooks are initialized)
  useEffect(() => {
    // Only redirect if isNewUserParam is explicitly false (user verified but was existing)
    // If isNewUserParam is undefined/missing, it means params weren't passed correctly, so don't redirect
    if (isNewUserParam === false && emailFromParams) {
      console.log('[PROFILE] Existing user detected from params, redirecting to home');
      router.replace('/(tabs)/home');
    } else if (!isNewUserParam && !emailFromParams) {
      console.log('[PROFILE] No valid params, should not reach here - redirecting to home');
      router.replace('/(tabs)/home');
    } else {
      console.log('[PROFILE] New user params confirmed, showing profile form');
    }
  }, [isNewUserParam, emailFromParams, router]);

  // Safety check: If user is marked as new but actually exists in Firestore, redirect to home
  // This handles the case where user was incorrectly classified as new due to a bug
  useEffect(() => {
    const checkExistingUser = async () => {
      if (isNewUserParam && emailFromParams) {
        try {
          const { checkEmailExists } = await import('@/utils/otpService');
          const exists = await checkEmailExists(emailFromParams);

          if (exists) {
            console.log('[PROFILE] ⚠️ User marked as new but found in Firestore. Redirecting to home.');
            router.replace('/(tabs)/home');
          }
        } catch (error) {
          console.error('[PROFILE] Error checking if user exists:', error);
        }
      }
    };

    const timeout = setTimeout(() => {
      checkExistingUser();
    }, 500); // Add delay to let app fully initialize

    return () => clearTimeout(timeout);
  }, [isNewUserParam, emailFromParams, router]);

  // Clear loading state when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      // Prevent hardware back button only when there's nothing to go back to
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          // Check if we can actually go back
          if (navigation?.canGoBack()) {
            navigation.goBack();
            return true;
          }
          // Can't go back, prevent default
          return true;
        }
      );

      return () => {
        // Clear loading state when screen loses focus
        setIsCreatingAccount(false);
        backHandler.remove();
      };
    }, [navigation])
  );

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access gallery is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleUploadImage(result.assets[0].uri);
    }
  };

  /**
   * Upload image to Cloudinary
   */
  const handleUploadImage = async (imageUri: string) => {
    setIsUploadingImage(true);
    try {
      console.log('[PROFILE] Starting profile image upload to Cloudinary...');
      const cloudinaryUrl = await uploadImageToCloudinary(imageUri, 'profile_pictures');
      console.log('[PROFILE] Profile image uploaded successfully:', cloudinaryUrl);
      setImage(cloudinaryUrl);
    } catch (error: any) {
      console.error('[PROFILE] Failed to upload profile image:', error);
      Alert.alert(
        'Upload Failed',
        error.message || 'Failed to upload profile image. Please try again.'
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');

    // Real-time phone validation
    if (field === 'phone') {
      const cleanedPhone = value.replace(/\D/g, '');
      if (value.trim().length > 0 && cleanedPhone.length !== 10) {
        setPhoneError('Phone number must be 10 digits');
      } else {
        setPhoneError('');
      }
    }
  };

  const handleCompleteProfile = async () => {
    // Step 1: Validate form data
    if (!formData.fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    if (!formData.year) {
      setError('Please select your current year');
      return;
    }
    if (!formData.course) {
      setError('Please select your course');
      return;
    }
    if (!formData.division) {
      setError('Please select your division');
      return;
    }
    if (!formData.appId.trim()) {
      setError('Please enter your app ID');
      return;
    }
    if (!formData.homeAddress) {
      setError('What is your home address?');
      return;
    }

    // Step 2: Validate email and OTP parameters
    if (!emailFromParams || !otpFromParams) {
      setError('Invalid session. Please start signup again.');
      return;
    }

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

    setIsCreatingAccount(true);
    try {
      // Call verifyOTPAndSignUp with email, OTP, and form data
      const result = await verifyOTPAndSignUp(emailFromParams, otpFromParams, {
        email: emailFromParams,
        fullName: formData.fullName,
        phone: formData.phone,
        year: formData.year,
        course: formData.course,
        division: formData.division,
        role,
        profileImage: image || undefined, // Include uploaded image URL or undefined if no image
        homeAddress: formData.homeAddress,
      });

      console.log('[PROFILE] verifyOTPAndSignUp completed, user role:', role);
      setError('');

      // Navigate based on role - use a small delay to let loader show
      setTimeout(() => {
        if (role === 'driver') {
          console.log('[PROFILE] Navigating to license upload');
          router.push('/auth/license-upload');
        } else {
          console.log('[PROFILE] Navigating to home');
          router.replace('/(tabs)/home');
        }
        // Note: isCreatingAccount will be cleared by useFocusEffect cleanup when this screen loses focus
      }, 500);
    } catch (err: any) {
      setIsCreatingAccount(false);
      console.error('[PROFILE] verifyOTPAndSignUp failed:', err);
      // Show specific error messages
      if (err.message.includes('already registered')) {
        setError('This email is already registered. Please login instead.');
      } else if (err.message.includes('expired')) {
        setError('OTP has expired. Please go back and request a new one.');
      } else if (err.message.includes('Invalid OTP') || err.message.includes('not found')) {
        setError('Invalid OTP. Please go back and try again.');
      } else if (err.message.includes('used')) {
        setError('OTP has already been used. Request a new one.');
      } else if (err.message.includes('exceeded')) {
        setError('Too many verification attempts. Request a new OTP.');
      } else {
        setError(err.message || 'Failed to complete profile. Please try again.');
      }
    }
  };

  const isFormValid = formData.fullName.trim().length > 0 &&
    formData.phone.trim().length > 0 &&
    /^\d{10}$/.test(formData.phone.replace(/\D/g, '')) &&
    formData.year.length > 0 &&
    formData.course.length > 0 &&
    formData.division.length > 0 &&
    formData.appId.trim().length > 0 &&
    !!formData.homeAddress;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              // Always allow back navigation - back button is always enabled
              if (navigation?.canGoBack()) {
                router.back();
              }
            }}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={30}
              color={WARM_CORE.text}
            />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Setup Profile</Text>
          <View style={styles.backButton} />
        </View>

        <ProgressBar step={3} totalSteps={3} label="Almost there!" />

        {/* Profile Image Upload */}
        <View style={styles.iconContainer}>
          <Pressable
            style={styles.avatarWrapper}
            onPress={handlePickImage}
            disabled={isUploadingImage}
          >
            {image ? (
              <>
                <Image
                  source={{ uri: image }}
                  style={styles.avatarOuterRing}
                />
                <View style={styles.cameraOverlay}>
                  {isUploadingImage ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <MaterialCommunityIcons name="camera-plus" size={16} color="#FFFFFF" />
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={styles.avatarOuterRing}>
                  <View style={styles.cameraIconContainer}>
                    <MaterialCommunityIcons name="camera-plus-outline" size={40} color="#B3B3B3" />
                  </View>
                </View>
                <View style={styles.cameraOverlay}>
                  {isUploadingImage ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <MaterialCommunityIcons name="camera" size={16} color="#FFFFFF" />
                  )}
                </View>
              </>
            )}
          </Pressable>
          {isUploadingImage && (
            <Text style={styles.uploadingText}>Uploading image...</Text>
          )}
        </View>

        <View style={styles.titleContainer}>
          <Animated.Text style={[styles.title, { opacity: titleFade.opacity }]}>
            Tell us about yourself
          </Animated.Text>
          <Animated.Text
            style={[
              styles.subtitle,
              {
                opacity: titleFade.opacity,
                transform: [{ translateY: formSlide.slideY }],
              },
            ]}
          >
            Personalize your{'\n'}
            <Text style={{ fontWeight: '600', color: WARM_CORE.primary }}>PullUp! experience</Text>
          </Animated.Text>
        </View>

        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: formSlide.slideY.interpolate({
                inputRange: [0, 20],
                outputRange: [1, 0.8],
              }),
              transform: [{ translateY: formSlide.slideY }],
            },
          ]}
        >
          {/* Full Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Full Name</Text>
            <View style={[styles.inputWrapper, { backgroundColor: WARM_CORE.card, borderColor: WARM_CORE.border, opacity: 0.7 }]}>
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="account-lock-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <TextInput
                style={[styles.input, { color: WARM_CORE.textSecondary }]}
                placeholder="Your Name"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={formData.fullName}
                onChangeText={text => handleInputChange('fullName', text)}
                editable={false}
              />
            </View>
          </View>

          {/* Phone Number */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={[styles.inputWrapper, phoneError && styles.inputWrapperError]}>
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="phone-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="10-digit phone number"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={formData.phone}
                onChangeText={text => handleInputChange('phone', text)}
                keyboardType="phone-pad"
                maxLength={13}
                editable={!auth.loading}
              />
            </View>
            {phoneError && (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
                <Text style={styles.errorText}>{phoneError}</Text>
              </View>
            )}
          </View>

          {/* App ID */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>App ID</Text>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="identifier"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Your App ID"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={formData.appId}
                onChangeText={text => handleInputChange('appId', text)}
                editable={!auth.loading}
              />
            </View>
          </View>

          {/* Year Selection */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Current Year</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownWrapper,
                pressed && styles.dropdownWrapperPressed,
              ]}
              onPress={() => {
                setShowYearDropdown(!showYearDropdown);
                setShowCourseDropdown(false);
                setShowDivisionDropdown(false);
              }}
            >
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="calendar-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <Text style={[styles.dropdownText, !formData.year && styles.placeholderText]}>
                {YEARS.find(y => y.value === formData.year)?.label || 'Select Year'}
              </Text>
              <MaterialCommunityIcons
                name={showYearDropdown ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={WARM_CORE.textSecondary}
              />
            </Pressable>

            {showYearDropdown && (
              <ScrollView style={styles.dropdownMenu} nestedScrollEnabled={true}>
                {YEARS.map(year => (
                  <TouchableOpacity
                    key={year.value}
                    style={[
                      styles.dropdownItem,
                      formData.year === year.value && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      handleInputChange('year', year.value);
                      setShowYearDropdown(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        formData.year === year.value && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {year.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Course Selection */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Course / Degree</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownWrapper,
                pressed && styles.dropdownWrapperPressed,
              ]}
              onPress={() => {
                setShowCourseDropdown(!showCourseDropdown);
                setShowYearDropdown(false);
                setShowDivisionDropdown(false);
              }}
            >
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="school-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <Text style={[styles.dropdownText, !formData.course && styles.placeholderText]}>
                {formData.course || 'Select Course'}
              </Text>
              <MaterialCommunityIcons
                name={showCourseDropdown ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={WARM_CORE.textSecondary}
              />
            </Pressable>

            {showCourseDropdown && (
              <ScrollView style={styles.dropdownMenu} nestedScrollEnabled={true}>
                {COURSES.map(course => (
                  <TouchableOpacity
                    key={course}
                    style={[
                      styles.dropdownItem,
                      formData.course === course && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      handleInputChange('course', course);
                      setShowCourseDropdown(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        formData.course === course && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {course}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Division Selection */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Division / Batch</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownWrapper,
                pressed && styles.dropdownWrapperPressed,
              ]}
              onPress={() => {
                setShowDivisionDropdown(!showDivisionDropdown);
                setShowYearDropdown(false);
                setShowCourseDropdown(false);
              }}
            >
              <View style={styles.inputIcon}>
                <MaterialCommunityIcons
                  name="alpha-a-box-outline"
                  size={20}
                  color={WARM_CORE.textSecondary}
                />
              </View>
              <Text style={[styles.dropdownText, !formData.division && styles.placeholderText]}>
                {formData.division || 'Select Division'}
              </Text>
              <MaterialCommunityIcons
                name={showDivisionDropdown ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={WARM_CORE.textSecondary}
              />
            </Pressable>

            {showDivisionDropdown && (
              <ScrollView style={styles.dropdownMenu} nestedScrollEnabled={true}>
                {DIVISIONS.map(division => (
                  <TouchableOpacity
                    key={division}
                    style={[
                      styles.dropdownItem,
                      formData.division === division && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      handleInputChange('division', division);
                      setShowDivisionDropdown(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        formData.division === division && styles.dropdownItemTextSelected,
                      ]}
                    >
                      Division {division}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>What is your home address?</Text>
            <LocationSearchInput
              label=""
              value={formData.homeAddress?.address || ''}
              location={formData.homeAddress || undefined}
              placeholder="Search your home address"
              onChange={(location) => handleInputChange('homeAddress', location)}
            />
          </View>

          {/* Role Selection */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Account Type</Text>
            <View style={styles.roleSelectionContainer}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'passenger' && styles.roleButtonActive
                ]}
                onPress={() => setRole('passenger')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.roleIconBackground,
                  role === 'passenger' && styles.roleIconBackgroundActive
                ]}>
                  <MaterialCommunityIcons
                    name="briefcase"
                    size={22}
                    color={role === 'passenger' ? WARM_CORE.white : WARM_CORE.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.roleButtonText, role === 'passenger' && styles.roleButtonTextActive]}
                  >
                    Passenger
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'driver' && styles.roleButtonActive
                ]}
                onPress={() => setRole('driver')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.roleIconBackground,
                  role === 'driver' && styles.roleIconBackgroundActive
                ]}>
                  <MaterialCommunityIcons
                    name="steering"
                    size={22}
                    color={role === 'driver' ? WARM_CORE.white : WARM_CORE.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.roleButtonText, role === 'driver' && styles.roleButtonTextActive]}
                  >
                    Car Owner
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            {role === 'driver' && (
              <View style={styles.driverHint}>
                <MaterialCommunityIcons name="information-outline" size={16} color={WARM_CORE.primary} />
                <Text style={styles.driverHintText}>
                  You{"'"}ll need to upload your driving license to start posting rides
                </Text>
              </View>
            )}
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
                styles.completeButton,
                !isFormValid || isCreatingAccount ? styles.buttonDisabled : null,
              ]}
              onPress={handleCompleteProfile}
              disabled={!isFormValid || isCreatingAccount}
            >
              {isCreatingAccount ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator color={WARM_CORE.white} />
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>Complete Profile</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color={WARM_CORE.white} />
                </View>
              )}
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
    paddingHorizontal: 0,
    paddingBottom: 40,
  },
  progressContainer: {
    height: 8,
    borderRadius: 12,
    backgroundColor: WARM_CORE.card,
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
    elevation: 5,
  } as ViewStyle,
  backpackContainer: {
    position: 'relative',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  backpackBody: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: WARM_CORE.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  backpackStrap: {
    position: 'absolute',
    width: 12,
    height: 60,
    backgroundColor: WARM_CORE.border,
    borderRadius: 6,
    top: 20,
    right: 15,
  } as ViewStyle,
  cameraIconOverlay: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: WARM_CORE.card,
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 8,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  } as ViewStyle,
  titleContainer: {
    marginBottom: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
  } as ViewStyle,
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.text,
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
  formContainer: {
    marginBottom: 40,
    paddingHorizontal: 24,
  } as ViewStyle,
  fieldContainer: {
    marginBottom: 20,
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
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  inputWrapperError: {
    borderColor: WARM_CORE.error,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  } as ViewStyle,
  dropdownWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 60,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  dropdownWrapperPressed: {
    backgroundColor: WARM_CORE.border,
    borderColor: WARM_CORE.border,
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
  dropdownText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: WARM_CORE.text,
  } as TextStyle,
  placeholderText: {
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  dropdownMenu: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: WARM_CORE.card,
    maxHeight: 200,
  } as ViewStyle,
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  dropdownItemSelected: {
    backgroundColor: WARM_CORE.border,
    borderLeftWidth: 4,
    borderLeftColor: WARM_CORE.primary,
  },
  dropdownItemText: {
    fontSize: 15,
    color: WARM_CORE.text,
    fontWeight: '500',
  } as TextStyle,
  dropdownItemTextSelected: {
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
    borderRadius: 8,
  } as ViewStyle,
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.error,
    marginLeft: 8,
    flex: 1,
  } as TextStyle,
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 30,
    paddingVertical: 24,
    marginTop: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  } as ViewStyle,
  buttonDisabled: {
    backgroundColor: WARM_CORE.border,
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
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  } as ViewStyle,
  avatarWrapper: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  avatarOuterRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 6,
  },

  cameraIconContainer: {
    width: 135,
    height: 135,
    borderRadius: 67.5,
    backgroundColor: WARM_CORE.card,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,

  uploadingText: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  } as TextStyle,

  cameraOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: WARM_CORE.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  roleSelectionContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  } as ViewStyle,
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  roleButtonActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  roleIconBackground: {
    width: 40,
    height: 25,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  roleIconBackgroundActive: {
  } as ViewStyle,
  roleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  roleButtonTextActive: {
    color: WARM_CORE.white,
    fontWeight: '700',
  } as TextStyle,
  driverHint: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.06)',
  } as ViewStyle,
  driverHintText: {
    flex: 1,
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    lineHeight: 18,
  } as TextStyle,
});
