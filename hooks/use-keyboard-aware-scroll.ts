import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findNodeHandle,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  UIManager,
} from 'react-native';

export function useKeyboardAwareScroll(extraClearance = 28) {
  const scrollRef = useRef<ScrollView>(null);
  const focusedInputRef = useRef<number | null>(null);
  const viewportHeightRef = useRef(0);
  const delayedRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const revealInput = useCallback((nativeHandle: number | null) => {
    if (!nativeHandle) return;
    focusedInputRef.current = nativeHandle;
    setInputFocused(true);

    const scrollView = scrollRef.current;
    if (!scrollView) return;
    const fallbackReveal = () => {
      scrollView.scrollResponderScrollNativeHandleToKeyboard?.(
        nativeHandle,
        extraClearance,
        true,
      );
    };
    const innerNode = scrollView.getInnerViewNode?.();
    const innerHandle = typeof innerNode === 'number'
      ? innerNode
      : findNodeHandle(innerNode);
    const visibleHeight = viewportHeightRef.current;
    if (!innerHandle || visibleHeight <= 0) {
      fallbackReveal();
      return;
    }

    UIManager.measureLayout(
      nativeHandle,
      innerHandle,
      fallbackReveal,
      (_inputX, inputY, _inputWidth, inputHeight) => {
        const targetY = Math.max(
          0,
          inputY + inputHeight - visibleHeight + extraClearance,
        );
        scrollView.scrollTo({ y: targetY, animated: true });
      },
    );
  }, [extraClearance]);

  const blurInput = useCallback(() => {
    focusedInputRef.current = null;
    setInputFocused(false);
  }, []);

  const onScrollLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios'
      ? 'keyboardWillShow'
      : 'keyboardDidShow';
    const keyboardHideEvent = 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(keyboardShowEvent, () => {
      setKeyboardVisible(true);
      const revealFocusedInput = () => revealInput(focusedInputRef.current);
      requestAnimationFrame(revealFocusedInput);
      if (delayedRevealRef.current) clearTimeout(delayedRevealRef.current);
      delayedRevealRef.current = setTimeout(revealFocusedInput, Platform.OS === 'ios' ? 320 : 80);
    });
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      if (delayedRevealRef.current) clearTimeout(delayedRevealRef.current);
      delayedRevealRef.current = null;
      setKeyboardVisible(false);
      focusedInputRef.current = null;
      setInputFocused(false);
    });

    return () => {
      if (delayedRevealRef.current) clearTimeout(delayedRevealRef.current);
      delayedRevealRef.current = null;
      focusedInputRef.current = null;
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [revealInput]);

  return {
    scrollRef,
    keyboardVisible,
    inputFocused,
    revealInput,
    blurInput,
    onScrollLayout,
  };
}
