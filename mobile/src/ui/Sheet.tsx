import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
  BottomSheetModalProvider
} from '@gorhom/bottom-sheet';
import { useTheme } from '../theme';
import { Text } from './Text';
import { haptics } from './haptics';

/**
 * The app's one overlay.
 *
 * The web has `Popover` and `Dialog` and a `layerStack` to arbitrate them,
 * because a pointer can anchor a panel next to the thing it belongs to. A
 * finger cannot: an anchored panel on a phone is either under the thumb or off
 * the screen. So every one of those call sites becomes a sheet, and having
 * exactly one overlay primitive is what keeps the stacking honest without
 * needing the web's lint.
 *
 * Three details do the "premium" work here:
 *
 * **Detents.** A sheet that is either full-screen or nothing is a modal wearing
 * a different shape. Snapping to a natural height — and letting someone drag it
 * taller — is what makes it feel like part of the screen rather than an
 * interruption.
 *
 * **The backdrop dims progressively with the drag**, so the sheet feels
 * connected to the finger rather than triggered by it.
 *
 * **A haptic on dismiss, not on open.** Opening is something you did; closing
 * is something that happened, and confirming it is what stops the small
 * uncertainty of "did that cancel or save".
 */

export type SheetRef = {
  open: () => void;
  close: () => void;
};

export const Sheet = forwardRef<
  SheetRef,
  {
    title?: string;
    /** Fractions of the screen, smallest first. */
    snapPoints?: string[];
    children: ReactNode;
    onClose?: () => void;
  }
>(function Sheet({ title, snapPoints = ['50%', '88%'], children, onClose }, ref) {
  const t = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const points = useMemo(() => snapPoints, [snapPoints]);

  useImperativeHandle(ref, () => ({
    open: () => sheet.current?.present(),
    close: () => sheet.current?.dismiss()
  }));

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        // Fades in as the sheet rises rather than appearing with it.
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={points}
      backdropComponent={backdrop}
      enablePanDownToClose
      onDismiss={() => {
        haptics.tick();
        onClose?.();
      }}
      backgroundStyle={{ backgroundColor: t.c('--color-surface') }}
      handleIndicatorStyle={{ backgroundColor: t.c('--color-border-strong'), width: 36 }}
      // Keeps the keyboard from covering an input inside the sheet — the single
      // most common way a sheet-with-a-form feels broken.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={{ paddingBottom: 28 }}>
        {title ? (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 4,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: t.c('--color-border')
            }}
          >
            <Text variant="lg" weight="600">
              {title}
            </Text>
          </View>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

/** Mounted once at the root so any screen can present a sheet. */
export { BottomSheetModalProvider as SheetProvider };
