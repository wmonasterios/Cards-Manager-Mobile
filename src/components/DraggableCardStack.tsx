import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View, ViewStyle } from 'react-native';
import { DecoratedCard } from '../decorate';

type Props = {
  cards: DecoratedCard[];
  cardHeight: number;
  step: number;
  onReorder: (orderedIds: string[]) => void;
  renderCard: (card: DecoratedCard, dragging: boolean) => React.ReactNode;
  style?: ViewStyle;
  // Absolutely-positioned children ignore their parent's padding in RN, so
  // this mirrors the same left/right inset the static (non-reordering) stack
  // applies on its own slots, instead of relying on padding to do it.
  sideInset?: number;
};

// Drag-to-reorder for the card stack, entered from an explicit "Reorder" mode
// (see HomeScreen) rather than always-on — this is built on PanResponder +
// the core Animated API only, no react-native-gesture-handler/reanimated:
// those aren't linked into the native build already installed on-device, and
// this ships as a JS-only OTA update, so a new native module here would crash
// on install instead of updating. Always-on dragging directly on the cards
// would also fight the surrounding ScrollView's own pan gesture; disabling
// scroll for the duration of reorder mode (done by the caller) sidesteps that.
export function DraggableCardStack({
  cards,
  cardHeight,
  step,
  onReorder,
  renderCard,
  style,
  sideInset = 0,
}: Props) {
  const [order, setOrder] = useState(() => cards.map((c) => c.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const idsKey = cards.map((c) => c.id).join('|');
  const prevIdsKey = useRef(idsKey);
  useEffect(() => {
    if (prevIdsKey.current !== idsKey) {
      prevIdsKey.current = idsKey;
      setOrder(cards.map((c) => c.id));
    }
  }, [idsKey, cards]);

  const orderRef = useRef(order);
  orderRef.current = order;

  // One persistent Animated.Value per card id holding its current resting
  // translateY (index * step), animated whenever its index shifts to make
  // room for whatever's being dragged.
  const translateYs = useRef(new Map<string, Animated.Value>()).current;
  const getTranslateY = (id: string, index: number) => {
    let v = translateYs.get(id);
    if (!v) {
      v = new Animated.Value(index * step);
      translateYs.set(id, v);
    }
    return v;
  };
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    for (const id of Array.from(translateYs.keys())) {
      if (!ids.has(id)) translateYs.delete(id);
    }
  }, [cards, translateYs]);

  useEffect(() => {
    order.forEach((id, index) => {
      if (id === draggingId) return;
      Animated.spring(getTranslateY(id, index), {
        toValue: index * step,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, draggingId, step]);

  const dragBaseY = useRef(new Animated.Value(0)).current;
  const dragDeltaY = useRef(new Animated.Value(0)).current;
  const dragTranslateY = useRef(Animated.add(dragBaseY, dragDeltaY)).current;
  const liftScale = useRef(new Animated.Value(1)).current;
  const startIndexRef = useRef(0);

  const responders = useMemo(
    () =>
      new Map(
        cards.map((c) => {
          const id = c.id;
          return [
            id,
            PanResponder.create({
              onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 || Math.abs(g.dx) > 4,
              onPanResponderGrant: () => {
                const startIndex = orderRef.current.indexOf(id);
                startIndexRef.current = startIndex;
                setDraggingId(id);
                dragBaseY.setValue(startIndex * step);
                dragDeltaY.setValue(0);
                Animated.spring(liftScale, { toValue: 1.04, useNativeDriver: true, friction: 6 }).start();
              },
              onPanResponderMove: (_, g) => {
                dragDeltaY.setValue(g.dy);
                const startIndex = startIndexRef.current;
                const targetIndex = Math.max(
                  0,
                  Math.min(orderRef.current.length - 1, startIndex + Math.round(g.dy / step)),
                );
                const currentIndex = orderRef.current.indexOf(id);
                if (targetIndex !== currentIndex) {
                  const next = [...orderRef.current];
                  next.splice(currentIndex, 1);
                  next.splice(targetIndex, 0, id);
                  setOrder(next);
                }
              },
              onPanResponderRelease: () => {
                setDraggingId(null);
                Animated.parallel([
                  Animated.spring(dragDeltaY, { toValue: 0, useNativeDriver: true }),
                  Animated.spring(liftScale, { toValue: 1, useNativeDriver: true }),
                ]).start();
                onReorder(orderRef.current);
              },
              onPanResponderTerminate: () => {
                setDraggingId(null);
                Animated.parallel([
                  Animated.spring(dragDeltaY, { toValue: 0, useNativeDriver: true }),
                  Animated.spring(liftScale, { toValue: 1, useNativeDriver: true }),
                ]).start();
              },
            }),
          ] as const;
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, step],
  );

  const stackHeight = cardHeight + (Math.max(1, cards.length) - 1) * step;

  return (
    <View style={[{ height: cards.length ? stackHeight : 0 }, style]}>
      {cards.map((card) => {
        const index = order.indexOf(card.id);
        const isDragging = card.id === draggingId;
        const translateY = isDragging ? dragTranslateY : getTranslateY(card.id, index);
        const responder = responders.get(card.id);
        return (
          <Animated.View
            key={card.id}
            {...(responder ? responder.panHandlers : {})}
            style={{
              position: 'absolute',
              left: sideInset,
              right: sideInset,
              height: cardHeight,
              zIndex: isDragging ? 999 : 10 + index,
              transform: [{ translateY }, { scale: isDragging ? liftScale : 1 }],
            }}
          >
            {renderCard(card, isDragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}
