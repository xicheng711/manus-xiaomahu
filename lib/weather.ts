/**
 * 天气服务 — 使用 Open-Meteo 免费 API（无需 API Key）
 * 根据城市名获取坐标，再获取天气数据
 */

export interface WeatherData {
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  isRainy: boolean;
  isHot: boolean;
  isCold: boolean;
  city: string;
  advice: string;
}

// 城市坐标数据库（常用中国城市）
const CITY_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  '北京': { lat: 39.9042, lon: 116.4074, name: '北京' },
  '上海': { lat: 31.2304, lon: 121.4737, name: '上海' },
  '广州': { lat: 23.1291, lon: 113.2644, name: '广州' },
  '深圳': { lat: 22.5431, lon: 114.0579, name: '深圳' },
  '杭州': { lat: 30.2741, lon: 120.1551, name: '杭州' },
  '成都': { lat: 30.5728, lon: 104.0668, name: '成都' },
  '武汉': { lat: 30.5928, lon: 114.3055, name: '武汉' },
  '西安': { lat: 34.3416, lon: 108.9398, name: '西安' },
  '南京': { lat: 32.0603, lon: 118.7969, name: '南京' },
  '重庆': { lat: 29.5630, lon: 106.5516, name: '重庆' },
  '天津': { lat: 39.3434, lon: 117.3616, name: '天津' },
  '苏州': { lat: 31.2989, lon: 120.5853, name: '苏州' },
  '郑州': { lat: 34.7466, lon: 113.6254, name: '郑州' },
  '长沙': { lat: 28.2278, lon: 112.9388, name: '长沙' },
  '沈阳': { lat: 41.8057, lon: 123.4315, name: '沈阳' },
  '哈尔滨': { lat: 45.8038, lon: 126.5349, name: '哈尔滨' },
  '昆明': { lat: 25.0389, lon: 102.7183, name: '昆明' },
  '福州': { lat: 26.0745, lon: 119.2965, name: '福州' },
  '厦门': { lat: 24.4798, lon: 118.0894, name: '厦门' },
  '青岛': { lat: 36.0671, lon: 120.3826, name: '青岛' },
  '济南': { lat: 36.6512, lon: 117.1201, name: '济南' },
  '合肥': { lat: 31.8206, lon: 117.2272, name: '合肥' },
  '南昌': { lat: 28.6820, lon: 115.8579, name: '南昌' },
  '石家庄': { lat: 38.0428, lon: 114.5149, name: '石家庄' },
  '太原': { lat: 37.8706, lon: 112.5489, name: '太原' },
  '兰州': { lat: 36.0611, lon: 103.8343, name: '兰州' },
  '乌鲁木齐': { lat: 43.8256, lon: 87.6168, name: '乌鲁木齐' },
  '呼和浩特': { lat: 40.8414, lon: 111.7519, name: '呼和浩特' },
  '南宁': { lat: 22.8170, lon: 108.3665, name: '南宁' },
  '海口': { lat: 20.0440, lon: 110.1999, name: '海口' },
  '贵阳': { lat: 26.6470, lon: 106.6302, name: '贵阳' },
  '香港': { lat: 22.3193, lon: 114.1694, name: '香港' },
  '台北': { lat: 25.0330, lon: 121.5654, name: '台北' },
};

function getWeatherIcon(weatherCode: number, isDay: boolean): string {
  if (weatherCode === 0) return isDay ? '☀️' : '🌙';
  if (weatherCode <= 2) return isDay ? '⛅' : '🌤️';
  if (weatherCode === 3) return '☁️';
  if (weatherCode <= 49) return '🌫️';
  if (weatherCode <= 59) return '🌦️';
  if (weatherCode <= 69) return '🌧️';
  if (weatherCode <= 79) return '❄️';
  if (weatherCode <= 82) return '🌧️';
  if (weatherCode <= 84) return '🌨️';
  if (weatherCode <= 94) return '⛈️';
  return '🌩️';
}

function getWeatherDesc(weatherCode: number): string {
  if (weatherCode === 0) return '晴天';
  if (weatherCode <= 2) return '少云';
  if (weatherCode === 3) return '阴天';
  if (weatherCode <= 49) return '有雾';
  if (weatherCode <= 59) return '小雨';
  if (weatherCode <= 69) return '中雨';
  if (weatherCode <= 79) return '雪';
  if (weatherCode <= 82) return '阵雨';
  if (weatherCode <= 84) return '阵雪';
  if (weatherCode <= 94) return '雷阵雨';
  return '雷暴';
}

