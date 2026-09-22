import { supabase } from './supabase';

export type ChatSenderRole = 'rider' | 'driver';

export type ChatMessageRow = {
  id: string;
  booking_id: string;
  sender_uuid: string;
  sender_role: ChatSenderRole;
  message: string;
  created_at: string;
};

export async function fetchChatMessages(bookingId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('ride_chat_message')
    .select('id, booking_id, sender_uuid, sender_role, message, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .returns<ChatMessageRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchUnreadDriverMessageCount(bookingId: string): Promise<number> {
  const { count, error } = await supabase
    .from('ride_chat_message')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('sender_role', 'driver')
    .is('read_by_rider_at', null);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function markDriverMessagesRead(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('ride_chat_message')
    .update({ read_by_rider_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('sender_role', 'driver')
    .is('read_by_rider_at', null);

  if (error) {
    throw error;
  }
}

export async function sendChatMessage(bookingId: string, message: string): Promise<ChatMessageRow> {
  const { data, error } = await supabase
    .rpc('send_ride_chat_message', { p_booking_id: bookingId, p_message: message })
    .single();

  if (error) {
    throw error;
  }

  return data as ChatMessageRow;
}

export function subscribeToChatMessages(
  bookingId: string,
  onInsert: (message: ChatMessageRow) => void
) {
  const channelName = `ride_chat_message:${bookingId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_chat_message',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => {
        onInsert(payload.new as ChatMessageRow);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
