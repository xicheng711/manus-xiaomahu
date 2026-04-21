import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeather, getWeatherByGPS, buildGreetingWithWeather, WeatherData, GpsWeatherInfo } from './weather';
import { getProfile, getFamilyProfile } from './storage';

interface WeatherContextValue {
  weatherData: WeatherData | null;
  gpsWeather: GpsWeatherInfo | null;
  cityName: string;
  loading: boolean;
  refresh: () => Promise<void>;
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

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [gpsWeather, setGpsWeather] = useState<GpsWeatherInfo | null>(null);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(false);
  const lastFetchTime = useRef(0);
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchTime.current < 5 * 60 * 1000) return;
    lastFetchTime.current = now;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      // P1 fix: prefer family-scoped city so multi-family switch shows correct weather
      const [familyProfile, legacyProfile] = await Promise.all([getFamilyProfile(), getProfile()]);
      if (requestId !== requestIdRef.current) return;
      const city = familyProfile?.city || legacyProfile?.city || '';
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
    refresh(true);
    timerRef.current = setInterval(() => refresh(true), REFRESH_INTERVAL);
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
