import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TabParamList } from './types';
import { useColors } from '../theme/ThemeContext';
import { useT } from '../i18n/LocaleContext';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { StatementsScreen } from '../screens/StatementsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'albums-outline',
  Calendar: 'calendar-outline',
  Insights: 'pie-chart-outline',
  Statements: 'document-text-outline',
  Settings: 'settings-outline',
};

export function TabNavigator() {
  const colors = useColors();
  const t = useT();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accentInk2,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.hair2,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof TabParamList]} size={size ?? 20} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t.cards }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: t.calendarTab }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: t.insightsTab }} />
      <Tab.Screen
        name="Statements"
        component={StatementsScreen}
        options={{ title: t.statements }}
        listeners={({ navigation }) => ({
          // The tab bar re-focuses this screen with whatever params it last
          // had (e.g. a cardId filter from CardDetail's "Statements" pill) —
          // tapping the tab icon itself should always land on the full list.
          tabPress: () => {
            navigation.setParams({ cardId: undefined });
          },
        })}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t.settings }} />
    </Tab.Navigator>
  );
}
