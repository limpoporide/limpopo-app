import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import SomeoneModal from '../../src/components/bookings/SomeoneModal';
import { supabase } from '../../src/lib/supabase';

type RideFor = 'me' | 'someoneElse';
type DurationMode = 'by_hour' | '12_hours' | '24_hours';

type HourlyPackage = {
  id: string;
  title: string;
  image: number;
};

type VehiclePricingSummary = {
  id: string;
  vehicle_type: string;
  price_per_hour: number;
  insurance_cost: number;
  vat_percentage: number;
  is_active: boolean;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

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

const HOURLY_PACKAGES: HourlyPackage[] = [
  { id: 'pro', title: 'Limpopo Pro', image: require('../../assets/slide2.png') },
  { id: 'promax', title: 'Limpopo Promax', image: require('../../assets/slide3.png') },
  { id: 'comfort', title: 'Limpopo Comfort', image: require('../../assets/slide1.png') },
];

const MIN_DURATION_HOURS = 1;
const MAX_CUSTOM_DURATION_HOURS = 8;
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NIGERIA_REGION_CODE = 'ng';

const createPlacesSessionToken = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const logApiError = (context: string, error: any) => {
  if (__DEV__) {
    console.warn(`[Google Places ${context}]:`, JSON.stringify(error, null, 2));
  }
};

const formatShortPlaceAddress = (result: any, fallbackAddress: string | null) => {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];

  let streetNumber = '';
  let route = '';
  let locality = '';

  components.forEach((component: any) => {
    const types = component?.types || [];

    if (types.includes('street_number')) {
      streetNumber = component.long_name || '';
    }

    if (types.includes('route')) {
      route = component.long_name || '';
    }

    if (
      types.includes('locality')
      || types.includes('administrative_area_level_2')
      || types.includes('sublocality')
      || types.includes('sublocality_level_1')
    ) {
      locality = locality || component.long_name || '';
    }
  });

  const streetLabel = [streetNumber, route].filter(Boolean).join(' ').trim();
  const shortAddress = [streetLabel, locality].filter(Boolean).join(', ').trim();

  if (shortAddress) {
    return shortAddress;
  }

  return fallbackAddress;
};

