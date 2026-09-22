import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type ChannelMediaOptions,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from 'react-native-agora';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  endNativeCall,
  markNativeCallActive,
  registerNativeCallingHandlers,
} from '@/lib/native-calling';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';

type AgoraTokenResponse = {
  appId: string;
  channelName: string;
  token: string;
  uid: number;
  expiresAt: number;
};

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const getFirstName = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 'Driver';
  }

  return trimmedValue.split(/\s+/)[0] ?? trimmedValue;
};

const resolveFunctionErrorMessage = async (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const response = (error as { context?: unknown }).context;

    if (response instanceof Response) {
      try {
        const payload = await response.clone().json();

        if (payload && typeof payload.error === 'string' && payload.error.trim()) {
          return payload.error;
        }
      } catch {
        try {
          const text = await response.clone().text();

          if (text.trim()) {
            return text;
          }
        } catch {
          return null;
        }
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return null;
};

const waitForBroadcastChannel = async (
  subscribe: (onStatus: (status: string) => void) => void,
  onStatus: (status: string) => void,
  timeoutMs = 4000
) => {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      onStatus('TIMED_OUT_WAITING');
      resolve(false);
    }, timeoutMs);

    subscribe((status) => {
      onStatus(status);

      if (settled) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timeoutId);
        resolve(true);
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true;
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  });
};

