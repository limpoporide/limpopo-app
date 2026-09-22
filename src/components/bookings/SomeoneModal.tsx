import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  InputAccessoryView,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';

type ThemeShape = {
  colors: {
    primary: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
  };
};

type SomeoneModalProps = {
  visible: boolean;
  onClose: () => void;
  theme: ThemeShape;
  recipientNumber: string;
  recipientName: string;
  onChangeRecipientNumber: (value: string) => void;
  onChangeRecipientName: (value: string) => void;
  onSelectContact: (phone: string, name: string) => void;
};

type ContactEntry = {
  id: string;
  name: string;
  phone: string;
};

const RECIPIENT_NUMBER_ACCESSORY_ID = 'recipient-number-accessory';

export default function SomeoneModal({
  visible,
  onClose,
  theme,
  recipientNumber,
  recipientName,
  onChangeRecipientNumber,
  onChangeRecipientName,
  onSelectContact,
}: SomeoneModalProps) {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  const pickFromContacts = async () => {
    setPermissionError('');
    setIsLoadingContacts(true);

    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== 'granted') {
        setPermissionError('Contacts permission was not granted.');
        return;
      }

      const response = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const mappedContacts = response.data
        .map((contact) => ({
          id: contact.id,
          name: contact.name || 'Unnamed contact',
          phone: contact.phoneNumbers?.[0]?.number?.replace(/\s/g, '') || '',
        }))
        .filter((contact) => contact.phone.length > 0)
        .slice(0, 20);

      setContacts(mappedContacts);
    } catch (error) {
      setPermissionError('Unable to load contacts right now.');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleContactSelect = (contact: ContactEntry) => {
    onSelectContact(contact.phone, contact.name);
    setContacts([]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}> 
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Someone else</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder="Recipient number"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
              inputAccessoryViewID={Platform.OS === 'ios' ? RECIPIENT_NUMBER_ACCESSORY_ID : undefined}
              value={recipientNumber}
              onChangeText={onChangeRecipientNumber}
            />
            <TouchableOpacity onPress={pickFromContacts} style={styles.iconButton}>
              <Ionicons name="person-circle-outline" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder="Add person name (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              value={recipientName}
              onChangeText={onChangeRecipientName}
            />
          </View>

          {permissionError ? (
            <Text style={[styles.feedbackText, { color: theme.colors.error }]}>{permissionError}</Text>
          ) : null}

          {isLoadingContacts ? (
            <Text style={[styles.feedbackText, { color: theme.colors.textSecondary }]}>Loading contacts...</Text>
          ) : null}

          {contacts.length > 0 ? (
            <ScrollView style={styles.contactsList} showsVerticalScrollIndicator={false}>
              {contacts.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={[styles.contactRow, { borderBottomColor: theme.colors.border }]}
                  onPress={() => handleContactSelect(contact)}
                >
                  <Ionicons name="person-outline" size={18} color={theme.colors.textSecondary} />
                  <View style={styles.contactTextWrap}>
                    <Text style={[styles.contactName, { color: theme.colors.text }]}>{contact.name}</Text>
                    <Text style={[styles.contactNumber, { color: theme.colors.textSecondary }]}>{contact.phone}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}
              onPress={onClose}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'ios' ? (
            <InputAccessoryView nativeID={RECIPIENT_NUMBER_ACCESSORY_ID}>
              <View style={[styles.keyboardAccessory, { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border }]}> 
                <View />
                <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                  <Text style={[styles.keyboardAccessoryText, { color: theme.colors.primary }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </InputAccessoryView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  inputRow: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  iconButton: {
    marginLeft: 10,
  },
  feedbackText: {
    fontSize: 13,
    marginBottom: 12,
  },
  contactsList: {
    maxHeight: 260,
    marginBottom: 16,
  },
  footer: {
    paddingTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
  },
  contactNumber: {
    fontSize: 13,
    marginTop: 2,
  },
  doneButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  keyboardAccessory: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  keyboardAccessoryText: {
    fontSize: 16,
    fontWeight: '600',
  },
});