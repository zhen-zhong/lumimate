import * as Haptics from 'expo-haptics';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearIndependentRoute,
  DriveStrategy,
  ExpoGaodeMapModule,
  ExpoGaodeMapNaviView,
  NaviSpeedometer,
  independentDriveRoute,
  independentRideRoute,
  independentWalkRoute,
  MapType,
  MapView,
  Marker,
  Polyline,
  searchPOI,
  selectIndependentRoute,
  type ExpoGaodeMapNaviViewRef,
  type IndependentRouteResult,
  type MapViewRef,
  type NaviTrafficStatusesEvent,
  type POI,
  type RouteResult,
} from 'expo-gaode-map-navigation';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTabBarVisibility } from '@/context/tab-bar-context';
import { useTheme } from '@/hooks/use-theme';

const LUMIMATE_COORDINATE = { latitude: 39.9087, longitude: 116.3975 };
const SEARCH_HISTORY_KEY = '@lumimate/map-search-history';
const MAX_SEARCH_HISTORY_ITEMS = 10;
const ROUTE_BLUE = '#3185F7';
const ROUTE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_ROUTE_POLYLINE_POINTS = 600;
const MAP_CONTROLS_HIDDEN_TRANSLATE_Y = -220;
const MAP_CONTROLS_HIDE_DURATION_MS = 240;
const MAP_CONTROLS_SHOW_DURATION_MS = 280;
const ROUTE_SHEET_BASE_HEIGHT = 276;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type SearchLocation = Pick<POI, 'id' | 'name' | 'address' | 'location'>;
type SearchHistoryItem = SearchLocation & { searchedAt: string };
type TravelMode = 'drive' | 'ride' | 'walk' | 'transit';
type RoutePreview = Pick<RouteResult, 'id' | 'distance' | 'duration' | 'polyline' | 'segments'>;
type RouteStep = NonNullable<RoutePreview['segments']>[number];
type NaviInfo = {
  pathRetainDistance: number;
  pathRetainTime: number;
  curStepRetainDistance?: number;
  currentRoadName: string;
  nextRoadName: string;
  currentSpeed?: number;
  routeRemainTrafficLightCount?: number;
};
type TrafficStatus = NaviTrafficStatusesEvent['items'][number];