const formatDisplayTime = (date: Date) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const toSqlTimeString = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}:00`;
};

// Nearest-hundred rounding keeps displayed fares whole, e.g. 8670.89 -> 8700, 8010.05 -> 8000.
const roundToNearestHundred = (value: number) => Math.round(value / 100) * 100;

const formatWholeNaira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

export default function HourlyBookingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [durationMode, setDurationMode] = useState<DurationMode | null>(null);
  const [selectedDurationHours, setSelectedDurationHours] = useState('3');
  const [vehiclePricing, setVehiclePricing] = useState<VehiclePricingSummary[]>([]);
  const [pickupTime, setPickupTime] = useState<Date | null>(null);
  const [pickupLocation, setPickupLocation] = useState('');
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [pickupInputFocused, setPickupInputFocused] = useState(false);
  const [showIosTimePicker, setShowIosTimePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [rideFor, setRideFor] = useState<RideFor>('me');
  const [someoneModalVisible, setSomeoneModalVisible] = useState(false);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const placesSessionToken = useRef(createPlacesSessionToken());

  const selectedPackage = useMemo(
    () => HOURLY_PACKAGES.find((option) => option.id === selectedPackageId) ?? null,
    [selectedPackageId]
  );

  const parsedDurationHours = Number.parseInt(selectedDurationHours, 10);
  const isDurationValid = durationMode === 'by_hour'
    ? Number.isInteger(parsedDurationHours)
      && parsedDurationHours >= MIN_DURATION_HOURS
      && parsedDurationHours <= MAX_CUSTOM_DURATION_HOURS
    : durationMode === '12_hours' || durationMode === '24_hours';
  const resolvedDurationHours = durationMode === '12_hours'
    ? 12
    : durationMode === '24_hours'
      ? 24
      : durationMode === 'by_hour'
        ? parsedDurationHours
        : null;

  const selectedVehiclePricing = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    const normalizedVehicleName = selectedPackage.title.trim().toLowerCase();
    return (
      vehiclePricing.find((row) => row.vehicle_type.trim().toLowerCase() === normalizedVehicleName) ?? null
    );
  }, [selectedPackage, vehiclePricing]);

  const computedAmount = useMemo(() => {
    if (!selectedVehiclePricing || !isDurationValid || resolvedDurationHours === null) {
      return null;
    }

    const pricePerHour = Number(selectedVehiclePricing.price_per_hour) || 0;
    const insuranceCost = Number(selectedVehiclePricing.insurance_cost) || 0;
    const vatPercentage = Number(selectedVehiclePricing.vat_percentage) || 0;

    const subtotal = (pricePerHour * resolvedDurationHours) + (insuranceCost * resolvedDurationHours);
    const vatAmount = subtotal * (vatPercentage / 100);
    const total = subtotal + vatAmount;

    return roundToNearestHundred(total);
  }, [selectedVehiclePricing, isDurationValid, resolvedDurationHours]);

  const canProceed = Boolean(
    selectedPackage
    && isDurationValid
    && computedAmount !== null
    && pickupTime
    && pickupLocation.trim().length > 0
    && pickupCoords
  );

  const handleSelectPackage = (packageId: string) => {
    setSelectedPackageId(packageId);
  };

  const handleDurationChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, '');

    if (digitsOnly.length === 0) {
      setSelectedDurationHours('');
      return;
    }

    const nextValue = Number.parseInt(digitsOnly, 10);

    if (Number.isNaN(nextValue)) {
      return;
    }

    setSelectedDurationHours(String(Math.min(nextValue, MAX_CUSTOM_DURATION_HOURS)));
  };

  const normalizeDurationOnBlur = () => {
    if (!selectedDurationHours) {
      setSelectedDurationHours(String(MIN_DURATION_HOURS));
      return;
    }

    const nextValue = Number.parseInt(selectedDurationHours, 10);

    if (Number.isNaN(nextValue) || nextValue < MIN_DURATION_HOURS) {
      setSelectedDurationHours(String(MIN_DURATION_HOURS));
      return;
    }

    if (nextValue > MAX_CUSTOM_DURATION_HOURS) {
      setSelectedDurationHours(String(MAX_CUSTOM_DURATION_HOURS));
    }
  };

  const handleTimePicked = (pickedTime: Date) => {
    setPickupTime(pickedTime);
  };

  const loadVehiclePricing = async () => {
    const { data, error } = await supabase
      .from('vehicle_pricing')
      .select('id, vehicle_type, price_per_hour, insurance_cost, vat_percentage, is_active')
      .eq('is_active', true);

    if (!error && data) {
      setVehiclePricing(data as VehiclePricingSummary[]);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const channelName = `hourly-vehicle-pricing-${Date.now()}`;
    const pricingChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_pricing',
        },
        async () => {
          if (!isCancelled) {
            await loadVehiclePricing();
          }
        }
      )
      .subscribe();

    loadVehiclePricing();

    return () => {
      isCancelled = true;
      supabase.removeChannel(pricingChannel);
    };
  }, []);

  const fetchPlaceSuggestions = async (query: string) => {
    if (!GOOGLE_MAPS_API_KEY) {
      return [] as PlaceSuggestion[];
    }

    const params = new URLSearchParams({
      input: query,
      key: GOOGLE_MAPS_API_KEY,
      components: `country:${NIGERIA_REGION_CODE}`,
      language: 'en',
      sessiontoken: placesSessionToken.current,
    });

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

  const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetailsResult | null> => {
    if (!GOOGLE_MAPS_API_KEY) {
      return null;
    }

    const params = new URLSearchParams({
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
      fields: 'formatted_address,name,geometry/location,address_components',
      sessiontoken: placesSessionToken.current,
    });

    const url = `${GOOGLE_PLACE_DETAILS_URL}?${params.toString()}`;

    try {
      const response = await fetch(url);
      const payload = await response.json();

      if (payload.status === 'OK' && payload.result) {
        const fallbackAddress = payload.result.formatted_address ?? payload.result.name ?? null;

        return {
          address: formatShortPlaceAddress(payload.result, fallbackAddress),
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
      const response = await fetch(url);
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

  const handlePickupLocationChange = (value: string) => {
    setPickupLocation(value);
    setPickupCoords(null);
  };

  const handlePickupSuggestionSelect = async (suggestion: PlaceSuggestion) => {
    setPlaceSuggestions([]);
    setIsSearchingPlaces(false);

    const detailedPlace = await fetchPlaceDetails(suggestion.placeId);
    const resolvedValue = detailedPlace?.address || suggestion.fullText;
    const resolvedCoords = detailedPlace?.coords ?? await fetchGeocodedCoordinates(suggestion.fullText);

    setPickupLocation(resolvedValue);
    setPickupCoords(resolvedCoords);
    setPickupInputFocused(false);
    placesSessionToken.current = createPlacesSessionToken();
  };

  useEffect(() => {
    const query = pickupLocation.trim();

    if (!pickupInputFocused || query.length < 2 || !GOOGLE_MAPS_API_KEY) {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearchingPlaces(true);

      try {
        const suggestions = await fetchPlaceSuggestions(query);

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
  }, [pickupInputFocused, pickupLocation]);

  const openTimePicker = () => {
    const initialTime = pickupTime ?? new Date();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        value: initialTime,
        is24Hour: false,
        onChange: (event, value) => {
          if (event.type === 'set' && value) {
            handleTimePicked(value);
          }
        },
      });
      return;
    }

    setShowIosTimePicker(true);
  };

  const handleIosTimeChange = (event: DateTimePickerEvent, value?: Date) => {
    if (event.type !== 'set' || !value) {
      return;
    }

    handleTimePicked(value);
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

  const handleProceed = () => {
    if (!canProceed || !pickupTime || !selectedPackage || resolvedDurationHours === null || computedAmount === null) {
      return;
    }

    router.push({
      pathname: '/schedule_bookings/booking_confirmation',
      params: {
        scheduleType: 'hourly',
        hourlyPackageId: selectedPackage.id,
        vehicleType: selectedPackage.title,
        hourlyDurationHours: String(resolvedDurationHours),
        hourlyPickupTime: toSqlTimeString(pickupTime),
        hourlyAmount: String(computedAmount),
        pickup: pickupLocation.trim(),
        pickupLat: pickupCoords?.latitude.toString(),
        pickupLng: pickupCoords?.longitude.toString(),
        hourlyNotes: notes,
        rideFor,
        guestRiderName: recipientName,
        guestRiderNumber: recipientNumber,
      },
    });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Booking</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hourly booking packages */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Hourly booking</Text>
        <View style={styles.packageRow}>
          {HOURLY_PACKAGES.map((option) => {
            const isSelected = option.id === selectedPackageId;

            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.packageCard,
                  {
                    backgroundColor: isSelected ? theme.colors.primary : theme.colors.card,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => handleSelectPackage(option.id)}
                activeOpacity={0.85}
              >
                <Image source={option.image} style={styles.packageImage} resizeMode="contain" />
                <Text
                  style={[
                    styles.packageTitle,
                    { color: isSelected ? '#FFFFFF' : theme.colors.text },
                  ]}
                >
                  {option.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Duration selection */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>
          Select duration
        </Text>
        <View style={styles.durationModeRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.durationModeButton,
              {
                backgroundColor: durationMode === 'by_hour' ? theme.colors.primary : theme.colors.card,
                borderColor: durationMode === 'by_hour' ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => setDurationMode('by_hour')}
          >
            <Text style={[styles.durationModeButtonText, { color: durationMode === 'by_hour' ? '#FFFFFF' : theme.colors.text }]}>By Hour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.durationModeButton,
              {
                backgroundColor: durationMode === '12_hours' ? theme.colors.primary : theme.colors.card,
                borderColor: durationMode === '12_hours' ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => setDurationMode('12_hours')}
          >
            <Text style={[styles.durationModeButtonText, { color: durationMode === '12_hours' ? '#FFFFFF' : theme.colors.text }]}>12 Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.durationModeButton,
              {
                backgroundColor: durationMode === '24_hours' ? theme.colors.primary : theme.colors.card,
                borderColor: durationMode === '24_hours' ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => setDurationMode('24_hours')}
          >
            <Text style={[styles.durationModeButtonText, { color: durationMode === '24_hours' ? '#FFFFFF' : theme.colors.text }]}>24 Hours</Text>
          </TouchableOpacity>
        </View>
        {durationMode === 'by_hour' ? (
          <>
            <View
              style={[
                styles.durationInputCard,
                styles.durationInputSpacing,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              <TextInput
                style={[styles.durationInput, { color: theme.colors.text }]}
                keyboardType="number-pad"
                value={selectedDurationHours}
                onChangeText={handleDurationChange}
                onBlur={normalizeDurationOnBlur}
                maxLength={2}
                placeholder="1"
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={[styles.durationInputSuffix, { color: theme.colors.textSecondary }]}>hrs</Text>
            </View>
            <Text style={[styles.durationHelperText, { color: theme.colors.textSecondary }]}>Enter 1 to 8 hours.</Text>
          </>
        ) : null}

        {/* Estimated amount */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>
          Estimated amount
        </Text>
        <View style={[styles.amountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}>Amount payable</Text>
          <Text style={[styles.amountValue, { color: theme.colors.text }]}>
            {computedAmount !== null ? formatWholeNaira(computedAmount) : '₦0'}
          </Text>
        </View>

        {/* Pickup time */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>
          Pickup time
        </Text>
        <TouchableOpacity
          style={[styles.selectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={openTimePicker}
          activeOpacity={0.85}
        >
          <View style={styles.selectionCopy}>
            <Text style={[styles.selectionLabel, { color: theme.colors.textSecondary }]}>Pickup time</Text>
            <Text style={[styles.selectionValue, { color: theme.colors.text }]}>
              {pickupTime ? formatDisplayTime(pickupTime) : 'Choose pickup time'}
            </Text>
          </View>
          <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
        </TouchableOpacity>

        {Platform.OS === 'ios' && showIosTimePicker ? (
          <View style={[styles.pickerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <DateTimePicker
              mode="time"
              display="spinner"
              value={pickupTime ?? new Date()}
              onChange={handleIosTimeChange}
            />
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>Pickup location</Text>
        <View
          style={[
            styles.selectionCard,
            styles.locationInputCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
          <TextInput
            style={[styles.locationInput, { color: theme.colors.text }]}
            placeholder="Search pickup address"
            placeholderTextColor={theme.colors.textSecondary}
            value={pickupLocation}
            onChangeText={handlePickupLocationChange}
            onFocus={() => setPickupInputFocused(true)}
            onBlur={() => {
              setTimeout(() => {
                setPickupInputFocused(false);
              }, 150);
            }}
          />
          {pickupLocation.trim() ? (
            <TouchableOpacity
              onPress={() => {
                setPickupLocation('');
                setPickupCoords(null);
                setPlaceSuggestions([]);
              }}
              style={styles.trailingIcon}
            >
              <Ionicons name="close-circle-outline" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {GOOGLE_MAPS_API_KEY && pickupInputFocused && (isSearchingPlaces || placeSuggestions.length > 0) ? (
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
                  onPress={() => handlePickupSuggestionSelect(suggestion)}
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

        {/* Notes */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>
          Notes (optional)
        </Text>
        <TextInput
          style={[
            styles.notesInput,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.text },
          ]}
          placeholder="Add any information for your driver"
          placeholderTextColor={theme.colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Ride for toggle */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: theme.colors.text }]}>
          Ride for
        </Text>
        <View style={[styles.tabsRow, { backgroundColor: theme.colors.card }]}>
          <TouchableOpacity
            style={[styles.tabButton, rideFor === 'me' && { backgroundColor: theme.colors.primary }]}
            onPress={() => handleRideForChange('me')}
          >
            <Text style={[styles.tabButtonText, { color: rideFor === 'me' ? '#FFFFFF' : theme.colors.text }]}>
              Me
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, rideFor === 'someoneElse' && { backgroundColor: theme.colors.primary }]}
            onPress={() => handleRideForChange('someoneElse')}
          >
            <Text
              style={[styles.tabButtonText, { color: rideFor === 'someoneElse' ? '#FFFFFF' : theme.colors.text }]}
            >
              Someone else
            </Text>
          </TouchableOpacity>
        </View>

        {rideFor === 'someoneElse' && (recipientName || recipientNumber) ? (
          <View style={[styles.someoneSummary, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.someoneSummaryTitle, { color: theme.colors.text }]}>Ride for</Text>
            <Text style={[styles.someoneSummaryValue, { color: theme.colors.textSecondary }]}>
              {[recipientName, recipientNumber].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[styles.proceedButton, { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border }]}
          onPress={handleProceed}
          disabled={!canProceed}
        >
          <Text style={styles.proceedButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>

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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  packageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  packageCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  packageImage: {
    width: 72,
    height: 54,
    marginBottom: 8,
  },
  packageTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  durationModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  durationModeButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  durationModeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  durationInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  durationInputSpacing: {
    marginTop: 10,
  },
  durationInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
  },
  durationInputSuffix: {
    fontSize: 14,
    fontWeight: '500',
  },
  durationHelperText: {
    marginTop: 8,
    fontSize: 12,
  },
  amountCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountHelperText: {
    marginTop: 6,
    fontSize: 12,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  locationInputCard: {
    gap: 10,
  },
  selectionCopy: {
    flex: 1,
  },
  selectionLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  selectionValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  locationInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  trailingIcon: {
    marginLeft: 4,
  },
  pickerCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  suggestionsCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  suggestionStatusText: {
    fontSize: 13,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  suggestionPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionSecondaryText: {
    fontSize: 12,
    marginTop: 2,
  },
  notesInput: {
    minHeight: 96,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  someoneSummary: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  someoneSummaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  someoneSummaryValue: {
    fontSize: 14,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  proceedButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
