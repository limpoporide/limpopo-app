import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  ImageBackground,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useNotifications } from '../../src/context/NotificationsContext';
import { formatCurrency } from '../../src/utils/formatters';
import { fetchRiderProfile, getCachedRiderProfile, cacheRiderProfile, setRiderProfileVisibility } from '../../src/lib/rider-profile';
import { supabase } from '../../src/lib/supabase';

const { width } = Dimensions.get('window');
const BANNER_WIDTH = width - 30; // Margin 30 on each side

export default function Home() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { unreadCount } = useNotifications();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [selectedRideType, setSelectedRideType] = useState<'instant' | 'scheduled' | 'courier' | null>(null);
  const [riderFirstName, setRiderFirstName] = useState('Rider');
  const [riderProfileImage, setRiderProfileImage] = useState<string | null>(null);
  const [riderUuidSuffix, setRiderUuidSuffix] = useState('-----');
  const [walletBalance, setWalletBalance] = useState(0);

  // Define border colors based on theme
  const borderColor = '#DAA520'; // Dark gold for both modes
  const walletBorderColor = isDark ? '#FFFFFF' : '#DAA520'; // White in dark mode, gold in light mode
  const headerIconColor = isDark ? theme.colors.text : theme.colors.primary;

  const applyProfile = useCallback((profile: Awaited<ReturnType<typeof getCachedRiderProfile>>) => {
    if (!profile) {
      return;
    }

    setRiderFirstName(profile.firstName || 'Rider');
    setRiderProfileImage(profile.profileImg);
    setRiderUuidSuffix(profile.uuid.slice(-5).toUpperCase());
    setWalletBalance(Number(profile.walletBalance || 0));
    setBalanceVisible(!profile.visibility);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadProfile = async () => {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile && isMounted) {
          applyProfile(cachedProfile);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile && isMounted) {
          applyProfile(latestProfile);
        }
      };

      loadProfile();

      return () => {
        isMounted = false;
      };
    }, [applyProfile])
  );

  useEffect(() => {
    let isActive = true;
    let walletChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToWalletBalance = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !isActive) {
        return;
      }

      const channelName = `home-wallet-balance-${user.id}-${Date.now()}`;

      walletChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rider_profile',
            filter: `uuid=eq.${user.id}`,
          },
          async (payload) => {
            if (isActive) {
              setWalletBalance(Number(payload.new.wallet_balance || 0));
              setBalanceVisible(!(payload.new.visibility as boolean | undefined ?? true));
            }

            const currentProfile = await getCachedRiderProfile();

            if (currentProfile) {
              await cacheRiderProfile({
                ...currentProfile,
                walletBalance: Number(payload.new.wallet_balance || 0),
                visibility: (payload.new.visibility as boolean | undefined) ?? currentProfile.visibility,
              });
            }
          }
        )
        .subscribe();
    };

    subscribeToWalletBalance();

    return () => {
      isActive = false;

      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
    };
  }, []);

  const banners = [
    {
      id: 1,
      title: 'Victoria Island',
      subtitle: 'Old Ikoyi, Banana Island, Bourdillon Road. The estate roads and main corridors, day and night.',
      image: require('../../assets/banner1.jpeg'),
    },
    {
      id: 2,
      title: 'Lekki',
      subtitle: 'Fast pickups for your next trip.',
      image: require('../../assets/banner2.jpeg'),
    },
    {
      id: 3,
      title: 'Ikoyi',
      subtitle: 'Move in comfort with Limpopo rides.',
      image: require('../../assets/banner3.jpeg'),
    },
  ];

  const handleBalanceVisibilityToggle = async () => {
    const nextValue = !balanceVisible;
    setBalanceVisible(nextValue);

    try {
      const updatedProfile = await setRiderProfileVisibility(!nextValue);

      if (updatedProfile) {
        setBalanceVisible(!updatedProfile.visibility);
      }
    } catch {
      setBalanceVisible(!nextValue);
    }
  };

  const handleOpenChat = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Chat unavailable', 'You are not assigned to a pilot yet');
      return;
    }

    const { data: booking, error: bookingError } = await supabase
      .from('rider_booking')
      .select('id, assigned_driver')
      .eq('rider_id', user.id)
      .not('assigned_driver', 'is', null)
      .in('ride_status', ['accepted', 'arrived', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bookingError || !booking?.assigned_driver) {
      Alert.alert('Chat unavailable', 'You are not assigned to a pilot yet');
      return;
    }

    const { data: driverProfile } = await supabase
      .from('driver_profile')
      .select('first_name')
      .eq('uuid', booking.assigned_driver)
      .returns<{ first_name: string | null }[]>()
      .maybeSingle();

    const { data: vehicleRecord } = await (supabase as any)
      .from('vehicle_management')
      .select('vehicle_type')
      .eq('assigned', booking.assigned_driver)
      .maybeSingle();

    router.push({
      pathname: '/bookings/chat',
      params: {
        bookingId: booking.id,
        driverName: typeof driverProfile?.first_name === 'string' ? driverProfile.first_name : 'Driver',
        vehicleLabel: typeof vehicleRecord?.vehicle_type === 'string' ? vehicleRecord.vehicle_type : '',
      },
    });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {/* Fixed Header Section */}
      <View style={[
        styles.header,
        {
          backgroundColor: theme.colors.background,
          borderColor: borderColor,
        }
      ]}>
          <View style={styles.headerLeft}>
            {/* Profile Image */}
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={styles.profileImageContainer}
            >
              {riderProfileImage ? (
                <Image
                  source={{ uri: riderProfileImage }}
                  style={styles.profileImage}
                  onError={() => setRiderProfileImage(null)}
                />
              ) : (
                <View style={[styles.profileIconContainer, { backgroundColor: theme.colors.primary }]}> 
                  <Ionicons name="person" size={22} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            {/* User Info */}
            <View style={styles.userInfo}>
              <Text style={[styles.greeting,] }>
                Hello {riderFirstName}
              </Text>
              <Text style={[styles.userNumber, { color: theme.colors.text }]}>
                  ID {riderUuidSuffix}
              </Text>
            </View>
          </View>

          {/* Header Right Icons */}
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconButton} onPress={() => void handleOpenChat()}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={headerIconColor} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={24} color={headerIconColor} />
              {unreadCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

      {/* Fixed Wallet Section */}
      <View style={[
        styles.walletSection,
        {
          backgroundColor: isDark ? '#000000' : '#040300',
          borderColor: walletBorderColor,
        }
      ]}>
          <View style={styles.walletLeft}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <View style={styles.balanceRow}>
              <View style={styles.balanceValueRow}>
                <Text style={styles.nairaSymbol}>₦</Text>
                <Text
                  style={styles.balanceAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {balanceVisible ? formatCurrency(walletBalance).replace('₦', '') : '****'}
                </Text>
              </View>
              <View style={styles.balanceActionsRow}>
                <TouchableOpacity
                  onPress={handleBalanceVisibilityToggle}
                  style={styles.visibilityToggle}
                >
                  <Ionicons
                    name={balanceVisible ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addFundButton}
                  onPress={() => router.push('/(tabs)/wallet')}
                >
                  <Text style={styles.addFundButtonText}>Add fund</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

      {/* Fixed Ride Type Selector */}
      <View style={styles.rideTypeSection}>
          <TouchableOpacity
            style={[
              styles.rideTypeCard,
              {
                backgroundColor: selectedRideType === 'instant' ? theme.colors.primary : theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {
              setSelectedRideType('instant');
              router.push('/bookings/destination');
            }}
          >
            <Image
              source={require('../../assets/Captain.png')}
              style={styles.rideTypeIcon}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[
                styles.rideTypeLabel,
                {
                  color: selectedRideType === 'instant' ? '#fff' : theme.colors.text,
                  fontWeight: selectedRideType === 'instant' ? 'bold' : 'normal',
                },
              ]}
            >
              Instant Ride
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.rideTypeCard,
              {
                backgroundColor: selectedRideType === 'scheduled' ? theme.colors.primary : theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {
              setSelectedRideType('scheduled');
              router.push('/schedule_bookings/onboarding');
            }}
          >
            <Ionicons
              name="calendar"
              size={32}
              color={selectedRideType === 'scheduled' ? '#fff' : theme.colors.textSecondary}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[
                styles.rideTypeLabel,
                {
                  color: selectedRideType === 'scheduled' ? '#fff' : theme.colors.text,
                  fontWeight: selectedRideType === 'scheduled' ? 'bold' : 'normal',
                },
              ]}
            >
              Scheduled Ride
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.rideTypeCard,
              {
                backgroundColor: selectedRideType === 'courier' ? theme.colors.primary : theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {
              setSelectedRideType('courier');
              Alert.alert('Couriers', 'Courier booking will be available here soon.');
            }}
          >
            <Ionicons
              name="cube-outline"
              size={32}
              color={selectedRideType === 'courier' ? '#fff' : theme.colors.textSecondary}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[
                styles.rideTypeLabel,
                {
                  color: selectedRideType === 'courier' ? '#fff' : theme.colors.text,
                  fontWeight: selectedRideType === 'courier' ? 'bold' : 'normal',
                },
              ]}
            >
              Couriers
            </Text>
          </TouchableOpacity>
        </View>

      {/* Fixed Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {/* Scrollable Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Scrollable Banner */}
        <View style={styles.bannerSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bannerScrollContent}
            snapToInterval={BANNER_WIDTH + 15}
            decelerationRate="fast"
          >
            {banners.map((banner, index) => (
              <TouchableOpacity
                key={banner.id}
                style={[
                  styles.bannerCard,
                  isDark && styles.bannerCardDark,
                  index === 0 && { marginLeft: 20 },
                  index === banners.length - 1 && { marginRight: 20 },
                ]}
              >
                <ImageBackground
                  source={banner.image}
                  style={styles.bannerImageBackground}
                  imageStyle={styles.bannerImage}
                  resizeMode="cover"
                >
                  <View style={styles.bannerOverlay}>
                    <Text style={styles.bannerTitle}>{banner.title}</Text>
                    <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                  </View>
                </ImageBackground>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Go Place Section */}
        <View style={styles.goPlaceSection}>
          <Text style={[styles.goPlaceText, { color: theme.colors.text }] }>
            Go places - with Limpopo rides
          </Text>
        </View>

        {/* Large Banner */}
        <TouchableOpacity
          style={styles.largeBanner}
          onPress={() => {
              router.push('/schedule_bookings/onboarding');
          }}
        >
          <ImageBackground
            source={require('../../assets/limpopo-driver.jpeg')}
            style={styles.largeBannerImageBackground}
            imageStyle={styles.largeBannerImage}
            resizeMode="cover"
          >
            <View style={styles.largeBannerOverlay}>
              <View style={[styles.largeBannerButton, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.largeBannerButtonText}>Hire a Pilot</Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderRadius: 16,
    marginHorizontal: 10,
    marginTop: 10,
    borderWidth: 0.5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImageContainer: {
    marginRight: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  profileImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  profileIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    marginBottom: 2,
    color: '#8E8E93',
  },
  userNumber: {
    fontSize: 11,
    fontWeight: '400',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    marginLeft: 16,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  walletSection: {
    marginHorizontal: 10,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderWidth: 0.3,
  },
  walletLeft: {
    flex: 1,
  },
  walletLabel: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  balanceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  nairaSymbol: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 4,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  visibilityToggle: {
    padding: 4,
  },
  addFundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    marginLeft: 12,
  },
  addFundButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  rideTypeSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 10,
  },
  rideTypeCard: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  rideTypeIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  rideTypeLabel: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    width: '100%',
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  goPlaceSection: {
    marginTop: 0,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  goPlaceText: {
    fontSize: 14,
    fontWeight: '400',
    marginLeft: 10,
  },
  bannerSection: {
    marginBottom: 8,
  },
  bannerScrollContent: {
    paddingVertical: 4,
  },
  bannerCard: {
    width: BANNER_WIDTH,
    height: 150,
    borderRadius: 16,
    marginRight: 15,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  bannerCardDark: {
    shadowColor: '#ebd1d1',
    shadowOpacity: 0.15,
    shadowRadius: 15,
  },
  bannerImageBackground: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bannerImage: {
    borderRadius: 16,
    opacity: 1,
  },
  bannerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  bannerSubtitle: {
    color: '#fff',
    fontSize: 10,
    opacity: 0.95,
  },
  largeBanner: {
    marginHorizontal: 10,
    marginBottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  largeBannerImageBackground: {
    minHeight: 210,
    justifyContent: 'flex-end',
  },
  largeBannerImage: {
    borderRadius: 16,
  },
  largeBannerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  largeBannerButton: {
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 24,
  },
  largeBannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
