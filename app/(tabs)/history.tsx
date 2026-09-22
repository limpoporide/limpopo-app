import React, { useCallback, useEffect, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';
import { formatCurrency } from '../../src/utils/formatters';

type FilterTab = 'all' | 'city_rides' | 'scheduled_ride' | 'delivery';
type ActiveRideHistoryStatus = 'accepted' | 'arrived' | 'in_progress';
type ReopenableRideHistoryStatus = ActiveRideHistoryStatus | 'completed';
type ScheduledRideHistoryStatus = 'pending' | 'confirmed' | 'expired';
type RideHistoryStatus = ActiveRideHistoryStatus | ScheduledRideHistoryStatus | 'cancelled' | 'completed';
type RideHistorySource = 'rider_booking' | 'schedule_booking';

type RiderBookingHistoryRow = {
  id: string;
  assigned_driver: string | null;
  pick_up: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_off: string;
  drop_lat: number | null;
  drop_lng: number | null;
  total_fare: number | null;
  total_km: number | null;
  total_time: number | null;
  ride_status: RideHistoryStatus;
  payment_status: 'unpaid' | 'paid' | null;
  created_at: string;
};

type ScheduleBookingHistoryRow = {
  id: string;
  assigned_driver: string | null;
  pick_up: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_off: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  total_fare: number | null;
  total_km: number | null;
  total_time: number | null;
  booking_status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'converted';
  created_at: string;
  schedule_date: string;
  pickup_time: string;
  converted_rider_booking_id: string | null;
};

type DriverSummary = {
  name: string;
  profileImg: string | null;
  rating: number | null;
};

type RideHistoryItem = {
  id: string;
  source: RideHistorySource;
  activeBookingId: string | null;
  rideTypeLabel: string;
  driverName: string;
  hasAssignedDriver: boolean;
  driverProfileImg: string | null;
  driverRating: number | null;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  amount: number;
  totalKm: number | null;
  etaMinutes: number | null;
  status: RideHistoryStatus;
  paymentStatus: 'unpaid' | 'paid' | null;
  dateLabel: string;
  timeLabel: string;
  sortDate: string;
};

const DEFAULT_DRIVER_IMAGE = require('../../assets/driver-profile.png');
const GOOGLE_STATIC_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const hasValidCoordinate = (value: number | null) => typeof value === 'number' && Number.isFinite(value);

const getStaticMapUrl = (item: RideHistoryItem) => {
  if (!GOOGLE_STATIC_MAPS_API_KEY) {
    return null;
  }

  if (
    !hasValidCoordinate(item.pickupLat) ||
    !hasValidCoordinate(item.pickupLng) ||
    !hasValidCoordinate(item.dropoffLat) ||
    !hasValidCoordinate(item.dropoffLng)
  ) {
    return null;
  }

  const pickup = `${item.pickupLat},${item.pickupLng}`;
  const dropoff = `${item.dropoffLat},${item.dropoffLng}`;
  const path = `${pickup}|${dropoff}`;

  return `https://maps.googleapis.com/maps/api/staticmap?size=1200x600&scale=2&maptype=roadmap&markers=${encodeURIComponent(`color:green|label:P|${pickup}`)}&markers=${encodeURIComponent(`color:red|label:D|${dropoff}`)}&path=${encodeURIComponent(`color:0xC48B2D|weight:5|${path}`)}&key=${GOOGLE_STATIC_MAPS_API_KEY}`;
};

const getDateHeading = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
};

const getTimeLabel = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getScheduledDateTime = (scheduleDate: string, pickupTime: string, fallbackCreatedAt: string) => {
  const safeDate = scheduleDate?.trim();
  const safeTime = pickupTime?.trim();

  if (!safeDate || !safeTime) {
    return fallbackCreatedAt;
  }

  const normalizedTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
  const scheduledDate = new Date(`${safeDate}T${normalizedTime}`);

  if (Number.isNaN(scheduledDate.getTime())) {
    return fallbackCreatedAt;
  }

  return scheduledDate.toISOString();
};

const formatDriverRating = (rating: number | null) => {
  if (typeof rating !== 'number' || Number.isNaN(rating)) {
    return 'New';
  }

  return rating.toFixed(1);
};

