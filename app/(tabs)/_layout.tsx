import { useState } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadows } from '../../constants/theme';
import { GlobalLogAddModal } from '../../components/GlobalLogAddModal';

function CenterAddButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.centerAddSlot}>
      <TouchableOpacity
        style={styles.centerAddButton}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="기록 추가"
        onPress={onPress}
      >
        <Ionicons name="add" size={34} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [globalAddVisible, setGlobalAddVisible] = useState(false);
  /** 홈 인디케이터 영역 — 탭 아이콘 위쪽 여백은 두지 않음 */
  const tabBarBottomPad = insets.bottom + 12;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textLight,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingTop: 0,
            paddingBottom: tabBarBottomPad,
            height: 52 + tabBarBottomPad,
            ...Shadows.sm,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '홈',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'AI 상담',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubble-ellipses" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => <CenterAddButton onPress={() => setGlobalAddVisible(true)} />,
          }}
        />
        <Tabs.Screen
          name="logs"
          options={{
            title: '기록',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '설정',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <GlobalLogAddModal
        visible={globalAddVisible}
        onClose={() => setGlobalAddVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centerAddSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAddButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: Colors.surface,
    ...Shadows.md,
  },
});
