import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '@/context/AuthContext';
import { SplashScreen } from '@/screens/auth/SplashScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { MainTabs } from '@/navigation/MainTabs';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): JSX.Element {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}
