import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { AgentActivityState } from '@/types/domain-types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ActivityNode from './ExecutionActivityCard';
import ModelProgressCard from './ModelProgressCard';
import type { ModelProgress } from './AISectionReasoningUtils';
import styles from './ExecutionTimeline.module.css';

export default function ExecutionTimeline({
  activity,
  modelProgress,
  timelineExpanded,
  showStepIO,
}: {
  activity: AgentActivityState;
  modelProgress?: ModelProgress;
  timelineExpanded: boolean;
  showStepIO: boolean;
}) {
  const executionMapRef = useRef<HTMLOListElement | null>(null);
  const previousCardRects = useRef(new Map<string, DOMRect>());
  const lastTimelineMode = useRef<boolean | null>(null);
  const cardAnimations = useRef<Animation[]>([]);
  const previousCardListKey = useRef<string | null>(null);
  const previousWorkingCardId = useRef<string | null>(null);
  const previousNavigatedCardId = useRef<string | null>(null);
  const cardIds = useMemo(
    () => [...(modelProgress ? ['model-progress'] : []), ...activity.nodes.map((item) => item.id)],
    [activity.nodes, modelProgress],
  );
  const currentNode = activity.nodes.find((item) => item.id === activity.currentNodeId);
  const activeNode = [...activity.nodes].reverse().find((item) => item.status === 'active');
  const workingCardId =
    (currentNode?.status === 'active' ? currentNode.id : undefined) ??
    activeNode?.id ??
    (modelProgress ? 'model-progress' : null);
  const collapsedCardIds = useMemo(() => {
    const visibleCardIds = cardIds.filter((cardId) => {
      if (cardId === 'model-progress') return true;
      return activity.nodes.find((item) => item.id === cardId)?.status !== 'queued';
    });
    if (!workingCardId || !visibleCardIds.includes(workingCardId)) return visibleCardIds;
    return [...visibleCardIds.filter((cardId) => cardId !== workingCardId), workingCardId];
  }, [activity.nodes, cardIds, workingCardId]);
  const navigationCardIds = timelineExpanded ? cardIds : collapsedCardIds;
  const cardIdKey = navigationCardIds.join('|');
  const defaultCardId =
    (workingCardId && navigationCardIds.includes(workingCardId)
      ? workingCardId
      : navigationCardIds.at(-1)) || null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(defaultCardId);
  const displayedSelectedCardId =
    previousWorkingCardId.current !== workingCardId ||
    previousCardListKey.current !== cardIdKey ||
    !selectedCardId ||
    !navigationCardIds.includes(selectedCardId)
      ? defaultCardId
      : selectedCardId;
  const selectedCardIndex = displayedSelectedCardId
    ? navigationCardIds.indexOf(displayedSelectedCardId)
    : -1;
  const previousCardDisabled = selectedCardIndex <= 0;
  const nextCardDisabled =
    selectedCardIndex < 0 || selectedCardIndex >= navigationCardIds.length - 1;
  const topCardId =
    displayedSelectedCardId && navigationCardIds.includes(displayedSelectedCardId)
      ? displayedSelectedCardId
      : navigationCardIds.at(-1);
  const topCardIndex = topCardId ? navigationCardIds.indexOf(topCardId) : -1;
  const cardRenderOrder =
    !timelineExpanded && topCardIndex >= 0 ? navigationCardIds.slice(0, topCardIndex + 1) : cardIds;

  useLayoutEffect(() => {
    setSelectedCardId((currentSelectedCardId) => {
      const cardListChanged = previousCardListKey.current !== cardIdKey;
      const workingCardChanged = previousWorkingCardId.current !== workingCardId;
      if (
        cardListChanged ||
        workingCardChanged ||
        !currentSelectedCardId ||
        !navigationCardIds.includes(currentSelectedCardId)
      ) {
        return defaultCardId;
      }
      return currentSelectedCardId;
    });
    previousCardListKey.current = cardIdKey;
    previousWorkingCardId.current = workingCardId ?? null;
  }, [cardIdKey, defaultCardId, navigationCardIds, workingCardId]);

  const moveSelectedCard = (offset: number) => {
    setSelectedCardId((currentSelectedCardId) => {
      const currentIndex = currentSelectedCardId
        ? navigationCardIds.indexOf(currentSelectedCardId)
        : -1;
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), navigationCardIds.length - 1);
      return navigationCardIds[nextIndex] || currentSelectedCardId;
    });
  };

  useEffect(() => {
    const previousCardId = previousNavigatedCardId.current;
    previousNavigatedCardId.current = displayedSelectedCardId;
    if (
      timelineExpanded ||
      !previousCardId ||
      !displayedSelectedCardId ||
      previousCardId === displayedSelectedCardId ||
      typeof HTMLElement.prototype.animate !== 'function'
    ) {
      return;
    }

    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const previousIndex = navigationCardIds.indexOf(previousCardId);
    const selectedIndex = navigationCardIds.indexOf(displayedSelectedCardId);
    const incomingCard = cards.find((card) => card.dataset.cardId === displayedSelectedCardId);
    const outgoingCard = cards.find((card) => card.dataset.cardId === previousCardId);
    if (!incomingCard || previousIndex < 0 || selectedIndex < 0) return;

    const direction = selectedIndex > previousIndex ? 1 : -1;
    const incomingAnimation = incomingCard.animate(
      [
        {
          transform: `translateX(${direction * 42}px) rotate(${direction * 1.4}deg)`,
        },
        { transform: 'translateX(0) rotate(0deg)' },
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    );
    const outgoingAnimation = outgoingCard
      ? outgoingCard.animate(
          [
            { transform: 'translateX(0) rotate(0deg)' },
            {
              transform: `translateX(${direction * -18}px) rotate(${direction * -0.8}deg)`,
            },
          ],
          {
            duration: 300,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'both',
          },
        )
      : null;

    const animations = outgoingAnimation
      ? [incomingAnimation, outgoingAnimation]
      : [incomingAnimation];
    cardAnimations.current.push(...animations);
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        for (const animation of animations) animation.cancel();
      })
      .catch(() => undefined);

    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [displayedSelectedCardId, navigationCardIds, timelineExpanded]);

  useLayoutEffect(() => {
    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const nextCardRects = new Map(
      cards.map((card) => [card.dataset.cardId || '', card.getBoundingClientRect()]),
    );
    const shouldAnimate =
      lastTimelineMode.current !== null && lastTimelineMode.current !== timelineExpanded;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    for (const animation of cardAnimations.current) animation.cancel();
    cardAnimations.current = [];

    if (shouldAnimate && !reducedMotion && typeof HTMLElement.prototype.animate === 'function') {
      cards.forEach((card, index) => {
        const cardId = card.dataset.cardId;
        const previousRect = cardId ? previousCardRects.current.get(cardId) : undefined;
        const nextRect = cardId ? nextCardRects.get(cardId) : undefined;
        if (!previousRect || !nextRect) return;

        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        const scaleX = previousRect.width / Math.max(nextRect.width, 1);
        const scaleY = previousRect.height / Math.max(nextRect.height, 1);
        if (
          Math.abs(deltaX) < 1 &&
          Math.abs(deltaY) < 1 &&
          Math.abs(scaleX - 1) < 0.01 &&
          Math.abs(scaleY - 1) < 0.01
        ) {
          return;
        }

        const finalTransform = getComputedStyle(card).transform;
        const animation = card.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY}) ${finalTransform === 'none' ? '' : finalTransform}`,
            },
            { transform: finalTransform },
          ],
          {
            duration: 460,
            delay: Math.min(index * 24, 168),
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both',
          },
        );
        cardAnimations.current.push(animation);
        animation.finished.then(() => animation.cancel()).catch(() => undefined);
      });
    }

    previousCardRects.current = nextCardRects;
    lastTimelineMode.current = timelineExpanded;
  }, [timelineExpanded]);

  useLayoutEffect(() => {
    if (!timelineExpanded || !workingCardId) return;

    const executionMap = executionMapRef.current;
    if (!executionMap) return;

    const cards = Array.from(executionMap.querySelectorAll<HTMLElement>(':scope > [data-card-id]'));
    const workingCard = cards.find((card) => card.dataset.cardId === workingCardId);
    if (
      !workingCard ||
      executionMap.clientWidth <= 0 ||
      executionMap.scrollWidth <= executionMap.clientWidth
    ) {
      return;
    }

    const mapRect = executionMap.getBoundingClientRect();
    const cardRect = workingCard.getBoundingClientRect();
    const maxScrollLeft = executionMap.scrollWidth - executionMap.clientWidth;
    const centeredScrollLeft =
      executionMap.scrollLeft +
      (cardRect.left - mapRect.left) -
      (executionMap.clientWidth - cardRect.width) / 2;
    const nextScrollLeft = Math.min(Math.max(centeredScrollLeft, 0), maxScrollLeft);
    if (Math.abs(nextScrollLeft - executionMap.scrollLeft) < 1) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    executionMap.scrollTo({
      left: nextScrollLeft,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [timelineExpanded, workingCardId]);

  useEffect(
    () => () => {
      for (const animation of cardAnimations.current) animation.cancel();
    },
    [],
  );

  const renderCard = (cardId: string) => {
    if (cardId === 'model-progress' && modelProgress) {
      return (
        <ModelProgressCard
          key={cardId}
          progress={modelProgress}
          isWorking={workingCardId === cardId}
          isSelected={displayedSelectedCardId === cardId}
        />
      );
    }

    const itemIndex = activity.nodes.findIndex((item) => item.id === cardId);
    const item = itemIndex >= 0 ? activity.nodes[itemIndex] : undefined;
    if (!item) return null;

    return (
      <ActivityNode
        key={item.id}
        item={item}
        index={itemIndex}
        isCurrent={item.id === workingCardId}
        isWorking={item.id === workingCardId}
        isSelected={item.id === displayedSelectedCardId}
        showStepIO={showStepIO}
      />
    );
  };

  return (
    <section className={styles.executionSection} aria-label="Execution timeline">
      <div
        className={`${styles.executionDeck} ${timelineExpanded ? styles.executionDeckExpanded : styles.executionDeckCollapsed}`}
      >
        {!timelineExpanded ? (
          <Tooltip content="Previous card" className={styles.deckNavTooltip}>
            <button
              type="button"
              className={styles.deckNavButton}
              aria-label="Previous timeline card"
              disabled={previousCardDisabled}
              onClick={() => moveSelectedCard(-1)}
            >
              <Icons.ChevronLeft size={18} />
            </button>
          </Tooltip>
        ) : null}
        <ol
          ref={executionMapRef}
          className={`${styles.executionMap} ${timelineExpanded ? styles.executionMapExpanded : styles.executionMapCollapsed}`}
          aria-label={
            timelineExpanded ? 'Expanded execution cards' : 'Collapsed execution card deck'
          }
        >
          {cardRenderOrder.map(renderCard)}
        </ol>
        {!timelineExpanded ? (
          <Tooltip content="Next card" className={styles.deckNavTooltip}>
            <button
              type="button"
              className={styles.deckNavButton}
              aria-label="Next timeline card"
              disabled={nextCardDisabled}
              onClick={() => moveSelectedCard(1)}
            >
              <Icons.ChevronRight size={18} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </section>
  );
}
