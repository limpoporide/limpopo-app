import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../../types';

type VehicleModalItem = {
  id: string;
  name: string;
  badge?: string;
  description?: string;
  priceNaira: number;
  waitTimeRate?: string;
  levyName?: string;
  levyAmount?: number;
  bookingFeePercent?: string;
  seats: number;
};

type VehicleModalFeaturesProps = {
  visible: boolean;
  onClose: () => void;
  onGetDriver: () => void;
  theme: Theme;
  vehicle: VehicleModalItem | null;
  imageSource: number;
  displayFareNaira: number;
};

export default function VehicleModalFeatures({
  visible,
  onClose,
  onGetDriver,
  theme,
  vehicle,
  imageSource,
  displayFareNaira,
}: VehicleModalFeaturesProps) {
  if (!vehicle) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}> 
          {/* Top Handle Bar */}
          <View style={styles.handleBar} />

          {/* Close Button */}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color="#333" />
          </TouchableOpacity>

          {/* Large Hero Image Header */}
          <View style={styles.imageContainer}>
            <Image source={imageSource} style={styles.vehicleImage} resizeMode="contain" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Title & Badge */}
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {vehicle.name}
              </Text>
              {vehicle.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{vehicle.badge}</Text>
                </View>
              )}
            </View>

            {/* Subtitle / Description */}
            <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
              {vehicle.description || 'Dependable rides in everyday, mid-size cars'}
            </Text>

            {/* Banner 1: Primary CTA */}
            <TouchableOpacity style={styles.promoBanner} onPress={onGetDriver} activeOpacity={0.85}>
              <View style={styles.plusBadge}>
                <Ionicons name="car-sport" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.promoTextWrap}>
                <Text style={styles.promoTitle}>Get my Driver</Text>
              </View>
            </TouchableOpacity>

            {/* Banner 2: Ride Features */}
            <View style={styles.featureGrid}>
              <View style={styles.featureItem}>
                <Ionicons name="shield-checkmark" size={18} color={theme.mode === 'dark' ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.featureText, { color: theme.mode === 'dark' ? '#FFFFFF' : '#000000' }]}>Driver</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="snow" size={18} color={theme.mode === 'dark' ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.featureText, { color: theme.mode === 'dark' ? '#FFFFFF' : '#000000' }]}>AC</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="battery-charging" size={18} color={theme.mode === 'dark' ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.featureText, { color: theme.mode === 'dark' ? '#FFFFFF' : '#000000' }]}>Charging</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="videocam" size={18} color={theme.mode === 'dark' ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.featureText, { color: theme.mode === 'dark' ? '#FFFFFF' : '#000000' }]}>Video Cam</Text>
              </View>
            </View>

            {vehicle.badge ? null : (
              <>
                {/* Fare Header */}
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: theme.colors.text }]}>Fare</Text>
                  <View style={styles.fareValueWrap}>
                    <Text style={[styles.farePrice, { color: theme.colors.text }]}> 
                      ₦{Math.round(displayFareNaira).toLocaleString('en-NG')}
                    </Text>
                  </View>
                </View>

                {/* Breakdown List */}
                <View style={styles.breakdownList}>
                  {/* <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Wait time</Text>
                    <Text style={styles.breakdownValue}>{vehicle.waitTimeRate || '₦73.33/MIN'}</Text>
                  </View> */}

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      {vehicle.levyName || 'LGA Levy'}
                    </Text>
                    <Text style={styles.breakdownValue}>
                      ₦{(vehicle.levyAmount ?? 30).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Booking Fee</Text>
                    <Text style={styles.breakdownValue}>{vehicle.bookingFeePercent || '5%'}</Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Seats</Text>
                    <Text style={styles.breakdownValue}>{vehicle.seats}</Text>
                  </View>
                </View>
              </>
            )}

            {/* Footnote Terms */}
            <Text style={styles.disclaimerText}>
              We are the pride of Africa. Premium ride with every executive feeling with Limpopo ride.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    height: '80%',
    position: 'relative',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  imageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    marginVertical: 10,
  },
  vehicleImage: {
    width: 220,
    height: 120,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: '#3E7D59',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C3526',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  plusBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#4E8D68',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  featureGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginBottom: 20,
  },
  featureItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginHorizontal: 4,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 6,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fareLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  fareValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  farePrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  chevronIcon: {
    marginLeft: 6,
  },
  breakdownList: {
    marginBottom: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
    paddingRight: 12,
  },
  breakdownValue: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '600',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#777777',
    lineHeight: 16,
    textAlign: 'center',
  },
});
