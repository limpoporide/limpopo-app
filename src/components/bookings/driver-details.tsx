import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DriverDetailsProps {
  visible: boolean;
  onClose: () => void;
  driver: {
    firstName: string;
    profileImage: any;
    experience: string;
    rating: number;
    reviews: number;
    vehicle?: string;
  };
  bookingId?: string;
}

export default function DriverDetails({ visible, onClose, driver, bookingId }: DriverDetailsProps) {
  const router = useRouter();
  const { theme } = useTheme();

  const handleCall = () => {
    if (!bookingId) {
      Alert.alert('Call unavailable', 'This booking is missing the call details needed to start an in-app call.');
      return;
    }

    // Agora in-app call entrypoint for the driver details modal.
    // Keeping the navigation here makes call-launch debugging straightforward.
    onClose();
    router.push({
      pathname: '/bookings/call',
      params: {
        bookingId,
        participantName: driver.firstName,
      },
    });
  };

  const handleMessage = () => {
    onClose();
    router.push({
      pathname: '/bookings/chat',
      params: {
        bookingId: bookingId ?? '',
        driverName: driver.firstName,
        vehicleLabel: driver.vehicle ?? '',
      },
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color={theme.colors.text} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Driver Profile Section */}
            <View style={styles.profileSection}>
              <Image source={driver.profileImage} style={styles.profileImage} />
              
              <Text style={[styles.driverName, { color: theme.colors.text }]}>
                {driver.firstName}
              </Text>
              
              <Text style={[styles.experience, { color: theme.colors.textSecondary }]}>
                {driver.experience} driving experience
              </Text>

              {/* Action Icons */}
              <View style={styles.actionIcons}>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.colors.card }]}
                  onPress={handleCall}
                >
                  <Ionicons name="call" size={24} color={theme.colors.primary} />
                  <Text style={[styles.iconLabel, { color: theme.colors.text }]}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.colors.card }]}
                  onPress={handleMessage}
                >
                  <Ionicons name="chatbox-ellipses" size={24} color={theme.colors.primary} />
                  <Text style={[styles.iconLabel, { color: theme.colors.text }]}>Message</Text>
                </TouchableOpacity>
              </View>

              {/* Rating Section */}
              <View style={styles.ratingSection}>
                <View style={styles.ratingStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Math.floor(driver.rating) ? 'star' : 'star-outline'}
                      size={20}
                      color="#FFC107"
                    />
                  ))}
                </View>
                <Text style={[styles.ratingText, { color: theme.colors.text }]}>
                  {driver.rating.toFixed(1)}
                </Text>
                <Text style={[styles.reviewsText, { color: theme.colors.textSecondary }]}>
                  ({driver.reviews} reviews)
                </Text>
              </View>
            </View>

            {/* Banner Section */}
            <View style={[styles.bannerSection, { backgroundColor: theme.colors.card }]}> 
              <View style={styles.bannerContent}>
                <Ionicons name="shield-checkmark" size={32} color={theme.colors.primary} />
                <View style={styles.bannerTextContainer}>
                  <Text style={[styles.bannerTitle, { color: theme.colors.text }]}>
                    Verified Driver
                  </Text>
                  <Text style={[styles.bannerSubtitle, { color: theme.colors.textSecondary }]}>
                    Background checked and approved
                  </Text>
                </View>
              </View>
            </View>

            {/* Info Section */}
            <View style={styles.infoSection}>
              <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
                About {driver.firstName}
              </Text>
              <Text style={[styles.infoDescription, { color: theme.colors.textSecondary }]}>
                Professional driver with {driver.experience} of experience. Committed to providing 
                safe, comfortable, and timely rides. Known for excellent customer service and 
                maintaining a clean vehicle. Familiar with all major routes in Lagos and surrounding areas.
              </Text>
            </View>

            {/* Additional Info Section */}
            <View style={styles.infoSection}>
              <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
                Safety & Comfort
              </Text>
              <Text style={[styles.infoDescription, { color: theme.colors.textSecondary }]}>
                All Limpopo drivers undergo rigorous background checks and training. We ensure 
                every ride meets our high standards for safety, cleanliness, and professionalism.
              </Text>
            </View>

            {/* Features Grid */}
            <View style={styles.featuresGrid}>
              <View style={styles.featureCard}>
                <Ionicons name="car-sport" size={28} color={theme.colors.primary} />
                <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
                  Clean Vehicle
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Ionicons name="water" size={28} color={theme.colors.primary} />
                <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
                  AC Available
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Ionicons name="musical-notes" size={28} color={theme.colors.primary} />
                <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
                  Music System
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Ionicons name="battery-charging" size={28} color={theme.colors.primary} />
                <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
                  Phone Charging
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  driverName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  experience: {
    fontSize: 14,
    marginBottom: 20,
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  iconButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '700',
  },
  reviewsText: {
    fontSize: 14,
  },
  bannerSection: {
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
  },
  infoSection: {
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  featureCard: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});
