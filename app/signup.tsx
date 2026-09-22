import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { supabase } from '../src/lib/supabase';

const PASSWORD_LENGTH = 6;
const OTP_LENGTH = 6;
const MIN_NAME_LENGTH = 3;
const TERMII_BASE_URL = 'https://v4.api.termii.com';
const TERMII_API_KEY = process.env.EXPO_PUBLIC_TERMII_API_KEY ?? '';
const TERMII_SENDER_ID = process.env.EXPO_PUBLIC_TERMII_SENDER_ID ?? 'Limpopo';
const TERMII_OTP_CHANNEL = process.env.EXPO_PUBLIC_TERMII_CHANNEL ?? 'generic';

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
  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    otp: '',
    password: '',
    confirmPassword: '',
  });

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

  const handleSendOtp = async () => {
    const normalizedPhone = normalizePhoneNumber(formData.phone);

    if (!normalizedPhone) {
      setErrors((current) => ({ ...current, phone: 'Please enter a valid phone number' }));
      return;
    }

    if (!TERMII_API_KEY) {
      Alert.alert('OTP setup missing', 'Add EXPO_PUBLIC_TERMII_API_KEY to continue.');
      return;
    }

    setIsSendingOtp(true);

    try {
      const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
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
        Alert.alert('OTP request failed', 'Termii did not return a verification reference.');
        return;
      }

      setErrors((current) => ({ ...current, phone: '', otp: '' }));
      setTermiiPinId(nextPinId);
      setFormData((current) => ({ ...current, otp: '' }));
      setShowOtpVerification(true);
      Alert.alert('OTP sent', 'Check your phone for the verification code.');
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
      setShowOtpVerification(false);
      Alert.alert('Success', 'Phone number verified successfully.');
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
        data: signUpData,
        error: authError,
      } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password: formData.password,
        options: {
          data: {
            email: trimmedEmail,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          phone_num: formData.phone,
          phone_verified: true,
          },
        },
      });

      if (authError) {
        setIsSigningUp(false);
        Alert.alert('Unable to create account', authError.message);
        return;
      }

      if (!signUpData.user) {
        setIsSigningUp(false);
        Alert.alert('Unable to create account', 'Supabase did not return the new rider account.');
        return;
      }

      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          phone: normalizedPhone,
          password: formData.password,
        });

        if (signInError) {
          setIsSigningUp(false);
          Alert.alert('Account created, sign-in required', signInError.message);
          return;
        }
      }

      const { error: profileError } = await supabase.from('rider_profile').upsert(
        {
          uuid: signUpData.user.id,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          email: trimmedEmail,
          phone_num: formData.phone,
          phone_verified: true,
          wallet_balance: 0,
          push_notification: true,
        },
        { onConflict: 'uuid' }
      );

      if (profileError) {
        setIsSigningUp(false);
        Alert.alert('Profile setup failed', profileError.message);
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

      Alert.alert('Success', 'Account created successfully!', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
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

              {canShowSendOtp ? (
                <TouchableOpacity
                  style={[
                    styles.inlineAction,
                    {
                      backgroundColor: theme.colors.primary,
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  onPress={handleSendOtp}
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.inlineActionText, { color: '#FFFFFF' }]}>Send OTP</Text>
                  )}
                </TouchableOpacity>
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
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                    ]}
                    onPress={handleVerifyPhone}
                    disabled={isVerifyingOtp}
                  >
                    {isVerifyingOtp ? (
                      <ActivityIndicator size="small" color={theme.colors.text} />
                    ) : (
                      <Text style={[styles.inlineActionText, { color: theme.colors.text }]}>Verify Phone</Text>
                    )}
                  </TouchableOpacity>
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
});
