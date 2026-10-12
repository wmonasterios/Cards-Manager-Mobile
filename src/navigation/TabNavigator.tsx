import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TabParamList } from './types';
import { useT } from '../i18n/LocaleContext';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { StatementsScreen } from '../screens/StatementsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { FloatingTabBar } from '../components/FloatingTabBar';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  const t = useT();

  return (
    <Tab.Navigator
      // Floating capsule bar (Home · Calendar · Insights · More) + the advisor
      // button. Statements and Settings stay tab routes, reached from More, and
      // "history" lets their back button return to wherever they were opened.
      tabBar={(props) => <FloatingTabBar {...props} />}
      backBehavior="history"
      screenOptions={{ headerShown: false }}
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
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}