const formatHistoryAddress = (address: string | null | undefined) => {
  const safeAddress = typeof address === 'string' ? address.trim() : '';

  if (!safeAddress) {
    return 'Location not set';
  }

  const parts = safeAddress
    .split(',')
    .map((part) => part.trim())
    .filter((part, index, values) => part.length > 0 && values.indexOf(part) === index)
    .slice(0, 3);

  return parts.length > 0 ? parts.join(', ') : safeAddress;
};

const formatEtaLabel = (etaMinutes: number | null) => {
  if (typeof etaMinutes !== 'number' || Number.isNaN(etaMinutes) || etaMinutes <= 0) {
    return '--';
  }

  if (etaMinutes >= 60) {
    const hours = Math.floor(etaMinutes / 60);
    const minutes = etaMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${etaMinutes} min`;
};

const ACTIVE_RIDE_STATUSES: ActiveRideHistoryStatus[] = ['accepted', 'arrived', 'in_progress'];

const canReopenActiveRide = (
  item: RideHistoryItem
): item is RideHistoryItem & { status: ReopenableRideHistoryStatus; activeBookingId: string } => {
  if (!item.activeBookingId) {
    return false;
  }

  if (ACTIVE_RIDE_STATUSES.includes(item.status as ActiveRideHistoryStatus)) {
    return true;
  }

  return item.status === 'completed' && item.paymentStatus !== 'paid';
};

const getRideCategory = (item: RideHistoryItem): Exclude<FilterTab, 'all'> => {
  if (item.source === 'schedule_booking') {
    return 'scheduled_ride';
  }

  return 'city_rides';
};

const getStatusLabel = (status: RideHistoryStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'confirmed':
      return 'Confirmed';
    case 'accepted':
      return 'Accepted';
    case 'arrived':
      return 'Arrived';
    case 'in_progress':
      return 'In Progress';
    case 'expired':
      return 'Expired';
    case 'completed':
      return 'Completed';
    case 'cancelled':
    default:
      return 'Cancelled';
  }
};

export default function History({ navigation }: { navigation?: any }) {
  const router = useRouter();
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [historyItems, setHistoryItems] = useState<RideHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<RideHistoryItem | null>(null);
  const selectedItemStaticMapUrl = selectedItem?.status === 'completed' ? getStaticMapUrl(selectedItem) : null;

  const getStatusColors = (status: RideHistoryStatus) => {
    switch (status) {
      case 'pending':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(144, 202, 249, 0.2)' : 'rgba(30, 136, 229, 0.12)',
          textColor: theme.mode === 'dark' ? '#90CAF9' : '#1565C0',
        };
      case 'confirmed':
      case 'accepted':
      case 'arrived':
      case 'in_progress':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(255, 214, 10, 0.18)' : 'rgba(196, 139, 45, 0.14)',
          textColor: theme.mode === 'dark' ? '#FFD54F' : '#8C6A00',
        };
      case 'expired':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(158, 158, 158, 0.2)' : 'rgba(117, 117, 117, 0.12)',
          textColor: theme.mode === 'dark' ? '#BDBDBD' : '#616161',
        };
      case 'completed':
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(77, 182, 172, 0.22)' : 'rgba(46, 125, 50, 0.12)',
          textColor: theme.mode === 'dark' ? '#80CBC4' : '#2E7D32',
        };
      case 'cancelled':
      default:
        return {
          backgroundColor: theme.mode === 'dark' ? 'rgba(239, 83, 80, 0.18)' : 'rgba(198, 40, 40, 0.12)',
          textColor: theme.mode === 'dark' ? '#EF9A9A' : '#C62828',
        };
    }
  };

  const openActiveRide = (item: RideHistoryItem & { status: ReopenableRideHistoryStatus; activeBookingId: string }) => {
    router.push({
      pathname: '/bookings/accept',
      params: {
        bookingId: item.activeBookingId,
        pickupLat: item.pickupLat !== null ? String(item.pickupLat) : '',
        pickupLng: item.pickupLng !== null ? String(item.pickupLng) : '',
        dropoffLat: item.dropoffLat !== null ? String(item.dropoffLat) : '',
        dropoffLng: item.dropoffLng !== null ? String(item.dropoffLng) : '',
      },
    });
  };

  const loadHistory = useCallback(async () => {
    setIsLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setHistoryItems([]);
        return;
      }

      try {
        await supabase.functions.invoke('promote-scheduled-bookings', {
          method: 'POST',
        });
      } catch (promotionError) {
        if (__DEV__) {
          console.warn('[History] Scheduled promotion trigger failed', promotionError);
        }
      }

      const untypedSupabase = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              in: (column: string, values: string[]) => {
                order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown; error: Error | null }>;
              };
            };
            in: (column: string, values: string[]) => Promise<{ data: unknown; error: Error | null }>;
          };
        };
      };

      const { data: bookings, error: bookingsError } = await supabase
        .from('rider_booking')
        .select('id, assigned_driver, pick_up, pickup_lat, pickup_lng, drop_off, drop_lat, drop_lng, total_fare, total_km, total_time, ride_status, payment_status, created_at')
        .eq('rider_id', user.id)
        .in('ride_status', ['accepted', 'arrived', 'in_progress', 'cancelled', 'completed'])
        .order('created_at', { ascending: false })
        .returns<RiderBookingHistoryRow[]>();

      if (bookingsError || !bookings) {
        setHistoryItems([]);
        return;
      }

      const scheduleResult = await untypedSupabase
        .from('schedule_booking')
        .select('id, assigned_driver, pick_up, pickup_lat, pickup_lng, drop_off, drop_lat, drop_lng, total_fare, total_km, total_time, booking_status, created_at, schedule_date, pickup_time, converted_rider_booking_id')
        .eq('rider_id', user.id)
        .in('booking_status', ['pending', 'confirmed', 'cancelled', 'expired', 'converted'])
        .order('created_at', { ascending: false });

      const scheduledBookings = Array.isArray(scheduleResult.data)
        ? (scheduleResult.data as ScheduleBookingHistoryRow[])
        : [];

      if (scheduleResult.error) {
        setHistoryItems([]);
        return;
      }

      const convertedRiderBookingIds = new Set(
        scheduledBookings
          .map((booking) => booking.converted_rider_booking_id)
          .filter((value): value is string => Boolean(value))
      );

      const bookingMetricsById = bookings.reduce<Record<string, { totalKm: number | null; etaMinutes: number | null }>>(
        (lookup, booking) => {
          lookup[booking.id] = {
            totalKm: booking.total_km ?? null,
            etaMinutes: booking.total_time ?? null,
          };

          return lookup;
        },
        {}
      );

      const bookingById = bookings.reduce<Record<string, RiderBookingHistoryRow>>((lookup, booking) => {
        lookup[booking.id] = booking;
        return lookup;
      }, {});

      const instantBookings = bookings.filter((booking) => !convertedRiderBookingIds.has(booking.id));

      const driverIds = Array.from(
        new Set(
          [...instantBookings, ...scheduledBookings]
            .map((booking) => booking.assigned_driver)
            .filter((value): value is string => Boolean(value))
        )
      );

      let driverById: Record<string, DriverSummary> = {};

      if (driverIds.length > 0) {
        const driverResult = await untypedSupabase
          .from('driver_profile')
          .select('uuid, first_name, last_name, profile_img, rating')
          .in('uuid', driverIds);

        const drivers = Array.isArray(driverResult.data) ? (driverResult.data as Record<string, unknown>[]) : [];

        driverById = drivers.reduce<Record<string, DriverSummary>>((lookup, driver) => {
          const uuid = typeof driver['uuid'] === 'string' ? driver['uuid'] : '';

          if (!uuid) {
            return lookup;
          }

          const firstName = typeof driver['first_name'] === 'string' ? driver['first_name'] : '';
          const lastName = typeof driver['last_name'] === 'string' ? driver['last_name'] : '';
          const displayName = firstName || lastName || 'Driver';

          lookup[uuid] = {
            name: displayName,
            profileImg: typeof driver['profile_img'] === 'string' ? driver['profile_img'] : null,
            rating: typeof driver['rating'] === 'number' ? driver['rating'] : null,
          };

          return lookup;
        }, {});
      }

      const instantHistoryItems: RideHistoryItem[] = instantBookings.map((booking) => {
        const driver = booking.assigned_driver ? driverById[booking.assigned_driver] : undefined;
        const canReopenBooking =
          ACTIVE_RIDE_STATUSES.includes(booking.ride_status as ActiveRideHistoryStatus) ||
          (booking.ride_status === 'completed' && booking.payment_status !== 'paid');

        return {
          id: booking.id,
          source: 'rider_booking',
          activeBookingId: canReopenBooking ? booking.id : null,
          rideTypeLabel: 'Instant ride',
          driverName: driver?.name ?? 'Driver',
          hasAssignedDriver: Boolean(booking.assigned_driver),
          driverProfileImg: driver?.profileImg ?? null,
          driverRating: driver?.rating ?? null,
          pickupLocation: formatHistoryAddress(booking.pick_up),
          dropoffLocation: formatHistoryAddress(booking.drop_off),
          pickupLat: booking.pickup_lat ?? null,
          pickupLng: booking.pickup_lng ?? null,
          dropoffLat: booking.drop_lat ?? null,
          dropoffLng: booking.drop_lng ?? null,
          amount: booking.total_fare ?? 0,
          totalKm: booking.total_km ?? null,
          etaMinutes: booking.total_time ?? null,
          status: booking.ride_status,
          paymentStatus: booking.payment_status,
          dateLabel: getDateHeading(booking.created_at),
          timeLabel: getTimeLabel(booking.created_at),
          sortDate: booking.created_at,
        };
      });

      const scheduledHistoryItems: RideHistoryItem[] = scheduledBookings.map((booking) => {
        const driver = booking.assigned_driver ? driverById[booking.assigned_driver] : undefined;
        const scheduledDateTime = getScheduledDateTime(booking.schedule_date, booking.pickup_time, booking.created_at);
        const linkedBooking = booking.converted_rider_booking_id
          ? bookingById[booking.converted_rider_booking_id] ?? null
          : null;
        const convertedBookingMetrics = booking.converted_rider_booking_id
          ? bookingMetricsById[booking.converted_rider_booking_id]
          : undefined;
        const resolvedStatus: RideHistoryStatus = linkedBooking
          ? linkedBooking.ride_status
          : booking.booking_status === 'converted'
            ? 'completed'
            : booking.booking_status;
        const linkedBookingIsActive = linkedBooking
          ? ACTIVE_RIDE_STATUSES.includes(linkedBooking.ride_status as ActiveRideHistoryStatus) ||
            (linkedBooking.ride_status === 'completed' && linkedBooking.payment_status !== 'paid')
          : false;

        return {
          id: booking.id,
          source: 'schedule_booking',
          activeBookingId: linkedBookingIsActive && linkedBooking ? linkedBooking.id : null,
          rideTypeLabel: 'Scheduled ride',
          driverName: driver?.name ?? 'Awaiting driver assignment',
          hasAssignedDriver: Boolean(linkedBooking?.assigned_driver ?? booking.assigned_driver),
          driverProfileImg: driver?.profileImg ?? null,
          driverRating: driver?.rating ?? null,
          pickupLocation: formatHistoryAddress(booking.pick_up),
          dropoffLocation: formatHistoryAddress(booking.drop_off),
          pickupLat: linkedBooking?.pickup_lat ?? booking.pickup_lat ?? null,
          pickupLng: linkedBooking?.pickup_lng ?? booking.pickup_lng ?? null,
          dropoffLat: linkedBooking?.drop_lat ?? booking.drop_lat ?? null,
          dropoffLng: linkedBooking?.drop_lng ?? booking.drop_lng ?? null,
          amount: linkedBooking?.total_fare ?? booking.total_fare ?? 0,
          totalKm: booking.total_km ?? convertedBookingMetrics?.totalKm ?? null,
          etaMinutes: booking.total_time ?? convertedBookingMetrics?.etaMinutes ?? null,
          status: resolvedStatus,
          paymentStatus: linkedBooking?.payment_status ?? null,
          dateLabel: getDateHeading(scheduledDateTime),
          timeLabel: getTimeLabel(scheduledDateTime),
          sortDate: scheduledDateTime,
        };
      });

      const items = [...scheduledHistoryItems, ...instantHistoryItems].sort(
        (left, right) => new Date(right.sortDate).getTime() - new Date(left.sortDate).getTime()
      );

      setHistoryItems(items);
      setSelectedItem((currentSelectedItem) => {
        if (!currentSelectedItem) {
          return null;
        }

        return (
          items.find(
            (item) => item.id === currentSelectedItem.id && item.source === currentSelectedItem.source
          ) ?? null
        );
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[History] Failed to load ride history', error);
      }

      setHistoryItems([]);
    } finally {
      setIsLoading(true);
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory])
  );

  useEffect(() => {
    let isMounted = true;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted || userError || !user) {
        return;
      }

      const channelName = `rider-history:${user.id}:${Date.now()}`;
      activeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rider_booking',
            filter: `rider_id=eq.${user.id}`,
          },
          () => {
            void loadHistory();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'schedule_booking',
            filter: `rider_id=eq.${user.id}`,
          },
          () => {
            void loadHistory();
          }
        )
        .subscribe();
    };

    void setupRealtime();

    return () => {
      isMounted = false;

      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [loadHistory]);

  const filteredItems = historyItems.filter((item) => {
    if (activeTab === 'all') {
      return true;
    }

    if (activeTab === 'delivery') {
      return false;
    }

    return getRideCategory(item) === activeTab;
  });

  // Group items by date heading (e.g. "23 Aug", "18 Aug")
  const groupedBookings = filteredItems.reduce((groups, item) => {
    if (!groups[item.dateLabel]) {
      groups[item.dateLabel] = [];
    }
    groups[item.dateLabel].push(item);
    return groups;
  }, {} as Record<string, RideHistoryItem[]>);

  const filterTabs: { id: FilterTab; label: string; hasIcon?: boolean }[] = [
    { id: 'all', label: 'All', hasIcon: true },
    { id: 'city_rides', label: 'City rides' },
    { id: 'scheduled_ride', label: 'Scheduled ride' },
    { id: 'delivery', label: 'Limpopo Delivery' },
  ];
  const pendingScheduledRideCount = historyItems.filter(
    (item) => item.source === 'schedule_booking' && item.status === 'pending'
  ).length;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}> 
          Ride history
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {filterTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const shouldShowPendingBadge = tab.id === 'scheduled_ride' && pendingScheduledRideCount > 0;
            const pendingBadgeLabel = pendingScheduledRideCount > 99 ? '99+' : String(pendingScheduledRideCount);
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive ? '#C48B2D' : theme.colors.card,
                    borderColor: isActive ? '#C48B2D' : theme.colors.border,
                  },
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                {tab.hasIcon && (
                  <Text style={[styles.listIcon, { color: isActive ? '#FFFFFF' : theme.colors.textSecondary }]}>
                    {isActive ? '≡' : '≡'}
                  </Text>
                )}
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? '#FFFFFF' : theme.colors.text },
                  ]}
                >
                  {tab.label}
                </Text>
                {shouldShowPendingBadge && (
                  <View
                    style={[
                      styles.tabCountBadge,
                      {
                        backgroundColor: isActive ? '#FFFFFF' : '#C48B2D',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountBadgeText,
                        {
                          color: isActive ? '#C48B2D' : '#FFFFFF',
                        },
                      ]}
                    >
                      {pendingBadgeLabel}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bookings List Grouped by Date */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 12 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : Object.keys(groupedBookings).length > 0 ? (
          <View style={styles.bookingsList}>
            {Object.entries(groupedBookings).map(([date, items]) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={[styles.dateHeader, { color: theme.colors.text }]}>
                  {date}
                </Text>
                {items.map((item) => {
                  const isCancelled = item.status === 'cancelled';
                  const isActiveRide = canReopenActiveRide(item);
                  const cardBackgroundColor = theme.mode === 'dark' ? '#1C1C1E' : theme.colors.card;
                  const imageBackgroundColor = theme.mode === 'dark' ? '#000000' : '#F3F4F6';
                  const driverImageSource = item.driverProfileImg ? { uri: item.driverProfileImg } : DEFAULT_DRIVER_IMAGE;
                  const statusColors = getStatusColors(item.status);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (isActiveRide) {
                          openActiveRide(item);
                          return;
                        }

                        setSelectedItem(item);
                      }}
                      style={[
                        styles.bookingCard,
                        {
                          backgroundColor: cardBackgroundColor,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {/* Driver Profile Thumbnail */}
                      <View style={styles.avatarContainer}>
                        <View style={[styles.imageContainer, { backgroundColor: imageBackgroundColor }]}> 
                          <Image
                            source={driverImageSource}
                            style={styles.vehicleImage}
                            resizeMode="cover"
                          />
                        </View>
                        <View style={[styles.avatarRatingBadge, { backgroundColor: theme.mode === 'dark' ? '#2A2111' : '#FFF4D6' }]}>
                          <Ionicons name="star" size={10} color="#C48B2D" />
                          <Text style={styles.ratingBadgeText}>{formatDriverRating(item.driverRating)}</Text>
                        </View>
                      </View>

                      {/* Info Section */}
                      <View style={styles.cardContent}>
                        <View style={styles.nameRow}>
                          <Text
                            style={[styles.driverNameText, { color: theme.colors.text }]}
                            numberOfLines={1}
                          >
                            {item.driverName}
                          </Text>
                          <View style={styles.nameBadgesRow}>
                            <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}> 
                              <Text style={[styles.statusBadgePillText, { color: statusColors.textColor }]}>
                                {getStatusLabel(item.status)}
                              </Text>
                            </View>
                            <View style={[styles.rideTypeBadge, { backgroundColor: theme.colors.primary + '18' }]}> 
                              <Text style={[styles.rideTypeBadgeText, { color: theme.colors.primary }]}>
                                {item.rideTypeLabel}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text
                          style={[styles.subLocation, { color: theme.colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.pickupLocation}
                        </Text>
                        <Text
                          style={[
                            styles.mainLocation,
                            { color: theme.colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item.dropoffLocation}
                        </Text>
                        
                        {/* Time & Price Row */}
                        <View style={styles.bottomRow}>
                          <Text
                            style={[
                              styles.timeText,
                              { color: theme.colors.textSecondary },
                            ]}
                          >
                            {isActiveRide ? 'Open active ride' : item.timeLabel}
                          </Text>
                          <Text
                            style={[
                              styles.priceText,
                              { color: isCancelled ? '#E57373' : theme.colors.text },
                            ]}
                          >
                            {formatCurrency(item.amount)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              {activeTab === 'delivery' ? 'No Delivery at the Moment' : 'No history found'}
            </Text>
            {activeTab === 'delivery' && (
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>We are yet to launch it.</Text>
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedItem(null)}
      >
        {selectedItem ? (
          <SafeAreaView style={[styles.detailContainer, { backgroundColor: theme.colors.background }]}>
            <View style={styles.detailHeader}>
              <TouchableOpacity
                onPress={() => setSelectedItem(null)}
                style={[
                  styles.detailHeaderAction,
                  {
                    marginRight: 10,
                  },
                ]}
              >
                <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: theme.colors.text, fontSize: 20 }]}>Ride details</Text>
            </View>

            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={styles.detailDriverRow}>
                <View style={styles.avatarContainer}>
                  <Image
                    source={selectedItem.driverProfileImg ? { uri: selectedItem.driverProfileImg } : DEFAULT_DRIVER_IMAGE}
                    style={styles.detailDriverImage}
                  />
                  <View style={[styles.avatarRatingBadge, { backgroundColor: theme.mode === 'dark' ? '#2A2111' : '#FFF4D6' }]}>
                    <Ionicons name="star" size={10} color="#C48B2D" />
                    <Text style={styles.ratingBadgeText}>{formatDriverRating(selectedItem.driverRating)}</Text>
                  </View>
                </View>
                <View style={styles.detailDriverContent}>
                  <Text style={[styles.driverNameText, { color: theme.colors.text, fontSize: 18 }]}>
                    {selectedItem.driverName}
                  </Text>
                  <View style={styles.detailMetaRow}>
                    <View style={[styles.rideTypeBadge, { backgroundColor: theme.colors.primary + '18' }]}>
                      <Text style={[styles.rideTypeBadgeText, { color: theme.colors.primary }]}>
                        {selectedItem.rideTypeLabel}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: getStatusColors(selectedItem.status).textColor },
                      ]}
                    >
                      {getStatusLabel(selectedItem.status)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.detailCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <View style={styles.detailRow}>
                  <Ionicons name="radio-button-on" size={16} color={theme.colors.primary} />
                  <Text style={[styles.detailLocationText, { color: theme.colors.text }]} numberOfLines={2}>
                    {selectedItem.pickupLocation}
                  </Text>
                </View>
                <View style={[styles.detailDivider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.detailRow}>
                  <Ionicons name="location" size={16} color={theme.colors.error} />
                  <Text style={[styles.detailLocationText, { color: theme.colors.text }]} numberOfLines={2}>
                    {selectedItem.dropoffLocation}
                  </Text>
                </View>
              </View>

              <View style={[styles.detailCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <View style={styles.detailSummaryRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Assigned Driver</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {selectedItem.hasAssignedDriver ? selectedItem.driverName : 'Awaiting driver assignment'}
                  </Text>
                </View>
                <View style={styles.detailSummaryRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                    {selectedItem.source === 'schedule_booking' ? 'Pickup Time' : 'Date'}
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {selectedItem.source === 'schedule_booking'
                      ? `${selectedItem.dateLabel} · ${selectedItem.timeLabel}`
                      : `${selectedItem.dateLabel} · ${selectedItem.timeLabel}`}
                  </Text>
                </View>
                <View style={styles.detailSummaryRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Distance</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {typeof selectedItem.totalKm === 'number' && !Number.isNaN(selectedItem.totalKm)
                      ? selectedItem.totalKm.toFixed(1)
                      : '--'}
                  </Text>
                </View>
                <View style={styles.detailSummaryRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>ETA</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {formatEtaLabel(selectedItem.etaMinutes)}
                  </Text>
                </View>
                <View style={styles.detailSummaryRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Amount</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>{formatCurrency(selectedItem.amount)}</Text>
                </View>
              </View>

              {selectedItem.status === 'completed' && selectedItemStaticMapUrl ? (
                <View style={[styles.detailCard, styles.mapCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mapTitle, { color: theme.colors.text }]}>Trip route map</Text>
                  <Image
                    source={{ uri: selectedItemStaticMapUrl }}
                    style={styles.staticMapImage}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  detailHeaderAction: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  tabsContainer: {
    paddingVertical: 12,
  },
  tabs: {
    paddingHorizontal: 20,
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
  },
  listIcon: {
    marginRight: 6,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabCountBadge: {
    minWidth: 18,
    height: 18,
    marginLeft: 8,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  bookingsList: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  dateGroup: {
    marginTop: 10,
  },
  dateHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  bookingCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  avatarContainer: {
    position: 'relative',
    paddingTop: 4,
  },
  imageContainer: {
    width: 48,
    height: 48,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarRatingBadge: {
    position: 'absolute',
    top: 0,
    right: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  vehicleEmoji: {
    fontSize: 24,
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
  },
  nameBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  driverNameText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 0,
    flex: 1,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  rideTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rideTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ratingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6118',
  },
  subLocation: {
    fontSize: 13,
    marginBottom: 2,
  },
  mainLocation: {
    fontSize: 13,
    fontWeight: '100',
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 13,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  detailContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  detailDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 20,
  },
  detailDriverContent: {
    flex: 1,
  },
  detailDriverImage: {
    width: 52,
    height: 52,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailDivider: {
    height: 1,
    marginVertical: 12,
    marginLeft: 26,
  },
  detailLocationText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  detailSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  mapCard: {
    padding: 12,
    overflow: 'hidden',
  },
  mapTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  staticMapImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#E8E8E8',
  },
});
