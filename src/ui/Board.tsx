import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

interface Props {
  id: string;
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: { from: string; to: string } | null;
}

const HIGHLIGHT = { background: 'rgba(205, 170, 60, 0.45)' };

/** Classic walnut-and-maple board, never draggable (moves are spoken). Fills its container's width. */
export function Board({ id, fen, orientation = 'white', lastMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', aspectRatio: '1 / 1' }}>
      {width > 0 && (
        <Chessboard
          id={id}
          position={fen}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          animationDuration={150}
          boardWidth={width}
          customDarkSquareStyle={{ backgroundColor: '#b58863' }}
          customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          customNotationStyle={{ fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 600, fontSize: '11px' }}
          customSquareStyles={lastMove ? { [lastMove.from]: HIGHLIGHT, [lastMove.to]: HIGHLIGHT } : {}}
        />
      )}
    </div>
  );
}
