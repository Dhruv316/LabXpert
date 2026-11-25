import { PART_SIZE } from '../../bench/catalog';
import { partMarkup, type PartLook } from './part-art';

export interface PartArtProps {
  look: PartLook;
  /** 1 is the design size; the shelf draws parts at 0.6. */
  scale?: number;
}

/** A part drawn on its own (shelf tile, drag ghost). The bench draws parts inside its own SVG instead. */
export function PartArt({ look, scale = 1 }: PartArtProps) {
  const { viewBox, inner } = partMarkup(look);
  const size = PART_SIZE[look.type];
  return (
    <svg
      viewBox={viewBox}
      width={Math.round(size.width * scale)}
      height={Math.round(size.height * scale)}
      focusable="false"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
