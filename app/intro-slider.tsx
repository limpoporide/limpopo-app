import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  useWindowDimensions,
  TouchableOpacity,
  ImageBackground,
  ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../src/context/ThemeContext';

const HAS_SEEN_INTRO_KEY = 'has_seen_intro';
const SCREEN_HEIGHT = Dimensions.get('screen').height;

interface SlideItem {
  id: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

const slides: SlideItem[] = [
  {
    id: '1',
    title: 'The Pride of Africa',
    description: 'Premium experience with Limpopo ride.Browse through our extensive collection of vehicles and find the perfect match for your journey.',
    image: require('../assets/introq.jpeg'),
  },
  {
    id: '2',
    title: 'Business Rides',
    description: 'Smart trip planning for businesses. Quick and easy booking process. Get on the road in minutes with our seamless platform.',
    image: require('../assets/intro2.jpeg'),
  },
  {
    id: '3',
    title: 'Simple Scheduling Pickup',
    description: ' Schedule your pickups with ease. by Hourly rate or renters.',
    image: require('../assets/intro3.jpeg'),
  },
];

export default function IntroSlider() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/login');
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/login');
  };

  const renderItem = ({ item }: { item: SlideItem }) => (
    <View style={{ width, height: SCREEN_HEIGHT }}>
      <ImageBackground source={item.image} style={styles.slideBackground} resizeMode="cover">
        <View style={styles.imageOverlay} />
        <View style={styles.contentSpacer} />
        <View style={[styles.textBlock, { paddingBottom: insets.bottom + 188 }]}> 
          <Text style={[styles.title, { color: '#FFFFFF' }]}>
            {item.title}
          </Text>
          <Text style={[styles.description, { color: 'rgba(255,255,255,0.88)', maxWidth: width * 0.78 }]}>
            {item.description}
          </Text>
        </View>
      </ImageBackground>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <TouchableOpacity
        style={[styles.skipButton, { top: insets.top + 18 }]}
        onPress={handleSkip}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={slides}
        style={{ flex: 1, width, height: SCREEN_HEIGHT }}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        keyExtractor={(item) => item.id}
      />

      <View style={[styles.bottomContent, { bottom: insets.bottom + 40 }]}> 
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentIndex
                      ? theme.colors.primary
                      : theme.colors.border,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  slideBackground: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  contentSpacer: {
    flex: 1,
  },
  textBlock: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomContent: {
    position: 'absolute',
    left: 28,
    right: 28,
    gap: 18,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  nextButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});