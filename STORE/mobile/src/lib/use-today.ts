import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { todayIso } from './dates';

/** Computes the current `yyyy-mm-dd` as a piece of state that updates when
 * the app comes to the foreground OR when the local date rolls over (checked
 * every minute while the screen is in focus).
 *
 * Use this anywhere you previously had `useMemo(() => todayIso(), [])` —
 * plain `useMemo` captures the value at mount and never updates, so KPIs
 * filtered by today's date would still show yesterday's data on Jul 22 if the
 * app was kept running.
 */
export function useToday(): string {
  const [today, setToday] = useState<string>(() => todayIso());

  useFocusEffect(() => {
    // Re-evaluate whenever a screen comes into focus (e.g. tab switch,
    // navigator transition, or coming back from background).
    setToday((current) => {
      const next = todayIso();
      return next === current ? current : next;
    });
  });

  useEffect(() => {
    // Catch the day boundary while the user keeps the app open for hours.
    function onAppState(next: AppStateStatus): void {
      if (next === 'active') setToday((current) => todayIso() === current ? current : todayIso());
    }
    const subscription = AppState.addEventListener('change', onAppState);
    const minuteTimer = setInterval(() => {
      setToday((current) => (todayIso() === current ? current : todayIso()));
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(minuteTimer);
    };
  }, []);

  return today;
}