export default function BookingCallScreen() {
  const { theme } = useTheme();
  const engineRef = useRef<IRtcEngine | null>(null);
  const eventHandlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const ringSignalSentRef = useRef(false);
  const isClosingRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [remoteUserCount, setRemoteUserCount] = useState(0);
  const [statusText, setStatusText] = useState('Connecting call...');
  const [callError, setCallError] = useState<string | null>(null);
  const { bookingId, participantName, callUUID, incoming, signalSent } = useLocalSearchParams<{
    bookingId?: string;
    participantName?: string;
    callUUID?: string;
    incoming?: string;
    signalSent?: string;
  }>();
  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const resolvedParticipantName = getFirstName(normalizeRouteParam(participantName).trim() || 'Driver');
  const resolvedCallUUID = normalizeRouteParam(callUUID).trim();
  const isIncomingCall = normalizeRouteParam(incoming) === '1';
  const hasExistingOutgoingSignal = normalizeRouteParam(signalSent) === '1';

  const notifyIncomingCall = async () => {
    if (!resolvedBookingId || ringSignalSentRef.current || isIncomingCall || hasExistingOutgoingSignal) {
      return;
    }

    try {
      const channel = supabase
        .channel(`ride_call:${resolvedBookingId}`)
        .on('broadcast', { event: 'incoming_call' }, () => undefined);

      const isChannelReady = await waitForBroadcastChannel(
        (handleStatus) => {
          channel.subscribe(handleStatus);
        },
        () => undefined
      );

      if (!isChannelReady) {
        throw new Error('Call signaling channel did not become ready.');
      }

      console.log('[Agora Call] Broadcasting incoming call', {
        bookingId: resolvedBookingId,
        participantName: resolvedParticipantName,
      });

      await channel.send({
        type: 'broadcast',
        event: 'incoming_call',
        payload: {
          bookingId: resolvedBookingId,
          participantName: resolvedParticipantName,
          callerRole: 'rider',
          initiatedAt: new Date().toISOString(),
        },
      });

      ringSignalSentRef.current = true;
      supabase.removeChannel(channel);
    } catch (error) {
      console.log('[Agora Call] Failed to broadcast incoming call', error);
    }
  };

  const cleanupCall = () => {
    const engine = engineRef.current;
    const eventHandler = eventHandlerRef.current;

    if (!engine) {
      return;
    }

    try {
      if (eventHandler) {
        engine.unregisterEventHandler(eventHandler);
      }
      engine.leaveChannel();
      engine.release();
    } catch (error) {
      console.log('[Agora Call] Cleanup error', error);
    } finally {
      eventHandlerRef.current = null;
      engineRef.current = null;
    }
  };

  const closeCallScreen = () => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;

    if (resolvedCallUUID) {
      void endNativeCall(resolvedCallUUID);
    }

    cleanupCall();
    router.back();
  };

  const emitCallSignal = async (event: 'call_ended') => {
    if (!resolvedBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${resolvedBookingId}:response`)
      .on('broadcast', { event }, () => undefined);

    try {
      const isChannelReady = await waitForBroadcastChannel(
        (handleStatus) => {
          channel.subscribe(handleStatus);
        },
        () => undefined
      );

      if (!isChannelReady) {
        throw new Error('Call response channel did not become ready.');
      }

      await channel.send({
        type: 'broadcast',
        event,
        payload: {
          bookingId: resolvedBookingId,
          participantName: resolvedParticipantName,
          respondedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.log('[Agora Call] Failed to send call signal', { event, error });
    } finally {
      supabase.removeChannel(channel);
    }
  };

  const endCallAndClose = async ({ notifyRemote }: { notifyRemote: boolean }) => {
    if (notifyRemote) {
      await emitCallSignal('call_ended');
    }

    closeCallScreen();
  };

  const requestMicrophonePermission = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone access required',
        message: 'Limpopo needs microphone access so you can talk to your driver in the app.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  useEffect(() => {
    let isMounted = true;

    // AGORA CALL INTEGRATION: token fetch + engine bootstrap.
    // This block is the main call setup path for easier debugging.
    const bootstrapCall = async () => {
      if (!resolvedBookingId) {
        if (resolvedCallUUID) {
          await endNativeCall(resolvedCallUUID);
        }

        setIsConnecting(false);
        setCallError('This booking is missing the call details needed to start an in-app call.');
        return;
      }

      const hasPermission = await requestMicrophonePermission();

      if (!hasPermission) {
        if (resolvedCallUUID) {
          await endNativeCall(resolvedCallUUID);
        }

        if (isMounted) {
          setIsConnecting(false);
          setCallError('Microphone permission is required for in-app calls.');
        }
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('create-agora-call-token', {
          method: 'POST',
          body: {
            bookingId: resolvedBookingId,
          },
        });

        if (error) {
          throw new Error(error.message || 'Unable to prepare the call session.');
        }

        const callCredentials = data as AgoraTokenResponse;

        if (!callCredentials?.appId || !callCredentials?.channelName || !callCredentials?.token) {
          throw new Error('Agora call credentials are incomplete.');
        }

        await notifyIncomingCall();

        const engine = createAgoraRtcEngine();
        const eventHandler: IRtcEngineEventHandler = {
          onJoinChannelSuccess: () => {
            if (!isMounted) {
              return;
            }

            if (resolvedCallUUID) {
              void markNativeCallActive(resolvedCallUUID);
            }

            setIsJoined(true);
            setIsConnecting(false);
            setStatusText(`Connected to ${resolvedParticipantName}`);
          },
          onUserJoined: () => {
            if (!isMounted) {
              return;
            }

            setRemoteUserCount((current) => current + 1);
            setStatusText(`${resolvedParticipantName} joined the call`);
          },
          onUserOffline: () => {
            if (!isMounted) {
              return;
            }

            setRemoteUserCount(0);
            setStatusText(`${resolvedParticipantName} left the call`);
            closeCallScreen();
          },
          onConnectionStateChanged: (_, state) => {
            if (!isMounted) {
              return;
            }

            if (state === 3) {
              setStatusText('Reconnecting...');
            }

            if (state === 5) {
              setCallError('The call connection failed. Please try again.');
              setIsConnecting(false);
            }
          },
          onError: (err, msg) => {
            console.log('[Agora Call] Engine error', { err, msg });

            if (!isMounted) {
              return;
            }

            setCallError(msg || `Agora error ${err}`);
            setIsConnecting(false);
          },
        };

        engine.initialize({ appId: callCredentials.appId });
        engine.registerEventHandler(eventHandler);
        engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        engine.enableAudio();
        engine.enableLocalAudio(true);
        engine.setEnableSpeakerphone(true);

        const options: ChannelMediaOptions = {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          publishMicrophoneTrack: true,
          publishCameraTrack: false,
          autoSubscribeAudio: true,
          autoSubscribeVideo: false,
        };

        const joinResult = engine.joinChannel(
          callCredentials.token,
          callCredentials.channelName,
          callCredentials.uid,
          options
        );

        if (joinResult < 0) {
          throw new Error(`Unable to join Agora channel (${joinResult}).`);
        }

        if (!isMounted) {
          engine.leaveChannel();
          engine.release();
          return;
        }

        engineRef.current = engine;
        eventHandlerRef.current = eventHandler;
        setStatusText(`Calling ${resolvedParticipantName}...`);
      } catch (error) {
        console.log('[Agora Call] Bootstrap failed', error);

        cleanupCall();

        if (resolvedCallUUID) {
          await endNativeCall(resolvedCallUUID);
        }

        if (isMounted) {
          const resolvedMessage = await resolveFunctionErrorMessage(error);
          setCallError(resolvedMessage || 'Unable to start the in-app call.');
          setIsConnecting(false);
        }
      }
    };

    bootstrapCall();

    return () => {
      isMounted = false;
      cleanupCall();
    };
  }, [isIncomingCall, resolvedBookingId, resolvedCallUUID, resolvedParticipantName]);

  useEffect(() => {
    if (!resolvedCallUUID) {
      return;
    }

    return registerNativeCallingHandlers({
      onEnd: (call) => {
        if (call?.callUUID !== resolvedCallUUID) {
          return;
        }

        void endCallAndClose({ notifyRemote: true });
      },
    });
  }, [resolvedCallUUID, resolvedBookingId, resolvedParticipantName]);

  useEffect(() => {
    const engine = engineRef.current;

    if (!engine || !isJoined) {
      return;
    }

    // AGORA CALL INTEGRATION: in-call controls.
    // These state-driven engine updates are separated for easier debugging.
    engine.muteLocalAudioStream(isMuted);
    engine.setEnableSpeakerphone(isSpeakerOn);
  }, [isJoined, isMuted, isSpeakerOn]);

  const handleEndCall = () => {
    void endCallAndClose({ notifyRemote: true });
  };

  const handleRetry = () => {
    cleanupCall();
    ringSignalSentRef.current = false;
    router.replace({
      pathname: '/bookings/call',
      params: {
        bookingId: resolvedBookingId,
        participantName: resolvedParticipantName,
        callUUID: resolvedCallUUID,
        incoming: isIncomingCall ? '1' : '0',
      },
    });
  };

  useEffect(() => {
    if (!resolvedBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${resolvedBookingId}:response`)
      .on('broadcast', { event: 'call_declined' }, ({ payload }) => {
        const payloadBookingId = typeof payload?.bookingId === 'string' ? payload.bookingId : '';

        if (payloadBookingId !== resolvedBookingId) {
          return;
        }

        console.log('[Agora Call] Incoming call declined', {
          bookingId: payloadBookingId,
          participantName: payload?.participantName ?? null,
          respondedAt: payload?.respondedAt ?? null,
        });

        cleanupCall();
        Alert.alert('Call ended', `${resolvedParticipantName} declined the call.`, [
          {
            text: 'OK',
            onPress: closeCallScreen,
          },
        ]);
      })
      .on('broadcast', { event: 'call_ended' }, ({ payload }) => {
        const payloadBookingId = typeof payload?.bookingId === 'string' ? payload.bookingId : '';

        if (payloadBookingId !== resolvedBookingId) {
          return;
        }

        console.log('[Agora Call] Remote call ended', {
          bookingId: payloadBookingId,
          participantName: payload?.participantName ?? null,
          respondedAt: payload?.respondedAt ?? null,
        });

        closeCallScreen();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedBookingId, resolvedParticipantName]);

  useEffect(() => {
    if (!callError) {
      return;
    }

    Alert.alert('Call unavailable', callError);
  }, [callError]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={handleEndCall}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>In-App Call</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.avatarShell, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Ionicons name="person" size={52} color={theme.colors.primary} />
        </View>
        <Text style={[styles.participantName, { color: theme.colors.text }]}>{resolvedParticipantName}</Text>
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>{statusText}</Text>

        {isConnecting ? (
          <View style={styles.connectingRow}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={[styles.connectingText, { color: theme.colors.textSecondary }]}>Preparing secure call...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => setIsMuted((current) => !current)}
        >
          <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={theme.colors.text} />
          <Text style={[styles.controlLabel, { color: theme.colors.text }]}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => setIsSpeakerOn((current) => !current)}
        >
          <Ionicons name={isSpeakerOn ? 'volume-high' : 'volume-medium'} size={22} color={theme.colors.text} />
          <Text style={[styles.controlLabel, { color: theme.colors.text }]}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: callError ? theme.colors.primary : theme.colors.error, borderColor: 'transparent' }]}
          onPress={callError ? handleRetry : handleEndCall}
        >
          <Ionicons name={callError ? 'refresh' : 'call'} size={22} color="#FFFFFF" />
          <Text style={styles.endCallLabel}>{callError ? 'Retry' : 'End'}</Text>
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
    paddingTop: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  avatarShell: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: {
    fontSize: 28,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 15,
    textAlign: 'center',
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectingText: {
    fontSize: 14,
  },
  infoCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  controlButton: {
    flex: 1,
    minHeight: 84,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  endCallLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});