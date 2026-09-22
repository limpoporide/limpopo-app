import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

const QUICK_FEEDBACK = [
  'Smooth ride',
  'On time',
  'Very polite',
  'Clean vehicle',
  'Safe driving',
  'Great route choice',
] as const;

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const parseNumericParam = (value?: string | string[]) => {
  const parsed = Number.parseFloat(normalizeRouteParam(value));

  return Number.isFinite(parsed) ? parsed : null;
};

const hasUsablePlateNumber = (value: string) => value.trim().length > 0 && !/unavailable/i.test(value);

export default function RateDriver() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const {
    pickup,
    dropoff,
    amount,
    bookingId,
    driverName,
    vehicle,
    plateNumber,
    rating,
  } = useLocalSearchParams<{
    pickup?: string;
    dropoff?: string;
    amount?: string;
    bookingId?: string;
    driverName?: string;
    vehicle?: string;
    plateNumber?: string;
    rating?: string;
  }>();
  const [selectedRating, setSelectedRating] = useState(5);
  const [selectedFeedback, setSelectedFeedback] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const resolvedPickup = normalizeRouteParam(pickup) || 'Pickup unavailable';
  const resolvedDropoff = normalizeRouteParam(dropoff) || 'Drop-off unavailable';
  const resolvedAmount = normalizeRouteParam(amount) || 'Amount unavailable';
  const resolvedDriverName = normalizeRouteParam(driverName) || 'Your driver';
  const resolvedVehicle = normalizeRouteParam(vehicle) || 'Limpopo Pro';
  const initialPlateNumber = normalizeRouteParam(plateNumber).trim();
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState(initialPlateNumber);
  const resolvedPlateNumber = hasUsablePlateNumber(vehiclePlateNumber)
    ? vehiclePlateNumber
    : 'Plate number unavailable';
  const resolvedDriverRating = parseNumericParam(rating) ?? 4.8;

  const ratingCopy = useMemo(() => {
    if (selectedRating >= 5) {
      return 'Outstanding ride experience';
    }

    if (selectedRating >= 4) {
      return 'A very good trip overall';
    }

    if (selectedRating >= 3) {
      return 'A decent ride with room to improve';
    }

    if (selectedRating >= 2) {
      return 'There were noticeable issues on this trip';
    }

    return 'We should review what went wrong';
  }, [selectedRating]);

  const toggleFeedback = (item: string) => {
    setSelectedFeedback((current) => {
      if (current.includes(item)) {
        return current.filter((entry) => entry !== item);
      }

      return [...current, item];
    });
  };

  const handleClose = () => {
    router.replace('/(tabs)/home');
  };

  useEffect(() => {
    if (!resolvedBookingId || hasUsablePlateNumber(initialPlateNumber)) {
      return;
    }

    let isActive = true;

    const loadVehiclePlateNumber = async () => {
      try {
        const untypedSupabase = supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
              };
            };
          };
        };

        const bookingResult = await untypedSupabase
          .from('rider_booking')
          .select('assigned_driver')
          .eq('id', resolvedBookingId)
          .maybeSingle();

        const bookingRecord =
          bookingResult.data && typeof bookingResult.data === 'object'
            ? (bookingResult.data as Record<string, unknown>)
            : null;
        const assignedDriver =
          bookingRecord && typeof bookingRecord['assigned_driver'] === 'string'
            ? bookingRecord['assigned_driver'].trim()
            : '';

        if (!assignedDriver || !isActive) {
          return;
        }

        const vehicleResult = await untypedSupabase
          .from('vehicle_management')
          .select('vehicle_num')
          .eq('assigned', assignedDriver)
          .maybeSingle();

        const vehicleRecord =
          vehicleResult.data && typeof vehicleResult.data === 'object'
            ? (vehicleResult.data as Record<string, unknown>)
            : null;
        const fetchedPlateNumber =
          vehicleRecord && typeof vehicleRecord['vehicle_num'] === 'string'
            ? vehicleRecord['vehicle_num'].trim()
            : '';

        if (isActive && hasUsablePlateNumber(fetchedPlateNumber)) {
          setVehiclePlateNumber(fetchedPlateNumber);
        }
      } catch {
        // Keep the screen usable even if the plate lookup fails.
      }
    };

    void loadVehiclePlateNumber();

    return () => {
      isActive = false;
    };
  }, [initialPlateNumber, resolvedBookingId]);

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!resolvedBookingId) {
      Alert.alert('Rating unavailable', 'This trip is missing the booking reference needed to save your feedback.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => {
              select: (columns: string) => {
                maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
              };
            };
          };
        };
      })
        .from('rider_booking')
        .update({
          driver_rating: selectedRating,
          driver_feedback_tags: selectedFeedback,
          driver_feedback_note: note.trim() || null,
        })
        .eq('id', resolvedBookingId)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('This trip could not be found for rating.');
      }

      Alert.alert('Thanks for your feedback', 'Your rating has been submitted.', [
        {
          text: 'Done',
          onPress: () => router.replace('/(tabs)/home'),
        },
      ]);
    } catch (error) {
      Alert.alert(
        'Unable to submit rating',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>Trip complete</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>Rate your driver</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Your feedback helps us keep Limpopo rides consistent and premium.</Text>
        </View>

        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={handleClose}
        >
          <Ionicons name="close" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <View style={[styles.driverBadge, { backgroundColor: theme.colors.primary }]}> 
            <Ionicons name="star" size={16} color="#FFFFFF" />
          </View>

          <Text style={[styles.driverName, { color: theme.colors.text }]}>{resolvedDriverName}</Text>
          <Text style={[styles.driverMeta, { color: theme.colors.textSecondary }]}>{resolvedVehicle} • {resolvedPlateNumber}</Text>

          <View style={styles.ratingRow}>
            {Array.from({ length: 5 }, (_, index) => {
              const starValue = index + 1;
              const isActive = starValue <= selectedRating;

              return (
                <TouchableOpacity key={starValue} onPress={() => setSelectedRating(starValue)} style={styles.starButton}>
                  <Ionicons
                    name={isActive ? 'star' : 'star-outline'}
                    size={30}
                    color={isActive ? '#F59E0B' : theme.colors.border}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.ratingCopy, { color: theme.colors.text }]}>{ratingCopy}</Text>

          <View style={[styles.driverRatingPill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
            <Ionicons name="shield-checkmark" size={15} color={theme.colors.primary} />
            <Text style={[styles.driverRatingText, { color: theme.colors.textSecondary }]}>Driver average {resolvedDriverRating.toFixed(1)}</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>What stood out?</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Select any details that describe the trip.</Text>

          <View style={styles.feedbackWrap}>
            {QUICK_FEEDBACK.map((item) => {
              const isSelected = selectedFeedback.includes(item);

              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.feedbackChip,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.background,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => toggleFeedback(item)}
                >
                  <Text style={[styles.feedbackChipText, { color: isSelected ? '#FFFFFF' : theme.colors.text }]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add a note</Text>
          <TextInput
            multiline
            placeholder="Share anything that could help us improve future rides"
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.noteInput,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
                color: theme.colors.text,
              },
            ]}
            value={note}
            onChangeText={setNote}
            textAlignVertical="top"
            maxLength={220}
          />
          <Text style={[styles.noteCount, { color: theme.colors.textSecondary }]}>{note.length}/220</Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Trip summary</Text>

          <View style={styles.tripRow}>
            <View style={[styles.tripIconWrap, { backgroundColor: `${theme.colors.primary}18` }]}>
              <Ionicons name="radio-button-on" size={16} color={theme.colors.primary} />
            </View>
            <View style={styles.tripCopy}>
              <Text style={[styles.tripLabel, { color: theme.colors.textSecondary }]}>Pickup</Text>
              <Text style={[styles.tripValue, { color: theme.colors.text }]}>{resolvedPickup}</Text>
            </View>
          </View>

          <View style={styles.tripDivider} />

          <View style={styles.tripRow}>
            <View style={[styles.tripIconWrap, { backgroundColor: `${theme.colors.error}18` }]}>
              <Ionicons name="location" size={16} color={theme.colors.error} />
            </View>
            <View style={styles.tripCopy}>
              <Text style={[styles.tripLabel, { color: theme.colors.textSecondary }]}>Drop-off</Text>
              <Text style={[styles.tripValue, { color: theme.colors.text }]}>{resolvedDropoff}</Text>
            </View>
          </View>

          <View style={styles.tripDivider} />

          <View style={styles.amountRow}>
            <Text style={[styles.tripLabel, { color: theme.colors.textSecondary }]}>Amount paid</Text>
            <Text style={[styles.amountValue, { color: theme.colors.text }]}>{resolvedAmount}</Text>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom + 14,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: theme.colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>{isSubmitting ? 'Submitting...' : 'Submit rating'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },
  driverBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  driverMeta: {
    fontSize: 12,
    marginBottom: 18,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  ratingCopy: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  driverRatingPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverRatingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  feedbackWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  feedbackChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  feedbackChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noteInput: {
    minHeight: 108,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  noteCount: {
    marginTop: 8,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tripIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripCopy: {
    flex: 1,
  },
  tripLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  tripValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  tripDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountValue: {
    fontSize: 19,
    fontWeight: '800',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  submitButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
