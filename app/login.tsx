import React, { useState } from 'react';
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';

export default function Login() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ phone: '', password: '' });

  const normalizePhoneNumber = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');

    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return `+234${digitsOnly.slice(1)}`;
    }

    if (digitsOnly.length === 10) {
      return `+234${digitsOnly}`;
    }

    if (digitsOnly.length === 13 && digitsOnly.startsWith('234')) {
      return `+${digitsOnly}`;
    }

    if (value.startsWith('+') && digitsOnly.length >= 10) {
      return `+${digitsOnly}`;
    }

    return null;
  };

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
    setPhoneNumber(digitsOnly);
    setErrors((current) => ({ ...current, phone: '' }));
  };

  const handlePasswordChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
    setPassword(digitsOnly);
    setErrors((current) => ({ ...current, password: '' }));
  };

  const handleLogin = async () => {
    let valid = true;
    const newErrors = { phone: '', password: '' };
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!phoneNumber) {
      newErrors.phone = 'Phone number is required';
      valid = false;
    } else if (!normalizedPhone) {
      newErrors.phone = 'Please enter a valid phone number';
      valid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      valid = false;
    } else if (!/^\d{6}$/.test(password)) {
      newErrors.password = 'Password must be exactly 6 digits';
      valid = false;
    }

    setErrors(newErrors);

    if (valid) {
      if (!normalizedPhone) {
        return;
      }

      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password,
      });

      setIsLoading(false);

      if (error) {
        Alert.alert('Login failed', error.message);
        return;
      }

      router.replace('/(tabs)/home');
    }
  };

  return (
    <ImageBackground
      source={require('../assets/banner3.jpeg')}
      style={styles.backgroundImage}
      imageStyle={styles.backgroundImageStyle}
      resizeMode="cover"
    >
      <View
        style={[
          styles.backgroundOverlay,
          { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.58)' },
        ]}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: 'transparent' }]}
        >
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor="transparent"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <Image
                  source={require('../assets/Limpopo round.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  Welcome Back
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}> 
                  Login to continue
                </Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: theme.colors.text }]}> 
                    Phone Number
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.card,
                        color: theme.colors.text,
                        borderColor: errors.phone ? theme.colors.error : theme.colors.border,
                      },
                    ]}
                    placeholder="Enter your 11-digit phone number"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={phoneNumber}
                    onChangeText={handlePhoneChange}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={11}
                  />
                  {errors.phone ? (
                    <Text style={[styles.errorText, { color: theme.colors.error }]}> 
                      {errors.phone}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: theme.colors.text }]}> 
                    6-Digit Password
                  </Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.passwordInput,
                        {
                          backgroundColor: theme.colors.card,
                          color: theme.colors.text,
                          borderColor: errors.password ? theme.colors.error : theme.colors.border,
                        },
                      ]}
                      placeholder="xxxxxx"
                      placeholderTextColor={theme.colors.textSecondary}
                      value={password}
                      onChangeText={handlePasswordChange}
                      secureTextEntry={!showPassword}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                        size={22}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {errors.password ? (
                    <Text style={[styles.errorText, { color: theme.colors.error }]}> 
                      {errors.password}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity style={styles.forgotPassword} onPress={() => router.push('/Security/forgot-password')}>
                  <Text style={[styles.forgotPasswordText, { color: theme.colors.primary }]}> 
                    Forgot Password?
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.loginButton, { backgroundColor: theme.colors.primary }]}
                  onPress={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.loginButtonText}>Login</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.signupContainer}>
                  <Text style={[styles.signupText, { color: theme.colors.textSecondary }]}> 
                    Don't have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/signup')}>
                    <Text style={[styles.signupLink, { color: theme.colors.primary }]}> 
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  backgroundImageStyle: {
    opacity: 0.35,
  },
  backgroundOverlay: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
    letterSpacing: 8,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  signupText: {
    fontSize: 14,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
