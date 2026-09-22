import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fetchRiderProfile, getCachedRiderProfile } from '@/lib/rider-profile';
import { supabase } from '@/lib/supabase';
import {
  ChatMessageRow,
  fetchChatMessages,
  markDriverMessagesRead,
  sendChatMessage,
  subscribeToChatMessages,
} from '@/lib/chat';

const QUICK_REPLIES = [
  'I am outside',
  'Please call me',
  'I will be there shortly',
  'Take the next turn',
];

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getDateLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Today';
  }

  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const getTimeLabel = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function ChatScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { bookingId, driverName, vehicleLabel } = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    vehicleLabel?: string;
  }>();
  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const resolvedDriverName = normalizeRouteParam(driverName) || 'Driver';
  const resolvedVehicleLabel = normalizeRouteParam(vehicleLabel);
  const [draftMessage, setDraftMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const driverAvatar = require('../../assets/driver-profile.png');
  const [driverAvatarUri, setDriverAvatarUri] = useState<string | null>(null);
  const [riderAvatarUri, setRiderAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    })
      .then(() => {
        if (__DEV__) {
          console.log('[Rider Chat] Audio mode prepared for message ping');
        }
      })
      .catch((error) => {
      console.log('[Rider Chat] Failed to prepare incoming message ping', error);
      });
  }, []);

  const playIncomingMessagePing = useCallback(async () => {
    try {
      if (__DEV__) {
        console.log('[Rider Chat] Attempting to play incoming message ping');
      }

      const { sound, status } = await Audio.Sound.createAsync(require('../../assets/chat-message-ping.wav'), {
        shouldPlay: false,
        volume: 1,
      });

      if (__DEV__) {
        console.log('[Rider Chat] Message ping sound created', status);
      }

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          if (__DEV__) {
            console.log('[Rider Chat] Message ping sound not loaded', status);
          }
          return;
        }

        if (__DEV__ && status.positionMillis === 0 && status.isPlaying) {
          console.log('[Rider Chat] Message ping playback started');
        }

        if (status.didJustFinish) {
          if (__DEV__) {
            console.log('[Rider Chat] Message ping playback finished');
          }
          sound.unloadAsync().catch(() => {
            // Ignore unload failures after playback completes.
          });
        }
      });

      const playbackStatus = await sound.playAsync();

      if (__DEV__) {
        console.log('[Rider Chat] Message ping playAsync result', playbackStatus);
      }
    } catch (error) {
      console.log('[Rider Chat] Failed to play incoming message ping', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const untypedSupabase = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
            };
          };
        };
      };

      const loadProfile = async () => {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile?.profileImg && isMounted) {
          setRiderAvatarUri(cachedProfile.profileImg);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile?.profileImg && isMounted) {
          setRiderAvatarUri(latestProfile.profileImg);
        }

        if (!resolvedBookingId) {
          if (isMounted) {
            setDriverAvatarUri(null);
          }
          return;
        }

        const { data: booking } = await supabase
          .from('rider_booking')
          .select('assigned_driver')
          .eq('id', resolvedBookingId)
          .maybeSingle();

        if (!booking?.assigned_driver || !isMounted) {
          setDriverAvatarUri(null);
          return;
        }

        const driverProfileResult = await untypedSupabase
          .from('driver_profile')
          .select('profile_img')
          .eq('uuid', booking.assigned_driver)
          .maybeSingle();

        const driverProfile = driverProfileResult.data;

        if (isMounted && driverProfile && typeof driverProfile === 'object') {
          const driverProfileRecord = driverProfile as Record<string, unknown>;
          setDriverAvatarUri(
            typeof driverProfileRecord['profile_img'] === 'string' ? driverProfileRecord['profile_img'] : null
          );
          return;
        }

        if (isMounted) {
          setDriverAvatarUri(null);
        }
      };

      loadProfile();

      return () => {
        isMounted = false;
      };
    }, [resolvedBookingId])
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      supabase.auth.getUser().then(({ data }) => {
        if (isMounted) {
          setMyUid(data.user?.id ?? null);
        }
      });

      if (!resolvedBookingId) {
        setMessages([]);
        return () => {
          isMounted = false;
        };
      }

      fetchChatMessages(resolvedBookingId)
        .then(async (history) => {
          if (isMounted) {
            setMessages(history);
          }

          await markDriverMessagesRead(resolvedBookingId);
        })
        .catch(() => {
          // Chat history failed to load; the realtime subscription below can
          // still populate new messages as they arrive.
        });

      const unsubscribe = subscribeToChatMessages(resolvedBookingId, (message) => {
        if (!isMounted) {
          return;
        }

        const isIncomingFromDriver = myUid ? message.sender_uuid !== myUid : message.sender_role === 'driver';

        if (__DEV__) {
          console.log('[Rider Chat] Realtime message received', {
            bookingId: resolvedBookingId,
            messageId: message.id,
            senderRole: message.sender_role,
            senderUuid: message.sender_uuid,
            myUid,
            isIncomingFromDriver,
          });
        }

        setMessages((currentMessages) => {
          if (currentMessages.some((existing) => existing.id === message.id)) {
            if (__DEV__) {
              console.log('[Rider Chat] Duplicate realtime message ignored', {
                bookingId: resolvedBookingId,
                messageId: message.id,
              });
            }
            return currentMessages;
          }

          return [...currentMessages, message];
        });

        if (isIncomingFromDriver) {
          if (__DEV__) {
            console.log('[Rider Chat] Incoming driver message will trigger ping', {
              bookingId: resolvedBookingId,
              messageId: message.id,
            });
          }
          void playIncomingMessagePing();
          markDriverMessagesRead(resolvedBookingId).catch(() => {
            // Keep rendering realtime messages even if read sync fails.
          });
        } else if (__DEV__) {
          console.log('[Rider Chat] Realtime message did not trigger ping because sender is not driver', {
            bookingId: resolvedBookingId,
            messageId: message.id,
            senderRole: message.sender_role,
            senderUuid: message.sender_uuid,
            myUid,
          });
        }
      });

      return () => {
        isMounted = false;
        unsubscribe();
      };
    }, [myUid, playIncomingMessagePing, resolvedBookingId])
  );

  const groupedMessages = useMemo(() => {
    return messages.reduce<Array<{ dateLabel: string; items: ChatMessageRow[] }>>((groups, message) => {
      const dateLabel = getDateLabel(message.created_at);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.dateLabel !== dateLabel) {
        groups.push({ dateLabel, items: [message] });
        return groups;
      }

      lastGroup.items.push(message);
      return groups;
    }, []);
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmedMessage = text.trim();

    if (!trimmedMessage || !resolvedBookingId || isSending) {
      return;
    }

    setIsSending(true);
    setDraftMessage('');

    try {
      const sentMessage = await sendChatMessage(resolvedBookingId, trimmedMessage);

      setMessages((currentMessages) => {
        if (currentMessages.some((existing) => existing.id === sentMessage.id)) {
          return currentMessages;
        }

        return [...currentMessages, sentMessage];
      });
    } catch {
      // Keep the draft so the rider can retry sending the message.
      setDraftMessage(trimmedMessage);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}> 
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Chat with Driver</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              {resolvedVehicleLabel ? `${resolvedDriverName} • ${resolvedVehicleLabel}` : resolvedDriverName}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.headerAction, { backgroundColor: theme.colors.card }]}
            onPress={() => {}}
          >
            <Ionicons name="call" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {!resolvedBookingId ? (
          <View style={styles.unavailableBanner}>
            <Text style={[styles.unavailableBannerText, { color: theme.colors.textSecondary }]}>
              Chat becomes available once a driver is assigned to this ride.
            </Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.messagesScroll}
          contentContainerStyle={[styles.messagesContent, { paddingBottom: 18 }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {groupedMessages.map((group) => (
            <View key={group.dateLabel}>
              <View style={styles.dateDividerWrap}>
                <View style={[styles.dateDivider, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                  <Text style={[styles.dateDividerText, { color: theme.colors.textSecondary }]}>{group.dateLabel}</Text>
                </View>
              </View>

              {group.items.map((message) => {
                const isRiderMessage = message.sender_uuid === myUid;

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      isRiderMessage ? styles.messageRowRight : styles.messageRowLeft,
                    ]}
                  >
                    {!isRiderMessage ? (
                      driverAvatarUri ? (
                        <Image source={{ uri: driverAvatarUri }} style={styles.chatAvatar} />
                      ) : (
                        <View style={[styles.chatAvatarFallback, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                          <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
                        </View>
                      )
                    ) : null}
                    <View
                      style={[
                        styles.messageBubble,
                        isRiderMessage
                          ? {
                              backgroundColor: theme.colors.primary,
                              borderTopRightRadius: 8,
                            }
                          : {
                              backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                              borderWidth: 1,
                              borderTopLeftRadius: 8,
                            },
                      ]}
                    >
                      <View style={styles.messageContentRow}>
                        <Text
                          style={[
                            styles.messageText,
                            { color: isRiderMessage ? '#FFFFFF' : theme.colors.text },
                          ]}
                        >
                          {message.message}
                        </Text>
                        <Text
                          style={[
                            styles.messageTime,
                            { color: isRiderMessage ? 'rgba(255,255,255,0.76)' : theme.colors.textSecondary },
                          ]}
                        >
                          {getTimeLabel(message.created_at)}
                        </Text>
                      </View>
                    </View>
                    {isRiderMessage ? (
                      <Image
                        source={riderAvatarUri ? { uri: riderAvatarUri } : driverAvatar}
                        style={styles.chatAvatar}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={[styles.quickRepliesSection, { borderTopColor: theme.colors.border }]}> 
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRepliesContent}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_REPLIES.map((reply) => (
              <TouchableOpacity
                key={reply}
                style={[styles.quickReplyChip, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                onPress={() => sendMessage(reply)}
              >
                <Text style={[styles.quickReplyText, { color: theme.colors.text }]}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.colors.background,
              borderTopColor: theme.colors.border,
              paddingBottom: 10,
            },
          ]}
        >
          <View style={[styles.inputWrap, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.textSecondary} />
            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Type a message"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.textInput, { color: theme.colors.text }]}
              multiline
              editable={!!resolvedBookingId}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: draftMessage.trim() ? theme.colors.primary : theme.colors.card,
              },
            ]}
            onPress={() => sendMessage(draftMessage)}
            disabled={!resolvedBookingId || isSending}
          >
            <Ionicons
              name="send"
              size={18}
              color={draftMessage.trim() ? '#FFFFFF' : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unavailableBannerText: {
    fontSize: 13,
    textAlign: 'center',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dateDividerWrap: {
    alignItems: 'center',
    marginVertical: 14,
  },
  dateDivider: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateDividerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  chatAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageContentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
  messageTime: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
    marginTop: 4,
  },
  quickRepliesSection: {
    borderTopWidth: 1,
    paddingTop: 8,
  },
  quickRepliesContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  quickReplyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickReplyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputWrap: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 96,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});