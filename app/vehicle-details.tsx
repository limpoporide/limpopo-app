import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { mockVehicles } from '../src/data/mockData';
import { formatCurrency } from '../src/utils/formatters';

export default function VehicleDetails() {
  const router = useRouter();
  const { theme } = useTheme();
  const { id } = useLocalSearchParams();
  
  const vehicle = mockVehicles.find((v) => v.id === id) || mockVehicles[0];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backIcon, { color: theme.colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Vehicle Details
          </Text>
          <TouchableOpacity style={styles.favoriteButton}>
            <Text style={styles.favoriteIcon}>♡</Text>
          </TouchableOpacity>
        </View>

        {/* Vehicle Image */}
        <View
          style={[
            styles.imageContainer,
            { backgroundColor: theme.colors.card },
          ]}
        >
          <Text style={styles.vehicleEmojiLarge}>
            {vehicle.type === 'car' ? '🚗' : vehicle.type === 'bike' ? '🏍️' : vehicle.type === 'van' ? '🚐' : '🚙'}
          </Text>
        </View>

        {/* Vehicle Info */}
        <View style={styles.content}>
          <View style={styles.titleSection}>
            <View style={styles.titleLeft}>
              <Text style={[styles.vehicleName, { color: theme.colors.text }]}>
                {vehicle.name}
              </Text>
              <Text style={[styles.vehicleBrand, { color: theme.colors.textSecondary }]}>
                {vehicle.brand} • {vehicle.year}
              </Text>
            </View>
            {vehicle.available ? (
              <View style={[styles.availableBadge, { backgroundColor: theme.colors.success + '20' }]}>
                <Text style={[styles.availableText, { color: theme.colors.success }]}>
                  Available
                </Text>
              </View>
            ) : (
              <View style={[styles.availableBadge, { backgroundColor: theme.colors.error + '20' }]}>
                <Text style={[styles.availableText, { color: theme.colors.error }]}>
                  Unavailable
                </Text>
              </View>
            )}
          </View>

          {/* Rating */}
          <View style={styles.ratingSection}>
            <Text style={styles.star}>⭐</Text>
            <Text style={[styles.ratingText, { color: theme.colors.text }]}>
              {vehicle.rating}
            </Text>
            <Text style={[styles.reviewsText, { color: theme.colors.textSecondary }]}>
              ({vehicle.reviews} reviews)
            </Text>
          </View>

          {/* Specs */}
          <View
            style={[
              styles.specsCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Specifications
            </Text>
            <View style={styles.specsGrid}>
              {vehicle.seats && (
                <View style={styles.specItem}>
                  <Text style={styles.specIcon}>🪑</Text>
                  <Text style={[styles.specLabel, { color: theme.colors.textSecondary }]}>
                    Seats
                  </Text>
                  <Text style={[styles.specValue, { color: theme.colors.text }]}>
                    {vehicle.seats}
                  </Text>
                </View>
              )}
              <View style={styles.specItem}>
                <Text style={styles.specIcon}>⚙️</Text>
                <Text style={[styles.specLabel, { color: theme.colors.textSecondary }]}>
                  Transmission
                </Text>
                <Text style={[styles.specValue, { color: theme.colors.text }]}>
                  {vehicle.transmission}
                </Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specIcon}>📅</Text>
                <Text style={[styles.specLabel, { color: theme.colors.textSecondary }]}>
                  Year
                </Text>
                <Text style={[styles.specValue, { color: theme.colors.text }]}>
                  {vehicle.year}
                </Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specIcon}>🏷️</Text>
                <Text style={[styles.specLabel, { color: theme.colors.textSecondary }]}>
                  Type
                </Text>
                <Text style={[styles.specValue, { color: theme.colors.text }]}>
                  {vehicle.type}
                </Text>
              </View>
            </View>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Features
            </Text>
            <View style={styles.featuresGrid}>
              {vehicle.features.map((feature, index) => (
                <View
                  key={index}
                  style={[
                    styles.featureChip,
                    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                  ]}
                >
                  <Text style={styles.featureIcon}>✓</Text>
                  <Text style={[styles.featureText, { color: theme.colors.text }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Pricing */}
          <View
            style={[
              styles.pricingCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Pricing
            </Text>
            <View style={styles.pricingRow}>
              <View style={styles.priceItem}>
                <Text style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>
                  Per Hour
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                  {formatCurrency(vehicle.pricePerHour)}
                </Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceItem}>
                <Text style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>
                  Per Day
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                  {formatCurrency(vehicle.pricePerDay)}
                </Text>
              </View>
            </View>
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
        <View style={styles.footerContent}>
          <View>
            <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>
              Starting from
            </Text>
            <Text style={[styles.footerPrice, { color: theme.colors.primary }]}>
              {formatCurrency(vehicle.pricePerDay)}/day
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.bookButton,
              {
                backgroundColor: vehicle.available ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => router.push(`/booking?id=${vehicle.id}`)}
            disabled={!vehicle.available}
          >
            <Text style={styles.bookButtonText}>
              {vehicle.available ? 'Book Now' : 'Unavailable'}
            </Text>
          </TouchableOpacity>
        </View>
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
  favoriteButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteIcon: {
    fontSize: 28,
  },
  imageContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    borderRadius: 20,
    marginBottom: 24,
  },
  vehicleEmojiLarge: {
    fontSize: 120,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleLeft: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  vehicleBrand: {
    fontSize: 16,
  },
  availableBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  availableText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  star: {
    fontSize: 20,
    marginRight: 6,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 6,
  },
  reviewsText: {
    fontSize: 14,
  },
  specsCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  specItem: {
    width: '45%',
    alignItems: 'center',
  },
  specIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  specLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  specValue: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  featuresSection: {
    marginBottom: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  featureIcon: {
    fontSize: 12,
    marginRight: 6,
    color: '#4CAF50',
  },
  featureText: {
    fontSize: 14,
  },
  pricingCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 20,
  },
  priceLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  priceValue: {
    fontSize: 24,
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
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  footerPrice: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bookButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
