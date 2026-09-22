import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TruncatedTextProps {
  readonly text: string;
  readonly maxWidth?: string;
  readonly className?: string;
}

const TRUNCATION_EPSILON_PX = 1;

function useIsTextTruncated(text: string) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const truncated =
      el.scrollWidth > el.clientWidth + TRUNCATION_EPSILON_PX;
    setIsTruncated((prev) => (prev === truncated ? prev : truncated));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [text, measure]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [measure, isTruncated, text]);

  return { textRef, isTruncated };
}

export function TruncatedText({
  text,
  maxWidth = '200px',
  className,
}: TruncatedTextProps) {
  const { textRef, isTruncated } = useIsTextTruncated(text);
  const isFullWidth = maxWidth === '100%';

  const spanClass = 'block max-w-full truncate';
  const outerClass = cn(
    'max-w-full min-w-0 text-left text-inherit',
    isFullWidth && 'block w-full',
    className,
  );
  const outerStyle = isFullWidth
    ? undefined
    : { maxWidth, display: 'inline-block' as const };

  if (!isTruncated) {
    return (
      <span className={outerClass} style={outerStyle}>
        <span ref={textRef} className={spanClass}>
          {text}
        </span>
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={120}
        render={
          <button
            type="button"
            title={text}
            className={cn(
              'max-w-full min-w-0 cursor-default border-none bg-transparent p-0 text-left text-inherit',
              isFullWidth && 'block w-full',
              className,
            )}
            style={isFullWidth ? undefined : { maxWidth, display: 'inline-block' }}
          />
        }
      >
        <span ref={textRef} className={spanClass}>
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-xs whitespace-normal wrap-break-word p-3 text-sm"
        align="start"
        side="bottom"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
