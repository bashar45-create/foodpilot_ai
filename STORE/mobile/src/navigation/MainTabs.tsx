import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  Home,
  Package,
  DollarSign,
  Ticket as TicketIcon,
  User,
  type LucideIcon,
} from 'lucide-react-native';

import { HomeScreen } from '@/screens/home/HomeScreen';
import { InventoryScreen } from '@/screens/inventory/InventoryScreen';
import { SalesScreen } from '@/screens/sales/SalesScreen';
import { TicketsScreen } from '@/screens/tickets/TicketsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { AttendanceScreen } from '@/screens/attendance/AttendanceScreen';
import { RecipesScreen } from '@/screens/recipes/RecipesScreen';
import { CloseShopScreen } from '@/screens/closeShop/CloseShopScreen';
import { ReportsScreen } from '@/screens/reports/ReportsScreen';
import { colors } from '@/lib/colors';

export type MainTabParamList = {
  HomeTab: undefined;
  InventoryTab: undefined;
  SalesTab: undefined;
  TicketsTab: undefined;
  ProfileTab: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Attendance: undefined;
  Inventory: undefined;
  Sales: undefined;
  Recipes: undefined;
  Reports: undefined;
  CloseShop: undefined;
};

export type InventoryStackParamList = {
  Inventory: undefined;
};

export type SalesStackParamList = {
  Sales: undefined;
};

export type TicketsStackParamList = {
  Tickets: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Tickets: undefined;
  Recipes: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const InventoryStack = createNativeStackNavigator<InventoryStackParamList>();
const SalesStack = createNativeStackNavigator<SalesStackParamList>();
const TicketsStack = createNativeStackNavigator<TicketsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const stackHeaderOptions = { headerShown: false } as const;

function HomeStackNav(): JSX.Element {
  return (
    <HomeStack.Navigator screenOptions={stackHeaderOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Attendance" component={AttendanceScreen} />
      <HomeStack.Screen name="Inventory" component={InventoryScreen} />
      <HomeStack.Screen name="Sales" component={SalesScreen} />
      <HomeStack.Screen name="Recipes" component={RecipesScreen} />
      <HomeStack.Screen name="Reports" component={ReportsScreen} />
      <HomeStack.Screen name="CloseShop" component={CloseShopScreen} />
    </HomeStack.Navigator>
  );
}

function InventoryStackNav(): JSX.Element {
  return (
    <InventoryStack.Navigator screenOptions={stackHeaderOptions}>
      <InventoryStack.Screen name="Inventory" component={InventoryScreen} />
    </InventoryStack.Navigator>
  );
}

function SalesStackNav(): JSX.Element {
  return (
    <SalesStack.Navigator screenOptions={stackHeaderOptions}>
      <SalesStack.Screen name="Sales" component={SalesScreen} />
    </SalesStack.Navigator>
  );
}

function TicketsStackNav(): JSX.Element {
  return (
    <TicketsStack.Navigator screenOptions={stackHeaderOptions}>
      <TicketsStack.Screen name="Tickets" component={TicketsScreen} />
    </TicketsStack.Navigator>
  );
}

function ProfileStackNav(): JSX.Element {
  return (
    <ProfileStack.Navigator screenOptions={stackHeaderOptions}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Tickets" component={TicketsScreen} />
      <ProfileStack.Screen name="Recipes" component={RecipesScreen} />
    </ProfileStack.Navigator>
  );
}

interface TabIconProps {
  Icon: LucideIcon;
  focused: boolean;
}

const TabIcon = memo(function TabIcon({ Icon, focused }: TabIconProps): JSX.Element {
  return (
    <View style={[styles.tabIconWrap, focused ? styles.tabIconWrapActive : null]}>
      <Icon
        size={20}
        strokeWidth={focused ? 2.2 : 1.6}
        color={focused ? colors.accentInk : colors.text}
      />
    </View>
  );
});

export function MainTabs(): JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNav}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="InventoryTab"
        component={InventoryStackNav}
        options={{
          tabBarLabel: 'Stock',
          tabBarIcon: ({ focused }) => <TabIcon Icon={Package} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="SalesTab"
        component={SalesStackNav}
        options={{
          tabBarLabel: 'Sales',
          tabBarIcon: ({ focused }) => <TabIcon Icon={DollarSign} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="TicketsTab"
        component={TicketsStackNav}
        options={{
          tabBarLabel: 'Tickets',
          tabBarIcon: ({ focused }) => <TabIcon Icon={TicketIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNav}
        options={{
          tabBarLabel: 'Me',
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    height: 72,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabItem: { paddingVertical: 2 },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tabIconWrap: {
    width: 44,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabIconWrapActive: {
    backgroundColor: colors.accent,
    borderColor: colors.border,
  },
});