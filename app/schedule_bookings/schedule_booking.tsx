import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

type RideFor = 'me' | 'someoneElse';

type TimeSlotOption = {
  key: string;
  label: string;
};

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 4;
const DATE_OPTION_COUNT = 30;
const MIN_LEAD_TIME_MINUTES = 60;
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const toIsoDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date) => {
  const monthLabel = MONTH_LABELS[date.getMonth()];
  return `${monthLabel} ${date.getDate()}, ${date.getFullYear()}`;
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

const buildScheduleDateTime = (scheduleDate: Date, pickupTime: Date) => {
  return new Date(
    scheduleDate.getFullYear(),
    scheduleDate.getMonth(),
    scheduleDate.getDate(),
    pickupTime.getHours(),
    pickupTime.getMinutes(),
    0,
    0
  );
};

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const getStreetOnlyLabel = (value?: string) => {
  if (!value?.trim()) {
    return '';
  }

  return value.split(',')[0]?.trim() ?? value;
};

export default function ScheduleBookingModal() {
  const router = useRouter();
  const { theme } = useTheme();
  const {
    pickup,
    dropoff,
    stops,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    rideFor,
    guestRiderName,
    guestRiderNumber,
    vehiclePricing,
    scheduleType,
  } = useLocalSearchParams<{
    pickup?: string;
    dropoff?: string;
    stops?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropoffLat?: string;
    dropoffLng?: string;
    rideFor?: RideFor;
    guestRiderName?: string;
    guestRiderNumber?: string;
    vehiclePricing?: string;
    scheduleType?: string;
  }>();
  const resolvedPickup = normalizeRouteParam(pickup);
  const resolvedDropoff = normalizeRouteParam(dropoff);
  const resolvedScheduleType = normalizeRouteParam(scheduleType) || 'ride';
  const pickupDisplay = getStreetOnlyLabel(resolvedPickup);
  const dropoffDisplay = getStreetOnlyLabel(resolvedDropoff);
  const [earliestBookableAt] = useState(() => new Date(Date.now() + MIN_LEAD_TIME_MINUTES * 60 * 1000));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [passengerCount, setPassengerCount] = useState(MIN_PASSENGERS);
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);
  const [showIosTimePicker, setShowIosTimePicker] = useState(false);
  const maximumDate = useMemo(() => {
    const maxDate = new Date(earliestBookableAt);
    maxDate.setDate(maxDate.getDate() + (DATE_OPTION_COUNT - 1));
    return maxDate;
  }, [earliestBookableAt]);

  const canProceed = useMemo(() => {
    if (!selectedDate || !selectedTime) {
      return false;
    }

    return buildScheduleDateTime(selectedDate, selectedTime) >= earliestBookableAt;
  }, [earliestBookableAt, selectedDate, selectedTime]);

  const handlePassengerChange = (delta: number) => {
    setPassengerCount((current) => Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, current + delta)));
  };

  const handleDatePicked = (pickedDate: Date) => {
    const normalizedDate = new Date(
      pickedDate.getFullYear(),
      pickedDate.getMonth(),
      pickedDate.getDate(),
      0,
      0,
      0,
      0
    );

    setSelectedDate(normalizedDate);

    if (selectedTime) {
      const combined = buildScheduleDateTime(normalizedDate, selectedTime);

      if (combined < earliestBookableAt) {
        setSelectedTime(null);
      }
    }
  };

  const handleTimePicked = (pickedTime: Date) => {
    if (!selectedDate) {
      Alert.alert('Select date first', 'Choose your scheduled date before picking a pickup time.');
      return;
    }

    const candidateDateTime = buildScheduleDateTime(selectedDate, pickedTime);

    if (candidateDateTime < earliestBookableAt) {
      Alert.alert(
        'Unavailable pickup time',
        'Pickup time must be at least 1 hour from now. Please choose a later time.'
      );
      return;
    }

    setSelectedTime(pickedTime);
  };

  const openDatePicker = () => {
    const initialDate = selectedDate ?? earliestBookableAt;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: initialDate,
        minimumDate: earliestBookableAt,
        maximumDate,
        onChange: (event, value) => {
          if (event.type === 'set' && value) {
            handleDatePicked(value);
          }
        },
      });
      return;
    }

    setShowIosDatePicker(true);
  };

  const openTimePicker = () => {
    if (!selectedDate) {
      Alert.alert('Select date first', 'Choose your scheduled date before picking a pickup time.');
      return;
    }

    const initialTime = selectedTime ?? earliestBookableAt;

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

  const handleIosDateChange = (event: DateTimePickerEvent, value?: Date) => {
    if (event.type !== 'set' || !value) {
      return;
    }

    handleDatePicked(value);
  };

  const handleIosTimeChange = (event: DateTimePickerEvent, value?: Date) => {
    if (event.type !== 'set' || !value) {
      return;
    }

    handleTimePicked(value);
  };

  const handleProceed = () => {
    if (!selectedDate || !selectedTime) {
      return;
    }

    router.push({
      pathname: '/schedule_bookings/vehicle_details',
      params: {
        pickup: resolvedPickup,
        dropoff: resolvedDropoff,
        stops: normalizeRouteParam(stops),
        pickupLat: normalizeRouteParam(pickupLat),
        pickupLng: normalizeRouteParam(pickupLng),
        dropoffLat: normalizeRouteParam(dropoffLat),
        dropoffLng: normalizeRouteParam(dropoffLng),
        rideFor: normalizeRouteParam(rideFor),
        guestRiderName: normalizeRouteParam(guestRiderName),
        guestRiderNumber: normalizeRouteParam(guestRiderNumber),
        vehiclePricing: normalizeRouteParam(vehiclePricing),
        scheduleType: resolvedScheduleType,
        scheduledDate: toIsoDateString(selectedDate),
        scheduledTime: toSqlTimeString(selectedTime),
        passengerCount: String(passengerCount),
      },
    });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Schedule your ride</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Route summary */}
        <View
          style={[
            styles.routeSummary,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.routeRow}>
            <Ionicons name="radio-button-on" size={14} color={theme.colors.primary} />
            <Text style={[styles.routeText, { color: theme.colors.text }]} numberOfLines={1}>
              {pickupDisplay || 'Pickup location'}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="location" size={14} color={theme.colors.error} />
            <Text style={[styles.routeText, { color: theme.colors.text }]} numberOfLines={1}>
              {dropoffDisplay || 'Drop-off location'}
            </Text>
          </View>
        </View>

        {/* Date section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Date</Text>
        <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>Pick any day in the next 30 days.</Text>
        <TouchableOpacity
          style={[styles.selectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={openDatePicker}
          activeOpacity={0.85}
        >
          <View style={styles.selectionCopy}>
            <Text style={[styles.selectionLabel, { color: theme.colors.textSecondary }]}>Scheduled date</Text>
            <Text style={[styles.selectionValue, { color: theme.colors.text }]}>
              {selectedDate ? formatDisplayDate(selectedDate) : 'Choose a date'}
            </Text>
          </View>
          <Ionicons name="calendar-outline" size={22} color={theme.colors.primary} />
        </TouchableOpacity>

        {Platform.OS === 'ios' && showIosDatePicker ? (
          <View style={[styles.pickerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <DateTimePicker
              mode="date"
              display="inline"
              value={selectedDate ?? earliestBookableAt}
              minimumDate={earliestBookableAt}
              maximumDate={maximumDate}
              onChange={handleIosDateChange}
            />
          </View>
        ) : null}

        {/* Time section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Pick up time</Text>
        <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>1hour interval pickup time</Text>
        <TouchableOpacity
          style={[
            styles.selectionCard,
            styles.selectionCardSpaced,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: selectedDate ? 1 : 0.55,
            },
          ]}
          onPress={openTimePicker}
          activeOpacity={0.85}
        >
          <View style={styles.selectionCopy}>
            <Text style={[styles.selectionLabel, { color: theme.colors.textSecondary }]}>Pickup time</Text>
            <Text style={[styles.selectionValue, { color: theme.colors.text }]}>
              {selectedTime ? formatDisplayTime(selectedTime) : 'Choose pickup time'}
            </Text>
          </View>
          <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
        </TouchableOpacity>

        {Platform.OS === 'ios' && showIosTimePicker ? (
          <View style={[styles.pickerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <DateTimePicker
              mode="time"
              display="spinner"
              value={selectedTime ?? earliestBookableAt}
              onChange={handleIosTimeChange}
            />
          </View>
        ) : null}

        {/* Passenger section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Passengers</Text>
        <View
          style={[
            styles.passengerStepper,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <TouchableOpacity
            style={[styles.stepperButton, { borderColor: theme.colors.border }]}
            onPress={() => handlePassengerChange(-1)}
            disabled={passengerCount <= MIN_PASSENGERS}
          >
            <Ionicons
              name="remove"
              size={20}
              color={passengerCount <= MIN_PASSENGERS ? theme.colors.textSecondary : theme.colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.passengerCountText, { color: theme.colors.text }]}>{passengerCount}</Text>
          <TouchableOpacity
            style={[styles.stepperButton, { borderColor: theme.colors.border }]}
            onPress={() => handlePassengerChange(1)}
            disabled={passengerCount >= MAX_PASSENGERS}
          >
            <Ionicons
              name="add"
              size={20}
              color={passengerCount >= MAX_PASSENGERS ? theme.colors.textSecondary : theme.colors.text}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.proceedButton,
            { backgroundColor: canProceed ? theme.colors.primary : theme.colors.border },
          ]}
          onPress={handleProceed}
          disabled={!canProceed}
        >
          <Text style={styles.proceedButtonText}>Proceed</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  routeSummary: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 26,
    marginBottom: 20,
    gap: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeText: {
    fontSize: 14,
    fontWeight: '300',
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 10,
  },
  selectionCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  selectionCardSpaced: {
    marginBottom: 20,
  },
  selectionCopy: {
    flex: 1,
    paddingRight: 12,
  },
  selectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  selectionValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerCard: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: -8,
    marginBottom: 20,
  },
  passengerStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 24,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerCountText: {
    fontSize: 20,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  proceedButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
