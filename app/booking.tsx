import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { mockVehicles } from '../src/data/mockData';
import { formatCurrency } from '../src/utils/formatters';

export default function Booking() {
  const router = useRouter();
  const { theme } = useTheme();
  const { id } = useLocalSearchParams();
  
  const vehicle = mockVehicles.find((v) => v.id === id) || mockVehicles[0];

  const [bookingData, setBookingData] = useState({
    startDate: '',
    endDate: '',
    startTime: '10:00',
    endTime: '10:00',
    pickupLocation: '',
    dropoffLocation: '',
  });

  const updateField = (field: string, value: string) => {
    setBookingData({ ...bookingData, [field]: value });
  };

  const calculateTotal = () => {
    // Simple calculation - in production this would be more sophisticated
    return vehicle.pricePerDay * 2; // Assuming 2 days for demo
  };

  const handleBooking = () => {
    if (!bookingData.startDate || !bookingData.endDate || !bookingData.pickupLocation) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    Alert.alert(
      'Booking Confirmed',
      `Your ${vehicle.name} has been booked successfully!`,
      [
        {
          text: 'View Bookings',
          onPress: () => router.push('/(tabs)/history'),
        },
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Back Button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backIcon, { color: theme.colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Book Vehicle
          </Text>
          <View style={styles.placeholder} />
        </View>

        {/* Vehicle Summary */}
        <View
          style={[
            styles.vehicleCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={[styles.vehicleImage, { backgroundColor: theme.colors.background }]}>
            <Text style={styles.vehicleEmoji}>
              {vehicle.type === 'car' ? '🚗' : vehicle.type === 'bike' ? '🏍️' : vehicle.type === 'van' ? '🚐' : '🚙'}
            </Text>
          </View>
          <View style={styles.vehicleInfo}>
            <Text style={[styles.vehicleName, { color: theme.colors.text }]}>
              {vehicle.name}
            </Text>
            <Text style={[styles.vehicleDetails, { color: theme.colors.textSecondary }]}>
              {vehicle.brand} • {vehicle.transmission}
            </Text>
          </View>
        </View>

        {/* Booking Form */}
        <View style={styles.form}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Rental Period
          </Text>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                Start Date *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textSecondary}
                value={bookingData.startDate}
                onChangeText={(value) => updateField('startDate', value)}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                Start Time
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="HH:MM"
                placeholderTextColor={theme.colors.textSecondary}
                value={bookingData.startTime}
                onChangeText={(value) => updateField('startTime', value)}
              />
            </View>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                End Date *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textSecondary}
                value={bookingData.endDate}
                onChangeText={(value) => updateField('endDate', value)}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                End Time
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="HH:MM"
                placeholderTextColor={theme.colors.textSecondary}
                value={bookingData.endTime}
                onChangeText={(value) => updateField('endTime', value)}
              />
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Locations
          </Text>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              Pickup Location *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Enter pickup address"
              placeholderTextColor={theme.colors.textSecondary}
              value={bookingData.pickupLocation}
              onChangeText={(value) => updateField('pickupLocation', value)}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              Dropoff Location
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Same as pickup"
              placeholderTextColor={theme.colors.textSecondary}
              value={bookingData.dropoffLocation}
              onChangeText={(value) => updateField('dropoffLocation', value)}
            />
          </View>
        </View>

        {/* Price Summary */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>
            Price Summary
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
              Daily Rate
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {formatCurrency(vehicle.pricePerDay)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
              Estimated Duration
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              2 days
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.text }]}>
              Total Amount
            </Text>
            <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
              {formatCurrency(calculateTotal())}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Book Now Button */}
      <View
        style={[
          styles.footer,
          { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleBooking}
        >
          <Text style={styles.bookButtonText}>Confirm Booking</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  vehicleCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  vehicleImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleEmoji: {
    fontSize: 40,
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  vehicleDetails: {
    fontSize: 14,
  },
  form: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateField: {
    flex: 1,
  },
  fieldContainer: {
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
  summaryCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 100,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
    opacity: 0.3,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  bookButton: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
