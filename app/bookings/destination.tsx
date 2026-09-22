import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import SomeoneModal from '../../src/components/bookings/SomeoneModal';
import {
  loadSavedPlaceLocations,
  saveSavedPlaceLocation,
  type SavedPlaceLocation,
} from '../../src/lib/saved-place-locations';
import { supabase } from '../../src/lib/supabase';

type RideFor = 'me' | 'someoneElse';

type VehiclePricingSummary = {
  id: string;
  vehicle_type: string;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  delay_price_per_min: number;
  vat_percentage: number;
  state_levy: number;
  is_active: boolean;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type StopField = {
  id: `stop-${number}`;
  value: string;
  coords: Coordinates | null;
};

type LocationField = 'pickup' | 'dropoff' | StopField['id'];

type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
};

type PlaceDetailsResult = {
  address: string | null;
  coords: Coordinates | null;
};

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NIGERIA_REGION_CODE = 'ng';
const LOCATION_BIAS_RADIUS_METERS = 30000;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || GOOGLE_PLACES_API_KEY;
const PLACES_MIN_QUERY_LENGTH = 3;

const createPlacesSessionToken = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const PLACES_REQUEST_TIMEOUT_MS = 8000;

// Google Places responses stay HTTP 200 with an error `status` field, but a hung
// mobile network can otherwise leave a request in flight indefinitely.
const fetchWithTimeout = async (url: string, timeoutMs: number = PLACES_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const logApiError = (context: string, error: any) => {
  if (__DEV__) {
    console.warn(`[Google Places ${context}]:`, JSON.stringify(error, null, 2));
  }
};

const reverseGeocodeWithGoogle = async (latitude: number, longitude: number): Promise<string> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return 'Current location';
  }

  try {
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: GOOGLE_MAPS_API_KEY,
      result_type: 'street_address|premise|subpremise',
      language: 'en',
    });

    const url = `${GOOGLE_GEOCODING_URL}?${params.toString()}`;
    const response = await fetchWithTimeout(url);
    const payload = await response.json();

    if (__DEV__) {
      console.log('[Google Geocoding Debug]:', JSON.stringify(payload, null, 2));
    }

    if (payload.status === 'OK' && payload.results && payload.results.length > 0) {
      const result = payload.results[0];

      let streetNumber = '';
      let street = '';
      let sublocality = '';
      let locality = '';

      result.address_components?.forEach((component: any) => {
        const types = component.types || [];
        if (types.includes('street_number')) streetNumber = component.long_name;
        if (types.includes('route')) street = component.long_name;
        if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
          sublocality = component.long_name;
        }
        if (types.includes('locality')) locality = component.long_name;
      });

      const streetPart = [streetNumber, street].filter(Boolean).join(' ').trim();
      const areaPart = [sublocality, locality].filter(Boolean).join(', ').trim();

      if (streetPart && areaPart) return `${streetPart}, ${areaPart}`;
      if (streetPart) return streetPart;
      if (result.formatted_address) return result.formatted_address;
    }

    if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
      logApiError('Geocoding Error', {
        status: payload.status,
        error_message: payload.error_message,
      });
    }

    return 'Current location';
  } catch (error) {
    logApiError('Geocoding Network Error', { error: String(error) });
    return 'Current location';
  }
};

type CurrentLocationSnapshot = {
  coords: Coordinates;
  label: string;
};

let cachedCurrentLocationSnapshot: CurrentLocationSnapshot | null = null;
let currentLocationPrefetchPromise: Promise<CurrentLocationSnapshot | null> | null = null;

// Starts resolving the device location as soon as this module loads, so the pickup
// placeholder can already be filled by the time the screen finishes mounting.
const prefetchCurrentLocation = (): Promise<CurrentLocationSnapshot | null> => {
  if (currentLocationPrefetchPromise) {
    return currentLocationPrefetchPromise;
  }

  currentLocationPrefetchPromise = (async () => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const label = await reverseGeocodeWithGoogle(coords.latitude, coords.longitude);
      const snapshot: CurrentLocationSnapshot = { coords, label };

      cachedCurrentLocationSnapshot = snapshot;

      return snapshot;
    } catch {
      return null;
    }
  })();

  return currentLocationPrefetchPromise;
};