export async function fetchWeather(cityName: string): Promise<WeatherData | null> {
  try {
    const cityKey = Object.keys(CITY_COORDS).find(k => cityName.includes(k)) || '北京';
    const coords = CITY_COORDS[cityKey] || CITY_COORDS['北京'];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=Asia%2FShanghai`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    const temp = Math.round(c.temperature_2m);
    const feelsLike = Math.round(c.apparent_temperature);
    const humidity = c.relative_humidity_2m;
    const weatherCode = c.weather_code;
    const isDay = c.is_day === 1;
    const isRainy = weatherCode >= 51;
    const isHot = temp >= 32;
    const isCold = temp <= 5;
    let advice = '';
    if (isRainy) advice = '今日有雨，外出需带伞，老人容易因天气变化情绪波动，室内活动为主。';
    else if (isHot) advice = '今日高温，避免正午外出，注意补水防暑，室内保持通风凉爽。';
    else if (isCold) advice = '今日寒冷，外出注意保暖，关节疼痛可能加重，减少不必要外出。';
    else if (temp >= 18 && temp <= 26 && !isRainy) advice = '今日天气舒适，非常适合带老人到户外散步10-20分钟，阳光有助于改善情绪和睡眠。';
    else advice = '天气一般，可根据老人状态决定是否外出，注意适当增减衣物。';
    return {
      temp, feelsLike, humidity, windSpeed: Math.round(c.wind_speed_10m),
      description: getWeatherDesc(weatherCode),
      icon: getWeatherIcon(weatherCode, isDay),
      isRainy, isHot, isCold, city: coords.name, advice,
    };
  } catch {
    return null;
  }
}

export function getWeatherCareScore(weather: WeatherData | null): number {
  if (!weather) return 0;
  let score = 0;
  if (weather.isRainy) score -= 10;
  if (weather.isHot) score -= 15;
  if (weather.isCold) score -= 10;
  if (weather.temp >= 18 && weather.temp <= 26 && !weather.isRainy) score += 10;
  return score;
}

// ─── GPS 天气 + 问候语 ────────────────────────────────────────────────────────

export interface GpsWeatherInfo {
  temp: number;
  description: string;
  emoji: string;
  city?: string;
}

/**
 * 通过设备 GPS 定位 + Open-Meteo 免费 API 获取实时天气
 * 仅在原生端运行（iOS/Android），web 端直接返回 null
 */
export async function getWeatherByGPS(): Promise<GpsWeatherInfo | null> {
  try {
    const { Platform } = require('react-native');
    if (Platform.OS === 'web') return null;

    const Location = require('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const { latitude, longitude } = loc.coords;

    // Fetch weather
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const temp = Math.round(data.current.temperature_2m);
    const code: number = data.current.weathercode;
    const emoji = getWeatherIcon(code, true);
    const description = getWeatherDesc(code);

    // Reverse geocode (best-effort)
    let city: string | undefined;
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=zh`,
        { headers: { 'User-Agent': 'XiaoMaHu/1.0' } }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json() as any;
        const addr = geoData.address;
        city = addr?.city || addr?.county || addr?.state;
      }
    } catch { /* ignore */ }

    return { temp, description, emoji, city };
  } catch {
    return null;
  }
}

/**
 * 根据时间 + 天气信息生成问候语
 */
export function buildGreetingWithWeather(
  caregiverName: string | undefined,
  weather: GpsWeatherInfo | null
): string {
  const hour = new Date().getHours();
  const name = caregiverName || '';
  const prefix = name ? `${name}，` : '';

  let base = '';
  if (hour >= 5 && hour < 9) base = `${prefix}早上好`;
  else if (hour >= 9 && hour < 12) base = `${prefix}上午好`;
  else if (hour >= 12 && hour < 14) base = `${prefix}中午好`;
  else if (hour >= 14 && hour < 18) base = `${prefix}下午好`;
  else if (hour >= 18 && hour < 21) base = `${prefix}晚上好`;
  else base = `${prefix}夜深了，注意休息`;

  // 天气信息已在右上角显示，问候语不重复展示天气
  return base;
}
