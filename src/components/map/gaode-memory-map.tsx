import { useEffect, useRef, useState } from 'react';
import {
  clearIndependentRoute,
  DriveStrategy,
  ExpoGaodeMapModule,
  ExpoGaodeMapNaviView,
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
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { BottomNavigationGap, BottomNavigationHeight, Spacing } from '@/constants/theme';
import { useTabBarVisibility } from '@/context/tab-bar-context';
import { useTheme } from '@/hooks/use-theme';

const LUMIMATE_COORDINATE = { latitude: 39.9087, longitude: 116.3975 };
const SEARCH_HISTORY_KEY = '@lumimate/map-search-history';
const MAX_SEARCH_HISTORY_ITEMS = 10;
const ROUTE_BLUE = '#3185F7';
const ROUTE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_ROUTE_POLYLINE_POINTS = 600;
const MAP_CONTROLS_HIDDEN_TRANSLATE_Y = -220;

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
};
type TrafficStatus = NaviTrafficStatusesEvent['items'][number];

const TRAVEL_MODES: { key: TravelMode; label: string; glyph: string }[] = [
  { key: 'drive', label: '驾车', glyph: '▰' },
  { key: 'ride', label: '骑行', glyph: '♧' },
  { key: 'walk', label: '步行', glyph: '♙' },
  { key: 'transit', label: '地铁', glyph: '⊞' },
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
  const { setTabBarHidden } = useTabBarVisibility();
  const mapRef = useRef<MapViewRef>(null);
  const naviRef = useRef<ExpoGaodeMapNaviViewRef>(null);
  const routeRequestIdRef = useRef(0);
  const mapControlsVisibleRef = useRef(true);
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
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationStarting, setNavigationStarting] = useState(false);
  const [navigationOverview, setNavigationOverview] = useState(false);
  const [naviInfo, setNaviInfo] = useState<NaviInfo | null>(null);
  const [trafficStatuses, setTrafficStatuses] = useState<TrafficStatus[]>([]);
  const [mapControlsHidden, setMapControlsHidden] = useState(false);
  const mapControlsProgress = useSharedValue(1);
  const routePreview = routeOptions[selectedRouteIndex] ?? null;

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
    mapControlsProgress.value = withTiming(mapControlsHidden ? 0 : 1, {
      duration: mapControlsHidden ? 320 : 360,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [mapControlsHidden, mapControlsProgress]);

  const mapControlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mapControlsProgress.value,
    transform: [{ translateY: (1 - mapControlsProgress.value) * MAP_CONTROLS_HIDDEN_TRANSLATE_Y }],
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
    if (!isTrackingLocation) return;
    const subscription = ExpoGaodeMapModule.addLocationListener((location) => {
      setRouteStart({ latitude: location.latitude, longitude: location.longitude });
    });
    ExpoGaodeMapModule.start();
    return () => {
      subscription.remove();
      ExpoGaodeMapModule.stop();
    };
  }, [isTrackingLocation]);

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
    setTabBarHidden(!visible);
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
    setRouteDetailsOpen(false);
  };

  const planRoute = async (mode: TravelMode, destination = selectedPoi) => {
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
      let from = routeStart && isSafeCoordinate(routeStart) ? routeStart : null;
      if (!from) {
        let permission = await ExpoGaodeMapModule.checkLocationPermission();
        if (!permission.granted) permission = await ExpoGaodeMapModule.requestLocationPermission();
        if (!permission.granted) throw new Error('未授予位置权限');
        const location = await withRouteTimeout(ExpoGaodeMapModule.getCurrentLocation());
        if (requestId !== routeRequestIdRef.current) return;
        from = { latitude: location.latitude, longitude: location.longitude };
        setRouteStart(from);
        setIsTrackingLocation(true);
      }
      const base = {
        from: { ...from, name: '我的位置' },
        to: { ...destination.location, name: destination.name, poiId: destination.id },
      };
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
          const map = mapRef.current;
          try {
            if (map) void map.fitToCoordinates(mainRoute.polyline!).catch(() => undefined);
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
    setSelectedRouteIndex(index);
    if (routeToken !== null) void selectIndependentRoute({ token: routeToken, routeIndex: index }).catch(() => undefined);
    if (route.polyline && route.polyline.length > 1) {
      const map = mapRef.current;
      try {
        if (map) await map.fitToCoordinates(route.polyline);
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
    setSelectedPoi(poi);
    setQuery('');
    setSearchHistory((items) =>
      [{ ...poi, searchedAt: new Date().toISOString() }, ...items.filter((item) => item.id !== poi.id)].slice(0, MAX_SEARCH_HISTORY_ITEMS)
    );
    closeSearch();
    const map = mapRef.current;
    try {
      if (map) await map.moveCamera({ target: poi.location, zoom: 16 }, 350);
    } catch {
      // The route calculation can continue when a transient camera update fails.
    }
    void planRoute('drive', poi);
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
      nextRoadName: selectedPoi?.name || '',
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
    if (searchOpen) return;
    setMapControlsVisibility(false);
  };
  const showMapControls = () => {
    setMapControlsVisibility(true);
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
        compassEnabled={false}
        scaleControlsEnabled
        zoomControlsEnabled={false}
        onCameraMove={hideMapControls}
        onCameraIdle={showMapControls}>
        <Marker position={LUMIMATE_COORDINATE} title="LumiMate" />
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
              <View style={[styles.routeHeader, { backgroundColor: theme.background }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="退出路线规划" onPress={clearRoute} style={styles.routeBackButton}>
              <Text style={[styles.routeBackGlyph, { color: theme.text }]}>‹</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="重新搜索目的地" onPress={openSearch} style={styles.routeLocations}>
              <View style={styles.routeLocationRow}>
                <View style={[styles.locationDot, styles.startDot]} />
                <Text numberOfLines={1} style={[styles.routeLocationText, { color: theme.text }]}>我的位置</Text>
              </View>
              <View style={styles.routeLocationDivider} />
              <View style={styles.routeLocationRow}>
                <View style={[styles.locationDot, styles.endDot]} />
                <Text numberOfLines={1} style={[styles.routeLocationText, { color: theme.text }]}>{selectedPoi.name}</Text>
              </View>
            </Pressable>
              </View>
              <View style={[styles.routeModeTabs, { backgroundColor: theme.background }]}>
            {TRAVEL_MODES.map((mode) => {
              const selected = mode.key === travelMode;
              return (
                <Pressable
                  key={mode.key}
                  accessibilityRole="button"
                  disabled={isPlanningRoute}
                  onPress={() => void planRoute(mode.key)}
                  style={[styles.routeModeTab, selected && styles.routeModeTabSelected, isPlanningRoute && styles.routeModeTabDisabled]}>
                  <Text style={[styles.routeModeGlyph, { color: selected ? ROUTE_BLUE : theme.textSecondary }]}>{mode.glyph}</Text>
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
          onPress={() => void mapRef.current?.moveCamera({ target: routeStart || LUMIMATE_COORDINATE, zoom: 16 }, 300)}
          style={[styles.locateButton, { backgroundColor: theme.background }]}>
          <Text style={[styles.locateGlyph, { color: theme.text }]}>◎</Text>
        </Pressable>
      ) : null}

      {selectedPoi ? (
        <View style={[styles.routeSheet, { backgroundColor: theme.background }]}>
          {isPlanningRoute ? (
            <View style={styles.routeLoading}>
              <ActivityIndicator color={ROUTE_BLUE} size="small" />
              <Text style={[styles.routeLoadingText, { color: theme.textSecondary }]}>正在规划路线…</Text>
            </View>
          ) : routePreview ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeCardList} style={styles.routeCardScroll}>
                {routeOptions.map((route, index) => {
                  const selected = index === selectedRouteIndex;
                  return (
                    <Pressable
                      key={`${route.id}-${index}`}
                      accessibilityRole="button"
                      onPress={() => void selectRoute(index)}
                      style={[styles.routeCard, { backgroundColor: theme.backgroundElement, borderColor: selected ? ROUTE_BLUE : 'transparent' }]}>
                      <Text style={[styles.routeCardDuration, { color: theme.text }]}>{formatDuration(route.duration)}</Text>
                      <Text style={[styles.routeCardDistance, { color: theme.textSecondary }]}>{formatDistance(route.distance)}</Text>
                      <Text style={[styles.routeCardLabel, { color: selected ? ROUTE_BLUE : theme.textSecondary }]}>{index === 0 ? '推荐' : `备选 ${index}`}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.routeActionBar}>
                <Pressable accessibilityRole="button" onPress={() => setRouteDetailsOpen(true)} style={styles.routeDetailAction}>
                  <Text style={[styles.routeDetailActionGlyph, { color: theme.text }]}>≡</Text>
                  <Text style={[styles.routeDetailActionText, { color: theme.text }]}>路线详情</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={openNavigation} style={styles.startNavigationButton}>
                  <Text style={styles.startNavigationText}>开始导航</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={[styles.routeStatus, { color: theme.textSecondary }]}>{routeMessage || '请选择出行方式'}</Text>
          )}
        </View>
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
          <ScrollView contentContainerStyle={styles.routeSteps}>
            {routePreview?.segments?.length ? (
              routePreview.segments.map((step, index) => (
                <View key={`${step.instruction}-${index}`} style={styles.routeStep}>
                  <View style={styles.routeStepRail}>
                    <Text style={styles.routeStepIndex}>{index + 1}</Text>
                    {index < routePreview.segments!.length - 1 ? <View style={styles.routeStepLine} /> : null}
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
              <Text style={styles.navigationArrow}>↑</Text>
              <View style={styles.navigationInstruction}>
                <Text style={styles.navigationTurnDistance}>{formatDistance(turnDistance)}</Text>
                <Text numberOfLines={1} style={styles.navigationRoadName}>{displayedRoadName}</Text>
                <Text numberOfLines={1} style={styles.navigationCurrentRoad}>
                  {currentRoadName && currentRoadName !== nextRoadName ? `沿 ${currentRoadName} 行驶` : '请按路线行驶'}
                </Text>
              </View>
              <Text style={styles.navigationVoice}>◔</Text>
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
              <Pressable accessibilityRole="button" onPress={() => void closeNavigation()} style={styles.navigationExit}>
                <Text style={styles.navigationExitGlyph}>×</Text>
                <Text style={styles.navigationExitText}>退出</Text>
              </Pressable>
              <View style={styles.navigationSummary}>
                <Text style={styles.navigationSummaryMain}>{formatDuration(navigationDuration)} {formatDistance(navigationDistance)}</Text>
                <Text style={styles.navigationSummaryArrival}>{formatArrivalTime(navigationDuration)}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setNavigationOverview((value) => !value)} style={styles.navigationOverviewButton}>
                <Text style={styles.navigationOverviewGlyph}>{navigationOverview ? '⌖' : '⌁'}</Text>
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
    position: 'absolute', top: Platform.select({ ios: 50, default: 18 }), right: Spacing.three, left: Spacing.three,
    minHeight: 82, flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: Spacing.two,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  routeBackButton: { width: 38, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  routeBackGlyph: { marginTop: -5, fontSize: 42, fontWeight: '300' },
  routeLocations: { flex: 1, justifyContent: 'center', gap: Spacing.one, paddingRight: Spacing.two },
  routeLocationRow: { height: 30, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  startDot: { backgroundColor: '#20C77A' },
  endDot: { backgroundColor: '#F04B4B' },
  routeLocationDivider: { width: StyleSheet.hairlineWidth, height: 8, marginLeft: 4.5, backgroundColor: '#B7BEC9' },
  routeLocationText: { flex: 1, fontSize: 16, fontWeight: '600' },
  routeModeTabs: {
    position: 'absolute', top: Platform.select({ ios: 140, default: 108 }), right: 0, left: 0, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8DCE3',
  },
  routeModeTab: { minWidth: 62, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingHorizontal: Spacing.one },
  routeModeTabSelected: { backgroundColor: '#EAF2FF' },
  routeModeTabDisabled: { opacity: 0.5 },
  routeModeGlyph: { fontSize: 15, fontWeight: '700' },
  routeModeText: { fontSize: 15, fontWeight: '700' },
  locateButton: {
    position: 'absolute', right: Spacing.three, bottom: BottomNavigationHeight + BottomNavigationGap + 226, width: 46, height: 46,
    alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 8, elevation: 4,
  },
  locateGlyph: { fontSize: 30, lineHeight: 34 },
  routeSheet: {
    position: 'absolute', right: 0, bottom: BottomNavigationHeight + BottomNavigationGap, left: 0, minHeight: 190, paddingTop: Spacing.two,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8,
  },
  routeLoading: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  routeLoadingText: { fontSize: 14 },
  routeCardScroll: { flexGrow: 0 },
  routeCardList: { gap: Spacing.two, paddingHorizontal: Spacing.three },
  routeCard: { width: 130, minHeight: 102, justifyContent: 'center', borderWidth: 2, borderRadius: 14, paddingHorizontal: Spacing.two },
  routeCardDuration: { fontSize: 22, fontWeight: '800' },
  routeCardDistance: { marginTop: 3, fontSize: 14 },
  routeCardLabel: { marginTop: Spacing.one, fontSize: 13, fontWeight: '600' },
  routeActionBar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  routeDetailAction: { width: 78, alignItems: 'center', justifyContent: 'center' },
  routeDetailActionGlyph: { fontSize: 21, lineHeight: 23 },
  routeDetailActionText: { marginTop: 1, fontSize: 12 },
  startNavigationButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: ROUTE_BLUE },
  startNavigationText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  routeStatus: { minHeight: 190, paddingHorizontal: Spacing.four, textAlign: 'center', textAlignVertical: 'center', fontSize: 15 },
  routeDetailsScreen: { flex: 1, paddingTop: Platform.select({ ios: 58, default: 24 }) },
  routeDetailsHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D5DC' },
  routeDetailsBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  routeDetailsBackGlyph: { marginTop: -4, fontSize: 40, fontWeight: '300' },
  routeDetailsHeading: { flex: 1, marginLeft: Spacing.one },
  routeDetailsTitle: { fontSize: 20, fontWeight: '800' },
  routeSummary: { marginTop: 2, fontSize: 13 },
  routeSteps: { paddingVertical: Spacing.two, paddingBottom: Spacing.five },
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
    position: 'absolute', top: Platform.select({ ios: 54, default: 20 }), right: Spacing.three, left: Spacing.three, minHeight: 112,
    flexDirection: 'row', alignItems: 'center', borderRadius: 22, backgroundColor: '#111B2E', paddingHorizontal: Spacing.three,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  navigationArrow: { width: 54, color: '#FFFFFF', fontSize: 66, fontWeight: '300', lineHeight: 76, textAlign: 'center' },
  navigationInstruction: { flex: 1, paddingHorizontal: Spacing.two },
  navigationTurnDistance: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  navigationRoadName: { marginTop: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  navigationCurrentRoad: { marginTop: 2, color: '#AEB8C9', fontSize: 13 },
  navigationVoice: { color: '#FFFFFF', fontSize: 28 },
  navigationTrafficBar: {
    position: 'absolute',
    top: Platform.select({ ios: 196, default: 158 }),
    right: Spacing.three,
    bottom: 138,
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
  navigationLoading: { position: 'absolute', top: Platform.select({ ios: 182, default: 144 }), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 18, backgroundColor: '#111B2ECC', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  navigationLoadingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  navigationBottomBar: {
    position: 'absolute', right: 0, bottom: 0, left: 0, minHeight: 112, flexDirection: 'row', alignItems: 'center',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', paddingHorizontal: Spacing.three,
    paddingBottom: Platform.select({ ios: 18, default: Spacing.three }), shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 10,
  },
  navigationExit: { width: 52, alignItems: 'center' },
  navigationExitGlyph: { color: '#101010', fontSize: 42, fontWeight: '300', lineHeight: 42 },
  navigationExitText: { marginTop: 2, color: '#101010', fontSize: 13 },
  navigationSummary: { flex: 1, alignItems: 'center' },
  navigationSummaryMain: { color: '#101010', fontSize: 21, fontWeight: '800' },
  navigationSummaryArrival: { marginTop: 3, color: '#555B66', fontSize: 15 },
  navigationOverviewButton: { width: 52, alignItems: 'center' },
  navigationOverviewGlyph: { color: '#101010', fontSize: 28, fontWeight: '700', lineHeight: 32 },
  navigationOverviewText: { marginTop: 2, color: '#101010', fontSize: 13 },
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
