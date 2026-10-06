import { Platform } from 'react-native';
import notifee, { AndroidImportance, type Notification } from '@notifee/react-native';

export type RideOngoingNotificationStatus = 'accepted' | 'arrived' | 'in_progress';

type RideOngoingNotificationPayload = {
  bookingId: string;
  status: RideOngoingNotificationStatus;
  driverName?: string | null;
};

const CHANNEL_ID = 'limpopo-ride-ongoing';
const NOTIFICATION_ID = 'limpopo-ride-ongoing';
const NOTIFICATION_COLOR = '#C58B00';
const NOTIFICATION_ICON = 'ic_stat_limpopo_ride';

let isForegroundServiceRegistered = false;
let stopForegroundTask: (() => void) | null = null;

const isAndroid = Platform.OS === 'android';

const ensureForegroundServiceRegistered = () => {
  if (!isAndroid || isForegroundServiceRegistered) {
    return;
  }

  notifee.registerForegroundService(() => {
    return new Promise<void>((resolve) => {
      stopForegroundTask = () => {
        stopForegroundTask = null;
        resolve();
      };
    });
  });

  isForegroundServiceRegistered = true;
};

const ensureChannel = async () => {
  if (!isAndroid) {
    return null;
  }

  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Limpopo Ride',
    importance: AndroidImportance.LOW,
    vibration: false,
    sound: undefined,
  });
};

const buildNotificationBody = ({ status, driverName }: RideOngoingNotificationPayload) => {
  const resolvedDriverName = driverName?.trim() || 'Your pilot';

  switch (status) {
    case 'accepted':
      return `${resolvedDriverName} is heading to your pickup.`;
    case 'arrived':
      return `${resolvedDriverName} has arrived at your pickup.`;
    case 'in_progress':
      return 'Trip in progress.';
    default:
      return 'Ride update available.';
  }
};

const buildForegroundNotification = async (
  payload: RideOngoingNotificationPayload
): Promise<Notification | null> => {
  const channelId = await ensureChannel();

  if (!channelId) {
    return null;
  }

  return {
    id: NOTIFICATION_ID,
    title: 'Limpopo Ride',
    body: buildNotificationBody(payload),
    data: {
      bookingId: payload.bookingId,
      rideStatus: payload.status,
    },
    android: {
      channelId,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: NOTIFICATION_ICON,
      color: NOTIFICATION_COLOR,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
    },
  };
};

export const showRideOngoingNotification = async (payload: RideOngoingNotificationPayload) => {
  if (!isAndroid || !payload.bookingId) {
    return;
  }

  ensureForegroundServiceRegistered();

  const notification = await buildForegroundNotification(payload);

  if (!notification) {
    return;
  }

  await notifee.displayNotification(notification);
};

export const hideRideOngoingNotification = async () => {
  if (!isAndroid) {
    return;
  }

  stopForegroundTask?.();
  await notifee.stopForegroundService();
  await notifee.cancelNotification(NOTIFICATION_ID);
};