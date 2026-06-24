import { Location as LocationType } from '@/types';
import { calculateDistance, getCurrentLocation, getLocationSuggestionsWithCoords, getReverseGeocodeAddress } from '@/utils/locationUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WARM_CORE } from '@/constants/theme';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LocationPickerModalProps {
  visible: boolean;
  onConfirm: (location: LocationType) => void;
  onCancel: () => void;
  initialLocation?: LocationType;
  title?: string;
}

export default function LocationPickerModal({
  visible,
  onConfirm,
  onCancel,
  initialLocation,
  title = 'Select Location',
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const searchTimeoutRef = useRef<any>(null);
  const searchIdRef = useRef<number>(0);
  const regionChangeIdRef = useRef<number>(0);
  const programmaticMoveRef = useRef<boolean>(false);
  const [markerLocation, setMarkerLocation] = useState<LocationType>(
    initialLocation || {
      latitude: 19.0176,
      longitude: 72.8479,
      address: 'Mumbai, India',
      city: 'Mumbai',
    }
  );
  const [address, setAddress] = useState(initialLocation?.address || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapProvider, setMapProvider] = useState<'google' | 'default'>('google');
  const [mapInitialized, setMapInitialized] = useState(false);

  const [recentSearches, setRecentSearches] = useState<LocationType[]>([]);

  useEffect(() => {
    setMarkerLocation(
      initialLocation || {
        latitude: 19.0176,
        longitude: 72.8479,
        address: 'Mumbai, India',
        city: 'Mumbai',
      }
    );
    setAddress(initialLocation?.address || '');
  }, [initialLocation, visible]);

  // Load recent searches when modal is visible
  useEffect(() => {
    if (visible) {
      const loadRecentSearches = async () => {
        try {
          const stored = await AsyncStorage.getItem('pullup_recent_searches');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setRecentSearches(parsed);
            }
          }
        } catch (error) {
          console.warn('[LOCATION PICKER] Failed to load recent searches:', error);
        }
      };
      loadRecentSearches();
    }
  }, [visible]);

  // Get current location on mount
  useEffect(() => {
    const fetchCurrentLocation = async () => {
      try {
        const loc = await getCurrentLocation();
        if (loc && loc.latitude && loc.longitude && !isNaN(loc.latitude) && !isNaN(loc.longitude)) {
          setCurrentLocation(loc);
        }
      } catch (error) {
        console.warn('[LOCATION PICKER] Could not fetch current location on mount:', error);
      }
    };
    fetchCurrentLocation();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleMapPress = async (e: any) => {
    // Close suggestions if they're open
    setShowSuggestions(false);
  };

  const handleMapError = (error: any) => {
    console.error('[LOCATION PICKER] MapView Error Details:', {
      error,
      errorMessage: error?.message,
      errorCode: error?.code,
      provider: mapProvider,
      platform: Platform.OS,
    });
    
    // If Google provider fails, try default provider
    if (mapProvider === 'google') {
      console.warn('[LOCATION PICKER] Google Maps provider failed, switching to default provider');
      setMapProvider('default');
      setMapError(null);
      return;
    }
    
    setMapError(`Map failed to load: ${error?.message || 'Unknown error'}. Using offline mode.`);
  };

  const handleMapReady = () => {
    console.log('[LOCATION PICKER] Map initialized successfully with provider:', mapProvider);
    setMapError(null);
    setMapInitialized(true);
  };

  const handleRegionChangeComplete = async (region: any, details?: any) => {
    // If this region change was caused by our code selecting a suggestion or current location, skip reverse geocoding
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false;
      return;
    }
    
    // Check for user gesture (if details object is provided by the map, mostly reliable on iOS)
    if (details && details.isGesture === false) {
      return; 
    }

    // Update marker location when map region changes
    const currentRegionId = ++regionChangeIdRef.current;
    
    try {
      if (!region) {
        console.warn('[LOCATION PICKER] Region is null');
        return;
      }

      const { latitude, longitude } = region;
      
      if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
        console.warn('[LOCATION PICKER] Coordinates are null/undefined:', { latitude, longitude });
        return;
      }

      if (isNaN(latitude) || isNaN(longitude)) {
        console.warn('[LOCATION PICKER] Invalid coordinates received:', { latitude, longitude });
        return;
      }

      const reverseAddress = await getReverseGeocodeAddress(latitude, longitude);
      
      // Prevent race conditions: only update if this is the most recent region change
      if (currentRegionId === regionChangeIdRef.current) {
        setMarkerLocation({
          latitude,
          longitude,
          address: reverseAddress,
          city: 'Mumbai',
        });
        setAddress(reverseAddress);
      }
    } catch (error) {
      console.error('[LOCATION PICKER] Error updating location from map region:', error);
      // Don't crash, just log the error
    }
  };

  const handleMarkerDragEnd = async (e: any) => {
    // Not used with fixed center marker, but kept for compatibility
    try {
      if (!e || !e.nativeEvent || !e.nativeEvent.coordinate) {
        console.warn('[LOCATION PICKER] Invalid drag event:', e);
        return;
      }

      const { latitude, longitude } = e.nativeEvent.coordinate;

      if (
        !latitude ||
        !longitude ||
        isNaN(latitude) ||
        isNaN(longitude) ||
        latitude === undefined ||
        longitude === undefined
      ) {
        console.warn('[LOCATION PICKER] Invalid marker coordinates from drag:', { latitude, longitude });
        return;
      }

      const reverseAddress = await getReverseGeocodeAddress(latitude, longitude);
      setMarkerLocation({
        latitude,
        longitude,
        address: reverseAddress,
        city: 'Mumbai',
      });
      setAddress(reverseAddress);
    } catch (error) {
      console.error('[LOCATION PICKER] Error handling marker drag:', error);
    }
  };

  const handleSearchChange = async (text: string) => {
    setSearchQuery(text);

    if (!text.trim()) {
      setSuggestions([]);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Require minimum 2 characters for real-world search
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    
    // Debounce search requests (300ms) to avoid too many API calls
    searchTimeoutRef.current = setTimeout(async () => {
      const currentSearchId = ++searchIdRef.current;
      try {
        // Fetch real-world location suggestions from Nominatim API
        const results = await getLocationSuggestionsWithCoords(text);
        
        if (currentSearchId !== searchIdRef.current) return;
        
        if (!results || !Array.isArray(results)) {
          console.warn('[LOCATION PICKER] Invalid results from getLocationSuggestionsWithCoords');
          setSuggestions([]);
          setIsSearching(false);
          return;
        }
        
        setSuggestions(results);
      } catch (error) {
        if (currentSearchId !== searchIdRef.current) return;
        console.error('[LOCATION PICKER] Error searching locations:', error);
        setSuggestions([]);
      } finally {
        if (currentSearchId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: any) => {
    try {
      if (!suggestion) return;

      if (suggestion.type === 'current_location') {
        setShowSuggestions(false);
        setIsSearching(true);
        const location = await getCurrentLocation();
        setIsSearching(false);
        if (location && location.latitude && location.longitude) {
          setMarkerLocation(location);
          setAddress(location.address || '');
          setSearchQuery(location.address || '');
          programmaticMoveRef.current = true;
          if (mapRef.current) {
            try {
              mapRef.current.animateToRegion(
                {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                },
                500
              );
            } catch (mapError) {
              console.warn('[LOCATION PICKER] Map animation error:', mapError);
            }
          }
        } else {
          Alert.alert('Location Error', 'Could not fetch your current location. Please make sure location services are enabled.');
        }
        return;
        setShowSuggestions(false);
        return;
      }

      if (suggestion.type === 'recent_search') {
        setShowSuggestions(false);
        const finalLoc = {
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
          address: suggestion.address,
          city: suggestion.city || 'Mumbai',
          placeId: suggestion.placeId,
        };
        setMarkerLocation(finalLoc);
        setAddress(suggestion.address);
        setSearchQuery(suggestion.address);
        programmaticMoveRef.current = true;
        if (mapRef.current) {
          try {
            mapRef.current.animateToRegion(
              {
                latitude: suggestion.latitude,
                longitude: suggestion.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              },
              500
            );
          } catch (mapError) {
            console.warn('[LOCATION PICKER] Map animation error:', mapError);
          }
        }
        return;
      }

      if (!suggestion.latitude || !suggestion.longitude) {
        console.warn('[LOCATION PICKER] Invalid suggestion:', suggestion);
        return;
      }

      setShowSuggestions(false);

      const displayName = suggestion.mainText || suggestion.displayName;

      // Update marker location with the selected place
      setMarkerLocation({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        address: displayName,
        city: 'Mumbai',
        placeId: suggestion.placeId,
      });
      setAddress(displayName);
      setSearchQuery(displayName);
      programmaticMoveRef.current = true;

      // Animate map to the selected location
      if (mapRef.current) {
        try {
          mapRef.current.animateToRegion(
            {
              latitude: suggestion.latitude,
              longitude: suggestion.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            500
          );
        } catch (mapError) {
          console.warn('[LOCATION PICKER] Map animation error (not critical):', mapError);
        }
      }
    } catch (error) {
      console.error('[LOCATION PICKER] Error selecting suggestion:', error);
    }
  };

  const handleCurrentLocation = async () => {
    try {
      const location = await getCurrentLocation();
      if (location && location.latitude && location.longitude) {
        setMarkerLocation(location);
        setAddress(location.address || '');
        programmaticMoveRef.current = true;
        if (mapRef.current) {
          try {
            mapRef.current.animateToRegion(
              {
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              },
              500
            );
          } catch (mapError) {
            console.warn('[LOCATION PICKER] Map animation error (not critical):', mapError);
          }
        }
      } else {
        console.warn('[LOCATION PICKER] Could not get current location');
      }
    } catch (error) {
      console.error('[LOCATION PICKER] Error getting current location:', error);
    }
  };

  const handleConfirm = async () => {
    const finalLocation = {
      ...markerLocation,
      address: address || markerLocation.address,
    };

    try {
      const stored = await AsyncStorage.getItem('pullup_recent_searches');
      let currentList = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(currentList)) {
        currentList = [];
      }
      currentList = currentList.filter((item: any) => {
        const matchesAddress = item.address === finalLocation.address;
        const matchesCoords = Math.abs(item.latitude - finalLocation.latitude) < 0.0001 && 
                              Math.abs(item.longitude - finalLocation.longitude) < 0.0001;
        const matchesPlaceId = item.placeId && finalLocation.placeId && item.placeId === finalLocation.placeId;
        return !matchesAddress && !matchesCoords && !matchesPlaceId;
      });
      currentList.unshift(finalLocation);
      const limitedList = currentList.slice(0, 5);
      await AsyncStorage.setItem('pullup_recent_searches', JSON.stringify(limitedList));
    } catch (error) {
      console.warn('[LOCATION PICKER] Failed to save recent search:', error);
    }

    onConfirm(finalLocation);
  };

  const darkMapStyle = [
    {
    elementType: "geometry",
    stylers: [{ color: "#0B1220" }] // richer than #0F0F0F
  },

  // Labels (clean + readable)
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#94A3B8" }] // softer than #9CA3AF
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#020617" }]
  },

  // Roads
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1E293B" }] // cooler card tone
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#334155" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#475569" }] // slightly highlighted
  },

  // Water (deep navy instead of black)
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#020617" }]
  },

  // Parks (very subtle green-blue)
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0B1A2A" }]
  },

  // Remove clutter
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }]
  }
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView 
        style={[styles.container]} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header with Search */}
        <View style={styles.headerSection}>
          {/* Top bar with close button and title */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Modern Search Bar */}
          <View style={styles.searchSection}>
            <View style={styles.searchBody}>
              <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search locations..."
                placeholderTextColor="#6B7280"
                value={searchQuery}
                onChangeText={handleSearchChange}
                onFocus={() => setShowSuggestions(true)}
              />
              {searchQuery && (
                <TouchableOpacity
                  onPress={() => { setSearchQuery(''); setShowSuggestions(false); }}
                  style={styles.clearBtn}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Map */}
        <View style={styles.mapSection}>
          {mapError ? (
            <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1F2937' }]}>
              <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
              <Text style={{ color: '#FFFFFF', marginTop: 10, textAlign: 'center', paddingHorizontal: 20, fontSize: 14 }}>
                {mapError}
              </Text>
              <Text style={{ color: '#9CA3AF', marginTop: 8, textAlign: 'center', paddingHorizontal: 20, fontSize: 12 }}>
                Map mode: {mapProvider === 'google' ? 'Google Maps' : 'Default'}
              </Text>
              <TouchableOpacity
                style={{ marginTop: 15, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2563EB', borderRadius: 8 }}
                onPress={() => {
                  setMapError(null);
                  setMapInitialized(false);
                }}
              >
                <Text style={{ color: '#FFFFFF' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : markerLocation?.latitude && markerLocation?.longitude ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={mapProvider === 'google' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
              initialRegion={{
                latitude: markerLocation.latitude,
                longitude: markerLocation.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              customMapStyle={darkMapStyle}
              onPress={handleMapPress}
              onRegionChangeComplete={handleRegionChangeComplete}
              maxZoomLevel={20}
              minZoomLevel={3}
              onMapReady={handleMapReady}
              loadingEnabled={true}
              loadingIndicatorColor="#FFFFFF"
            />
          ) : (
            <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1F2937' }]}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', marginTop: 10 }}>Loading map...</Text>
            </View>
          )}

          {/* Center Pin */}
          <View style={styles.mapCenter}>
            <View style={styles.pinIcon}>
              <MaterialCommunityIcons name="map-marker" size={40} color="#fff" />
            </View>
          </View>

          {/* Current Location Button */}
          <TouchableOpacity
            style={styles.currentLocationBtn}
            onPress={handleCurrentLocation}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#0F0F0F" />
          </TouchableOpacity>

          {/* Suggestions List Overlay */}
          {showSuggestions && (() => {
            const suggestionsData = searchQuery.trim() === ''
              ? [
                  { type: 'current_location', displayName: 'Use Current Location', secondaryText: 'Tap to use your current location' },
                  ...recentSearches.map(item => ({
                    type: 'recent_search',
                    displayName: item.address.split(',')[0],
                    secondaryText: item.address,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    address: item.address,
                    city: item.city || 'Mumbai',
                    placeId: item.placeId,
                  }))
                ]
              : [
                  { type: 'current_location', displayName: 'Use Current Location', secondaryText: 'Tap to use your current location' },
                  ...suggestions
                ];

            return (
              <View style={styles.suggestionsSection}>
                <FlatList
                  data={suggestionsData}
                  scrollEnabled={true}
                  keyExtractor={(item, index) => item.type === 'current_location' ? 'current_location' : `${item.name || item.displayName || ''}-${index}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [
                        styles.suggestionItem,
                        pressed && styles.suggestionItemPressed,
                        item.type === 'current_location' && { borderBottomWidth: 1, borderBottomColor: '#2A2A2A', backgroundColor: 'rgba(212, 80, 10, 0.08)' },
                        item.type === 'recent_search' && { borderBottomWidth: 0.5, borderBottomColor: '#2A2A2A' }
                      ]}
                      onPress={() => handleSelectSuggestion(item)}
                    >
                      <View style={[
                        styles.suggestionIconContainer, 
                        item.type === 'current_location' && { backgroundColor: WARM_CORE.primary },
                        item.type === 'recent_search' && { backgroundColor: WARM_CORE.textSecondary }
                      ]}>
                        <MaterialCommunityIcons 
                          name={
                            item.type === 'current_location' 
                              ? 'crosshairs-gps' 
                              : item.type === 'recent_search' 
                                ? 'history' 
                                : 'map-marker'
                          } 
                          size={20} 
                          color="#FFFFFF" 
                        />
                      </View>
                      <View style={styles.suggestionContent}>
                        <Text style={[
                          styles.suggestionName, 
                          item.type === 'current_location' && { color: WARM_CORE.primary, fontWeight: '700' }
                        ]} numberOfLines={1}>
                          {item.displayName || item.mainText}
                        </Text>
                        {item.secondaryText ? (
                          <View style={styles.suggestionMeta}>
                            <Text style={styles.suggestionCategory}>{item.secondaryText}</Text>
                          </View>
                        ) : null}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#6B7280" />
                    </Pressable>
                  )}
                  scrollIndicatorInsets={{ right: 1 }}
                />
              </View>
            );
          })()}

          {/* Loading state while searching Overlay */}
          {isSearching && searchQuery.length >= 2 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          )}

          {/* Empty state Overlay */}
          {searchQuery && suggestions.length === 0 && !isSearching && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="map-search-outline" size={48} color="#4B5563" />
              <Text style={styles.emptyStateText}>No locations found</Text>
              <Text style={styles.emptyStateSubtext}>Try searching with a different query</Text>
            </View>
          )}
        </View>

        {/* Bottom Address Section */}
        <View
          style={styles.bottomSection}
        >
          <View style={styles.addressDisplay}>
            <View style={styles.addressIcon}>
              <MaterialCommunityIcons name="map-marker" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.addressTitle}>Location</Text>
              <TextInput
                style={styles.addressValue}
                value={address}
                onChangeText={setAddress}
                placeholder="Address"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onCancel}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  },
  headerSection: {
    backgroundColor: WARM_CORE.background,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    padding: 4,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: WARM_CORE.text,
    letterSpacing: -0.3,
  },
  searchSection: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchBody: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 10,
    fontSize: 15,
    fontWeight: '500',
    color: WARM_CORE.text,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },

  /* Quick Actions */
  quickActionsContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  },

  /* Suggestions */
  suggestionsSection: {
    backgroundColor: WARM_CORE.card,
    maxHeight: 281,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    borderBottomColor: WARM_CORE.border,
  },
  suggestionItemPressed: {
    backgroundColor: 'rgba(212, 80, 10, 0.05)',
  },
  suggestionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: WARM_CORE.text,
    marginBottom: 4,
  },
  suggestionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestionCategory: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: WARM_CORE.border,
    marginHorizontal: 6,
  },
  suggestionDistance: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },

  /* Empty State */
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 5,
  },
  emptyStateText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: WARM_CORE.text,
  },
  emptyStateSubtext: {
    marginTop: 6,
    fontSize: 14,
    color: WARM_CORE.textSecondary,
  },

  /* Loading Container */
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.card,
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    zIndex: 10,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  },

  /* Map */
  mapSection: {
    flex: 1.2,
    position: 'relative',
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    zIndex: 5,
  },
  pinIcon: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  currentLocationBtn: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: WARM_CORE.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  /* Bottom Section */
  bottomSection: {
    backgroundColor: WARM_CORE.background,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addressDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 80, 10, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  addressInfo: {
    flex: 1,
  },
  addressTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 14,
    fontWeight: '500',
    color: WARM_CORE.text,
    maxHeight: 60,
    paddingVertical: 0,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
  },
  confirmBtn: {
    backgroundColor: WARM_CORE.primary,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
  },
});
