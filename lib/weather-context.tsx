import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeather, getWeatherByGPS, buildGreetingWithWeather, WeatherData, GpsWeatherInfo } from './weather';
import { getProfile, getFamilyProfile } from './storage';

interface WeatherContextValue {
  weatherData: WeatherData | null;
  gpsWeather: GpsWeatherInfo | null;
  cityName: string;
  loading: boolean;
  /** refresh(forceCity?) — 城市未变化且距上次请求 < 10 分钟时跳过网络请求 */
  refresh: (forceCity?: string) => Promise<void>;
  buildGreeting: (caregiverName?: string) => string;
}

const WeatherContext = createContext<WeatherContextValue>({
  weatherData: null,
  gpsWeather: null,
  cityName: '',
  loading: false,
  refresh: async () => {},
  buildGreeting: () => '',
});

const REFRESH_INTERVAL = 30 * 60 * 1000;
/** 同城市最短刷新间隔：10 分钟 */
const MIN_SAME_CITY_INTERVAL = 10 * 60 * 1000;

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [gpsWeather, setGpsWeather] = useState<GpsWeatherInfo | null>(null);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(false);
  const lastFetchTime = useRef(0);
  const lastFetchCity = useRef<string>('');
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * refresh(forceCity?)
   * - forceCity: 传入当前城市名，用于切换家庭时判断城市是否变化
   *   - 城市变了 → 立即重新请求
   *   - 城市未变 → 距上次请求 < 10 分钟时跳过
   * - 不传 forceCity（定时器触发）→ 按 30 分钟间隔正常刷新
   */
  const refresh = useCallback(async (forceCity?: string) => {
    const now = Date.now();
    const cityChanged = forceCity !== undefined && forceCity !== lastFetchCity.current;
    // 城市未变且距上次请求不足 10 分钟 → 跳过
    if (!cityChanged && now - lastFetchTime.current < MIN_SAME_CITY_INTERVAL) return;

    lastFetchTime.current = now;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      // P1 fix: prefer family-scoped city so multi-family switch shows correct weather
      const [familyProfile, legacyProfile] = await Promise.all([getFamilyProfile(), getProfile()]);
      if (requestId !== requestIdRef.current) return;
      const city = forceCity ?? familyProfile?.city ?? legacyProfile?.city ?? '';
      lastFetchCity.current = city;
      setCityName(city);

      const [cityWeather, gps] = await Promise.all([
        city ? fetchWeather(city) : Promise.resolve(null),
        getWeatherByGPS(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setWeatherData(cityWeather);
      setGpsWeather(gps);
    } catch {
      if (requestId === requestIdRef.current) {
        setWeatherData(null);
        setGpsWeather(null);
      }
    }
    if (requestId === requestIdRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    // 初始化时强制刷新（不传 forceCity，让它自己读 profile）
    refresh();
    timerRef.current = setInterval(() => refresh(), REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  const buildGreeting = useCallback((caregiverName?: string) => {
    return buildGreetingWithWeather(caregiverName, gpsWeather);
  }, [gpsWeather]);

  return (
    <WeatherContext.Provider value={{ weatherData, gpsWeather, cityName, loading, refresh, buildGreeting }}>
      {children}
    </WeatherContext.Provider>
  );
}

export function useWeather() {
  return useContext(WeatherContext);
}