prefetchCurrentLocation();

export default function DestinationScreen() {
  const router = useRouter();
  const { pickup } = useLocalSearchParams<{ pickup?: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [pickupLocation, setPickupLocation] = useState(() => cachedCurrentLocationSnapshot?.label ?? '');
  const [stopFields, setStopFields] = useState<StopField[]>([]);
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [savedPickupLocations, setSavedPickupLocations] = useState<SavedPlaceLocation[]>([]);
  const [savedDropoffLocations, setSavedDropoffLocations] = useState<SavedPlaceLocation[]>([]);
  const [activeField, setActiveField] = useState<LocationField>('pickup');
  const [rideFor, setRideFor] = useState<RideFor>('me');
  const [someoneModalVisible, setSomeoneModalVisible] = useState(false);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(() => cachedCurrentLocationSnapshot?.coords ?? null);
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(() => cachedCurrentLocationSnapshot?.coords ?? null);
  const [dropoffCoords, setDropoffCoords] = useState<Coordinates | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSuggestionsError, setPlaceSuggestionsError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [vehiclePricing, setVehiclePricing] = useState<VehiclePricingSummary[]>([]);
  const hasPickupLocation = pickupLocation.trim().length > 0;
  const hasDropoffLocation = dropoffLocation.trim().length > 0;
  const placesSessionTokens = useRef<Record<string, string>>({
    pickup: createPlacesSessionToken(),
    dropoff: createPlacesSessionToken(),
  });
  const isProceedingRef = useRef(false);
  const nextStopIndexRef = useRef(1);
  const placesRequestIdRef = useRef(0);

  const inputContainerStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
    }),
    [theme.colors.card, theme.colors.border]
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      isProceedingRef.current = false;

      const hydrateSavedLocations = async () => {
        const [pickupEntries, dropoffEntries] = await Promise.all([
          loadSavedPlaceLocations('pickup'),
          loadSavedPlaceLocations('dropoff'),
        ]);

        if (isActive) {
          setSavedPickupLocations(pickupEntries);
          setSavedDropoffLocations(dropoffEntries);
        }
      };

      hydrateSavedLocations();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const getFilledStops = () => stopFields.map((stop) => stop.value.trim()).filter(Boolean);

  const goToVehicleDetails = (
    pickup: string,
    dropoff: string,
    coords: {
      pickupCoords: Coordinates | null;
      dropoffCoords: Coordinates | null;
    },
    stops: string[]
  ) => {
    if (isProceedingRef.current) {
      return;
    }

    isProceedingRef.current = true;

    router.push({
      pathname: '/bookings/vehicle-details',
      params: {
        pickup,
        dropoff,
        stops: JSON.stringify(stops),
        pickupLat: coords.pickupCoords?.latitude?.toString(),
        pickupLng: coords.pickupCoords?.longitude?.toString(),
        dropoffLat: coords.dropoffCoords?.latitude?.toString(),
        dropoffLng: coords.dropoffCoords?.longitude?.toString(),
        rideFor,
        guestRiderName: recipientName,
        guestRiderNumber: recipientNumber,
        vehiclePricing: JSON.stringify(vehiclePricing),
      },
    });
  };

  const getLocationValue = (field: LocationField) => {
    if (field === 'pickup') {
      return pickupLocation;
    }

    if (field === 'dropoff') {
      return dropoffLocation;
    }

    return stopFields.find((stop) => stop.id === field)?.value ?? '';
  };

  const activeQuery = getLocationValue(activeField);

  const setLocationValue = (field: LocationField, value: string) => {
    if (field === 'dropoff') {
      setDropoffLocation(value);
      setDropoffCoords(null);
      return;
    }

    if (field !== 'pickup') {
      setStopFields((currentStops) =>
        currentStops.map((stop) => (stop.id === field ? { ...stop, value, coords: null } : stop))
      );
      return;
    }

    setPickupLocation(value);
    setPickupCoords(null);
  };

  const setLocationCoords = (field: LocationField, coords: Coordinates | null) => {
    if (field === 'dropoff') {
      setDropoffCoords(coords);
      return;
    }

    if (field !== 'pickup') {
      setStopFields((currentStops) =>
        currentStops.map((stop) => (stop.id === field ? { ...stop, coords } : stop))
      );
      return;
    }

    setPickupCoords(coords);
  };

  const focusLocationField = (field: LocationField) => {
    setActiveField(field);
    setInputFocused(true);
    placesSessionTokens.current[field] = createPlacesSessionToken();
  };

  const blurLocationField = (field: LocationField) => {
    setTimeout(() => setInputFocused(false), 200);
  };

  const addStopField = () => {
    const nextStopId = `stop-${nextStopIndexRef.current}` as StopField['id'];
    nextStopIndexRef.current += 1;

    setStopFields((currentStops) => [
      ...currentStops,
      {
        id: nextStopId,
        value: '',
        coords: null,
      },
    ]);

    focusLocationField(nextStopId);
  };

  const clearLocationField = (field: LocationField) => {
    setLocationValue(field, '');
    setLocationCoords(field, null);
    setPlaceSuggestions([]);
  };

  const fetchPlaceSuggestions = async (query: string, coords: Coordinates | null, field: LocationField) => {
    if (!GOOGLE_MAPS_API_KEY) {
      return [] as PlaceSuggestion[];
    }

    const params = new URLSearchParams({
      input: query,
      key: GOOGLE_MAPS_API_KEY,
      components: `country:${NIGERIA_REGION_CODE}`,
      language: 'en',
      sessiontoken: placesSessionTokens.current[field],
    });

    if (coords) {
      params.append('location', `${coords.latitude},${coords.longitude}`);
      params.append('radius', LOCATION_BIAS_RADIUS_METERS.toString());
    }

    const url = `${GOOGLE_PLACES_AUTOCOMPLETE_URL}?${params.toString()}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Autocomplete request failed with HTTP status ${response.status}`);
    }

    const payload = await response.json();

    if (payload.status === 'OK' && Array.isArray(payload.predictions)) {
      return payload.predictions
        .map((prediction: any) => ({
          placeId: prediction.place_id,
          primaryText: prediction.structured_formatting?.main_text ?? prediction.description ?? '',
          secondaryText: prediction.structured_formatting?.secondary_text ?? '',
          fullText: prediction.description ?? '',
        }))
        .filter((suggestion: PlaceSuggestion) => suggestion.placeId && suggestion.fullText);
    }

    if (payload.status === 'ZERO_RESULTS') {
      return [] as PlaceSuggestion[];
    }

    logApiError('Autocomplete Error', {
      status: payload.status,
      error_message: payload.error_message,
      query,
    });

    throw new Error(payload.error_message || `Autocomplete failed with status ${payload.status}`);
  };

  const fetchPlaceDetails = async (placeId: string, field: LocationField): Promise<PlaceDetailsResult | null> => {
    if (!GOOGLE_MAPS_API_KEY) {
      return null;
    }

    const params = new URLSearchParams({
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
      fields: 'formatted_address,name,geometry/location',
      sessiontoken: placesSessionTokens.current[field],
    });

    const url = `${GOOGLE_PLACE_DETAILS_URL}?${params.toString()}`;

    try {
      const response = await fetchWithTimeout(url);
      const payload = await response.json();

      if (payload.status === 'OK' && payload.result) {
        return {
          address:
            payload.result.name?.trim() ||
            payload.result.formatted_address?.split(',').slice(0, 2).map((value: string) => value.trim()).filter(Boolean).join(', ') ||
            payload.result.formatted_address ||
            null,
          coords: payload.result.geometry?.location
            ? {
                latitude: payload.result.geometry.location.lat,
                longitude: payload.result.geometry.location.lng,
              }
            : null,
        };
      }

      if (payload.status !== 'OK') {
        logApiError('Place Details Error', {
          status: payload.status,
          error_message: payload.error_message,
          placeId,
        });
      }

      return null;
    } catch (error) {
      logApiError('Place Details Network Error', { error: String(error), placeId });
      return null;
    }
  };

  const fetchGeocodedCoordinates = async (address: string): Promise<Coordinates | null> => {
    if (!GOOGLE_MAPS_API_KEY || !address.trim()) {
      return null;
    }

    const params = new URLSearchParams({
      address,
      key: GOOGLE_MAPS_API_KEY,
      components: `country:${NIGERIA_REGION_CODE}`,
      language: 'en',
    });

    const url = `${GOOGLE_GEOCODING_URL}?${params.toString()}`;

    try {
      const response = await fetchWithTimeout(url);
      const payload = await response.json();

      if (payload.status === 'OK' && Array.isArray(payload.results) && payload.results.length > 0) {
        const location = payload.results[0]?.geometry?.location;

        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
          return {
            latitude: location.lat,
            longitude: location.lng,
          };
        }
      }

      if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
        logApiError('Geocoding Error', {
          status: payload.status,
          error_message: payload.error_message,
          address,
        });
      }

      return null;
    } catch (error) {
      logApiError('Geocoding Network Error', { error: String(error), address });
      return null;
    }
  };

  const persistSavedPlaceLocation = async (
    field: LocationField,
    label: string,
    coords: Coordinates | null
  ) => {
    if (field !== 'pickup' && field !== 'dropoff') {
      return;
    }

    const nextEntries = await saveSavedPlaceLocation(field, label, coords);

    if (field === 'pickup') {
      setSavedPickupLocations(nextEntries);
    } else {
      setSavedDropoffLocations(nextEntries);
    }
  };

  const handlePlaceSelect = async (suggestion: PlaceSuggestion) => {
    const field = activeField;

    setPlaceSuggestions([]);
    setIsSearchingPlaces(false);

    const detailedPlace = await fetchPlaceDetails(suggestion.placeId, field);
    const resolvedValue = detailedPlace?.address || suggestion.primaryText.trim() || suggestion.fullText;
    const resolvedCoords = detailedPlace?.coords ?? (await fetchGeocodedCoordinates(suggestion.fullText));

    setLocationValue(field, resolvedValue);
    setLocationCoords(field, resolvedCoords);
    placesSessionTokens.current[field] = createPlacesSessionToken();
    setInputFocused(false);

    await persistSavedPlaceLocation(field, resolvedValue, resolvedCoords);
  };

  useEffect(() => {
    if (typeof pickup === 'string' && pickup.trim().length > 0) {
      setPickupLocation(pickup);
    }
  }, [pickup]);

  useEffect(() => {
    let isActive = true;

    prefetchCurrentLocation().then((snapshot) => {
      if (!isActive || !snapshot) {
        return;
      }

      setCurrentCoords((current) => current ?? snapshot.coords);
      setPickupCoords((current) => current ?? snapshot.coords);
      setPickupLocation((current) => (current.trim().length > 0 ? current : snapshot.label));
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadVehiclePricing = async () => {
      const { data, error } = await supabase
        .from('vehicle_pricing')
        .select(
          'id, vehicle_type, base_fare, price_per_km, price_per_min, delay_price_per_min, vat_percentage, state_levy, is_active'
        )
        .eq('is_active', true);

      if (!isCancelled && !error && data) {
        setVehiclePricing(data as VehiclePricingSummary[]);
      }
    };

    loadVehiclePricing();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = activeQuery.trim();

    if (query.length < PLACES_MIN_QUERY_LENGTH || !GOOGLE_MAPS_API_KEY) {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
      setPlaceSuggestionsError(null);
      return;
    }

    let isCancelled = false;
    const requestId = ++placesRequestIdRef.current;

    const isStale = () => isCancelled || requestId !== placesRequestIdRef.current;

    // One automatic retry absorbs transient network blips instead of leaving
    // the field with no suggestions until the user types again.
    const runSearch = async (attempt: number): Promise<void> => {
      setIsSearchingPlaces(true);
      setPlaceSuggestionsError(null);

      try {
        const suggestions = await fetchPlaceSuggestions(query, currentCoords, activeField);

        if (isStale()) {
          return;
        }

        setPlaceSuggestions(suggestions);
        setIsSearchingPlaces(false);
      } catch (error) {
        if (isStale()) {
          return;
        }

        if (attempt < 1) {
          await runSearch(attempt + 1);
          return;
        }

        logApiError('Autocomplete Failed', { error: String(error), query });
        setPlaceSuggestions([]);
        setIsSearchingPlaces(false);
        setPlaceSuggestionsError('Could not load suggestions. Tap to retry.');
      }
    };

    const timeoutId = setTimeout(() => {
      runSearch(0);
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeField, activeQuery, currentCoords]);

  const retryPlaceSuggestions = () => {
    const query = activeQuery.trim();

    if (query.length < PLACES_MIN_QUERY_LENGTH || !GOOGLE_MAPS_API_KEY) {
      return;
    }

    const requestId = ++placesRequestIdRef.current;
    setIsSearchingPlaces(true);
    setPlaceSuggestionsError(null);

    fetchPlaceSuggestions(query, currentCoords, activeField)
      .then((suggestions) => {
        if (requestId !== placesRequestIdRef.current) {
          return;
        }

        setPlaceSuggestions(suggestions);
        setIsSearchingPlaces(false);
      })
      .catch((error) => {
        if (requestId !== placesRequestIdRef.current) {
          return;
        }

        logApiError('Autocomplete Manual Retry Failed', { error: String(error), query });
        setPlaceSuggestions([]);
        setIsSearchingPlaces(false);
        setPlaceSuggestionsError('Could not load suggestions. Tap to retry.');
      });
  };

  const handleSavedLocationPress = (item: SavedPlaceLocation) => {
    setLocationValue(item.type, item.label);
    setLocationCoords(item.type, item.coords);
    setPlaceSuggestions([]);
    setInputFocused(false);
  };

  const useCurrentLocation = async () => {
    try {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const label = await reverseGeocodeWithGoogle(coords.latitude, coords.longitude);

      cachedCurrentLocationSnapshot = { coords, label };
      setCurrentCoords(coords);
      setPickupLocation(label);
      setPickupCoords(coords);
    } catch (error) {
      if (__DEV__) {
        console.error('[Current Location Error]:', error);
      }
    }
  };

  const canProceed = pickupLocation.trim().length > 0 && dropoffLocation.trim().length > 0;

  const handleProceed = async () => {
    if (!canProceed || isProceedingRef.current) {
      return;
    }

    const trimmedPickup = pickupLocation.trim();
    const trimmedDropoff = dropoffLocation.trim();

    const resolvedPickupCoords = pickupCoords ?? (await fetchGeocodedCoordinates(trimmedPickup));
    const resolvedDropoffCoords = dropoffCoords ?? (await fetchGeocodedCoordinates(trimmedDropoff));

    if (resolvedPickupCoords && !pickupCoords) {
      setPickupCoords(resolvedPickupCoords);
    }

    if (resolvedDropoffCoords && !dropoffCoords) {
      setDropoffCoords(resolvedDropoffCoords);
    }

    await Promise.all([
      persistSavedPlaceLocation('pickup', trimmedPickup, resolvedPickupCoords),
      persistSavedPlaceLocation('dropoff', trimmedDropoff, resolvedDropoffCoords),
    ]);

    goToVehicleDetails(
      trimmedPickup,
      trimmedDropoff,
      { pickupCoords: resolvedPickupCoords, dropoffCoords: resolvedDropoffCoords },
      getFilledStops()
    );
  };

  const handleRideForChange = (value: RideFor) => {
    setRideFor(value);

    if (value === 'someoneElse') {
      setSomeoneModalVisible(true);
    }
  };

  const handleSelectContact = (phone: string, name: string) => {
    setRecipientNumber(phone);

    if (name) {
      setRecipientName(name);
    }
  };

  const activeSavedLocations = activeField === 'pickup'
    ? savedPickupLocations
    : activeField === 'dropoff'
      ? savedDropoffLocations
      : [];
  const savedSectionTitle = activeField === 'pickup'
    ? 'Saved pickup locations'
    : activeField === 'dropoff'
      ? 'Saved drop-off locations'
      : 'Saved locations';
  const savedSectionEmptyText = activeField === 'pickup'
    ? 'Your saved pickup locations will appear here.'
    : activeField === 'dropoff'
      ? 'Your saved drop-off locations will appear here.'
      : 'Select the pickup or drop-off field to see saved locations.';
  const shouldShowSuggestions = Boolean(
    GOOGLE_MAPS_API_KEY && inputFocused && (isSearchingPlaces || placeSuggestions.length > 0 || placeSuggestionsError)
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Destination</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 32) }]}
        >
        <View style={[styles.tabsRow, { backgroundColor: theme.colors.card }]}> 
          <TouchableOpacity
            style={[
              styles.tabButton,
              rideFor === 'me' && { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => handleRideForChange('me')}
          >
            <Text
              style={[
                styles.tabButtonText,
                { color: rideFor === 'me' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              My ride
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              rideFor === 'someoneElse' && { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => handleRideForChange('someoneElse')}
          >
            <Text
              style={[
                styles.tabButtonText,
                { color: rideFor === 'someoneElse' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              Someone else
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.inputCard, { backgroundColor: theme.colors.card }]}> 
          <View style={styles.pickupSection}>
            <TouchableOpacity style={styles.addStopButton} onPress={addStopField} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.addStopText, { color: theme.colors.textSecondary }]}>Add stop</Text>
            </TouchableOpacity>

            <View style={[styles.inputRow, styles.pickupRow, inputContainerStyle]}>
              <Ionicons name="radio-button-on-outline" size={20} color={theme.colors.primary} />
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                placeholder="Enter your location"
                placeholderTextColor={theme.colors.textSecondary}
                value={pickupLocation}
                onChangeText={(value) => setLocationValue('pickup', value)}
                onFocus={() => focusLocationField('pickup')}
                onBlur={() => blurLocationField('pickup')}
              />
              {hasPickupLocation ? (
                <TouchableOpacity onPress={() => clearLocationField('pickup')} style={styles.trailingIcon}>
                  <Ionicons name="close-circle-outline" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={useCurrentLocation} style={styles.trailingIcon}>
                  <Ionicons name="navigate-circle-outline" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {stopFields.map((stop) => {
            const hasStopLocation = stop.value.trim().length > 0;

            return (
              <View key={stop.id} style={[styles.inputRow, inputContainerStyle]}>
                <Ionicons name="radio-button-on-outline" size={20} color="#22C55E" />
                <TextInput
                  style={[styles.input, { color: theme.colors.text }]}
                  placeholder="Add stop"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={stop.value}
                  onChangeText={(value) => setLocationValue(stop.id, value)}
                  onFocus={() => focusLocationField(stop.id)}
                  onBlur={() => blurLocationField(stop.id)}
                />
                {hasStopLocation ? (
                  <TouchableOpacity onPress={() => clearLocationField(stop.id)} style={styles.trailingIcon}>
                    <Ionicons name="close-circle-outline" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          <View style={[styles.inputRow, inputContainerStyle]}>
            <Ionicons name="radio-button-off-outline" size={20} color={theme.colors.primary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder="Enter your drop-off"
              placeholderTextColor={theme.colors.textSecondary}
              value={dropoffLocation}
              onChangeText={(value) => setLocationValue('dropoff', value)}
              onFocus={() => focusLocationField('dropoff')}
              onBlur={() => blurLocationField('dropoff')}
            />
            {hasDropoffLocation ? (
              <TouchableOpacity onPress={() => clearLocationField('dropoff')} style={styles.trailingIcon}>
                <Ionicons name="close-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {shouldShowSuggestions ? (
          <View style={[styles.suggestionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            {isSearchingPlaces ? (
              <View style={styles.suggestionStatusRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.suggestionStatusText, { color: theme.colors.textSecondary }]}>Searching places in Nigeria...</Text>
              </View>
            ) : placeSuggestionsError ? (
              <TouchableOpacity style={styles.suggestionStatusRow} onPress={retryPlaceSuggestions}>
                <Ionicons name="refresh" size={18} color={theme.colors.error} />
                <Text style={[styles.suggestionStatusText, { color: theme.colors.error }]}>{placeSuggestionsError}</Text>
              </TouchableOpacity>
            ) : placeSuggestions.length > 0 ? (
              placeSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.placeId}
                  style={[styles.suggestionRow, { borderBottomColor: theme.colors.border }]}
                  onPress={() => handlePlaceSelect(suggestion)}
                >
                  <Ionicons name="location-outline" size={18} color={theme.colors.primary} />
                  <View style={styles.suggestionTextGroup}>
                    <Text style={[styles.suggestionPrimaryText, { color: theme.colors.text }]} numberOfLines={1}>
                      {suggestion.primaryText}
                    </Text>
                    {suggestion.secondaryText ? (
                      <Text style={[styles.suggestionSecondaryText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {suggestion.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.proceedButton,
            { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border },
          ]}
          onPress={handleProceed}
          disabled={!canProceed}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.proceedButtonText,
              { color: canProceed ? '#FFFFFF' : theme.colors.textSecondary },
            ]}
          >
            Proceed
          </Text>
        </TouchableOpacity>

        {rideFor === 'someoneElse' && (recipientNumber || recipientName) ? (
          <View style={[styles.someoneSummary, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text style={[styles.someoneSummaryTitle, { color: theme.colors.text }]}>Ride for</Text>
            <Text style={[styles.someoneSummaryText, { color: theme.colors.text }]}> 
              {recipientName || 'Unnamed recipient'}
            </Text>
            <Text style={[styles.someoneSummarySubtext, { color: theme.colors.textSecondary }]}> 
              {recipientNumber}
            </Text>
          </View>
        ) : null}

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        <View style={styles.savedSection}>
          <Text style={[styles.savedTitle, { color: theme.colors.text }]}>{savedSectionTitle}</Text>
          {activeSavedLocations.length > 0 ? (
            activeSavedLocations.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.savedLocationRow, { borderBottomColor: theme.colors.border }]}
                onPress={() => handleSavedLocationPress(item)}
              >
                <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={[styles.savedLocationText, { color: theme.colors.text }]}>{item.label}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}> 
              {savedSectionEmptyText}
            </Text>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SomeoneModal
        visible={someoneModalVisible}
        onClose={() => setSomeoneModalVisible(false)}
        theme={theme}
        recipientNumber={recipientNumber}
        recipientName={recipientName}
        onChangeRecipientNumber={setRecipientNumber}
        onChangeRecipientName={setRecipientName}
        onSelectContact={handleSelectContact}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerButton: {
    width: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  tabsRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputCard: {
    gap: 14,
  },
  pickupSection: {
    gap: 8,
  },
  pickupRow: {
    marginTop: 2,
  },
  inputRow: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
  },
  trailingIcon: {
    marginLeft: 8,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    marginRight: 4,
    marginTop: 10,
  },
  addStopText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  suggestionsCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: 280,
  },
  suggestionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  suggestionStatusText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  suggestionPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  suggestionSecondaryText: {
    marginTop: 2,
    fontSize: 13,
  },
  someoneSummary: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  someoneSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  someoneSummaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  someoneSummarySubtext: {
    fontSize: 14,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 24,
  },
  savedSection: {
    gap: 6,
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  savedLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  savedLocationText: {
    marginLeft: 10,
    fontSize: 15,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
  },
  proceedButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});