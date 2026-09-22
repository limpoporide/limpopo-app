import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync();

const HAS_SEEN_INTRO_KEY = 'has_seen_intro';

export default function SplashScreenPage() {
  const router = useRouter();
  const { theme } = useTheme();

  useEffect(() => {
    let isActive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkAuthStatus = async () => {
      try {
        await SplashScreen.hideAsync();

        timer = setTimeout(async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!isActive) {
            return;
          }

          if (session) {
            const { data: riderProfile, error: riderProfileError } = await supabase
              .from('rider_profile')
              .select('uuid')
              .eq('uuid', session.user.id)
              .maybeSingle();

            if (!isActive) {
              return;
            }

            if (riderProfileError) {
              console.error('Error checking rider profile during splash:', riderProfileError);
            }

            if (riderProfile) {
              router.replace('/(tabs)/home');
              return;
            }

            await supabase.auth.signOut();
            await AsyncStorage.removeItem('rider_profile_cache');

            if (!isActive) {
              return;
            }

            router.replace('/signup');
            return;
          }

          const hasSeenIntro = await AsyncStorage.getItem(HAS_SEEN_INTRO_KEY);

          if (!isActive) {
            return;
          }

          router.replace(hasSeenIntro === 'true' ? '/login' : '/intro-slider');
        }, 2000);
      } catch (error) {
        console.error('Error during splash screen:', error);
      }
    };

    checkAuthStatus();

    return () => {
      isActive = false;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [router]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.primary }]}
    >
      <View style={styles.content}>
        <Image
          source={require('../assets/logo-limpopo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.subtitle, { color: '#FFFFFF' }]}>
          Pride of Africa
        </Text>
        <ActivityIndicator
          size="large"
          color="#FFFFFF"
          style={styles.loader}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 210,
    height: 210,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.9,
    textAlign: 'center',
    marginTop: -2,
  },
  loader: {
    marginTop: 40,
  },
});
