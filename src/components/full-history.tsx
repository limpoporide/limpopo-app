// ==========================================
// IMPORTS
// ==========================================
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Booking, Theme } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

// ==========================================
// TYPES & PROPS
// ==========================================
type FullHistoryProps = {
  visible: boolean;
  booking: Booking | null;
  theme: Theme;
  imageSource: number;
  onClose: () => void;
};

type BookingMetrics = {
  distance?: string | number | null;
  km?: string | number | null;
  eta?: string | number | null;
  totalDistanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  durationMinutes?: number | null;
};

const parseClockTime = (value: string) => {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);

  if (!match) {
    return null;
  }

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (meridiem) {
    if (meridiem === 'PM' && hours < 12) {
      hours += 12;
    }

    if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }
  }

  return hours * 60 + minutes;
};

const formatEtaLabel = (minutes: number | null) => {
  if (!minutes || minutes <= 0) {
    return '--';
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  return `${minutes} min`;
};

const formatMetricValue = (value: string | number | null | undefined, suffix?: string) => {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  if (typeof value === 'number') {
    return suffix ? `${value.toFixed(1)} ${suffix}` : `${value}`;
  }

  return value;
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function FullHistory({
  visible,
  booking,
  theme,
  imageSource,
  onClose,
}: FullHistoryProps) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(0);

  if (!booking) {
    return null;
  }

  const isCancelled = booking.status === 'cancelled';
  const isDelivery = booking.vehicle.type === 'bike' || booking.vehicle.type === 'van';
  const rideTypeLabel = isDelivery ? 'Delivery' : 'Instant ride';
  const statusLabel = isCancelled
    ? 'Cancelled'
    : booking.status === 'active'
      ? 'In Progress'
      : booking.status === 'pending'
        ? 'Pending'
        : 'Completed';
  const surfaceColor = theme.mode === 'dark' ? '#1C1C1E' : '#F8F8FA';
  const mutedSurfaceColor = theme.mode === 'dark' ? '#2C2C2E' : '#FFFFFF';
  const timelineColor = theme.mode === 'dark' ? '#38383A' : '#D1D1D6';
  const iconSurfaceColor = theme.mode === 'dark' ? '#2C2C2E' : '#EFEFF4';
  const successBadgeColor = theme.mode === 'dark' ? '#1E2B11' : '#EAF7E8';
  const dangerSurfaceColor = theme.mode === 'dark' ? '#2C1616' : '#FFF1F1';
  const infoSurfaceColor = theme.mode === 'dark' ? '#1F2630' : '#F3F7FB';
  const statusBadgeColor = isCancelled
    ? theme.mode === 'dark' ? '#3A1D1D' : '#FFF1F1'
    : theme.mode === 'dark' ? '#1E2B11' : '#EAF7E8';
  const bookingWithMetrics = booking as Booking & BookingMetrics;
  const startTimeMinutes = parseClockTime(booking.startTime);
  const endTimeMinutes = parseClockTime(booking.endTime);
  const fallbackEtaMinutes =
    startTimeMinutes !== null && endTimeMinutes !== null && endTimeMinutes >= startTimeMinutes
      ? endTimeMinutes - startTimeMinutes
      : null;
  const metricKmValue =
    typeof bookingWithMetrics.km === 'number'
      ? bookingWithMetrics.km
      : typeof bookingWithMetrics.totalDistanceKm === 'number'
        ? bookingWithMetrics.totalDistanceKm
        : null;
  const metricDistanceValue = bookingWithMetrics.distance ?? metricKmValue;
  const metricEtaValue =
    bookingWithMetrics.eta ??
    bookingWithMetrics.estimatedDurationMinutes ??
    bookingWithMetrics.durationMinutes ??
    fallbackEtaMinutes;
  const handleDeleteTransaction = () => {
    Alert.alert(
      'Delete transaction',
      'Are you sure you want to delete this transaction from your history?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onClose();
            router.push('/(tabs)/history');
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* ========================================== */}
        {/* SECTION 1: HEADER                          */}
        {/* ========================================== */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerDate, { color: theme.colors.text }] }>
              {formatDate(booking.startDate)}
            </Text>
            <Text style={[styles.headerTime, { color: theme.colors.textSecondary }]}>{booking.startTime}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* ========================================== */}
          {/* SECTION 2: TRIP INFORMATION CARD           */}
          {/* ========================================== */}
          <View style={[styles.card, { backgroundColor: surfaceColor, borderColor: theme.colors.border }]}>
            <View style={styles.tripHeaderRow}>
              <View>
                <Text style={[styles.serviceTitle, { color: theme.colors.text }] }>
                  {isDelivery ? 'Limpopo Delivery' : 'City ride'}
                </Text>
                <View style={styles.tripBadgeRow}>
                  <View style={[styles.tripTypeBadge, { backgroundColor: theme.colors.primary + '18' }]}>
                    <Text style={[styles.tripTypeBadgeText, { color: theme.colors.primary }]}>
                      {rideTypeLabel}
                    </Text>
                  </View>
                  <View style={[styles.tripStatusBadge, { backgroundColor: statusBadgeColor }]}>
                    <Text
                      style={[
                        styles.tripStatusBadgeText,
                        { color: isCancelled ? theme.colors.error : theme.colors.success },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              </View>
              <Image
                source={imageSource}
                style={styles.vehicleImage}
                resizeMode="contain"
              />
            </View>

            {/* Pickup & Dropoff Timeline */}
            <View style={styles.timelineContainer}>
              {/* Pickup */}
              <View style={styles.timelineRow}>
                <View style={styles.iconColumn}>
                  <Ionicons name="radio-button-on" size={18} color={theme.colors.primary} />
                </View>
                <Text style={[styles.locationText, { color: theme.colors.text }]} numberOfLines={2}>
                  {booking.pickupLocation}
                </Text>
                <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }] }>
                  {booking.startTime}
                </Text>
              </View>

              {/* Connecting Line */}
              <View style={[styles.timelineLine, { backgroundColor: timelineColor }]} />

              {/* Dropoff */}
              <View style={styles.timelineRow}>
                <View style={styles.iconColumn}>
                  <Ionicons name="flag" size={18} color={theme.colors.success} />
                </View>
                <Text style={[styles.locationText, { color: theme.colors.text }]} numberOfLines={2}>
                  {booking.dropoffLocation}
                </Text>
                <Text style={[styles.timeLabel, { color: theme.colors.textSecondary }] }>
                  {booking.endTime}
                </Text>
              </View>
            </View>

            <View style={[styles.metricSection, { borderTopColor: theme.colors.border }]}> 
              <View style={[styles.metricCard, { backgroundColor: infoSurfaceColor }]}> 
                <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>Distance</Text>
                <Text style={[styles.metricValue, { color: theme.colors.text }]}> 
                  {formatMetricValue(metricDistanceValue, typeof metricDistanceValue === 'number' ? 'km' : undefined)}
                </Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: infoSurfaceColor }]}> 
                <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>KM</Text>
                <Text style={[styles.metricValue, { color: theme.colors.text }]}> 
                  {formatMetricValue(metricKmValue, 'km')}
                </Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: infoSurfaceColor }]}> 
                <Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>ETA</Text>
                <Text style={[styles.metricValue, { color: theme.colors.text }]}> 
                  {typeof metricEtaValue === 'number' ? formatEtaLabel(metricEtaValue) : formatMetricValue(metricEtaValue)}
                </Text>
              </View>
            </View>

            {/* Trip Stats */}
            <View style={[styles.statsRow, { borderTopColor: theme.colors.border }]}>
              <View style={styles.statItem}>
                <Ionicons
                  name="car-sport-outline"
                  size={20}
                  color={theme.colors.text}
                  style={styles.statIcon}
                />
                <View>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Vehicle type</Text>
                  <Text style={[styles.statValue, { color: theme.colors.text }]}>
                    {booking.vehicle.type.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={theme.colors.text}
                  style={styles.statIcon}
                />
                <View>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Seats</Text>
                  <Text style={[styles.statValue, { color: theme.colors.text }]}>
                    {booking.vehicle.seats ?? '--'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ========================================== */}
          {/* SECTION 3: DRIVER & RATING CARD            */}
          {/* ========================================== */}
          <View style={[styles.card, { backgroundColor: surfaceColor, borderColor: theme.colors.border }]}>
            <View style={styles.driverRow}>
              <View style={[styles.driverAvatar, { backgroundColor: iconSurfaceColor }]}> 
                <Ionicons name="person-outline" size={24} color={theme.colors.text} />
              </View>
              <View style={styles.driverDetails}>
                <Text style={[styles.driverName, { color: theme.colors.text }] }>
                  Chauffeur service
                </Text>
                <Text style={[styles.vehicleDetails, { color: theme.colors.textSecondary }] }>
                  {booking.vehicle.brand} {booking.vehicle.model} • {booking.vehicle.transmission ?? 'automatic'}
                </Text>
              </View>
            </View>

            <Text style={[styles.rateTitle, { color: theme.colors.text }]}>Rate your driver</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={30}
                    color={star <= rating ? '#D4A017' : theme.colors.textSecondary}
                    style={styles.starIcon}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ========================================== */}
          {/* SECTION 4: ACTION BUTTONS                  */}
          {/* ========================================== */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionButton} activeOpacity={0.8}>
              <View style={[styles.actionIconCircle, { backgroundColor: mutedSurfaceColor, borderColor: theme.colors.border }]}>
                <Ionicons name="receipt-outline" size={20} color={theme.colors.text} />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.text }]}>Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} activeOpacity={0.8}>
              <View style={[styles.actionIconCircle, { backgroundColor: mutedSurfaceColor, borderColor: theme.colors.border }]}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={theme.colors.text}
                />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.text }]}>Support</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/bookings/destination',
                  params: {
                    pickup: booking.pickupLocation,
                    dropoff: booking.dropoffLocation,
                  },
                });
              }}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: mutedSurfaceColor, borderColor: theme.colors.border }]}>
                <Ionicons name="swap-horizontal" size={20} color={theme.colors.text} />
              </View>
              <Text style={[styles.actionText, { color: theme.colors.text }]}>Return route</Text>
            </TouchableOpacity>
          </View>

          {/* ========================================== */}
          {/* SECTION 5: PAYMENT BREAKDOWN CARD          */}
          {/* ========================================== */}
          <View style={[styles.card, { backgroundColor: surfaceColor, borderColor: theme.colors.border }]}>
            <Text style={[styles.paymentTitle, { color: theme.colors.text }]}>I paid</Text>

            <View style={styles.fareRow}>
              <Text style={[styles.fareLabel, { color: theme.colors.text }]}>Fare</Text>
              <Text style={[styles.fareValue, { color: theme.colors.text }]}>
                {formatCurrency(isCancelled ? 0 : booking.totalPrice)}
              </Text>
            </View>

            <View style={styles.totalPaidRow}>
              <View style={styles.totalPaidLabelGroup}>
                <View style={[styles.paymentBadge, { backgroundColor: successBadgeColor }]}>
                  <Ionicons name="card" size={14} color={theme.colors.success} />
                </View>
                <Text style={[styles.totalPaidText, { color: theme.colors.text }]}>Total paid</Text>
              </View>
              <Text style={[styles.totalPaidValue, { color: theme.colors.text }]}>
                {formatCurrency(isCancelled ? 0 : booking.totalPrice)}
              </Text>
            </View>
          </View>

          {/* ========================================== */}
          {/* SECTION 6: REMOVE FROM HISTORY BUTTON      */}
          {/* ========================================== */}
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: dangerSurfaceColor, borderColor: theme.colors.border }]}
            onPress={handleDeleteTransaction}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
            <Text style={[styles.removeButtonText, { color: theme.colors.error }]}>Delete transaction</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /* Header Styles */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerDate: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTime: {
    color: '#9E9E9E',
    fontSize: 13,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },

  /* Card Layout */
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },

  /* Trip Information Styles */
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  serviceTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  serviceSub: {
    color: '#9E9E9E',
    fontSize: 14,
    marginTop: 4,
  },
  tripBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  tripTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tripTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tripStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tripStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  vehicleImage: {
    width: 100,
    height: 50,
  },
  timelineContainer: {
    marginVertical: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconColumn: {
    width: 32,
    alignItems: 'center',
  },
  locationText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  timeLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  timelineLine: {
    width: 2,
    height: 20,
    marginLeft: 15,
    marginVertical: 4,
  },
  metricSection: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    marginRight: 10,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },

  /* Driver & Rating Styles */
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  driverAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverDetails: {
    marginLeft: 14,
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
  },
  vehicleDetails: {
    fontSize: 13,
    marginTop: 4,
  },
  rateTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  starIcon: {
    marginHorizontal: 4,
  },

  /* Action Grid Styles */
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Payment Section Styles */
  paymentTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fareLabel: {
    fontSize: 16,
  },
  fareValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalPaidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPaidLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  totalPaidText: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalPaidValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  /* Bottom Actions */
  removeButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});