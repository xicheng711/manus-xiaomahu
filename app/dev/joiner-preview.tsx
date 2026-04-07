import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TODAY = new Date().toISOString().split('T')[0];

const MOCK_PROFILE = {
  id: 'preview001',
  name: '王奶奶',
  nickname: '奶奶',
  birthDate: '1945-03-15',
  zodiacEmoji: '🐂',
  zodiacName: '牛',
  caregiverName: '小明',
  caregiverBirthYear: '1985',
  caregiverZodiacEmoji: '🐄',
  caregiverZodiacName: '牛',
  city: '上海',
  setupComplete: true,
};

const MOCK_ROOM = {
  id: 'room001',
  roomCode: 'ABC123',
  elderName: '王奶奶',
  createdAt: new Date().toISOString(),
  members: [
    {
      id: 'creator001',
      name: '小明',
      role: 'caregiver',
      roleLabel: '主要照顾者',
      emoji: '👨',
      color: '#6C9E6C',
      joinedAt: new Date().toISOString(),
      isCreator: true,
      isCurrentUser: false,
    },
    {
      id: 'joiner001',
      name: '小红',
      role: 'family',
      roleLabel: '家庭成员',
      emoji: '👩',
      color: '#A855F7',
      joinedAt: new Date().toISOString(),
      isCreator: false,
      isCurrentUser: true,
    },
  ],
};

const MOCK_MEMBER = {
  id: 'joiner001',
  name: '小红',
  role: 'family',
  roleLabel: '家庭成员',
  emoji: '👩',
  color: '#A855F7',
  joinedAt: new Date().toISOString(),
  isCreator: false,
  isCurrentUser: true,
};

const MOCK_ANNOUNCEMENTS = [
  {
    id: 'ann001',
    authorId: 'creator001',
    authorName: '小明',
    authorEmoji: '👨',
    authorColor: '#6C9E6C',
    content: '奶奶今天精神不错，下午散步了20分钟，胃口也好了很多！',
    emoji: '🌞',
    type: 'daily',
    createdAt: new Date().toISOString(),
    date: TODAY,
  },
];

export default function JoinerPreview() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  useEffect(() => {
    async function seed() {
      const MOCK_MEMBERSHIP = {
        familyId: 'room001',
        myMemberId: 'joiner001',
        role: 'joiner',
        room: MOCK_ROOM,
        joinedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem('elder_profile_v3', JSON.stringify(MOCK_PROFILE));
      await AsyncStorage.setItem('family_room_v1', JSON.stringify(MOCK_ROOM));
      await AsyncStorage.setItem('current_family_member_v1', JSON.stringify(MOCK_MEMBER));
      await AsyncStorage.setItem('family_announcements_v1', JSON.stringify(MOCK_ANNOUNCEMENTS));
      await AsyncStorage.setItem('family_memberships_v1', JSON.stringify([MOCK_MEMBERSHIP]));
      await AsyncStorage.setItem('active_family_id_v1', 'room001');
      const dest = params.tab === 'family' ? '/(tabs)/family' : '/(tabs)';
      router.replace(dest as any);
    }
    seed();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F7' }}>
      <ActivityIndicator size="large" color="#FB7185" />
      <Text style={{ marginTop: 16, color: '#687076' }}>正在加载预览...</Text>
    </View>
  );
}
