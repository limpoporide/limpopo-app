import { supabase } from './supabase';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

const normalizeNotification = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: row.data,
  isRead: row.is_read,
  createdAt: row.created_at,
});

const invokeNotificationMutation = async (body: { action: 'delete' | 'clear'; notificationId?: string }) => {
  const { error, data } = await supabase.functions.invoke('manage-rider-notifications', {
    method: 'POST',
    body,
  });

  if (error) {
    throw error;
  }

  const responseError = typeof data?.error === 'string' ? data.error : null;

  if (responseError) {
    throw new Error(responseError);
  }
};

export const fetchNotifications = async (): Promise<NotificationItem[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return (data as NotificationRow[]).map(normalizeNotification);
};

export const fetchUnreadNotificationCount = async (): Promise<number> => {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error || count == null) {
    return 0;
  }

  return count;
};

export const markNotificationRead = async (notificationId: string) => {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('is_read', false);
};

export const markAllNotificationsRead = async () => {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('is_read', false);
};

export const deleteNotification = async (notificationId: string) => {
  await invokeNotificationMutation({ action: 'delete', notificationId });
};

export const deleteAllNotifications = async () => {
  await invokeNotificationMutation({ action: 'clear' });
};
