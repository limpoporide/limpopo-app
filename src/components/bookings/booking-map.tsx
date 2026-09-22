import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import MapView, { LatLng, MapViewProps, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import SecurityTip from './security-tip';

type FocusEdgePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type BookingMapProps = Omit<MapViewProps, 'provider' | 'style'> & {
  style?: StyleProp<ViewStyle>;
  useGoogleProvider?: boolean;
  focusCoordinates?: LatLng[];
  focusEdgePadding?: FocusEdgePadding;
};

const MIN_SINGLE_POINT_DELTA = 0.035;
const MIN_MULTI_POINT_DELTA = 0.02;
const DEFAULT_FOCUS_EDGE_PADDING: FocusEdgePadding = {
  top: 120,
  right: 80,
  bottom: 180,
  left: 80,
};

const buildFocusRegion = (coordinates: LatLng[], minimumDelta: number) => {
  if (coordinates.length === 0) {
    return null;
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.8, minimumDelta),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.8, minimumDelta),
  };
};

const BookingMap = forwardRef<MapView, BookingMapProps>(function BookingMap({
  children,
  style,
  useGoogleProvider = Platform.OS !== 'web',
  showsCompass = false,
  toolbarEnabled = false,
  focusCoordinates = [],
  focusEdgePadding = DEFAULT_FOCUS_EDGE_PADDING,
  onMapReady,
  ...props
}, ref) {
  const { theme } = useTheme();
  const mapRef = useRef<MapView | null>(null);
  const [isSecurityTipVisible, setIsSecurityTipVisible] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const focusCoordinatesKey = focusCoordinates
    .map((coordinate) => `${coordinate.latitude}:${coordinate.longitude}`)
    .join('|');

  useImperativeHandle(ref, () => mapRef.current as MapView, []);

  const handleResetToMarkers = () => {
    if (!mapRef.current || focusCoordinates.length === 0) {
      return;
    }

    if (focusCoordinates.length === 1) {
      const singlePointRegion = buildFocusRegion(focusCoordinates, MIN_SINGLE_POINT_DELTA);

      if (!singlePointRegion) {
        return;
      }

      mapRef.current.animateToRegion(
        singlePointRegion,
        300
      );
      return;
    }

    const computedRegion = buildFocusRegion(focusCoordinates, MIN_MULTI_POINT_DELTA);

    if (
      computedRegion
      && computedRegion.latitudeDelta <= MIN_MULTI_POINT_DELTA
      && computedRegion.longitudeDelta <= MIN_MULTI_POINT_DELTA
    ) {
      mapRef.current.animateToRegion(computedRegion, 300);
      return;
    }

    mapRef.current.fitToCoordinates(focusCoordinates, {
      edgePadding: focusEdgePadding,
      animated: true,
    });
  };

  useEffect(() => {
    if (!isMapReady || focusCoordinates.length === 0) {
      return;
    }

    handleResetToMarkers();
  }, [focusCoordinatesKey, focusEdgePadding, isMapReady]);

  return (
    <View style={style}>
      <MapView
        ref={mapRef}
        {...props}
        style={StyleSheet.absoluteFill}
        provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
        showsCompass={showsCompass}
        toolbarEnabled={toolbarEnabled}
        onMapReady={(event) => {
          setIsMapReady(true);
          onMapReady?.(event);
        }}
      >
        {children}
      </MapView>

      <View pointerEvents="box-none" style={styles.actionRail}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.mode === 'dark' ? '#000000' : theme.colors.background,
              borderColor: theme.mode === 'dark' ? '#FFFFFF' : theme.colors.border,
            },
          ]}
          onPress={handleResetToMarkers}
        >
          <Ionicons name="navigate" size={20} color={theme.mode === 'dark' ? '#FFFFFF' : theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.mode === 'dark' ? '#000000' : theme.colors.background,
              borderColor: theme.mode === 'dark' ? '#FFFFFF' : theme.colors.border,
            },
          ]}
          onPress={() => setIsSecurityTipVisible(true)}
        >
          <Ionicons name="shield-checkmark" size={20} color={theme.mode === 'dark' ? '#FFFFFF' : theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <SecurityTip visible={isSecurityTipVisible} onClose={() => setIsSecurityTipVisible(false)} />
    </View>
  );
});

export default BookingMap;

const styles = StyleSheet.create({
  actionRail: {
    position: 'absolute',
    right: 16,
    top: '24%',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});