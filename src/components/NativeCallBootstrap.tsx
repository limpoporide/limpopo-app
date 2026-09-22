import { useEffect } from 'react';
import { router } from 'expo-router';
import {
  bringNativeCallAppToForeground,
  initializeNativeCalling,
  registerNativeCallingHandlers,
  type NativeManagedCall,
} from '../lib/native-calling';
import { supabase } from '../lib/supabase';

export function NativeCallBootstrap() {
  useEffect(() => {
    const emitRiderCallSignal = async (event: 'call_declined', call: NativeManagedCall) => {
      const channel = supabase
        .channel(`ride_call:${call.bookingId}:response`)
        .on('broadcast', { event }, () => undefined);

      try {
        const isChannelReady = await new Promise<boolean>((resolve) => {
          let settled = false;
          const timeoutId = setTimeout(() => {
            if (settled) {
              return;
            }

            settled = true;
            resolve(false);
          }, 4000);

          channel.subscribe((status) => {
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

        if (!isChannelReady) {
          throw new Error('Rider native call response channel did not become ready.');
        }

        await channel.send({
          type: 'broadcast',
          event,
          payload: {
            bookingId: call.bookingId,
            participantName: call.participantName,
            respondedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.log('[NativeCalling] failed to send rider native call signal', { event, error });
      } finally {
        supabase.removeChannel(channel);
      }
    };

    void initializeNativeCalling();

    const removeNativeCallingHandlers = registerNativeCallingHandlers({
      onAnswer: (call) => {
        if (!call?.bookingId) {
          return;
        }

        void bringNativeCallAppToForeground();

        router.push({
          pathname: '/bookings/call',
          params: {
            bookingId: call.bookingId,
            participantName: call.participantName,
            callUUID: call.callUUID,
            incoming: '1',
          },
        });
      },
      onEnd: (call) => {
        if (!call || call.direction !== 'incoming' || call.state !== 'ringing') {
          return;
        }

        void emitRiderCallSignal('call_declined', call);
      },
    });

    return () => {
      removeNativeCallingHandlers();
    };
  }, []);

  return null;
}