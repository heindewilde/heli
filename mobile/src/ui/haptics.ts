import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics, used sparingly and with intent.
 *
 * The difference between an app that feels expensive and one that feels cheap
 * is mostly restraint here. A tap that merely navigates gets nothing — the
 * screen moving is the feedback. A tap that *changes something you can't see
 * yet* gets a light tick, because the confirmation is otherwise invisible.
 * Errors get a notification pattern, because they need to interrupt.
 *
 * Android's implementations vary and several are unpleasant; the selection tick
 * in particular is a hard buzz on a lot of hardware, so it stays iOS-only.
 */

export const haptics = {
  /** A value changed: a toggle, a priority, a stage. */
  selection() {
    if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {});
  },

  /** Something was created or committed. */
  success() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },

  /** A write failed, or an action was refused. */
  error() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },

  /** A gesture crossed a threshold — a swipe action arming, a sheet snapping. */
  tick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },

  /** A destructive confirmation, or a long-press opening a menu. */
  heavy() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
};
