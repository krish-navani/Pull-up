import { Location as LocationType } from '@/types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native';
import LocationPickerModal from './LocationPickerModal';

interface LocationSearchInputProps {
  label: string;
  value: string;
  onChange: (location: LocationType) => void;
  onAddressChange?: (address: string) => void;
  placeholder?: string;
  error?: string;
  Icon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  isAtlasLocation?: boolean;
  readOnly?: boolean;
}

export default function LocationSearchInput({
  label,
  value,
  onChange,
  onAddressChange,
  placeholder = 'Search location...',
  error,
  Icon,
  containerStyle,
  inputStyle,
  isAtlasLocation = false,
  readOnly = false,
}: LocationSearchInputProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationType | undefined>();
  const [isPressed, setIsPressed] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const [modalError, setModalError] = useState<string | null>(null);

  const handleOpenModal = () => {
    try {
      console.log('[LOCATION SEARCH] Opening location picker modal');
      setShowModal(true);
      setModalError(null);
    } catch (error) {
      console.error('[LOCATION SEARCH] Error opening modal:', error);
      setModalError('Failed to open location picker');
    }
  };

  const handleCloseModal = () => {
    try {
      setShowModal(false);
    } catch (error) {
      console.error('[LOCATION SEARCH] Error closing modal:', error);
    }
  };

  const handleLocationSelect = (location: LocationType) => {
    setSelectedLocation(location);
    onAddressChange?.(location.address);
    onChange(location);
    setShowModal(false);
  };

  const handlePressIn = () => {
    if (readOnly) return;
    setIsPressed(true);
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (readOnly) return;
    setIsPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
    handleOpenModal();
  };

  const isSelected = !!selectedLocation && value;

  return (
    <>
      <View style={[styles.container, containerStyle]}>
        {/* Label with icon */}
        <View style={styles.labelSection}>
          <View style={styles.labelContainer}>
            <View style={styles.iconDot} />
            <Text style={styles.label}>{label.toUpperCase()}</Text>
          </View>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#22C55E" />
              <Text style={styles.selectedText}>Selected</Text>
            </View>
          )}
          {isAtlasLocation && (
            <View style={styles.atlasBadge}>
              <MaterialCommunityIcons name="school" size={12} color="#FFFFFF" />
              <Text style={styles.atlasBadgeText}>Atlas Default</Text>
            </View>
          )}
        </View>

        {/* Main Input Box */}
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
          <Pressable
            style={[
              styles.inputWrapper,
              error && styles.inputWrapperError,
              isSelected && styles.inputWrapperSelected,
              isPressed && styles.inputWrapperPressed,
              readOnly && styles.inputWrapperReadOnly,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={readOnly}
          >
            <View style={styles.inputContent}>
              {/* Icon */}
              <View
                style={[
                  styles.iconContainer,
                  isSelected && styles.iconContainerActive,
                ]}
              >
                {Icon ? (
                  <View style={styles.customIcon}>{Icon}</View>
                ) : (
                  <MaterialCommunityIcons
                    name={isSelected ? 'map-marker-check' : 'map-marker'}
                    size={18}
                    color={isSelected ? '#22C55E' : '#FFFFFF'}
                  />
                )}
              </View>

              {/* Text Section */}
              <View style={styles.textSection}>
                <View style={styles.addressContainer}>
                  {value ? (
                    <Text style={styles.addressText} numberOfLines={2}>
                      {value}
                    </Text>
                  ) : (
                    <Text style={styles.placeholderText}>{placeholder}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Action Icon */}
            <View style={styles.actionIconContainer}>
              <MaterialCommunityIcons
                name={isSelected ? 'map-search' : 'chevron-right'}
                size={20}
                color={error ? '#FF6B35' : isSelected ? '#22C55E' : '#8A8A8A'}
              />
            </View>
          </Pressable>
        </Animated.View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Modal */}
      <LocationPickerModal
        visible={showModal}
        onConfirm={handleLocationSelect}
        onCancel={handleCloseModal}
        initialLocation={selectedLocation}
        title={`Select ${label}`}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },

  /* LABEL SECTION */
  labelSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8A8A8A',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A8A8A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 20,
  },
  selectedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#22C55E',
    letterSpacing: 0.2,
  },

  // ATLAS BADGE
  atlasBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 12,
  },
  atlasBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.3,
  },

  /* INPUT WRAPPER */
  inputWrapper: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  inputWrapperError: {
    borderColor: '#FF6B35',
    backgroundColor: '#1E1E1E',
  },
  inputWrapperSelected: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  inputWrapperPressed: {
    backgroundColor: '#252525',
  },

  inputWrapperReadOnly: {
    opacity: 0.7,
    backgroundColor: '#1A1A1A',
    borderColor: '#3B82F6',
    borderWidth: 2,
  },

  /* ICON STYLES */
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#2A3A3A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  customIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* TEXT SECTION */
  inputContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textSection: {
    flex: 1,
    justifyContent: 'center',
  },
  addressContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  addressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8A8A8A',
  },

  /* ACTION ICON */
  actionIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ERROR */
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },
});
