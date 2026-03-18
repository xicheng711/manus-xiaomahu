import { Redirect } from 'expo-router';
export default function CheckinRedirect() {
  return <Redirect href={'/(tabs)/checkin' as any} />;
}
