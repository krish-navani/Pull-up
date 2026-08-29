/**
 * Profile Edit Screen
 * Allows users to edit their profile information with full validation
 * and image upload functionality
 */

import { useAppContext } from '@/context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { WARM_CORE } from '@/constants/theme';
import LocationSearchInput from '@/components/LocationSearchInput';
import { uploadImageToCloudinary } from '@/utils/cloudinaryService';
import { Location as PullUpLocation } from '@/types';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageStyle,
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
  ViewStyle
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface EditableProfile {
  fullName: string;
  phone: string;
  course: string;
  year: 'First Year' | 'Second Year' | 'Third Year' | 'Fourth Year' | 'Fifth Year' | 'Honors Degree';
  division: string;
  profileImage: string | null;
  homeAddress: PullUpLocation | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

interface ValidationErrors {
  fullName?: string;
  phone?: string;
  course?: string;
  division?: string;
  homeAddress?: string;
}

const YEAR_OPTIONS = ['First Year', 'Second Year', 'Third Year', 'Fourth Year', 'Fifth Year', 'Honors Degree'] as const;
const DIVISION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, updateProfileData } = useAppContext();
  const user = auth.user;

  // State Management
  const [profile, setProfile] = useState<EditableProfile>({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    course: user?.course || '',
    year: user?.year || 'First Year',
    division: user?.division || '',
    profileImage: user?.profileImage || null,
    homeAddress: user?.homeAddress || null,
    emergencyContactName: user?.emergencyContactName || '',
    emergencyContactPhone: user?.emergencyContactPhone || '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showDivisionPicker, setShowDivisionPicker] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  /**
   * Validate profile inputs
   */
  const validateProfile = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    // Phone validation
    if (profile.phone.trim()) {
      if (!/^[6-9]\d{9}$/.test(profile.phone.replace(/\s/g, ''))) {
        newErrors.phone = 'Please enter a valid 10-digit phone number';
      }
    }

    // Course validation
    if (!profile.course.trim()) {
      newErrors.course = 'Course is required';
    } else if (profile.course.trim().length > 50) {
      newErrors.course = 'Course must not exceed 50 characters';
    }

    // Division validation
    if (!profile.division.trim()) {
      newErrors.division = 'Division is required';
    }
    if (!profile.homeAddress) {
      newErrors.homeAddress = 'Home address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [profile]);

  /**
   * Check if profile has changed
   */
  useEffect(() => {
    const hasChanged =
      profile.phone !== (user?.phone || '') ||
      profile.course !== (user?.course || '') ||
      profile.year !== (user?.year || 'First Year') ||
      profile.division !== (user?.division || '') ||
      profile.profileImage !== (user?.profileImage || null) ||
      profile.emergencyContactName !== (user?.emergencyContactName || '') ||
      profile.emergencyContactPhone !== (user?.emergencyContactPhone || '') ||
      JSON.stringify(profile.homeAddress || null) !== JSON.stringify(user?.homeAddress || null);

    setHasChanges(hasChanged);
  }, [profile, user]);

  /**
   * Handle profile image selection
   */
  const handleSelectImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfile((prev) => ({
          ...prev,
          profileImage: result.assets[0].uri,
        }));
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  }, []);

  /**
   * Handle camera image capture
   */
  const handleCaptureImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfile((prev) => ({
          ...prev,
          profileImage: result.assets[0].uri,
        }));
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      Alert.alert('Error', 'Failed to capture image. Please try again.');
    }
  }, []);

  /**
   * Show image selection options
   */
  const handleProfileImagePress = useCallback(() => {
    Alert.alert('Update Profile Picture', 'Choose how to update your profile picture', [
      {
        text: 'Camera',
        onPress: handleCaptureImage,
      },
      {
        text: 'Gallery',
        onPress: handleSelectImage,
      },
      {
        text: 'Remove',
        onPress: () =>
          setProfile((prev) => ({
            ...prev,
            profileImage: null,
          })),
        style: 'destructive' as 'default' | 'cancel' | 'destructive',
      },
      {
        text: 'Cancel',
        style: 'cancel' as 'default' | 'cancel' | 'destructive',
      },
    ]);
  }, [handleCaptureImage, handleSelectImage]);

  /**
   * Handle save profile
   */
  const handleSaveProfile = useCallback(async () => {
    if (!validateProfile()) {
      return;
    }

    if (!user) {
      Alert.alert('Error', 'User information not available');
      return;
    }

    setIsSaving(true);
    try {
      const updates: any = {
        fullName: profile.fullName.trim(),
        phone: profile.phone.trim() || undefined,
        course: profile.course.trim(),
        year: profile.year,
        division: profile.division.trim(),
        homeAddress: profile.homeAddress,
        emergencyContactName: profile.emergencyContactName?.trim() || null,
        emergencyContactPhone: profile.emergencyContactPhone?.trim() || null,
      };

      // Handle profile image changes (including removal and Cloudinary upload)
      if (profile.profileImage !== user.profileImage) {
        if (profile.profileImage && (profile.profileImage.startsWith('file://') || profile.profileImage.startsWith('content://') || profile.profileImage.startsWith('ph://'))) {
          console.log('[PROFILE EDIT] Uploading image to Cloudinary...');
          const uploadedUrl = await uploadImageToCloudinary(profile.profileImage, 'profile_pictures');
          updates.profileImage = uploadedUrl;
        } else {
          updates.profileImage = profile.profileImage;
        }
      }

      await updateProfileData(user.id, updates);

      Alert.alert('Success', 'Profile updated successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', error.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [profile, user, validateProfile, updateProfileData, router]);

  /**
   * Handle reset changes
   */
  const handleReset = useCallback(() => {
    if (!user) return;
    setProfile({
      fullName: user.fullName || '',
      phone: user.phone || '',
      course: user.course || '',
      year: user.year || 'First Year',
      division: user.division || '',
      profileImage: user.profileImage || null,
      homeAddress: user.homeAddress || null,
      emergencyContactName: user.emergencyContactName || '',
      emergencyContactPhone: user.emergencyContactPhone || '',
    });
    setErrors({});
  }, [user]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={WARM_CORE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingBottom: 0 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingBottom: insets.bottom }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={WARM_CORE.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Picture Section */}
          <View style={styles.profileImageSection}>
            <TouchableOpacity
              style={styles.profileImageContainer}
              onPress={handleProfileImagePress}
              activeOpacity={0.7}
            >
              {profile.profileImage ? (
                <Image source={{ uri: profile.profileImage }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <MaterialCommunityIcons name="account" size={48} color={WARM_CORE.textSecondary} />
                </View>
              )}
              <View style={styles.editIconOverlay}>
                <MaterialCommunityIcons name="camera" size={16} color={WARM_CORE.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.profileImageHint}>Tap to change profile picture</Text>
          </View>

          {/* Full Name Field */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="account-lock" size={18} color={WARM_CORE.textSecondary} />
              <Text style={styles.fieldLabel}>
                Full Name
                <Text style={styles.fieldLabelRequired}> (Locked)</Text>
              </Text>
            </View>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: WARM_CORE.card, borderColor: WARM_CORE.border, opacity: 0.6 }
              ]}
            >
              <TextInput
                style={[styles.input, { color: WARM_CORE.textSecondary }]}
                placeholder="Enter your full name"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={profile.fullName}
                editable={false}
              />
            </View>
          </View>

          {/* Phone Field */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="phone" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>Phone Number</Text>
            </View>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'phone' && styles.inputContainerFocused,
                errors.phone && styles.inputError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter 10-digit phone number"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={profile.phone}
                onChangeText={(text) =>
                  setProfile((prev) => ({ ...prev, phone: text.replace(/\D/g, '').slice(0, 10) }))
                }
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                keyboardType="phone-pad"
                maxLength={10}
              />
              {profile.phone.length > 0 && (
                <Text style={styles.characterCount}>{profile.phone.length}/10</Text>
              )}
            </View>
            {errors.phone && (
              <Text style={styles.errorText}>{errors.phone}</Text>
            )}
          </View>

          {/* Course Field */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="school" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>
                Course
                <Text style={styles.fieldLabelRequired}> *</Text>
              </Text>
            </View>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'course' && styles.inputContainerFocused,
                errors.course && styles.inputError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="e.g., B.Tech Computer Science"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={profile.course}
                onChangeText={(text) =>
                  setProfile((prev) => ({ ...prev, course: text.slice(0, 50) }))
                }
                onFocus={() => setFocusedField('course')}
                onBlur={() => setFocusedField(null)}
                maxLength={50}
              />
              {profile.course.length > 0 && (
                <Text style={styles.characterCount}>{profile.course.length}/50</Text>
              )}
            </View>
            {errors.course && (
              <Text style={styles.errorText}>{errors.course}</Text>
            )}
          </View>

          {/* Year Dropdown */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="calendar" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>
                Academic Year
                <Text style={styles.fieldLabelRequired}> *</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.dropdownButton,
                showYearPicker && styles.dropdownButtonFocused,
              ]}
              onPress={() => setShowYearPicker(!showYearPicker)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownButtonText}>{profile.year}</Text>
              <MaterialCommunityIcons
                name={showYearPicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={WARM_CORE.primary}
              />
            </TouchableOpacity>

            {showYearPicker && (
              <ScrollView style={[styles.dropdownOptions, { maxHeight: 200 }]} nestedScrollEnabled={true}>
                {YEAR_OPTIONS.map((year, index) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.dropdownOption,
                      profile.year === year && styles.dropdownOptionActive,
                      index === YEAR_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => {
                      setProfile((prev) => ({ ...prev, year }));
                      setShowYearPicker(false);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        profile.year === year && styles.dropdownOptionTextActive,
                      ]}
                    >
                      {year}
                    </Text>
                    {profile.year === year && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={WARM_CORE.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Division Dropdown */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="layers" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>
                Division
                <Text style={styles.fieldLabelRequired}> *</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.dropdownButton,
                showDivisionPicker && styles.dropdownButtonFocused,
              ]}
              onPress={() => setShowDivisionPicker(!showDivisionPicker)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownButtonText}>{profile.division}</Text>
              <MaterialCommunityIcons
                name={showDivisionPicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={WARM_CORE.primary}
              />
            </TouchableOpacity>

            {showDivisionPicker && (
              <ScrollView style={[styles.dropdownOptions, { maxHeight: 200 }]} nestedScrollEnabled={true}>
                {DIVISION_OPTIONS.map((division, index) => (
                  <TouchableOpacity
                    key={division}
                    style={[
                      styles.dropdownOption,
                      profile.division === division && styles.dropdownOptionActive,
                      index === DIVISION_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => {
                      setProfile((prev) => ({ ...prev, division }));
                      setShowDivisionPicker(false);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        profile.division === division && styles.dropdownOptionTextActive,
                      ]}
                    >
                      Division {division}
                    </Text>
                    {profile.division === division && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={WARM_CORE.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {errors.division && (
            <Text style={styles.errorText}>{errors.division}</Text>
          )}

          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="home-map-marker" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>
                Home Address
                <Text style={styles.fieldLabelRequired}> *</Text>
              </Text>
            </View>
            <LocationSearchInput
              label=""
              value={profile.homeAddress?.address || ''}
              location={profile.homeAddress || undefined}
              placeholder="Search your home address"
              onChange={(location) => setProfile((prev) => ({ ...prev, homeAddress: location }))}
            />
            {errors.homeAddress && (
              <Text style={styles.errorText}>{errors.homeAddress}</Text>
            )}
          </View>

          <View style={styles.divider} />
          
          <Text style={[styles.fieldLabel, { marginTop: 16, marginBottom: 8, color: WARM_CORE.primary }]}>
            Emergency Contact Information
          </Text>

          {/* Emergency Contact Name */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="account-alert" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>Contact Name</Text>
            </View>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'emergencyContactName' && styles.inputContainerFocused,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="e.g., John Doe (Parent/Guardian)"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={profile.emergencyContactName || ''}
                onChangeText={(text) =>
                  setProfile((prev) => ({ ...prev, emergencyContactName: text }))
                }
                onFocus={() => setFocusedField('emergencyContactName')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* Emergency Contact Phone */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <MaterialCommunityIcons name="phone-alert" size={18} color={WARM_CORE.primary} />
              <Text style={styles.fieldLabel}>Contact Phone</Text>
            </View>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'emergencyContactPhone' && styles.inputContainerFocused,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="e.g., 9876543210"
                placeholderTextColor={WARM_CORE.textSecondary}
                value={profile.emergencyContactPhone || ''}
                onChangeText={(text) =>
                  setProfile((prev) => ({ ...prev, emergencyContactPhone: text.replace(/\D/g, '').slice(0, 10) }))
                }
                onFocus={() => setFocusedField('emergencyContactPhone')}
                onBlur={() => setFocusedField(null)}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleReset}
              disabled={!hasChanges}
            >
              <MaterialCommunityIcons name="refresh" size={18} color={WARM_CORE.textSecondary} />
              <Text style={styles.cancelButtonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton, (!hasChanges || isSaving) && styles.buttonDisabled]}
              onPress={handleSaveProfile}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={WARM_CORE.white} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={18} color={WARM_CORE.white} />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<{
  safeArea: ViewStyle;
  container: ViewStyle;
  centerContainer: ViewStyle;
  header: ViewStyle;
  backButton: ViewStyle;
  headerTitle: TextStyle;
  content: ViewStyle;
  contentContainer: ViewStyle;
  profileImageSection: ViewStyle;
  profileImageContainer: ViewStyle;
  profileImage: ImageStyle;
  profileImagePlaceholder: ViewStyle;
  editIconOverlay: ViewStyle;
  profileImageHint: TextStyle;
  fieldSection: ViewStyle;
  fieldHeader: ViewStyle;
  fieldLabel: TextStyle;
  fieldLabelRequired: TextStyle;
  inputContainer: ViewStyle;
  inputContainerFocused: ViewStyle;
  inputError: ViewStyle;
  input: TextStyle;
  characterCount: TextStyle;
  errorText: TextStyle;
  dropdownButton: ViewStyle;
  dropdownButtonFocused: ViewStyle;
  dropdownButtonText: TextStyle;
  dropdownOptions: ViewStyle;
  dropdownOption: ViewStyle;
  dropdownOptionActive: ViewStyle;
  dropdownOptionText: TextStyle;
  dropdownOptionTextActive: TextStyle;
  actionButtons: ViewStyle;
  button: ViewStyle;
  cancelButton: ViewStyle;
  cancelButtonText: TextStyle;
  saveButton: ViewStyle;
  saveButtonText: TextStyle;
  buttonDisabled: ViewStyle;
  divider: ViewStyle;
  successIndicator: ViewStyle;
}>({
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.card,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: WARM_CORE.text,
    flex: 1,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 16,
  },

  /* Profile Image Section */
  profileImageSection: {
    alignItems: 'center',
    marginBottom: 40,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: WARM_CORE.card,
    borderWidth: 4,
    borderColor: WARM_CORE.primary,
  },
  profileImagePlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: WARM_CORE.card,
    borderWidth: 4,
    borderColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: WARM_CORE.background,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
  },
  profileImageHint: {
    fontSize: 13,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  /* Field Section */
  fieldSection: {
    marginBottom: 24,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
    letterSpacing: 0.2,
  },
  fieldLabelRequired: {
    color: WARM_CORE.primary,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputContainerFocused: {
    borderColor: WARM_CORE.primary,
    backgroundColor: WARM_CORE.card,
  },
  inputError: {
    borderColor: WARM_CORE.error,
    backgroundColor: WARM_CORE.card,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: WARM_CORE.text,
    paddingVertical: 0,
  },
  characterCount: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginLeft: 10,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: WARM_CORE.error,
    marginTop: 7,
    fontWeight: '600',
  },

  /* Dropdown */
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: WARM_CORE.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownButtonFocused: {
    borderColor: WARM_CORE.primary,
    backgroundColor: WARM_CORE.card,
  },
  dropdownButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: WARM_CORE.text,
    flex: 1,
  },
  dropdownOptions: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: WARM_CORE.border,
    marginTop: 10,
    overflow: 'hidden',
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  dropdownOptionActive: {
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },
  dropdownOptionTextActive: {
    color: WARM_CORE.primary,
    fontWeight: '700',
  },

  /* Action Buttons */
  actionButtons: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 40,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 15,
    shadowColor: WARM_CORE.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  cancelButton: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.3,
  },
  saveButton: {
    backgroundColor: WARM_CORE.primary,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginVertical: 8,
  },
  successIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: WARM_CORE.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
