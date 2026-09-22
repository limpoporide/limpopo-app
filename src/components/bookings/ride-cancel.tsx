import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ThemeShape = {
  colors: {
    primary: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
  };
};

type RideCancelProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  theme: ThemeShape;
};

const CANCEL_REASONS = [
  'Driver is taking too long',
  'I entered the wrong pickup location',
  'I changed my mind',
  'Price is higher than expected',
  'I found another ride',
  'Emergency situation',
];

export default function RideCancel({
  visible,
  onClose,
  onSubmit,
  theme,
}: RideCancelProps) {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState('');

  const handleClose = () => {
    console.log('[RideCancel] Close pressed', {
      selectedReason,
    });
    setSelectedReason('');
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedReason) {
      console.log('[RideCancel] Submit blocked: no reason selected');
      return;
    }

    console.log('[RideCancel] Submit pressed', {
      selectedReason,
    });
    onSubmit(selectedReason);
    setSelectedReason('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 12) }]}> 
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Cancel ride request</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sheetSubtitle, { color: theme.colors.textSecondary }]}>Select a reason for cancelling this request.</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reasonList}>
            {CANCEL_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;

              return (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonCard,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => setSelectedReason(reason)}
                  activeOpacity={0.85}
                >
                  <View style={styles.reasonCopyWrap}>
                    <Text style={[styles.reasonText, { color: theme.colors.text }]}>{reason}</Text>
                  </View>
                  <View
                    style={[
                      styles.radioOuter,
                      { borderColor: isSelected ? theme.colors.primary : theme.colors.border },
                    ]}
                  >
                    {isSelected ? <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: selectedReason ? theme.colors.primary : theme.colors.border,
              },
            ]}
            activeOpacity={selectedReason ? 0.85 : 1}
            onPress={handleSubmit}
            disabled={!selectedReason}
          >
            <Text style={styles.submitButtonText}>Cancel Request</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    maxHeight: '84%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  sheetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  reasonList: {
    paddingBottom: 10,
  },
  reasonCard: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reasonCopyWrap: {
    flex: 1,
    paddingRight: 12,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  submitButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});