const TRAVEL_MODES: { key: TravelMode; label: string; icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol } }[] = [
  { key: 'drive', label: '驾车', icon: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' } },
  { key: 'ride', label: '骑行', icon: { ios: 'bicycle', android: 'directions_bike', web: 'directions_bike' } },
  { key: 'walk', label: '步行', icon: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' } },
  { key: 'transit', label: '地铁', icon: { ios: 'tram.fill', android: 'directions_transit', web: 'directions_transit' } },
];

let privacyConfigured = false;

function parseSearchHistory(value: string | null): SearchHistoryItem[] {
  if (!value) return [];
  try {
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (item): item is SearchHistoryItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.address === 'string' &&
          typeof item.searchedAt === 'string' &&
          typeof item.location === 'object' &&
          item.location !== null &&
          typeof item.location.latitude === 'number' &&
          typeof item.location.longitude === 'number'
      )
      .slice(0, MAX_SEARCH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function formatSearchDate(searchedAt: string) {
  const date = new Date(searchedAt);
  if (Number.isNaN(date.getTime())) return '日期未知';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRouteOptions(result: IndependentRouteResult) {
  if (!result.routes.length) throw new Error('未返回可用路线');
  return result.routes.map((route) => ({
    ...route,
    polyline: sanitizePolyline(route.polyline),
  })) as RoutePreview[];
}

function getRouteDetailSteps(route: RoutePreview): RouteStep[] {
  const nativeSteps = (route.segments ?? []).filter(
    (step): step is RouteStep =>
      Boolean(
        step &&
          Number.isFinite(step.distance) &&
          Number.isFinite(step.duration) &&
          step.distance >= 0 &&
          step.duration >= 0
      )
  );
  if (nativeSteps.length) return nativeSteps;

  const points = sanitizePolyline(route.polyline);
  if (points.length < 2) return [];

  const stepCount = Math.min(3, Math.max(1, Math.ceil(points.length / 200)));
  return Array.from({ length: stepCount }, (_, index) => {
    const startIndex = Math.floor(((points.length - 1) * index) / stepCount);
    const endIndex = Math.max(startIndex + 1, Math.floor(((points.length - 1) * (index + 1)) / stepCount));
    const isLastStep = index === stepCount - 1;

    return {
      instruction: isLastStep ? '到达目的地' : index === 0 ? '沿规划路线出发' : '继续沿规划路线前行',
      distance: Math.round(route.distance / stepCount),
      duration: Math.round(route.duration / stepCount),
      polyline: points.slice(startIndex, endIndex + 1),
    };
  });
}

function getMainRouteIndex(result: IndependentRouteResult) {
  return Math.min(Math.max(result.mainPathIndex, 0), Math.max(result.routes.length - 1, 0));
}

function formatDistance(distance: number) {
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} 公里` : `${Math.round(distance)} 米`;
}

function formatDuration(duration: number) {
  return `${Math.max(1, Math.round(duration / 60))} 分钟`;
}

function formatArrivalTime(duration: number) {
  const arrival = new Date(Date.now() + duration * 1000);
  return `${String(arrival.getHours()).padStart(2, '0')}:${String(arrival.getMinutes()).padStart(2, '0')} 到达`;
}

function getRouteStepTitle(step: RouteStep) {
  return step.instruction || step.road || '继续前行';
}

function isSafeCoordinate(point: { latitude: number; longitude: number } | null | undefined) {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
  );
}

function sanitizePolyline(points: RoutePreview['polyline']) {
  const validPoints = (points ?? []).filter(isSafeCoordinate);
  if (validPoints.length <= MAX_ROUTE_POLYLINE_POINTS) return validPoints;

  const step = Math.ceil((validPoints.length - 1) / (MAX_ROUTE_POLYLINE_POINTS - 1));
  return validPoints.filter((_, index) => index === validPoints.length - 1 || index % step === 0);
}

function withRouteTimeout<T>(request: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('路线规划超时')), ROUTE_REQUEST_TIMEOUT_MS);
    void request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getNamedRoadName(name?: string) {
  const value = name?.trim() || '';
  return value && !['无名道路', '未知道路', '未知'].includes(value) ? value : '';
}

function getTrafficColor(status: number) {
  switch (status) {
    case 1:
      return '#16B96A';
    case 2:
      return '#F4C542';
    case 3:
      return '#F28C28';
    case 4:
    case 5:
      return '#E5484D';
    default:
      return '#AAB4C2';
  }
}

function ensureGaodePrivacyReady() {
  if (Platform.OS === 'web' || privacyConfigured) return;
  const status = ExpoGaodeMapModule.getPrivacyStatus();
  if (!status.isReady) {
    ExpoGaodeMapModule.setPrivacyConfig({
      hasShow: true,
      hasContainsPrivacy: true,
      hasAgree: true,
      privacyVersion: '2026-09-10',
    });
  }
  privacyConfigured = true;
}

export function GaodeMemoryMap() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const { setTabBarHidden } = useTabBarVisibility();
  const mapRef = useRef<MapViewRef>(null);
  const naviRef = useRef<ExpoGaodeMapNaviViewRef>(null);
  const routeRequestIdRef = useRef(0);
  const mapControlsVisibleRef = useRef(true);
  const hasCenteredOnUserLocationRef = useRef(false);
  const hasSettledInitialCameraRef = useRef(false);
  const isProgrammaticCameraMoveRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<SearchLocation | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>('drive');
  const [routeOptions, setRouteOptions] = useState<RoutePreview[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeToken, setRouteToken] = useState<number | null>(null);
  const [routeStart, setRouteStart] = useState<SearchLocation['location'] | null>(null);
  const [userLocation, setUserLocation] = useState<SearchLocation['location'] | null>(null);
  const [routeReversed, setRouteReversed] = useState(false);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationStarting, setNavigationStarting] = useState(false);
  const [navigationOverview, setNavigationOverview] = useState(false);
  const [naviInfo, setNaviInfo] = useState<NaviInfo | null>(null);
  const [trafficStatuses, setTrafficStatuses] = useState<TrafficStatus[]>([]);
  const [mapControlsHidden, setMapControlsHidden] = useState(false);
  const reducedMotion = useReducedMotion();
  const mapControlsProgress = useSharedValue(1);
  const routePreview = routeOptions[selectedRouteIndex] ?? null;
  const routeDetailSteps = routePreview ? getRouteDetailSteps(routePreview) : [];

  const moveMapCamera = useCallback(async (target: SearchLocation['location'], zoom: number, duration: number) => {
    const map = mapRef.current;
    if (!map) return;
    isProgrammaticCameraMoveRef.current = true;
    try {
      await map.moveCamera({ target, zoom }, duration);
    } catch (error) {
      isProgrammaticCameraMoveRef.current = false;
      throw error;
    }
  }, []);

  const fitMapToCoordinates = useCallback(async (coordinates: NonNullable<RoutePreview['polyline']>) => {
    const map = mapRef.current;
    if (!map) return;
    isProgrammaticCameraMoveRef.current = true;
    try {
      await map.fitToCoordinates(coordinates);
    } catch (error) {
      isProgrammaticCameraMoveRef.current = false;
      throw error;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void AsyncStorage.getItem(SEARCH_HISTORY_KEY)
      .then((value) => isMounted && setSearchHistory(parseSearchHistory(value)))
      .catch(() => undefined)
      .finally(() => isMounted && setHistoryLoaded(true));
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (historyLoaded) void AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory)).catch(() => undefined);
  }, [historyLoaded, searchHistory]);

  useEffect(() => () => setTabBarHidden(false), [setTabBarHidden]);

  useEffect(() => {
    setTabBarHidden(Boolean(selectedPoi) || !mapControlsVisibleRef.current);
  }, [selectedPoi, setTabBarHidden]);

  useEffect(() => {
    mapControlsProgress.set(
      withTiming(mapControlsHidden ? 0 : 1, {
        duration: reducedMotion
          ? 160
          : mapControlsHidden
            ? MAP_CONTROLS_HIDE_DURATION_MS
            : MAP_CONTROLS_SHOW_DURATION_MS,
        easing: EASE_OUT,
      }),
    );
  }, [mapControlsHidden, mapControlsProgress, reducedMotion]);

  const mapControlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mapControlsProgress.get(),
    transform: [
      {
        translateY: reducedMotion
          ? 0
          : (1 - mapControlsProgress.get()) * MAP_CONTROLS_HIDDEN_TRANSLATE_Y,
      },
    ],
  }));

  useEffect(() => {
    if (!searchOpen || !query.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      setIsSearching(true);
      setSearchMessage('');
      void searchPOI({ keyword: query.trim(), pageSize: 8 })
        .then((result) => {
          if (!current) return;
          setResults(result.pois);
          if (!result.pois.length) setSearchMessage('未找到匹配地址');
        })
        .catch(() => current && setSearchMessage('地址搜索失败，请重试'))
        .finally(() => current && setIsSearching(false));
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, searchOpen]);

  useEffect(() => {
    let isMounted = true;
    const updateLocation = (location: SearchLocation['location']) => {
      if (isMounted) setUserLocation({ latitude: location.latitude, longitude: location.longitude });
    };
    const subscription = ExpoGaodeMapModule.addLocationListener((location) => {
      updateLocation(location);
    });
    void (async () => {
      let permission = await ExpoGaodeMapModule.checkLocationPermission();
      if (!permission.granted) permission = await ExpoGaodeMapModule.requestLocationPermission();
      if (!permission.granted || !isMounted) return;
      ExpoGaodeMapModule.start();
      try {
        updateLocation(await withRouteTimeout(ExpoGaodeMapModule.getCurrentLocation()));
      } catch {
        // The location listener can still provide a later GPS update.
      }
    })();
    return () => {
      isMounted = false;
      subscription.remove();
      ExpoGaodeMapModule.stop();
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !userLocation || hasCenteredOnUserLocationRef.current) return;
    hasCenteredOnUserLocationRef.current = true;
    void moveMapCamera(userLocation, 16, 350).catch(() => undefined);
  }, [mapReady, moveMapCamera, userLocation]);

  useEffect(() => {
    if (!navigationOpen || routeToken === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const naviView = naviRef.current;
      if (!naviView) {
        if (!cancelled) {
          setNavigationOpen(false);
          setNavigationStarting(false);
          setRouteMessage('导航视图尚未就绪，请重试');
        }
        return;
      }
      void naviView
        .startNavigationWithIndependentPath(routeToken, { routeIndex: selectedRouteIndex, naviType: 0 })
        .then(() => !cancelled && setNavigationStarting(false))
        .catch(() => {
          if (!cancelled) {
            setNavigationOpen(false);
            setNavigationStarting(false);
            setRouteMessage('导航启动失败，请检查定位权限和网络');
          }
        });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigationOpen, routeToken, selectedRouteIndex]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">高德地图仅在 iOS / Android 原生构建中显示</ThemedText>
      </View>
    );
  }

  ensureGaodePrivacyReady();

  const setMapControlsVisibility = (visible: boolean) => {
    if (mapControlsVisibleRef.current === visible) return;
    mapControlsVisibleRef.current = visible;
    setMapControlsHidden(!visible);
    setTabBarHidden(Boolean(selectedPoi) || !visible);
  };

  const closeSearch = () => {
    setMapControlsVisibility(true);
    Keyboard.dismiss();
    setSearchOpen(false);
    setResults([]);
    setSearchMessage('');
    setIsSearching(false);
  };

  const openSearch = () => {
    setMapControlsVisibility(true);
    setQuery('');
    setResults([]);
    setSearchMessage('');
    setSearchOpen(true);
  };

  const clearRoute = () => {
    setMapControlsVisibility(true);
    routeRequestIdRef.current += 1;
    if (routeToken !== null) void clearIndependentRoute({ token: routeToken }).catch(() => undefined);
    setSelectedPoi(null);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setRouteToken(null);
    setRouteMessage('');
    setRouteReversed(false);
    setRouteDetailsOpen(false);
    setTabBarHidden(false);
  };

  const planRoute = async (mode: TravelMode, destination = selectedPoi, reversed = routeReversed) => {
    if (!destination) return;
    const requestId = ++routeRequestIdRef.current;
    if (routeToken !== null) void clearIndependentRoute({ token: routeToken }).catch(() => undefined);
    setTravelMode(mode);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    setRouteToken(null);
    setRouteDetailsOpen(false);
    if (mode === 'transit') {
      setRouteMessage('地铁路线暂不支持');
      return;
    }
    setIsPlanningRoute(true);
    setRouteMessage('');
    try {
      // 模式切换必须复用已规划路线的起点。重复调用原生定位在 iOS 上可能不回调，
      // 会让骑行/步行一直停留在加载态。
      let from = routeStart && isSafeCoordinate(routeStart) ? routeStart : userLocation && isSafeCoordinate(userLocation) ? userLocation : null;
      if (!from) {
        let permission = await ExpoGaodeMapModule.checkLocationPermission();
        if (!permission.granted) permission = await ExpoGaodeMapModule.requestLocationPermission();
        if (!permission.granted) throw new Error('未授予位置权限');
        const location = await withRouteTimeout(ExpoGaodeMapModule.getCurrentLocation());
        if (requestId !== routeRequestIdRef.current) return;
        from = { latitude: location.latitude, longitude: location.longitude };
        setRouteStart(from);
      }
      const currentPosition = { ...from, name: '我的位置' };
      const destinationPosition = { ...destination.location, name: destination.name, poiId: destination.id };
      const base = reversed
        ? { from: destinationPosition, to: currentPosition }
        : { from: currentPosition, to: destinationPosition };
      const result =
        mode === 'drive'
          ? await withRouteTimeout(independentDriveRoute({ ...base, strategy: DriveStrategy.FASTEST }))
          : mode === 'ride'
            ? await withRouteTimeout(independentRideRoute(base))
            : await withRouteTimeout(independentWalkRoute(base));
      if (requestId !== routeRequestIdRef.current) {
        void clearIndependentRoute({ token: result.token }).catch(() => undefined);
        return;
      }
      const routes = getRouteOptions(result);
      const mainRouteIndex = getMainRouteIndex(result);
      setRouteOptions(routes);
      setSelectedRouteIndex(mainRouteIndex);
      setRouteToken(result.token);
      const mainRoute = routes[mainRouteIndex];
      if (mainRoute.polyline && mainRoute.polyline.length > 1) {
        setTimeout(() => {
          try {
            void fitMapToCoordinates(mainRoute.polyline!).catch(() => undefined);
          } catch {
            // Invalid native map state must not take down the route screen.
          }
        }, 80);
      }
    } catch {
      if (requestId === routeRequestIdRef.current) setRouteMessage('路线规划失败或超时，请重试');
    } finally {
      if (requestId === routeRequestIdRef.current) setIsPlanningRoute(false);
    }
  };

  const selectRoute = async (index: number) => {
    const route = routeOptions[index];
    if (!route) return;
    if (index !== selectedRouteIndex) Haptics.selectionAsync().catch(() => undefined);
    setSelectedRouteIndex(index);
    if (routeToken !== null) void selectIndependentRoute({ token: routeToken, routeIndex: index }).catch(() => undefined);
    if (route.polyline && route.polyline.length > 1) {
      try {
        await fitMapToCoordinates(route.polyline);
      } catch {
        // Keep the selected route visible even if camera fitting fails.
      }
    }
  };

  const handleSelectPoi = async (poi: SearchLocation) => {
    if (isPlanningRoute || !isSafeCoordinate(poi.location)) {
      setSearchMessage('该地址坐标不可用，请选择其他结果');
      return;
    }
    Keyboard.dismiss();
    setTabBarHidden(true);
    setSelectedPoi(poi);
    setRouteReversed(false);
    setQuery('');
    setSearchHistory((items) =>
      [{ ...poi, searchedAt: new Date().toISOString() }, ...items.filter((item) => item.id !== poi.id)].slice(0, MAX_SEARCH_HISTORY_ITEMS)
    );
    closeSearch();
    try {
      await moveMapCamera(poi.location, 16, 350);
    } catch {
      // The route calculation can continue when a transient camera update fails.
    }
    void planRoute('drive', poi, false);
  };

  const reverseRouteDirection = () => {
    if (!selectedPoi || isPlanningRoute) return;
    const reversed = !routeReversed;
    setRouteReversed(reversed);
    Haptics.selectionAsync().catch(() => undefined);
    void planRoute(travelMode, selectedPoi, reversed);
  };

  const openNavigation = () => {
    if (routeToken === null || !routePreview) {
      setRouteMessage('请先选择可用路线');
      return;
    }
    setNavigationOverview(false);
    setNavigationStarting(true);
    setTrafficStatuses([]);
    setNaviInfo({
      pathRetainDistance: routePreview.distance,
      pathRetainTime: routePreview.duration,
      curStepRetainDistance: routePreview.segments?.[0]?.distance,
      currentRoadName: '正在准备导航',
      nextRoadName: routeReversed ? '我的位置' : selectedPoi?.name || '',
    });
    setNavigationOpen(true);
  };

  const closeNavigation = async () => {
    try {
      await naviRef.current?.stopNavigation();
    } catch {
      // The native view can be dismissed before navigation has started.
    } finally {
      setNavigationOpen(false);
      setNavigationStarting(false);
      setNavigationOverview(false);
    }
  };

  const navigationDistance = naviInfo?.pathRetainDistance ?? routePreview?.distance ?? 0;
  const navigationDuration = naviInfo?.pathRetainTime ?? routePreview?.duration ?? 0;
  const turnDistance = naviInfo?.curStepRetainDistance ?? navigationDistance;
  const nextRoadName = getNamedRoadName(naviInfo?.nextRoadName);
  const currentRoadName = getNamedRoadName(naviInfo?.currentRoadName);
  const displayedRoadName = nextRoadName || currentRoadName || '前方道路';
  const hideMapControls = () => {
    if (searchOpen || !hasSettledInitialCameraRef.current || isProgrammaticCameraMoveRef.current) return;
    setMapControlsVisibility(false);
  };
  const showMapControls = () => {
    setMapControlsVisibility(true);
  };
  const handleCameraIdle = () => {
    if (!hasSettledInitialCameraRef.current) {
      hasSettledInitialCameraRef.current = true;
      isProgrammaticCameraMoveRef.current = false;
      return;
    }
    if (isProgrammaticCameraMoveRef.current) {
      isProgrammaticCameraMoveRef.current = false;
      return;
    }
    showMapControls();
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={MapType.Standard}
        initialCameraPosition={{ target: LUMIMATE_COORDINATE, zoom: 13 }}
        myLocationEnabled
        followUserLocation={false}
        onLoad={() => setMapReady(true)}
        compassEnabled={false}
        scaleControlsEnabled
        zoomControlsEnabled={false}
        onCameraMove={hideMapControls}
        onCameraIdle={handleCameraIdle}>
        {routeStart ? <Marker position={routeStart} title="我的位置" /> : null}
        {selectedPoi ? <Marker position={selectedPoi.location} title={selectedPoi.name} /> : null}
        {routeOptions.map((route, index) =>
          route.polyline ? (
            <Polyline
              key={`${route.id}-${index}`}
              points={route.polyline}
              strokeColor={index === selectedRouteIndex ? ROUTE_BLUE : '#93A1B2'}
              strokeWidth={index === selectedRouteIndex ? 7 : 4}
              zIndex={index === selectedRouteIndex ? 2 : 1}
              simplificationTolerance={5}
            />
          ) : null
        )}
      </MapView>

      <Animated.View
        pointerEvents={mapControlsHidden ? 'none' : 'box-none'}
        style={[styles.mapControlsOverlay, mapControlsAnimatedStyle]}>
          {selectedPoi ? (
            <>
              <View
                style={[
                  styles.routeHeader,
                  { backgroundColor: theme.background, minHeight: safeAreaInsets.top + 70, paddingTop: safeAreaInsets.top + 4 },
                ]}>
            <Pressable accessibilityRole="button" accessibilityLabel="退出路线规划" onPress={clearRoute} style={styles.routeBackButton}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} tintColor={theme.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重新搜索目的地"
              onPress={openSearch}
              style={[styles.routeLocations, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.routeLocationRow}>
                <View style={[styles.locationDot, styles.startDot]} />
                <Text numberOfLines={1} style={[styles.routeLocationText, { color: theme.text }]}>{routeReversed ? selectedPoi.name : '我的位置'}</Text>
              </View>
              <View style={styles.routeLocationDivider} />
              <View style={styles.routeLocationRow}>
                <View style={[styles.locationDot, styles.endDot]} />
                <Text numberOfLines={1} style={[styles.routeLocationText, { color: theme.text }]}>{routeReversed ? '我的位置' : selectedPoi.name}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="反转起点和终点"
              disabled={isPlanningRoute}
              onPress={reverseRouteDirection}
              style={({ pressed }) => [styles.routeSwapButton, isPlanningRoute && styles.routeModeTabDisabled, pressed && styles.routeSwapButtonPressed]}>
              <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' }} size={20} tintColor={ROUTE_BLUE} />
            </Pressable>
              </View>
              <View style={[styles.routeModeTabs, { backgroundColor: theme.background, top: safeAreaInsets.top + 70 }]}>
            {TRAVEL_MODES.map((mode) => {
              const selected = mode.key === travelMode;
              return (
                <Pressable
                  key={mode.key}
                  accessibilityRole="button"
                  disabled={isPlanningRoute}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    void planRoute(mode.key);
                  }}
                  style={[styles.routeModeTab, selected && styles.routeModeTabSelected, isPlanningRoute && styles.routeModeTabDisabled]}>
                  <SymbolView name={mode.icon} size={20} tintColor={selected ? ROUTE_BLUE : theme.textSecondary} />
                  <Text style={[styles.routeModeText, { color: selected ? ROUTE_BLUE : theme.textSecondary }]}>{mode.label}</Text>
                </Pressable>
              );
            })}
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="搜索地址" onPress={openSearch} style={[styles.searchTrigger, { backgroundColor: theme.background }]}>
              <Text style={[styles.searchTriggerText, { color: theme.textSecondary }]}>搜索地址、地点</Text>
            </Pressable>
          )}
      </Animated.View>

      {selectedPoi ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="定位到当前位置"
          onPress={() => void moveMapCamera(userLocation || routeStart || LUMIMATE_COORDINATE, 16, 300)}
          style={({ pressed }) => [
            styles.locateButton,
            { bottom: ROUTE_SHEET_BASE_HEIGHT + safeAreaInsets.bottom + Spacing.two },
            pressed && styles.locateButtonPressed,
          ]}>
          <SymbolView
            name={{ ios: 'location.north.fill', android: 'my_location', web: 'my_location' }}
            size={22}
            tintColor="#FFFFFF"
          />
        </Pressable>
      ) : null}

      {selectedPoi ? (
        <Animated.View
          entering={FadeInUp.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
          exiting={FadeOutDown.duration(140).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
          style={styles.routeSheet}>
          <View style={[styles.routeSheetSurface, { backgroundColor: theme.background }]}>
          {isPlanningRoute ? (
            <View style={styles.routeLoading}>
              <ActivityIndicator color={ROUTE_BLUE} size="small" />
              <Text style={[styles.routeLoadingText, { color: theme.textSecondary }]}>正在规划路线…</Text>
            </View>
          ) : routePreview ? (
            <>
              <View style={styles.routeSheetHandle} />
              <View style={styles.routeSheetHeader}>
                <View style={styles.routeEndpoints}>
                  <View style={styles.routeEndpointRow}>
                    <View style={[styles.routeEndpointDot, styles.routeEndpointStartDot]} />
                    <View style={styles.routeEndpointCopy}>
                      <Text style={[styles.routeEndpointLabel, { color: theme.textSecondary }]}>出发地</Text>
                      <Text numberOfLines={1} style={[styles.routeEndpointName, { color: theme.text }]}>{routeReversed ? selectedPoi.name : '我的位置'}</Text>
                    </View>
                  </View>
                  <View style={styles.routeEndpointConnector} />
                  <View style={styles.routeEndpointRow}>
                    <View style={[styles.routeEndpointDot, styles.routeEndpointEndDot]} />
                    <View style={styles.routeEndpointCopy}>
                      <Text style={[styles.routeEndpointLabel, { color: theme.textSecondary }]}>目的地</Text>
                      <Text numberOfLines={1} style={[styles.routeEndpointName, { color: theme.text }]}>{routeReversed ? '我的位置' : selectedPoi.name}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.routeArrivalBadge}>
                  <Text style={styles.routeArrivalLabel}>预计到达</Text>
                  <Text style={styles.routeArrivalTime}>{formatArrivalTime(routePreview.duration).slice(0, 5)}</Text>
                </View>
              </View>
              <View style={styles.routeCardList}>
                {routeOptions.slice(0, 3).map((route, index) => {
                  const selected = index === selectedRouteIndex;
                  const segmentCount = route.segments?.length;
                  return (
                    <Pressable
                      key={`${route.id}-${index}`}
                      accessibilityRole="button"
                      onPress={() => void selectRoute(index)}
                      style={({ pressed }) => [
                        styles.routeCard,
                        {
                          backgroundColor: selected ? '#F1F7FF' : theme.backgroundElement,
                          borderColor: selected ? ROUTE_BLUE : 'transparent',
                        },
                        pressed && styles.routeCardPressed,
                      ]}>
                      <View style={styles.routeCardTopLine}>
                        <Text style={[styles.routeCardBadge, { color: selected ? ROUTE_BLUE : theme.textSecondary, backgroundColor: selected ? '#DDEEFF' : theme.background }]}>
                          {index === 0 ? '推荐' : `方案 ${index + 1}`}
                        </Text>
                      </View>
                      <Text style={[styles.routeCardDuration, { color: selected ? ROUTE_BLUE : theme.text }]}>{formatDuration(route.duration)}</Text>
                      <Text style={[styles.routeCardDistance, { color: theme.textSecondary }]}>
                        {formatDistance(route.distance)}{segmentCount ? ` · ${segmentCount} 个路段` : ''}
                      </Text>
                      <Text style={[styles.routeCardLabel, { color: selected ? ROUTE_BLUE : theme.textSecondary }]}>
                        {selected ? '已选路线' : '点击选择'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.routeActionBar, { paddingBottom: safeAreaInsets.bottom + Spacing.one }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRouteDetailsOpen(true)}
                  style={({ pressed }) => [styles.routeDetailAction, { borderColor: theme.backgroundSelected }, pressed && styles.routeActionPressed]}>
                  <SymbolView
                    name={{ ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' }}
                    size={19}
                    tintColor={theme.text}
                  />
                  <Text style={[styles.routeDetailActionText, { color: theme.textSecondary }]}>详情</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`开始导航，${formatDuration(routePreview.duration)}，${formatDistance(routePreview.distance)}`}
                  onPress={openNavigation}
                  style={({ pressed }) => [styles.startNavigationButton, pressed && styles.startNavigationButtonPressed]}>
                  <View style={styles.startNavigationIcon}>
                    <SymbolView
                      name={{ ios: 'location.north.fill', android: 'navigation', web: 'navigation' }}
                      size={22}
                      tintColor="#FFFFFF"
                    />
                  </View>
                  <View style={styles.startNavigationCopy}>
                    <Text style={styles.startNavigationText}>开始导航</Text>
                    <Text style={styles.startNavigationMeta}>
                      {formatDuration(routePreview.duration)} · {formatDistance(routePreview.distance)}
                    </Text>
                  </View>
                  <View style={styles.startNavigationArrow}>
                    <SymbolView
                      name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
                      size={18}
                      tintColor={ROUTE_BLUE}
                    />
                  </View>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={[styles.routeStatus, { color: theme.textSecondary }]}>{routeMessage || '请选择出行方式'}</Text>
          )}
          </View>
        </Animated.View>
      ) : null}

      <Modal animationType="slide" visible={routeDetailsOpen && Boolean(routePreview)} onRequestClose={() => setRouteDetailsOpen(false)}>
        <View style={[styles.routeDetailsScreen, { backgroundColor: theme.background }]}>
          <View style={styles.routeDetailsHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回路线预览" onPress={() => setRouteDetailsOpen(false)} style={styles.routeDetailsBack}>
              <Text style={[styles.routeDetailsBackGlyph, { color: theme.text }]}>‹</Text>
            </Pressable>
            <View style={styles.routeDetailsHeading}>
              <Text style={[styles.routeDetailsTitle, { color: theme.text }]}>路线详情</Text>
              {routePreview ? <Text style={[styles.routeSummary, { color: theme.textSecondary }]}>{formatDuration(routePreview.duration)} · {formatDistance(routePreview.distance)}</Text> : null}
            </View>
          </View>
          <ScrollView
            style={styles.routeDetailsScroll}
            contentContainerStyle={[styles.routeSteps, !routeDetailSteps.length && styles.routeStepsEmpty]}>
            {routeDetailSteps.length ? (
              routeDetailSteps.map((step, index) => (
                <View key={`${step.instruction}-${index}`} style={styles.routeStep}>
                  <View style={styles.routeStepRail}>
                    <Text style={styles.routeStepIndex}>{index + 1}</Text>
                    {index < routeDetailSteps.length - 1 ? <View style={styles.routeStepLine} /> : null}
                  </View>
                  <View style={styles.routeStepContent}>
                    <Text style={[styles.routeStepTitle, { color: theme.text }]}>{getRouteStepTitle(step)}</Text>
                    <Text style={[styles.routeStepMeta, { color: theme.textSecondary }]}>{formatDistance(step.distance)} · 约 {formatDuration(step.duration)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.routeStatus, { color: theme.textSecondary }]}>此路线暂未返回分段指引。</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal animationType="slide" visible={navigationOpen} onRequestClose={() => void closeNavigation()} statusBarTranslucent>
        <View style={styles.navigationScreen}>
          <ExpoGaodeMapNaviView
            ref={naviRef}
            style={styles.navigationMap}
            naviType={0}
            enableVoice
            showCamera
            autoLockCar
            autoChangeZoom
            trafficLayerEnabled
            realCrossDisplay
            showMode={navigationOverview ? 2 : 1}
            showUIElements={false}
            showCompassEnabled={false}
            showTrafficBar={false}
            showRoute
            showBackupRoute
            isNaviTravelView={travelMode !== 'drive'}
            screenAnchor={{ x: 0.5, y: 0.68 }}
            pointToCenter={{ x: 0.5, y: 0.68 }}
            driveViewEdgePadding={{ top: 184, bottom: 132, left: 0, right: 0 }}
            onNaviInfoUpdate={(event) => setNaviInfo(event.nativeEvent)}
            onTrafficStatusesUpdate={(event) => setTrafficStatuses(event.nativeEvent.items)}
            onNaviStart={() => setNavigationStarting(false)}
            onNaviEnd={() => setNavigationStarting(false)}
          />
          <View pointerEvents="box-none" style={styles.navigationOverlay}>
            <View style={styles.navigationHud}>
              <View style={styles.navigationTurnIcon}>
                <SymbolView
                  name={{ ios: 'arrow.up', android: 'straight', web: 'arrow_upward' }}
                  size={36}
                  tintColor="#FFFFFF"
                />
              </View>
              <View style={styles.navigationInstruction}>
                <Text style={styles.navigationActionLabel}>前方 {formatDistance(turnDistance)}</Text>
                <Text numberOfLines={1} style={styles.navigationRoadName}>{displayedRoadName}</Text>
                <Text numberOfLines={1} style={styles.navigationCurrentRoad}>
                  {currentRoadName && currentRoadName !== nextRoadName ? `沿 ${currentRoadName} 行驶` : '请按路线行驶'}
                </Text>
              </View>
              <View style={styles.navigationHudStatus}>
                <Text style={styles.navigationHudStatusValue}>{navigationOverview ? '全览' : '跟随'}</Text>
                <Text style={styles.navigationHudStatusLabel}>导航中</Text>
              </View>
            </View>
            <View pointerEvents="none" style={styles.navigationSpeedometerShell}>
              <NaviSpeedometer
                speed={naviInfo?.currentSpeed}
                size={76}
                color={ROUTE_BLUE}
                backgroundColor="#FFFFFF"
              />
            </View>
            {trafficStatuses.length ? (
              <View pointerEvents="none" style={styles.navigationTrafficBar}>
                {[...trafficStatuses].reverse().map((segment, index) => (
                  <View
                    key={`${segment.status}-${segment.length}-${index}`}
                    style={[
                      styles.navigationTrafficSegment,
                      {
                        backgroundColor: getTrafficColor(segment.status),
                        flex: Math.max(segment.length, 1),
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            {navigationStarting ? (
              <View style={styles.navigationLoading}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.navigationLoadingText}>正在进入导航…</Text>
              </View>
            ) : null}
            <View style={styles.navigationBottomBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="退出导航"
                onPress={() => void closeNavigation()}
                style={({ pressed }) => [styles.navigationExit, pressed && styles.navigationControlPressed]}>
                <View style={styles.navigationControlIcon}>
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={19}
                    tintColor="#152033"
                  />
                </View>
                <Text style={styles.navigationExitText}>退出</Text>
              </Pressable>
              <View style={styles.navigationSummary}>
                <Text numberOfLines={1} style={styles.navigationDestination}>{selectedPoi?.name || '目的地'}</Text>
                <View style={styles.navigationSummaryStats}>
                  <Text style={styles.navigationSummaryMain}>{formatDuration(navigationDuration)}</Text>
                  <View style={styles.navigationSummaryDot} />
                  <Text style={styles.navigationSummaryDistance}>{formatDistance(navigationDistance)}</Text>
                </View>
                <Text style={styles.navigationSummaryArrival}>{formatArrivalTime(navigationDuration)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={navigationOverview ? '切换为跟随视角' : '切换为全览视角'}
                onPress={() => setNavigationOverview((value) => !value)}
                style={({ pressed }) => [styles.navigationOverviewButton, pressed && styles.navigationControlPressed]}>
                <View style={styles.navigationControlIcon}>
                  <SymbolView
                    name={
                      navigationOverview
                        ? { ios: 'location.north.fill', android: 'my_location', web: 'my_location' }
                        : { ios: 'map.fill', android: 'map', web: 'map' }
                    }
                    size={19}
                    tintColor="#152033"
                  />
                </View>
                <Text style={styles.navigationOverviewText}>{navigationOverview ? '跟随' : '全览'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {searchOpen ? (
        <View style={[styles.searchMask, { backgroundColor: theme.background }]}>
          <View style={styles.searchHeader}>
            <View style={[styles.searchInputWrap, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                autoFocus
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  if (!text.trim()) {
                    setResults([]);
                    setSearchMessage('');
                    setIsSearching(false);
                  }
                }}
                onSubmitEditing={Keyboard.dismiss}
                placeholder="搜索地址、地点"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.text }]}
              />
              {isSearching ? <ActivityIndicator color={theme.textSecondary} size="small" /> : null}
            </View>
            <Pressable accessibilityRole="button" onPress={closeSearch} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: theme.text }]}>取消</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            style={styles.searchContent}
            contentContainerStyle={styles.searchContentContainer}>
            {results.map((poi) => (
              <Pressable key={poi.id} accessibilityRole="button" onPress={() => void handleSelectPoi(poi)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: theme.backgroundSelected }]}>
                <Text numberOfLines={1} style={[styles.resultName, { color: theme.text }]}>{poi.name}</Text>
                <Text numberOfLines={1} style={[styles.resultAddress, { color: theme.textSecondary }]}>{poi.address || poi.adName || poi.cityName || '地址未知'}</Text>
              </Pressable>
            ))}
            {!query.trim() && searchHistory.length > 0 ? (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyTitle, { color: theme.textSecondary }]}>搜索历史</Text>
                  <Pressable accessibilityRole="button" onPress={() => setSearchHistory([])}>
                    <Text style={[styles.clearHistoryText, { color: theme.textSecondary }]}>清空</Text>
                  </Pressable>
                </View>
                {searchHistory.map((poi) => (
                  <Pressable key={poi.id} accessibilityRole="button" onPress={() => void handleSelectPoi(poi)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: theme.backgroundSelected }]}>
                    <View style={styles.historyResultHeader}>
                      <Text numberOfLines={1} style={[styles.historyResultName, { color: theme.text }]}>{poi.name}</Text>
                      <Text style={[styles.historyDate, { color: theme.textSecondary }]}>{formatSearchDate(poi.searchedAt)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除 ${poi.name} 搜索记录`}
                        hitSlop={Spacing.two}
                        onPress={(event) => {
                          event.stopPropagation();
                          setSearchHistory((items) => items.filter((item) => item.id !== poi.id));
                        }}
                        style={styles.deleteHistoryButton}>
                        <Text style={[styles.deleteHistoryText, { color: theme.textSecondary }]}>×</Text>
                      </Pressable>
                    </View>
                    <Text numberOfLines={1} style={[styles.resultAddress, { color: theme.textSecondary }]}>{poi.address || '地址未知'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {searchMessage ? <View style={styles.message}><Text style={[styles.messageText, { color: theme.textSecondary }]}>{searchMessage}</Text></View> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapControlsOverlay: { ...StyleSheet.absoluteFill },
  searchTrigger: {
    position: 'absolute', top: Platform.select({ ios: 64, default: 24 }), right: Spacing.three, left: Spacing.three,
    minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: Spacing.three,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 4,
  },
  searchTriggerText: { fontSize: 16 },
  routeHeader: {
    position: 'absolute', top: 0, right: 0, left: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: Spacing.three, paddingBottom: 6, paddingLeft: Spacing.three,
  },
  routeBackButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  routeLocations: { flex: 1, minHeight: 60, justifyContent: 'center', gap: 0, borderRadius: 14, paddingHorizontal: 12 },
  routeSwapButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  routeSwapButtonPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  routeLocationRow: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 9 },
  locationDot: { width: 9, height: 9, borderRadius: 4.5 },
  startDot: { backgroundColor: '#20C77A' },
  endDot: { backgroundColor: '#F04B4B' },
  routeLocationDivider: { width: StyleSheet.hairlineWidth, height: 5, marginLeft: 4, backgroundColor: '#B7BEC9' },
  routeLocationText: { flex: 1, fontSize: 16, fontWeight: '600' },
  routeModeTabs: {
    position: 'absolute', top: 0, right: 0, left: 0, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 4, paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8DCE3',
  },
  routeModeTab: { flex: 1, minWidth: 0, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12 },
  routeModeTabSelected: { backgroundColor: '#EAF2FF' },
  routeModeTabDisabled: { opacity: 0.5 },
  routeModeText: { fontSize: 14, fontWeight: '800' },
  locateButton: {
    position: 'absolute', right: Spacing.three, bottom: 282, width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: ROUTE_BLUE,
    shadowColor: '#1265D2', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.26, shadowRadius: 10, elevation: 6,
  },
  locateButtonPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  routeSheet: {
    position: 'absolute', right: 0, bottom: 0, left: 0,
    shadowColor: '#0D1B30', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 12,
  },
  routeSheetSurface: { minHeight: ROUTE_SHEET_BASE_HEIGHT, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  routeSheetHandle: { alignSelf: 'center', width: 34, height: 4, marginTop: 8, marginBottom: 5, borderRadius: 4, backgroundColor: '#D7DEE9' },
  routeSheetHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: 4 },
  routeEndpoints: { flex: 1, minWidth: 0 },
  routeEndpointRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 9 },
  routeEndpointDot: { width: 10, height: 10, borderRadius: 5 },
  routeEndpointStartDot: { backgroundColor: '#24BE79' },
  routeEndpointEndDot: { backgroundColor: '#F15B5B' },
  routeEndpointConnector: { width: 1, height: 8, marginLeft: 4.5, backgroundColor: '#C7CFDB' },
  routeEndpointCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  routeEndpointLabel: { width: 38, fontSize: 11, fontWeight: '700' },
  routeEndpointName: { flex: 1, fontSize: 15, fontWeight: '700' },
  routeArrivalBadge: { minWidth: 72, alignItems: 'center', borderRadius: 14, backgroundColor: '#EAF3FF', paddingHorizontal: Spacing.two, paddingVertical: 6 },
  routeArrivalLabel: { color: '#5275A9', fontSize: 11, fontWeight: '700' },
  routeArrivalTime: { marginTop: 2, color: ROUTE_BLUE, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  routeLoading: { minHeight: 276, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  routeLoadingText: { fontSize: 14 },
  routeCardList: { width: '100%', flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.three },
  routeCard: { flex: 1, minWidth: 0, minHeight: 90, justifyContent: 'center', borderWidth: 1.5, borderRadius: 15, padding: 9 },
  routeCardPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  routeCardTopLine: { alignItems: 'flex-start' },
  routeCardDuration: { marginTop: 5, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  routeCardBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
  routeCardDistance: { marginTop: 3, fontSize: 11, fontWeight: '600' },
  routeCardLabel: { marginTop: 3, fontSize: 11, fontWeight: '700' },
  routeActionBar: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9EDF3', paddingHorizontal: Spacing.three, paddingTop: 8, paddingBottom: Spacing.two },
  routeDetailAction: { width: 58, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 16, backgroundColor: '#F7F9FC' },
  routeDetailActionText: { fontSize: 11, fontWeight: '800' },
  routeActionPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  startNavigationButton: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: '#1976ED', paddingHorizontal: 9, shadowColor: '#1265D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  startNavigationButtonPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  startNavigationIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF26' },
  startNavigationCopy: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  startNavigationText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  startNavigationMeta: { marginTop: 2, color: '#D8E9FF', fontSize: 12, fontWeight: '700' },
  startNavigationArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFF' },
  routeStatus: { minHeight: 244, paddingHorizontal: Spacing.four, textAlign: 'center', textAlignVertical: 'center', fontSize: 15 },
  routeDetailsScreen: { flex: 1, paddingTop: Platform.select({ ios: 58, default: 24 }) },
  routeDetailsHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D5DC' },
  routeDetailsBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  routeDetailsBackGlyph: { marginTop: -4, fontSize: 40, fontWeight: '300' },
  routeDetailsHeading: { flex: 1, marginLeft: Spacing.one },
  routeDetailsTitle: { fontSize: 20, fontWeight: '800' },
  routeSummary: { marginTop: 2, fontSize: 13 },
  routeDetailsScroll: { flex: 1 },
  routeSteps: { flexGrow: 1, paddingVertical: Spacing.two, paddingBottom: Spacing.five },
  routeStepsEmpty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  routeStep: { flexDirection: 'row', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  routeStepRail: { width: 32, alignItems: 'center' },
  routeStepIndex: { width: 24, height: 24, overflow: 'hidden', borderRadius: 12, backgroundColor: ROUTE_BLUE, color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 24, textAlign: 'center' },
  routeStepLine: { width: 2, flex: 1, marginVertical: 4, backgroundColor: '#D4D8DF' },
  routeStepContent: { flex: 1, minHeight: 54, paddingLeft: Spacing.two },
  routeStepTitle: { fontSize: 16, fontWeight: '600' },
  routeStepMeta: { marginTop: Spacing.half, fontSize: 13 },
  navigationScreen: { flex: 1, backgroundColor: '#DDEAF0' },
  navigationMap: { flex: 1 },
  navigationOverlay: { ...StyleSheet.absoluteFill },
  navigationHud: {
    position: 'absolute', top: Platform.select({ ios: 54, default: 20 }), right: Spacing.three, left: Spacing.three, minHeight: 124,
    flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: '#101B2E', padding: Spacing.two,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
  },
  navigationTurnIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#237CF4' },
  navigationInstruction: { flex: 1, minWidth: 0, paddingHorizontal: Spacing.two },
  navigationActionLabel: { color: '#D7E7FF', fontSize: 14, fontWeight: '700' },
  navigationRoadName: { marginTop: 2, color: '#FFFFFF', fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
  navigationCurrentRoad: { marginTop: 4, color: '#AAB7CB', fontSize: 13, fontWeight: '600' },
  navigationHudStatus: { alignItems: 'flex-end', gap: 2, paddingRight: Spacing.one },
  navigationHudStatusValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  navigationHudStatusLabel: { color: '#90A1BA', fontSize: 11, fontWeight: '600' },
  navigationSpeedometerShell: { position: 'absolute', top: Platform.select({ ios: 202, default: 170 }), left: Spacing.three, borderRadius: 38, shadowColor: '#111B2E', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 6 },
  navigationTrafficBar: {
    position: 'absolute',
    top: Platform.select({ ios: 202, default: 170 }),
    right: Spacing.three,
    bottom: 154,
    width: 11,
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#AAB4C2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  navigationTrafficSegment: { width: '100%' },
  navigationLoading: { position: 'absolute', top: Platform.select({ ios: 196, default: 160 }), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 18, backgroundColor: '#101B2ED9', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  navigationLoadingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  navigationBottomBar: {
    position: 'absolute', right: 0, bottom: 0, left: 0, minHeight: 132, flexDirection: 'row', alignItems: 'center',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two, paddingBottom: Platform.select({ ios: 22, default: Spacing.three }), shadowColor: '#0C1729', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 12,
  },
  navigationExit: { width: 58, alignItems: 'center', gap: 4 },
  navigationControlIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#EFF3F8' },
  navigationExitText: { color: '#152033', fontSize: 12, fontWeight: '700' },
  navigationControlPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  navigationSummary: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.one },
  navigationDestination: { maxWidth: 190, color: '#667085', fontSize: 12, fontWeight: '700' },
  navigationSummaryStats: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 1 },
  navigationSummaryMain: { color: '#101828', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  navigationSummaryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#AAB4C2' },
  navigationSummaryDistance: { color: '#344054', fontSize: 16, fontWeight: '700' },
  navigationSummaryArrival: { marginTop: 2, color: '#667085', fontSize: 13, fontWeight: '600' },
  navigationOverviewButton: { width: 58, alignItems: 'center', gap: 4 },
  navigationOverviewText: { color: '#152033', fontSize: 12, fontWeight: '700' },
  searchMask: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, elevation: 12, paddingTop: Platform.select({ ios: 64, default: 24 }) },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  searchInputWrap: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingRight: Spacing.three },
  searchInput: { flex: 1, minHeight: 44, paddingHorizontal: Spacing.three, fontSize: 16 },
  cancelButton: { minHeight: 44, justifyContent: 'center' },
  cancelButtonText: { fontSize: 15 },
  searchContent: { flex: 1, marginTop: Spacing.three },
  searchContentContainer: { paddingBottom: Spacing.five },
  result: { minHeight: 60, justifyContent: 'center', paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6' },
  resultName: { fontSize: 16, fontWeight: '600' },
  resultAddress: { marginTop: Spacing.half, fontSize: 13 },
  historySection: { marginTop: Spacing.three },
  historyHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three },
  historyTitle: { fontSize: 14, fontWeight: '600' },
  clearHistoryText: { fontSize: 14 },
  historyResultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  historyResultName: { flex: 1, fontSize: 16, fontWeight: '600' },
  historyDate: { fontSize: 12 },
  deleteHistoryButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  deleteHistoryText: { fontSize: 22, fontWeight: '300', lineHeight: 24 },
  message: { alignItems: 'center', marginTop: Spacing.four, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  messageText: { fontSize: 14 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
