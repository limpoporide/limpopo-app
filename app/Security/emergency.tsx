import React, { useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';

const HERO_IMAGES = [
  require('../../assets/security1.jpeg'),
  require('../../assets/security2.jpeg'),
  require('../../assets/security3.jpeg'),
  require('../../assets/security4.jpeg'),
];

const SECURITY_TIPS = [
  {
    id: '1',
    title: 'Match the License Plate & Car Model',
    body: 'Always verify that the vehicle\'s plate number, make, and model match the details in the app before approaching or opening the door.',
    icon: 'car-sport-outline' as const,
  },
  {
    id: '2',
    title: 'Share Your Trip Status',
    body: 'Use the in-app "Share Trip" feature to send your live route and estimated arrival time to a trusted friend or family member.',
    icon: 'share-social-outline' as const,
  },
  {
    id: '3',
    title: 'Always use your Seat',
    body: 'Always use your seat belt while using Limpopo ride. Ensure it is firmly secured.',
    icon: 'shield-checkmark-outline' as const,
  },
  {
    id: '4',
    title: 'Track the Route on Your Map',
    body: 'Keep your GPS active and follow the route on your own phone map.',
    icon: 'map-outline' as const,
  },
  {
    id: '5',
    title: 'Keep Personal Details Private',
    body: 'Avoid sharing sensitive personal information such as your personal details and financial status during your ride.',
    icon: 'lock-closed-outline' as const,
  },
];

export default function EmergencyScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [activeSlide, setActiveSlide] = useState(0);
  const heroScrollRef = useRef<ScrollView>(null);
  const cardSurface = isDark ? '#171717' : '#FCFBF7';
  const accentSurface = isDark ? 'rgba(206, 160, 7, 0.14)' : '#F2E6C8';

  const handleHeroScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveSlide(nextIndex);
  };

  useEffect(() => {
    const autoSlideInterval = setInterval(() => {
      setActiveSlide((prev) => {
        const nextSlide = (prev + 1) % HERO_IMAGES.length;
        heroScrollRef.current?.scrollTo({
          x: nextSlide * width,
          animated: true,
        });
        return nextSlide;
      });
    }, 4000);

    return () => clearInterval(autoSlideInterval);
  }, [width]);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Security</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.securityTitleSection, { marginLeft: 20, marginRight: 20, marginBottom: 16 }]}>
          <Text style={[styles.securityTitleText, { color: theme.colors.text }]}>Limpopo Security Tips</Text>
        </View>

        <View style={styles.heroSliderWrap}>
          <ScrollView
            ref={heroScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleHeroScrollEnd}
            scrollEventThrottle={16}
            style={styles.heroScroll}
          >
            {HERO_IMAGES.map((imageSource, index) => (
              <ImageBackground
                key={index}
                source={imageSource}
                resizeMode="contain"
                style={[styles.hero, { width }]}
                imageStyle={styles.heroImage}
              >
                <View style={styles.heroOverlay}>
                  <View style={[styles.heroBadge, { backgroundColor: accentSurface }]}>
                    <Text style={[styles.heroBadgeText, { color: isDark ? '#F7E7A8' : '#6C5100' }]}>Stay alert</Text>
                  </View>
                </View>
              </ImageBackground>
            ))}
          </ScrollView>

          <View style={styles.heroPagination}>
            {HERO_IMAGES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.heroDot,
                  {
                    backgroundColor:
                      index === activeSlide ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)',
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.tipsSection}>
          {SECURITY_TIPS.map((tip) => (
            <View key={tip.id} style={[styles.tipCard, { backgroundColor: cardSurface, borderColor: theme.colors.border }]}> 
              <View style={[styles.tipIconWrap, { backgroundColor: accentSurface }]}> 
                <Ionicons name={tip.icon} size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.tipBody}>
                <Text
                  numberOfLines={1}
                  style={[styles.tipTitle, { color: theme.colors.primary }]}
                >
                  {tip.title}
                </Text>
                <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>{tip.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  hero: {
    width: '100%',
    minHeight: 280,
    justifyContent: 'flex-end',
  },
  heroSliderWrap: {
    position: 'relative',
  },
  heroScroll: {
    width: '100%',
  },
  heroImage: {
    borderRadius: 0,
  },
  heroOverlay: {
    minHeight: 280,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    alignItems: 'flex-start',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  securityTitleSection: {
    paddingVertical: 12,
  },
  securityTitleText: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: -8,
  },
  heroPagination: {
    position: 'absolute',
    left: '50%',
    bottom: 16,
    transform: [{ translateX: -20 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 10,
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  tipsSection: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 14,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  tipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipBody: {
    flex: 1,
    gap: 6,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 22,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 21,
  },
});