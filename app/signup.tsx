import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  StatusBar,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';

const PASSWORD_LENGTH = 6;
const OTP_LENGTH = 6;
const MIN_NAME_LENGTH = 3;
const TERMII_BASE_URL = 'https://v4.api.termii.com';
const TERMII_API_KEY = process.env.EXPO_PUBLIC_TERMII_API_KEY ?? '';
const TERMII_SENDER_ID = process.env.EXPO_PUBLIC_TERMII_SENDER_ID ?? 'OE Alert';
const TERMII_OTP_CHANNEL = process.env.EXPO_PUBLIC_TERMII_CHANNEL ?? 'dnd';
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_RETRIES = 3;
const SUCCESS_ANIMATION = require('../assets/success.json');

export default function Signup() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    otp: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [termiiPinId, setTermiiPinId] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpRetryCount, setOtpRetryCount] = useState(0);
  const [showSignupSuccessModal, setShowSignupSuccessModal] = useState(false);
  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    otp: '',
    password: '',
    confirmPassword: '',
  });
  const signupSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    const phoneRegex = /^[0-9]{11}$/;
    return phoneRegex.test(phone);
  };

  const validateName = (name: string) => name.trim().length >= MIN_NAME_LENGTH;

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

  const getTermiiPhoneNumber = (normalizedPhone: string) => normalizedPhone.replace(/^\+/, '');

  const getErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const message = errorRecord.message;
      const smsStatus = errorRecord.smsStatus;
      const details = errorRecord.details;

      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }

      if (typeof smsStatus === 'string' && smsStatus.trim().length > 0) {
        return smsStatus;
      }

      if (typeof details === 'string' && details.trim().length > 0) {
        return details;
      }
    }

    return fallbackMessage;
  };

  useEffect(() => {
    if (otpCountdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setOtpCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [otpCountdown]);

  useEffect(() => () => {
    if (signupSuccessTimeoutRef.current) {
      clearTimeout(signupSuccessTimeoutRef.current);
    }
  }, []);

  const handleSendOtp = async (isRetry = false) => {
    const normalizedPhone = normalizePhoneNumber(formData.phone);

    if (!normalizedPhone) {
      setErrors((current) => ({ ...current, phone: 'Please enter a valid phone number' }));
      return;
    }

    if (!TERMII_API_KEY) {
      Alert.alert('OTP setup missing', 'Add EXPO_PUBLIC_TERMII_API_KEY to continue.');
      return;
    }

    if (isRetry && otpRetryCount >= OTP_MAX_RETRIES) {
      Alert.alert('Retry limit reached', 'You have used all OTP retries. Please contact admin for assistance.');
      return;
    }

    setIsSendingOtp(true);

    try {
      const requestPayload = {
        api_key: TERMII_API_KEY,
        message_type: 'NUMERIC',
        to: getTermiiPhoneNumber(normalizedPhone),
        from: TERMII_SENDER_ID,
        channel: TERMII_OTP_CHANNEL,
        pin_attempts: 3,
        pin_time_to_live: 5,
        pin_length: OTP_LENGTH,
        pin_placeholder: '< 123456 >',
        message_text: 'Your Limpopo verification code is < 123456 >',
        pin_type: 'NUMERIC',
      };

      const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await response.json();

      if (!response.ok) {
        Alert.alert('OTP request failed', getErrorMessage(payload, 'Unable to send OTP right now.'));
        return;
      }

      const nextPinId = typeof payload?.pinId === 'string'
        ? payload.pinId
        : typeof payload?.pin_id === 'string'
          ? payload.pin_id
          : '';

      if (!nextPinId) {
        Alert.alert('OTP request failed', 'We could not start verification right now. Please try again.');
        return;
      }

      setErrors((current) => ({ ...current, phone: '', otp: '' }));
      setTermiiPinId(nextPinId);
      setFormData((current) => ({ ...current, otp: '' }));
      setShowOtpVerification(true);
      setOtpCountdown(OTP_RESEND_SECONDS);
      setOtpRetryCount((current) => (isRetry ? current + 1 : current));
      Alert.alert('OTP sent', 'A verification code has been sent to your phone number.');
    } catch (error) {
      Alert.alert('OTP request failed', getErrorMessage(error, 'Unable to send OTP right now.'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyPhone = async () => {
    const normalizedPhone = normalizePhoneNumber(formData.phone);

    if (!normalizedPhone) {
      setErrors((current) => ({ ...current, phone: 'Please enter a valid phone number' }));
      return;
    }

    if (formData.otp.length !== OTP_LENGTH) {
      setErrors((current) => ({ ...current, otp: 'Enter the 6-digit OTP code' }));
      return;
    }

    if (!termiiPinId) {
      setErrors((current) => ({ ...current, otp: 'Send a new OTP code before verifying' }));
      return;
    }

    if (!TERMII_API_KEY) {
      Alert.alert('OTP setup missing', 'Add EXPO_PUBLIC_TERMII_API_KEY to continue.');
      return;
    }

    setIsVerifyingOtp(true);

    try {
      const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: TERMII_API_KEY,
          pin_id: termiiPinId,
          pin: formData.otp,
        }),
      });

      const payload = await response.json();
      const isVerified = String(payload?.verified).toLowerCase() === 'true';

      if (!response.ok || !isVerified) {
        setIsPhoneVerified(false);
        Alert.alert('Verification failed', getErrorMessage(payload, 'The OTP code is invalid or has expired.'));
        return;
      }

      setErrors((current) => ({ ...current, otp: '' }));
      setFormData((current) => ({ ...current, otp: '' }));
      setIsPhoneVerified(true);
      setTermiiPinId('');
      setOtpCountdown(0);
      setShowOtpVerification(false);
      Alert.alert('Phone verified', 'Your phone number has been verified successfully.');
    } catch (error) {
      setIsPhoneVerified(false);
      Alert.alert('Verification failed', getErrorMessage(error, 'Unable to verify OTP right now.'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSignup = async () => {
    console.log('[Signup] Sign Up button pressed', {
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone,
      isPhoneVerified,
    });

    let valid = true;
    const newErrors = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      otp: '',
      password: '',
      confirmPassword: '',
    };

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
      valid = false;
    } else if (!validateName(formData.firstName)) {
      newErrors.firstName = `First name must be at least ${MIN_NAME_LENGTH} characters`;
      valid = false;
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
      valid = false;
    } else if (!validateName(formData.lastName)) {
      newErrors.lastName = `Last name must be at least ${MIN_NAME_LENGTH} characters`;
      valid = false;
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email';
      valid = false;
    }

    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
      valid = false;
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
      valid = false;
    }

    if (!isPhoneVerified) {
      newErrors.otp = 'Send and verify OTP before continuing';
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
      valid = false;
    } else if (!/^\d{6}$/.test(formData.password)) {
      newErrors.password = 'Password must be exactly 6 digits';
      valid = false;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      valid = false;
    }

    setErrors(newErrors);

    if (valid) {
      const normalizedPhone = normalizePhoneNumber(formData.phone);

      if (!normalizedPhone) {
        setErrors((current) => ({ ...current, phone: 'Please enter a valid phone number' }));
        return;
      }

      setIsSigningUp(true);

      const trimmedEmail = formData.email.trim().toLowerCase();
      const {
        data: createAuthUserData,
        error: authError,
      } = await supabase.functions.invoke('create-rider-auth-user', {
        method: 'POST',
        body: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: trimmedEmail,
          phone: formData.phone,
          password: formData.password,
        },
      });

      if (authError) {
        setIsSigningUp(false);
        Alert.alert('Unable to create account', authError.message);
        return;
      }

      if (!createAuthUserData?.userId) {
        setIsSigningUp(false);
        Alert.alert('Unable to create account', 'Supabase did not return the new rider account.');
        return;
      }

      const {
        data: signInData,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password: formData.password,
      });

      if (signInError || !signInData.user) {
        setIsSigningUp(false);
        Alert.alert('Account created, sign-in required', signInError?.message ?? 'Please sign in with your phone number and password.');
        return;
      }

      // Provision the rider's dedicated virtual account; non-fatal if it fails.
      const { error: virtualAccountError } = await supabase.functions.invoke('create-virtual-account', {
        method: 'POST',
      });

      if (virtualAccountError) {
        console.log('Virtual account creation failed:', virtualAccountError.message);
      }

      setIsSigningUp(false);
      setShowSignupSuccessModal(true);

      if (signupSuccessTimeoutRef.current) {
        clearTimeout(signupSuccessTimeoutRef.current);
      }

      signupSuccessTimeoutRef.current = setTimeout(() => {
        setShowSignupSuccessModal(false);
        router.replace('/login');
      }, 3500);
    }
  };

  const updateField = (field: string, value: string) => {
    const sanitizedValue = field === 'phone'
      ? value.replace(/\D/g, '').slice(0, 11)
      : field === 'otp'
        ? value.replace(/\D/g, '').slice(0, OTP_LENGTH)
        : field === 'password' || field === 'confirmPassword'
          ? value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH)
          : value;

    if (field === 'phone') {
      setIsPhoneVerified(false);
      setTermiiPinId('');
      setOtpCountdown(0);
      setOtpRetryCount(0);
      setShowOtpVerification(false);
      setFormData((current) => ({ ...current, otp: '', [field]: sanitizedValue }));
      setErrors((current) => ({ ...current, phone: '', otp: '' }));
      return;
    }

    setFormData({ ...formData, [field]: sanitizedValue });
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const isFormReady =
    validateName(formData.firstName)
    && validateName(formData.lastName)
    && validateEmail(formData.email.trim())
    && validatePhone(formData.phone)
    && isPhoneVerified
    && /^\d{6}$/.test(formData.password)
    && formData.password === formData.confirmPassword;

  const canShowSendOtp =
    !isPhoneVerified
    && validateName(formData.firstName)
    && validateName(formData.lastName)
    && validateEmail(formData.email.trim())
    && validatePhone(formData.phone);

  const canRetryOtp = showOtpVerification && !isPhoneVerified && otpCountdown === 0 && otpRetryCount < OTP_MAX_RETRIES;
  const hasReachedOtpRetryLimit = showOtpVerification && !isPhoneVerified && otpCountdown === 0 && otpRetryCount >= OTP_MAX_RETRIES;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
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
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Create Account
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              Sign up to get started
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>First Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: errors.firstName ? theme.colors.error : theme.colors.border,
                  },
                ]}
                placeholder="John"
                placeholderTextColor={theme.colors.textSecondary}
                value={formData.firstName}
                onChangeText={(value) => updateField('firstName', value)}
              />
              {errors.firstName ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.firstName}</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Last Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: errors.lastName ? theme.colors.error : theme.colors.border,
                  },
                ]}
                placeholder="Doe"
                placeholderTextColor={theme.colors.textSecondary}
                value={formData.lastName}
                onChangeText={(value) => updateField('lastName', value)}
              />
              {errors.lastName ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.lastName}</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Email Address</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: errors.email ? theme.colors.error : theme.colors.border,
                  },
                ]}
                placeholder="Enter your email"
                placeholderTextColor={theme.colors.textSecondary}
                value={formData.email}
                onChangeText={(value) => updateField('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.email ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.email}</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Phone Number</Text>
              <View style={styles.phoneInputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.phoneInput,
                    {
                      backgroundColor: theme.colors.card,
                      color: theme.colors.text,
                      borderColor: errors.phone
                        ? theme.colors.error
                        : isPhoneVerified
                          ? theme.colors.success
                          : theme.colors.border,
                    },
                  ]}
                  placeholder={isPhoneVerified ? 'Phone number verified' : '080 0000 0000'}
                  placeholderTextColor={
                    isPhoneVerified ? theme.colors.success : theme.colors.textSecondary
                  }
                  value={formData.phone}
                  onChangeText={(value) => updateField('phone', value)}
                  keyboardType="phone-pad"
                  inputMode="numeric"
                  maxLength={11}
                />
                {isPhoneVerified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={theme.colors.success}
                    style={styles.phoneVerifiedIcon}
                  />
                ) : null}
              </View>
              {errors.phone ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.phone}</Text>
              ) : null}

              {canShowSendOtp && !showOtpVerification ? (
                <TouchableOpacity
                  style={[
                    styles.inlineAction,
                    {
                      backgroundColor: theme.colors.primary,
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() => handleSendOtp()}
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.inlineActionText, { color: '#FFFFFF' }]}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {showOtpVerification && !isPhoneVerified && otpCountdown > 0 ? (
                <View style={styles.otpCountdownContainer}>
                  <Text style={[styles.otpCountdownText, { color: theme.colors.textSecondary }]}>
                    Resend available in 00:{String(otpCountdown).padStart(2, '0')}
                  </Text>
                </View>
              ) : null}

              {showOtpVerification && !isPhoneVerified ? (
                <>
                  <View style={[styles.inputContainer, styles.otpContainer]}>
                    <Text style={[styles.label, { color: theme.colors.text }]}>OTP</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.colors.card,
                          color: theme.colors.text,
                          borderColor: errors.otp ? theme.colors.error : theme.colors.border,
                        },
                      ]}
                      placeholder="Enter 6-digit OTP"
                      placeholderTextColor={theme.colors.textSecondary}
                      value={formData.otp}
                      onChangeText={(value) => updateField('otp', value)}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={OTP_LENGTH}
                    />
                    {errors.otp ? (
                      <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.otp}</Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.inlineAction,
                      {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.primary,
                      },
                    ]}
                    onPress={handleVerifyPhone}
                    disabled={isVerifyingOtp}
                  >
                    {isVerifyingOtp ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.inlineActionText, { color: '#FFFFFF' }]}>Verify Phone</Text>
                    )}
                  </TouchableOpacity>

                  {canRetryOtp ? (
                    <TouchableOpacity
                      onPress={() => handleSendOtp(true)}
                      activeOpacity={0.75}
                      disabled={isSendingOtp}
                    >
                      <Text style={[styles.retryText, { color: theme.colors.primary }]}>I didn't get the code</Text>
                    </TouchableOpacity>
                  ) : null}

                  {hasReachedOtpRetryLimit ? (
                    <Text style={[styles.retryLimitText, { color: theme.colors.error }]}>Retry limit reached. Please contact admin for assistance.</Text>
                  ) : null}
                </>
              ) : null}

              {isPhoneVerified ? (
                <Text style={[styles.successText, { color: theme.colors.success }]}>Phone number verified</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>6-Digit Password</Text>
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
                  placeholder="Enter your 6-digit password"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={formData.password}
                  onChangeText={(value) => updateField('password', value)}
                  secureTextEntry={!showPassword}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={PASSWORD_LENGTH}
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

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Confirm Password
              </Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: theme.colors.card,
                      color: theme.colors.text,
                      borderColor: errors.confirmPassword ? theme.colors.error : theme.colors.border,
                    },
                  ]}
                  placeholder="Confirm your 6-digit password"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={formData.confirmPassword}
                  onChangeText={(value) => updateField('confirmPassword', value)}
                  secureTextEntry={!showConfirmPassword}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={PASSWORD_LENGTH}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  {errors.confirmPassword}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.termsText, { color: theme.colors.textSecondary }]}>
              By continuing you accept{' '}
              <Text
                style={[styles.termsLink, { color: theme.colors.primary }]}
                onPress={() => router.push('/support/terms')}
              >
                Terms & Conditions
              </Text>
            </Text>

            <TouchableOpacity
              style={[
                styles.signupButton,
                {
                  backgroundColor: isSigningUp || !isFormReady
                    ? theme.colors.border
                    : theme.colors.primary,
                },
              ]}
              onPress={handleSignup}
              disabled={isSigningUp || !isFormReady}
            >
              {isSigningUp ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.signupButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
                Already have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={[styles.loginLink, { color: theme.colors.primary }]}>
                  Login
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showSignupSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignupSuccessModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={[styles.successModalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <LottieView
              source={SUCCESS_ANIMATION}
              autoPlay
              loop={false}
              style={styles.successAnimation}
            />
            <Text style={[styles.successModalTitle, { color: theme.colors.text }]}>Account created</Text>
            <Text style={[styles.successModalText, { color: theme.colors.textSecondary }]}>Your rider account is ready. Redirecting you to login now.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 16,
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 16,
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
  phoneInputWrapper: {
    position: 'relative',
  },
  phoneInput: {
    paddingRight: 48,
  },
  phoneVerifiedIcon: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
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
  successText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  inlineAction: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  inlineActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  otpContainer: {
    marginTop: 12,
    marginBottom: 0,
  },
  otpCountdownContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  otpCountdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
  retryText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  retryLimitText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  termsLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  signupButton: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successModalCard: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  successAnimation: {
    width: 140,
    height: 140,
    marginBottom: 8,
  },
  successModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  successModalText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
