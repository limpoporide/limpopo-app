import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_HORIZONTAL_PADDING = 20;
const SLIDER_WIDTH = SCREEN_WIDTH;
const RENT_SLIDE_HEIGHT = 240;
const AUTO_SLIDE_INTERVAL_MS = 8000;
const LATO_FONT_FAMILY = 'Lato';
const MUSTARD_YELLOW = '#C9A227';
const BANNER_BACKGROUND_IMAGE = require('../../assets/city-bg.jpg');

type QuickAction = 'ride' | 'hourly' | 'hire';

type RentSlide = {
  id: string;
  image: number;
};

const RENT_SLIDES: RentSlide[] = [
  { id: '1', image: require('../../assets/slide1.png') },
  { id: '2', image: require('../../assets/slide2.png') },
  { id: '3', image: require('../../assets/slide3.png') },
];

export default function ScheduleOnboardingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const sliderRef = useRef<FlatList<RentSlide> | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setActiveSlideIndex((currentIndex) => {
        const nextIndex = (currentIndex + 1) % RENT_SLIDES.length;

        sliderRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });

        return nextIndex;
      });
    }, AUTO_SLIDE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleQuickActionPress = (action: QuickAction) => {
    setSelectedAction(action);

    if (action === 'ride') {
      router.push({
        pathname: '/schedule_bookings/ride_route',
        params: { scheduleType: 'ride' },
      });
      return;
    }

    if (action === 'hourly') {
      router.push('/schedule_bookings/hourly_booking');
      return;
    }

    if (action === 'hire') {
      router.push('/schedule_bookings/rent_booking');
    }
  };

  const handleSlidesScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SLIDER_WIDTH);
    setActiveSlideIndex(index);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.greetingSection}>
        <View style={styles.greetingRow}>
          {/* <View style={styles.greetingCard}>
            <Text style={[styles.greetingText, { color: theme.colors.text }]}>
              Hi {riderFirstName},
            </Text>
          </View> */}
          <View style={styles.greetingSpacer} />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close scheduled bookings"
            onPress={() => router.back()}
            style={[styles.closeButton, { backgroundColor: theme.colors.card }]}
          >
            <Ionicons name="close" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.swipeSection}>
        <Text style={[styles.actionSectionTitle, { color: theme.colors.textSecondary }]}>
          Choose a scheduling service
        </Text>

        <View style={styles.quickActionRow}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.quickActionCard,
              {
                  backgroundColor: selectedAction === 'ride' ? MUSTARD_YELLOW : theme.colors.card,
              },
            ]}
            onPress={() => handleQuickActionPress('ride')}
          >
            <Ionicons
              name="car-outline"
              size={24}
              color={selectedAction === 'ride' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.quickActionLabel,
                { color: selectedAction === 'ride' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              Ride
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.quickActionCard,
              {
                  backgroundColor: selectedAction === 'hourly' ? MUSTARD_YELLOW : theme.colors.card,
              },
            ]}
            onPress={() => handleQuickActionPress('hourly')}
          >
            <Ionicons
              name="time-outline"
              size={24}
              color={selectedAction === 'hourly' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.quickActionLabel,
                { color: selectedAction === 'hourly' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              Hourly rate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.quickActionCard,
              {
                  backgroundColor: selectedAction === 'hire' ? MUSTARD_YELLOW : theme.colors.card,
              },
            ]}
            onPress={() => handleQuickActionPress('hire')}
          >
            <Ionicons
              name="briefcase-outline"
              size={24}
              color={selectedAction === 'hire' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.quickActionLabel,
                { color: selectedAction === 'hire' ? '#FFFFFF' : theme.colors.text },
              ]}
            >
              Hire
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <ScrollView
        style={styles.scrollSection}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rentSection}>
          {/* <View style={styles.rentTitleRow}>
            <Ionicons name="car-sport-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.rentTitle, { color: theme.colors.text }]}>Rent a car | Limpopo Hire Services</Text>
          </View> */}

          <View style={styles.rentCarouselBlock}>
            <FlatList
              ref={sliderRef}
              data={RENT_SLIDES}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              onMomentumScrollEnd={handleSlidesScrollEnd}
              onScrollToIndexFailed={() => {
                sliderRef.current?.scrollToOffset({
                  offset: activeSlideIndex * SLIDER_WIDTH,
                  animated: true,
                });
              }}
              style={styles.rentSlider}
              contentContainerStyle={styles.rentSliderContent}
              renderItem={({ item }) => (
                <View style={styles.rentSlideCard}>
                  <ImageBackground
                    source={BANNER_BACKGROUND_IMAGE}
                    style={styles.rentSlideFrame}
                    imageStyle={styles.rentSlideFrameImage}
                    resizeMode="cover"
                  >
                    <Image source={item.image} style={styles.rentSlideImage} resizeMode="contain" />
                  </ImageBackground>
                </View>
              )}
            />

            <TouchableOpacity
              style={[
                styles.hireButton,
                { backgroundColor: MUSTARD_YELLOW },
              ]}
              onPress={() => router.push('/schedule_bookings/rent_booking')}
              activeOpacity={0.85}
            >
              <Text style={styles.bookNowButtonText}>Hire Now</Text>
            </TouchableOpacity>

            <View style={[styles.serviceInfoCard, { backgroundColor: theme.colors.card }]}> 
              <Text style={[styles.serviceInfoText, { color: theme.colors.text }]}> 
                <Text style={styles.serviceInfoEmphasis}>Limpopo Ride Scheduling Service</Text>
                {' '}is a premium executive mobility experience, designed to make every journey seamless, stylish, and comfortable. Schedule your ride in advance and enjoy reliable, personalized transportation tailored to your time and destination.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  greetingSection: {
    paddingTop: 24,
    paddingBottom: 12,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  greetingSpacer: {
    flex: 1,
  },
  greetingCard: {
    marginBottom: 6,
    flex: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.4,
    flexWrap: 'wrap',
    fontFamily: LATO_FONT_FAMILY,
  },
  swipeSection: {
    paddingVertical: 20,
  },
  actionSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: LATO_FONT_FAMILY,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: -0.2,
    fontFamily: LATO_FONT_FAMILY,
  },
  helperText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: LATO_FONT_FAMILY,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  scrollSection: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  rentSection: {
    paddingTop: 16,
    justifyContent: 'flex-start',
  },
  rentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  rentTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.3,
    
  },
  rentCarouselBlock: {
    alignItems: 'center',
  },
  rentSlider: {
    width: SCREEN_WIDTH,
    height: RENT_SLIDE_HEIGHT,
    flexGrow: 0,
    marginHorizontal: -CONTENT_HORIZONTAL_PADDING,
  },
  rentSliderContent: {
    alignItems: 'center',
  },
  rentSlideCard: {
    width: SLIDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rentSlideFrame: {
    width: '100%',
    height: RENT_SLIDE_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  rentSlideFrameImage: {
    borderRadius: 18,
  },
  rentSlideImage: {
    width: '100%',
    height: '100%',
  },
  hireButton: {
    width: '100%',
    marginTop: 14,
    marginBottom: 18,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  bookNowButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: LATO_FONT_FAMILY,
  },
  serviceInfoCard: {
    width: '100%',
    marginTop: 30,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  serviceInfoText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'justify',
    fontWeight: '400',
    fontFamily: LATO_FONT_FAMILY,
  },
  serviceInfoEmphasis: {
    fontWeight: '600',
    fontFamily: LATO_FONT_FAMILY,
  },
});
