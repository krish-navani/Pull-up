import { useAppContext } from '@/context/AppContext';
import {
    ANIMATION_TIMINGS,
    createFadeAnimation,
    createShakeAnimation,
    createSlideAnimation,
} from '@/utils/animationConfig';
import { refreshUserFromFirestore, updateUserProfile } from '@/utils/authService';
import { uploadImageToCloudinary } from '@/utils/cloudinaryService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    BackHandler,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';
import apiClient from '@/utils/backendApiClient';


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

export default function LicenseUploadScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { auth, updateProfileData } = useAppContext();
    
    // Debug logging
    console.log('[LICENSE-UPLOAD] Screen mounted');
    
    const [licenseImage, setLicenseImage] = useState<string | null>(null);
    const [licenseConfirmed, setLicenseConfirmed] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [licenseUploaded, setLicenseUploaded] = useState(false);
    const [isVerificationPending, setIsVerificationPending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
    const [isRejected, setIsRejected] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Animations
    const titleFade = useRef(createFadeAnimation(0)).current;
    const formSlide = useRef(createSlideAnimation(20)).current;
    const errorShake = useRef(createShakeAnimation()).current;
    const buttonScale = useRef(new Animated.Value(1)).current;
    const galleryButtonScale = useRef(new Animated.Value(1)).current;
    const cameraButtonScale = useRef(new Animated.Value(1)).current;
    const checkboxScale = useRef(new Animated.Value(1)).current;
    const imageOpacity = useRef(new Animated.Value(0)).current;

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

    // Animate image when loaded
    useEffect(() => {
        if (licenseImage) {
            Animated.timing(imageOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            imageOpacity.setValue(0);
        }
    }, [licenseImage, imageOpacity]);

    // Check current license status on mount
    useEffect(() => {
        const checkCurrentStatus = async () => {
            try {
                const freshUser = await refreshUserFromFirestore();
                if (freshUser?.licenseVerified || freshUser?.licenseVerificationStatus === 'verified') {
                    // License already verified! Update context and navigate away
                    console.log('[LICENSE] License already verified on mount - navigating to home');
                    setIsVerified(true);
                    if (updateProfileData && auth.user?.id) {
                        try {
                            await updateProfileData(auth.user.id, {
                                licenseVerified: true,
                                licenseVerificationStatus: 'verified',
                            });
                        } catch (e) {
                            console.warn('[LICENSE] Context update on mount failed:', e);
                        }
                    }
                    router.replace('/(tabs)/home');
                    return;
                }
                
                if (freshUser?.licenseVerificationStatus === 'rejected') {
                    setIsRejected(true);
                    setLicenseUploaded(false);
                    setIsVerificationPending(false);
                    setIsVerified(false);
                    setLicenseConfirmed(false);
                    setLicenseImage(null);
                    setUploadStatus('');
                    setError('');
                } else if (freshUser?.licenseVerificationStatus === 'pending' && freshUser?.licenseImageUri) {
                    // License was already submitted and is pending - resume polling state
                    console.log('[LICENSE] License already submitted, resuming pending state');
                    setLicenseUploaded(true);
                    setIsVerificationPending(true);
                    setUploadStatus('Awaiting admin verification...');
                    setLicenseConfirmed(true);
                }
            } catch (err) {
                console.error('[LICENSE] Error checking initial status:', err);
            }
        };
        
        checkCurrentStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                setIsLoading(false);
                backHandler.remove();
            };
        }, [navigation])
    );

    // Check for rejection status when auth changes
    useEffect(() => {
        if (auth.user?.licenseVerificationStatus === 'rejected') {
            setIsRejected(true);
            setLicenseUploaded(false);
            setIsVerificationPending(false);
            setIsVerified(false);
            setLicenseConfirmed(false);
            setLicenseImage(null);
            setUploadStatus('');
            setError('');
        }
    }, [auth.user?.licenseVerificationStatus]);

    // Poll for verification status every 5 seconds after upload
    useEffect(() => {
        if (licenseUploaded && isVerificationPending && !isVerified && !isRejected) {
            console.log('[LICENSE] Starting polling for verification status...');
            const interval = setInterval(async () => {
                try {
                    // refreshUserFromFirestore fetches fresh data AND updates AsyncStorage
                    const updatedUser = await refreshUserFromFirestore();
                    if (updatedUser?.licenseVerified || updatedUser?.licenseVerificationStatus === 'verified') {
                        console.log('[LICENSE] ✅ License verified by admin! Updating context...');
                        setIsVerified(true);
                        setIsVerificationPending(false);
                        setUploadStatus('License verified! Proceeding...');
                        
                        // Update the context state so the navigation guard sees the change.
                        // The navigation guard in _layout.tsx will handle the redirect to home
                        // automatically once auth.user.licenseVerified becomes true.
                        if (updateProfileData && auth.user?.id) {
                            try {
                                await updateProfileData(auth.user.id, {
                                    licenseVerified: true,
                                    licenseVerificationStatus: 'verified',
                                });
                                console.log('[LICENSE] ✅ Context updated - navigation guard will redirect to home');
                                // Navigation guard will handle redirect — no manual router.replace needed!
                            } catch (e) {
                                // If context update fails, try direct navigation as fallback
                                console.warn('[LICENSE] Context update failed, using fallback navigation:', e);
                                setTimeout(() => {
                                    router.replace('/(tabs)/home');
                                }, 1000);
                            }
                        } else {
                            // Fallback: navigate directly if context update not possible
                            console.log('[LICENSE] No updateProfileData available, using fallback navigation');
                            setTimeout(() => {
                                router.replace('/(tabs)/home');
                            }, 1000);
                        }
                    } else if (updatedUser?.licenseVerificationStatus === 'rejected') {
                        // License was rejected by admin
                        console.log('[LICENSE] ❌ License rejected by admin');
                        setIsVerificationPending(false);
                        setLicenseUploaded(false);
                        setIsRejected(true);
                        setUploadStatus('');
                    }
                } catch (err) {
                    console.error('[LICENSE] Error checking verification status:', err);
                }
            }, 5000);

            setPollInterval(interval);

            return () => {
                if (interval) clearInterval(interval);
            };
        }
    }, [licenseUploaded, isVerificationPending, isVerified, isRejected, auth.user?.id, updateProfileData]);

    const handlePickLicenseImage = async () => {
        // Button press animation
        Animated.sequence([
            Animated.timing(galleryButtonScale, {
                toValue: 0.92,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(galleryButtonScale, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
            }),
        ]).start();

        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permissionResult.granted) {
            setError('Permission to access gallery is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1.586, 1],
            quality: 0.9,
        });

        if (result && !result.canceled && result.assets?.length > 0) {
            console.log('[LICENSE] Image selected:', result.assets[0].uri);
            setLicenseImage(result.assets[0].uri);
            console.log('[LICENSE] License image state set to:', result.assets[0].uri);
            setUploadStatus('Image selected - Ready to verify');
            setError('');
        }
    };

    const handleTakeLicensePhoto = async () => {
        // Button press animation
        Animated.sequence([
            Animated.timing(cameraButtonScale, {
                toValue: 0.92,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(cameraButtonScale, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
            }),
        ]).start();

        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

        if (!permissionResult.granted) {
            setError('Permission to access camera is required!');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1.586, 1],
            quality: 0.9,
        });

        if (!result.canceled) {
            console.log('[LICENSE] Photo taken:', result.assets[0].uri);
            setLicenseImage(result.assets[0].uri);
            console.log('[LICENSE] License image state set to:', result.assets[0].uri);
            setUploadStatus('Photo captured - Ready to verify');
            setError('');
        }
    };

    const handleVerifyLicense = async () => {
        // If already uploaded and verification is pending, just show waiting state
        if (licenseUploaded && isVerificationPending) {
            setError('');
            return;
        }

        // First time verification submission
        if (!licenseImage) {
            setError('Please upload your driving license');
            return;
        }
        if (!licenseConfirmed) {
            setError('Please confirm that you hold a valid Indian driving license');
            return;
        }

        if (!auth.user?.id) {
            setError('User not authenticated. Please login again.');
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

        setIsLoading(true);
        setUploadStatus('Uploading license...');
        try {
            // Upload image to Cloudinary
            console.log('[LICENSE] Starting Cloudinary upload...');
            const licenseImageUrl = await uploadImageToCloudinary(licenseImage, 'driver_licenses');
            console.log('[LICENSE] Image uploaded to Cloudinary:', licenseImageUrl);
            
            setUploadStatus('Submitting for verification...');
            
            // Update user profile with license image URL and set licenseVerified to false
            await updateProfileData(auth.user.id, {
                licenseImageUri: licenseImageUrl,
                licenseVerified: false,
                licenseVerificationStatus: 'pending',
                licenseUploadedAt: new Date().toISOString(),
                licenseConfirmed: true,
                role: 'driver',
            });
            
            console.log('[LICENSE] Profile updated with pending verification');
            
            // Mark as uploaded and waiting for verification
            setLicenseUploaded(true);
            setIsVerificationPending(true);
            setUploadStatus('Awaiting admin verification...');
            setError('');
            setIsLoading(false);
            
            // Disable upload buttons
            setLicenseImage(null);
            
            // Show verification success modal
            setShowSuccessModal(true);

            // Notify admin — fire and forget, never block the user
            apiClient.post('/notify-license-submission', {
              userId: auth.user.id,
              userName: auth.user.fullName || null,
              userEmail: auth.user.email || null,
              licenseImageUrl,
            }).catch((notifyErr: any) => {
              console.warn('[LICENSE] Admin notification failed (non-fatal):', notifyErr?.message);
            });

        } catch (err: any) {
            console.error('[LICENSE] Upload error:', err);
            setError(err.message || 'Failed to submit license. Please try again.');
            setIsLoading(false);
            setUploadStatus('');
            setLicenseUploaded(false);
        }
    };

    const isFormValid = licenseImage && licenseConfirmed && !licenseUploaded;
    const isVerifyButtonDisabled = isLoading || (licenseUploaded && isVerificationPending && !isVerified);

    const handleReapply = () => {
        // Reset rejection state and allow user to reupload
        setIsRejected(false);
        setLicenseImage(null);
        setLicenseConfirmed(false);
        setError('');
        setUploadStatus('');
        setIsLoading(false);
        
        // Reset the verification status in Firestore back to pending if needed
        // This is handled by resubmitting through handleVerifyLicense
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
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
                    <Text style={styles.screenTitle}>Car Owner License</Text>
                    <View style={styles.backButton} />
                </View>

                <ProgressBar step={4} totalSteps={4} label="Let's do this!" />

                {/* Icon Section */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconSquare}>
                        <MaterialCommunityIcons name="card-account-details-outline" size={40} color={WARM_CORE.primary} />
                    </View>
                </View>

                <View style={styles.titleContainer}>
                    <Animated.Text style={[styles.title, { opacity: titleFade.opacity }]}>
                        Upload Your License
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
                        Complete your profile by uploading your{'\n'}
                        driving license to start posting rides.
                    </Animated.Text>
                </View>

                {/* License Rejection Alert */}
                {isRejected && (
                    <Animated.View
                        style={[
                            styles.rejectionAlertContainer,
                        ]}
                    >
                        <View style={styles.rejectionAlert}>
                            <View style={styles.rejectionIconBg}>
                                <MaterialCommunityIcons name="close-circle" size={28} color="#FFFFFF" />
                            </View>
                            <View style={styles.rejectionContent}>
                                <Text style={styles.rejectionTitle}>Verification Unsuccessful</Text>
                                <Text style={styles.rejectionMessage}>
                                    Please upload a clearer photo of your license. Ensure the text is fully visible and readable.
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={styles.reapplyButton}
                            onPress={handleReapply}
                        >
                            <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
                            <Text style={styles.reapplyButtonText}>Reapply</Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {!isRejected && (
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
                    {/* License Upload Section */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Driving License Photo</Text>

                        {licenseImage ? (
                            <Animated.View style={[styles.licensePreviewContainer, { opacity: imageOpacity }]}>
                                <Image
                                    source={{ uri: licenseImage }}
                                    style={styles.licensePreview}
                                    resizeMode="cover"
                                />
                                <View style={styles.imageOverlay}>
                                    <View style={styles.statusBadge}>
                                        <MaterialCommunityIcons name="check-circle" size={16} color="#FFFFFF" />
                                        <Text style={styles.statusBadgeText}>Ready to verify</Text>
                                    </View>
                                </View>
                            </Animated.View>
                        ) : licenseUploaded ? (
                            <View style={styles.uploadPlaceholder}>
                                <MaterialCommunityIcons name="cloud-check" size={40} color={WARM_CORE.primary} />
                                <Text style={styles.uploadPlaceholderText}>License submitted</Text>
                                <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
                            </View>
                        ) : (
                            <View style={styles.uploadPlaceholder}>
                                <MaterialCommunityIcons name="camera-enhance-outline" size={40} color={WARM_CORE.textSecondary} />
                                <Text style={styles.uploadPlaceholderText}>No image selected</Text>
                            </View>
                        )}

                        <View style={styles.uploadButtonsRow}>
                            <Animated.View style={{ flex: 1, transform: [{ scale: galleryButtonScale }] }}>
                                <TouchableOpacity
                                    style={[
                                        styles.uploadButton,
                                        licenseUploaded && styles.uploadButtonDisabled
                                    ]}
                                    onPress={handlePickLicenseImage}
                                    disabled={licenseUploaded || isLoading}
                                >
                                    <MaterialCommunityIcons 
                                        name="folder-outline" 
                                        size={20} 
                                        color={licenseUploaded ? WARM_CORE.textSecondary : WARM_CORE.primary} 
                                    />
                                    <Text style={[
                                        styles.uploadButtonText,
                                        licenseUploaded && { color: WARM_CORE.textSecondary }
                                    ]}>Gallery</Text>
                                </TouchableOpacity>
                            </Animated.View>

                            <Animated.View style={{ flex: 1, transform: [{ scale: cameraButtonScale }] }}>
                                <TouchableOpacity
                                    style={[
                                        styles.uploadButton,
                                        licenseUploaded && styles.uploadButtonDisabled
                                    ]}
                                    onPress={handleTakeLicensePhoto}
                                    disabled={licenseUploaded || isLoading}
                                >
                                    <MaterialCommunityIcons 
                                        name="camera-outline" 
                                        size={20} 
                                        color={licenseUploaded ? WARM_CORE.textSecondary : WARM_CORE.primary} 
                                    />
                                    <Text style={[
                                        styles.uploadButtonText,
                                        licenseUploaded && { color: WARM_CORE.textSecondary }
                                    ]}>Camera</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                        <View style={styles.uploadHint}>
                            <MaterialCommunityIcons name="information-outline" size={16} color={WARM_CORE.primary} />
                            <Text style={styles.uploadHintText}>
                                Make sure the license is clearly visible and readable
                            </Text>
                        </View>
                    </View>

                    {/* Confirmation Checkbox */}
                    <View style={styles.fieldContainer}>
                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() => {
                                if (!licenseUploaded) {
                                    Animated.sequence([
                                        Animated.timing(checkboxScale, {
                                            toValue: 0.8,
                                            duration: 80,
                                            useNativeDriver: true,
                                        }),
                                        Animated.timing(checkboxScale, {
                                            toValue: 1,
                                            duration: 80,
                                            useNativeDriver: true,
                                        }),
                                    ]).start();
                                    setLicenseConfirmed(!licenseConfirmed);
                                    if (error) setError('');
                                }
                            }}
                            activeOpacity={licenseUploaded ? 1 : 0.7}
                            disabled={licenseUploaded}
                        >
                            <Animated.View style={{ transform: [{ scale: checkboxScale }] }}>
                                <View style={[
                                    styles.checkbox,
                                    licenseConfirmed && styles.checkboxChecked,
                                    licenseUploaded && styles.checkboxDisabled
                                ]}>
                                    {licenseConfirmed && (
                                        <MaterialCommunityIcons name="check" size={16} color={WARM_CORE.white} />
                                    )}
                                </View>
                            </Animated.View>
                            <Text style={[
                                styles.checkboxLabel,
                                licenseUploaded && { color: WARM_CORE.textSecondary }
                            ]}>
                                I confirm I hold a valid Indian driving license
                            </Text>
                        </TouchableOpacity>
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
                                styles.submitButton,
                                isVerifyButtonDisabled ? styles.buttonDisabled : null,
                                isVerified && styles.buttonVerified
                            ]}
                            onPress={handleVerifyLicense}
                            disabled={isVerifyButtonDisabled}
                        >
                            {isLoading ? (
                                <View style={styles.buttonContent}>
                                    <ActivityIndicator color={WARM_CORE.white} />
                                </View>
                            ) : isVerified ? (
                                <View style={styles.buttonContent}>
                                    <Text style={styles.buttonText}>Proceed to PullUp ✓</Text>
                                    <MaterialCommunityIcons name="arrow-right" size={20} color={WARM_CORE.white} />
                                </View>
                            ) : isVerificationPending ? (
                                <View style={styles.buttonContent}>
                                    <ActivityIndicator color={WARM_CORE.white} size="small" />
                                    <Text style={styles.buttonText}>Verifying...</Text>
                                </View>
                            ) : (
                                <View style={styles.buttonContent}>
                                    <Text style={styles.buttonText}>Verify License</Text>
                                    <MaterialCommunityIcons name="check-circle-outline" size={20} color={WARM_CORE.white} />
                                </View>
                            )}
                        </TouchableOpacity>
                    </Animated.View>

                    <Text style={styles.disclaimerText}>
                        {isVerificationPending 
                            ? 'Your license is currently under verification by our admin team. This process may take up to 24 hours. Please wait...'
                            : 'Your license information is secure and encrypted. We never share your personal data.'}
                    </Text>
                </Animated.View>
                )}
            </ScrollView>

            {isVerificationPending && (
                <TouchableOpacity
                    style={styles.exploreButton}
                    onPress={() => router.replace('/(tabs)/home')}
                >
                    <Text style={styles.exploreButtonText}>Continue to App</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color={WARM_CORE.primary} />
                </TouchableOpacity>
            )}

            {showSuccessModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalIconContainer}>
                            <MaterialCommunityIcons name="file-document-check-outline" size={44} color={WARM_CORE.primary} />
                        </View>
                        <Text style={styles.modalTitle}>License Submitted!</Text>
                        <Text style={styles.modalText}>
                            Your driving license has been uploaded successfully and is currently under review by our administration team.
                            {"\n\n"}
                            In the meantime, you can explore the app and coordinate rides. We will notify you immediately once your account is fully verified.
                        </Text>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={() => {
                                setShowSuccessModal(false);
                                router.replace('/(tabs)/home');
                            }}
                        >
                            <Text style={styles.modalButtonText}>Continue to App</Text>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.white} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
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
        shadowOpacity: 0.04,
        shadowRadius: 12,
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
        textAlign: 'center',
    } as TextStyle,
    formContainer: {
        paddingHorizontal: 24,
    } as ViewStyle,
    fieldContainer: {
        marginBottom: 14,
    } as ViewStyle,
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: WARM_CORE.textSecondary,
        marginBottom: 12,
    } as TextStyle,
    licensePreviewContainer: {
        position: 'relative',
        width: '100%',
        height: 240,
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: WARM_CORE.card,
        borderWidth: 1,
        borderColor: WARM_CORE.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 6,
    } as ViewStyle,
    licensePreview: {
        width: '100%',
        height: '100%',
    } as any,
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: 'rgba(30, 18, 13, 0.6)',
        alignItems: 'center',
    } as ViewStyle,
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: WARM_CORE.success,
        shadowColor: WARM_CORE.success,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    } as ViewStyle,
    statusBadgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: WARM_CORE.white,
        letterSpacing: 0.2,
    } as TextStyle,
    removeButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(30, 18, 13, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    } as ViewStyle,
    uploadPlaceholder: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: WARM_CORE.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        backgroundColor: WARM_CORE.card,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 3,
    } as ViewStyle,
    uploadPlaceholderText: {
        fontSize: 15,
        fontWeight: '600',
        color: WARM_CORE.textSecondary,
        marginTop: 12,
    } as TextStyle,
    uploadButtonsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    } as ViewStyle,
    uploadButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: WARM_CORE.card,
        borderWidth: 1,
        borderColor: WARM_CORE.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 6,
        elevation: 2,
    } as ViewStyle,
    uploadButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: WARM_CORE.primary,
        letterSpacing: 0.2,
    } as TextStyle,
    uploadHint: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(212, 80, 10, 0.06)',
    } as ViewStyle,
    uploadHintText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
        color: WARM_CORE.textSecondary,
        lineHeight: 19,
    } as TextStyle,
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
    } as ViewStyle,
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: WARM_CORE.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    } as ViewStyle,
    checkboxChecked: {
        backgroundColor: WARM_CORE.primary,
        borderColor: WARM_CORE.primary,
    } as ViewStyle,
    checkboxDisabled: {
        opacity: 0.5,
        borderColor: WARM_CORE.border,
    } as ViewStyle,
    checkboxLabel: {
        flex: 1,
        fontSize: 15,
        color: WARM_CORE.text,
        fontWeight: '500',
        lineHeight: 21,
        letterSpacing: 0.1,
    } as TextStyle,
    uploadButtonDisabled: {
        opacity: 0.5,
    } as ViewStyle,
    verificationNotice: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        borderRadius: 14,
        backgroundColor: WARM_CORE.card,
        borderWidth: 1,
        borderColor: WARM_CORE.border,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 6,
        elevation: 2,
    } as ViewStyle,
    verificationNoticePending: {
        borderColor: WARM_CORE.accent,
        backgroundColor: 'rgba(255, 122, 51, 0.05)',
    } as ViewStyle,
    verificationNoticeVerified: {
        borderColor: WARM_CORE.success,
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
    } as ViewStyle,
    verificationContent: {
        flex: 1,
    } as ViewStyle,
    verificationTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: WARM_CORE.success,
        marginBottom: 6,
        letterSpacing: 0.2,
    } as TextStyle,
    verificationText: {
        fontSize: 13,
        color: WARM_CORE.textSecondary,
        lineHeight: 19,
        fontWeight: '500',
    } as TextStyle,
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.04)',
        borderLeftWidth: 3,
        borderLeftColor: WARM_CORE.error,
        marginBottom: 16,
    } as ViewStyle,
    errorText: {
        flex: 1,
        fontSize: 13,
        color: WARM_CORE.error,
        fontWeight: '600',
        lineHeight: 19,
    } as TextStyle,
    submitButton: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 14,
        backgroundColor: WARM_CORE.primary,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 14,
        elevation: 6,
    } as ViewStyle,
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    } as ViewStyle,
    buttonDisabled: {
        backgroundColor: WARM_CORE.border,
        opacity: 0.7,
    } as ViewStyle,
    buttonVerified: {
        backgroundColor: WARM_CORE.success,
    } as ViewStyle,
    buttonText: {
        fontSize: 17,
        fontWeight: '800',
        color: WARM_CORE.white,
        letterSpacing: 0.4,
    } as TextStyle,
    disclaimerText: {
        fontSize: 12,
        color: WARM_CORE.textSecondary,
        textAlign: 'center',
        lineHeight: 18,
        fontWeight: '500',
    } as TextStyle,
    uploadStatusText: {
        fontSize: 13,
        color: WARM_CORE.primary,
        marginTop: 6,
        fontWeight: '600',
        letterSpacing: 0.2,
    } as TextStyle,
    rejectionAlertContainer: {
        paddingHorizontal: 24,
        marginBottom: 32,
        gap: 14,
    } as ViewStyle,
    rejectionAlert: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: WARM_CORE.card,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: WARM_CORE.error,
        paddingVertical: 18,
        paddingHorizontal: 16,
        gap: 14,
    } as ViewStyle,
    rejectionIconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: WARM_CORE.error,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    } as ViewStyle,
    rejectionContent: {
        flex: 1,
        gap: 5,
    } as ViewStyle,
    rejectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: WARM_CORE.text,
        letterSpacing: 0.3,
    } as TextStyle,
    rejectionMessage: {
        fontSize: 13,
        fontWeight: '500',
        color: WARM_CORE.textSecondary,
        lineHeight: 19,
    } as TextStyle,
    reapplyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        backgroundColor: WARM_CORE.error,
    } as ViewStyle,
    reapplyButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: WARM_CORE.white,
    } as TextStyle,
    exploreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: WARM_CORE.primary,
        marginTop: 16,
        marginHorizontal: 24,
        marginBottom: 8,
    } as ViewStyle,
    exploreButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: WARM_CORE.primary,
    } as TextStyle,
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(30, 18, 13, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100000,
    } as ViewStyle,
    modalContent: {
        backgroundColor: WARM_CORE.background,
        borderRadius: 24,
        padding: 30,
        width: '85%',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: WARM_CORE.border,
        shadowColor: WARM_CORE.text,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 10,
    } as ViewStyle,
    modalIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: WARM_CORE.card,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    } as ViewStyle,
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: WARM_CORE.text,
        marginBottom: 12,
        textAlign: 'center',
    } as TextStyle,
    modalText: {
        fontSize: 13.5,
        color: WARM_CORE.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 26,
    } as TextStyle,
    modalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: WARM_CORE.primary,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
    } as ViewStyle,
    modalButtonText: {
        color: WARM_CORE.white,
        fontSize: 15,
        fontWeight: '700',
        marginRight: 6,
    } as TextStyle,
});

