import { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Pressable,
} from 'react-native';

import { colors } from '@/lib/colors';
import { AppText } from '@/lib/typography';

interface SyncBannerProps {
  message: string | null;
  onHide: () => void;
}

const VISIBLE_MS = 4_000;
const SWIPE_DISMISS_THRESHOLD = -80; // upward translation needed to dismiss

/**
 * Toast-style sync banner.
 *
 * Dismissal options (any of which dismisses immediately):
 *   - Swipe up by 80+ pixels.
 *   - Tap the small × close button (accessibility / non-gesture fallback).
 *   - Auto-dismiss after 4s if the user has not interacted yet.
 *
 * The view starts with `pointerEvents="box-none"` on the wrapper so taps land
 * on the close button only, while the inner animated view continues to translate
 * with the pan gesture.
 */
export function SyncBanner({ message, onHide }: SyncBannerProps): JSX.Element | null {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const interacted = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PanResponder built once; reads `interacted.current` to decide whether to
  // cancel the auto-dismiss timer when the user starts a swipe.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
        Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        interacted.current = true;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
      onPanResponderMove: (_, g) => {
        // Allow drag up (negative dy) and gently drag down (small positive dy)
        // but stop following finger once it goes way positive.
        const next = g.dy < 0 ? g.dy : Math.min(g.dy, 20);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < SWIPE_DISMISS_THRESHOLD || g.vy < -0.5) {
          dismissAnimated(true);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 220,
            damping: 18,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  function dismissAnimated(swiped: boolean): void {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: swiped ? -200 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  }

  useEffect(() => {
    if (!message) return undefined;

    // Reset position for a new banner.
    interacted.current = false;
    translateY.setValue(0);

    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();

    timerRef.current = setTimeout(() => {
      if (!interacted.current) {
        dismissAnimated(false);
      }
    }, VISIBLE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message, opacity, translateY]);

  if (!message) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      <AppText style={styles.text} numberOfLines={2}>
        {message}
      </AppText>
      <Pressable
        onPress={() => {
          interacted.current = true;
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          dismissAnimated(false);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        style={styles.closeBtn}
      >
        <AppText style={styles.closeText}>×</AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 1000,
  },
  text: {
    flex: 1,
    color: colors.inverse,
    fontSize: 13,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeText: {
    color: colors.inverse,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
  },
});
