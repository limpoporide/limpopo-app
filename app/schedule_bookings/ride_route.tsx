import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import SomeoneModal from '../../src/components/bookings/SomeoneModal';
import { supabase } from '../../src/lib/supabase';
import { loadScheduledSavedRoutes, type ScheduledSavedRoute } from '../../src/lib/scheduled-saved-routes';

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

const createPlacesSessionToken = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const parseRouteCoordinate = (value?: string | string[]) => {
  const normalizedValue = normalizeRouteParam(value);

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const logApiError = (context: string, error: any) => {
  if (__DEV__) {
    console.warn(`[Google Places ${context}]:`, JSON.stringify(error, null, 2));
  }
};

export default function RideRouteScreen() {
  const router = useRouter();
  const { pickup, pickupLat, pickupLng, scheduleType } = useLocalSearchParams<{
    pickup?: string;
    pickupLat?: string;
    pickupLng?: string;
    scheduleType?: string;
  }>();
  const resolvedScheduleType = normalizeRouteParam(scheduleType) || 'ride';
  const { theme } = useTheme();
  const [pickupLocation, setPickupLocation] = useState('');
  const [stopFields, setStopFields] = useState<StopField[]>([]);
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [savedRoutes, setSavedRoutes] = useState<ScheduledSavedRoute[]>([]);
  const [activeField, setActiveField] = useState<LocationField>('pickup');
  const [rideFor, setRideFor] = useState<RideFor>('me');
  const [someoneModalVisible, setSomeoneModalVisible] = useState(false);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coordinates | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [vehiclePricing, setVehiclePricing] = useState<VehiclePricingSummary[]>([]);
  const hasPickupLocation = pickupLocation.trim().length > 0;
  const hasDropoffLocation = dropoffLocation.trim().length > 0;
  const placesSessionTokens = useRef<Record<string, string>>({
    pickup: createPlacesSessionToken(),
    dropoff: createPlacesSessionToken(),
  });
  const vehicleNavigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasQueuedVehicleNavigationRef = useRef(false);
  const nextStopIndexRef = useRef(1);

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

      const hydrateSavedRoutes = async () => {
        const nextRoutes = await loadScheduledSavedRoutes();

        if (isActive) {
          setSavedRoutes(nextRoutes);
        }
      };

      hydrateSavedRoutes();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const getFilledStops = () => stopFields.map((stop) => stop.value.trim()).filter(Boolean);

  const navigateToScheduleBooking = (
    pickup: string,
    dropoff: string,
    delay = 300,
    coords?: {
      pickupCoords?: Coordinates | null;
      dropoffCoords?: Coordinates | null;
    },
    stops: string[] = getFilledStops()
  ) => {
    if (hasQueuedVehicleNavigationRef.current) {
      return;
    }

    hasQueuedVehicleNavigationRef.current = true;

    if (vehicleNavigationTimeoutRef.current) {
      clearTimeout(vehicleNavigationTimeoutRef.current);
    }

    vehicleNavigationTimeoutRef.current = setTimeout(() => {
      vehicleNavigationTimeoutRef.current = null;
      router.push({
        pathname: '/schedule_bookings/schedule_booking',
        params: {
          pickup,
          dropoff,
          stops: JSON.stringify(stops),
          pickupLat: coords?.pickupCoords?.latitude?.toString(),
          pickupLng: coords?.pickupCoords?.longitude?.toString(),
          dropoffLat: coords?.dropoffCoords?.latitude?.toString(),
          dropoffLng: coords?.dropoffCoords?.longitude?.toString(),
          rideFor,
          guestRiderName: recipientName,
          guestRiderNumber: recipientNumber,
          vehiclePricing: JSON.stringify(vehiclePricing),
          scheduleType: resolvedScheduleType,
        },
      });
    }, delay);
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
      const response = await fetch(url);
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

  const reverseGeocodeWithExpo = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      const result = results[0];

      if (__DEV__) {
        console.log('[Expo Reverse Geocoding Debug]:', JSON.stringify(result, null, 2));
      }

      if (!result) {
        return 'Current location';
      }

      const streetPart = [result.streetNumber, result.street].filter(Boolean).join(' ').trim();
      const areaPart = [result.district, result.city || result.subregion].filter(Boolean).join(', ').trim();

      if (streetPart && areaPart) return `${streetPart}, ${areaPart}`;
      if (streetPart) return streetPart;

      const fallback = [result.name, result.city, result.region].filter(Boolean).join(', ').trim();
      return fallback || 'Current location';
    } catch (error) {
      if (__DEV__) {
        console.warn('[Expo Reverse Geocoding Error]:', String(error));
      }
      return 'Current location';
    }
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
      return;
    }

    if (field !== 'pickup') {
      setStopFields((currentStops) =>
        currentStops.map((stop) => (stop.id === field ? { ...stop, value } : stop))
      );
      return;
    }

    setPickupLocation(value);
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

  const hydrateCurrentLocation = async (requestPermission = false, overwritePickup = false) => {
    try {
      console.log('[Schedule RideRoute] hydrateCurrentLocation:start', {
        requestPermission,
        overwritePickup,
      });

      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      console.log('[Schedule RideRoute] hydrateCurrentLocation:permission', {
        status: permission.status,
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
      });

      if (permission.status !== 'granted') {
        console.log('[Schedule RideRoute] hydrateCurrentLocation:permission-denied');
        return null;
      }

      let position: Location.LocationObject | null = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      if (!position?.coords) {
        const lastKnownPosition = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
          requiredAccuracy: 500,
        });

        position = lastKnownPosition ?? position;
      }

      if (!position?.coords) {
        console.log('[Schedule RideRoute] hydrateCurrentLocation:no-position');
        return null;
      }

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      console.log('[Schedule RideRoute] hydrateCurrentLocation:coords', coords);

      setCurrentCoords(coords);

      const resolvedPickup = await reverseGeocodeWithGoogle(coords.latitude, coords.longitude);

      console.log('[Schedule RideRoute] hydrateCurrentLocation:resolvedPickup', {
        platform: Platform.OS,
        resolvedPickup,
      });

      setPickupLocation((currentPickup) => {
        const nextPickup = overwritePickup || currentPickup.trim().length === 0 ? resolvedPickup : currentPickup;

        console.log('[Schedule RideRoute] hydrateCurrentLocation:setPickupLocation', {
          currentPickup,
          nextPickup,
          overwritePickup,
        });

        if (!overwritePickup && currentPickup.trim().length > 0) {
          return currentPickup;
        }

        return resolvedPickup;
      });
      setPickupCoords((currentPickupCoords) => {
        const nextCoords = overwritePickup || !currentPickupCoords ? coords : currentPickupCoords;

        console.log('[Schedule RideRoute] hydrateCurrentLocation:setPickupCoords', {
          currentPickupCoords,
          nextCoords,
          overwritePickup,
        });

        return nextCoords;
      });

      return coords;
    } catch (error) {
      console.log('[Schedule RideRoute] hydrateCurrentLocation:error', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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

    try {
      const response = await fetch(url);
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

      if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
        logApiError('Autocomplete Error', {
          status: payload.status,
          error_message: payload.error_message,
          query,
        });
      }

      return [] as PlaceSuggestion[];
    } catch (error) {
      logApiError('Autocomplete Network Error', { error: String(error), query });
      return [] as PlaceSuggestion[];
    }
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
      const response = await fetch(url);
      const payload = await response.json();

      if (payload.status === 'OK' && payload.result) {
        return {
          address: payload.result.formatted_address ?? payload.result.name ?? null,
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

  const handlePlaceSelect = async (suggestion: PlaceSuggestion) => {
    const field = activeField;
    
    // Hide suggestions immediately when user taps a suggestion
    setPlaceSuggestions([]);
    setIsSearchingPlaces(false);
    
    const detailedPlace = await fetchPlaceDetails(suggestion.placeId, field);
    const resolvedValue = detailedPlace?.address || suggestion.fullText;

    setLocationValue(field, resolvedValue);
    setLocationCoords(field, detailedPlace?.coords ?? null);
    placesSessionTokens.current[field] = createPlacesSessionToken();
  };

  useEffect(() => {
    const resolvedPickup = normalizeRouteParam(pickup);

    if (resolvedPickup?.trim().length) {
      setPickupLocation(resolvedPickup);
    }

    const latitude = parseRouteCoordinate(pickupLat);
    const longitude = parseRouteCoordinate(pickupLng);

    if (latitude !== null && longitude !== null) {
      setPickupCoords({ latitude, longitude });
    }
  }, [pickup, pickupLat, pickupLng]);

  useEffect(() => {
    hydrateCurrentLocation(true);
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
    return () => {
      if (vehicleNavigationTimeoutRef.current) {
        clearTimeout(vehicleNavigationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const query = activeQuery.trim();

    if (query.length < 2 || !GOOGLE_MAPS_API_KEY) {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearchingPlaces(true);

      try {
        const suggestions = await fetchPlaceSuggestions(query, currentCoords, activeField);

        if (!isCancelled) {
          setPlaceSuggestions(suggestions);
        }
      } catch {
        if (!isCancelled) {
          setPlaceSuggestions([]);
        }
      } finally {
        if (!isCancelled) {
          setIsSearchingPlaces(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeField, activeQuery, currentCoords]);

  const handleSavedLocationPress = (route: ScheduledSavedRoute) => {
    setDropoffLocation(route.dropoff);
    setDropoffCoords(route.dropoffCoords);
    setStopFields([]);
    nextStopIndexRef.current = 1;
    setPlaceSuggestions([]);
  };

  const useCurrentLocation = async () => {
    try {
      console.log('[Schedule RideRoute] navigation-icon:pressed', {
        hasPickupLocation,
        pickupLocation,
        pickupCoords,
      });

      // Hide suggestions while getting location
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);

      const coords = await hydrateCurrentLocation(true, true);

      console.log('[Schedule RideRoute] navigation-icon:completed', {
        coords,
      });

      if (__DEV__ && coords) {
        console.log('[Current Location Coords]:', coords);
      }

      if (!coords) {
        console.log('[Schedule RideRoute] navigation-icon:no-coords');
        Alert.alert('Location unavailable', 'Please enable location permissions to use your current location.');
      }
    } catch (error) {
      console.log('[Schedule RideRoute] navigation-icon:error', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (__DEV__) {
        console.error('[Current Location Error]:', error);
      }
      Alert.alert('Location unavailable', 'We could not get your current location. Please try again.');
      // Keep the current input value when live location lookup fails.
    }
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

  const canConfirmRoute = pickupLocation.trim().length > 0 && dropoffLocation.trim().length > 0;

  const handleConfirmRoute = () => {
    if (!canConfirmRoute) {
      return;
    }

    navigateToScheduleBooking(pickupLocation, dropoffLocation, 0, { pickupCoords, dropoffCoords });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Enter Route</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
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

        <View style={[styles.inputCard, { }]}>
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

        <TouchableOpacity
          style={[
            styles.confirmButton,
            { backgroundColor: canConfirmRoute ? theme.colors.primary : theme.colors.border },
          ]}
          onPress={handleConfirmRoute}
          disabled={!canConfirmRoute}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.confirmButtonText,
              { color: canConfirmRoute ? '#FFFFFF' : theme.colors.textSecondary },
            ]}
          >
            Confirm
          </Text>
        </TouchableOpacity>

        {GOOGLE_MAPS_API_KEY && inputFocused && (isSearchingPlaces || placeSuggestions.length > 0) ? (
          <View style={[styles.suggestionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            {isSearchingPlaces ? (
              <View style={styles.suggestionStatusRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.suggestionStatusText, { color: theme.colors.textSecondary }]}>Searching places in Nigeria...</Text>
              </View>
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
          <Text style={[styles.savedTitle, { color: theme.colors.text }]}>Saved locations</Text>
          {savedRoutes.length > 0 ? (
            savedRoutes.map((route: ScheduledSavedRoute) => (
              <TouchableOpacity
                key={route.id}
                style={[styles.savedLocationRow, { borderBottomColor: theme.colors.border }]}
                onPress={() => handleSavedLocationPress(route)}
              >
                <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={[styles.savedLocationText, { color: theme.colors.text }]}>{route.label}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}> 
              Your saved locations will appear here.
            </Text>
          )}
        </View>
      </ScrollView>

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
  confirmButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});