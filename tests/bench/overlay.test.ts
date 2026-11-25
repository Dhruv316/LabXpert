import { describe, expect, it } from 'vitest';
import { BENCH_VIEW, PART_SIZE } from '../../src/bench/catalog';
import { benchToLocal, clientToBench, sceneLayout } from '../../src/bench/coords';
import {
  circleHitsRect,
  clampCentre,
  CONTROL_GAP_PX,
  CONTROL_MIN_PX,
  layoutOrDefault,
  placeClear,
  placementRect,
  segmentHitsRect,
  slotPlacement,
  WIRE_LEAD_PX,
  wireLeads,
} from '../../src/bench/overlay';
import { canStepSupply, stepSupplyVoltage, SUPPLY_STEP_VOLTS } from '../../src/bench/supply';
import type { Circuit } from '../../src/model/types';
import { ohmsLaw } from './helpers';

const FULL = { width: BENCH_VIEW.width, height: BENCH_VIEW.height };

describe('sceneLayout and benchToLocal', () => {
  it('is 1:1 when the box is exactly the scene', () => {
    expect(sceneLayout(FULL.width, FULL.height)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('scales down without distortion and centres the scene in a wider box (1024 × 640 style)', () => {
    const layout = sceneLayout(1000, 400);
    expect(layout?.scale).toBeCloseTo(400 / BENCH_VIEW.height, 10);
    expect(layout?.offsetY).toBe(0);
    expect(layout?.offsetX).toBeCloseTo((1000 - BENCH_VIEW.width * (400 / BENCH_VIEW.height)) / 2, 10);
  });

  it('is undefined for a box with no size', () => {
    expect(sceneLayout(0, 300)).toBeUndefined();
    expect(sceneLayout(300, 0)).toBeUndefined();
  });

  it('benchToLocal is the inverse of clientToBench', () => {
    const rect = { left: 40, top: 70, width: 900, height: 600 };
    const layout = sceneLayout(rect.width, rect.height);
    if (layout === undefined) throw new Error('no layout');
    const local = benchToLocal(layout, 321, 123);
    const back = clientToBench(rect, rect.left + local.x, rect.top + local.y);
    expect(back?.x).toBeCloseTo(321, 8);
    expect(back?.y).toBeCloseTo(123, 8);
  });
});

describe('layoutOrDefault', () => {
  it('draws 1:1 before the layer has been measured', () => {
    expect(layoutOrDefault(undefined)).toEqual({ layout: { scale: 1, offsetX: 0, offsetY: 0 }, size: FULL });
    expect(layoutOrDefault({ width: 0, height: 0 }).layout.scale).toBe(1);
  });

  it('uses the measured size once there is one', () => {
    const result = layoutOrDefault({ width: 550, height: 324 });
    expect(result.layout.scale).toBeCloseTo(0.5, 10);
    expect(result.size).toEqual({ width: 550, height: 324 });
  });
});

describe('slotPlacement', () => {
  const layout = { scale: 1, offsetX: 0, offsetY: 0 };

  it('centres a control under its part, a gap below the part’s bottom edge', () => {
    const place = slotPlacement(layout, FULL, { type: 'supply', x: 100, y: 100 });
    expect(place).toEqual({
      left: 100 + PART_SIZE.supply.width / 2,
      anchor: 'top',
      offset: 100 + PART_SIZE.supply.height + CONTROL_GAP_PX,
      edge: 'below',
    });
  });

  it('follows the part: moving it 48 units moves the control 48 px at scale 1', () => {
    const before = slotPlacement(layout, FULL, { type: 'supply', x: 100, y: 100 });
    const after = slotPlacement(layout, FULL, { type: 'supply', x: 148, y: 100 });
    expect(after.left - before.left).toBe(48);
  });

  it('is scaled and offset with the scene', () => {
    const scaled = { scale: 0.5, offsetX: 20, offsetY: 10 };
    const place = slotPlacement(scaled, { width: 600, height: 340 }, { type: 'supply', x: 100, y: 100 });
    expect(place.left).toBe(20 + (100 + PART_SIZE.supply.width / 2) * 0.5);
    expect(place.offset).toBe(10 + (100 + PART_SIZE.supply.height) * 0.5 + CONTROL_GAP_PX);
  });

  it('goes above the part when there is no room below it', () => {
    const place = slotPlacement(layout, FULL, { type: 'supply', x: 100, y: BENCH_VIEW.height - PART_SIZE.supply.height - 10 });
    expect(place.edge).toBe('above');
    expect(place.anchor).toBe('bottom');
    // pinned CONTROL_GAP_PX above the part's top edge
    expect(FULL.height - place.offset).toBe(BENCH_VIEW.height - PART_SIZE.supply.height - 10 - CONTROL_GAP_PX);
  });

  it('keeps the preferred side when neither side has room', () => {
    const tiny = { width: 400, height: 60 };
    expect(slotPlacement(layout, tiny, { type: 'supply', x: 0, y: 0 }).edge).toBe('below');
  });

  it('honours an "above" preference and falls back to below at the top of the box', () => {
    expect(slotPlacement(layout, FULL, { type: 'supply', x: 100, y: 200 }, 'above').edge).toBe('above');
    expect(slotPlacement(layout, FULL, { type: 'supply', x: 100, y: 10 }, 'above').edge).toBe('below');
  });
});

describe('control size', () => {
  it('is 44 px, the minimum touch target in DESIGN.md §9', () => {
    expect(CONTROL_MIN_PX).toBe(44);
  });
});

describe('supply stepping', () => {
  const rules = ohmsLaw.supply;

  it('steps 1 V up and down', () => {
    expect(SUPPLY_STEP_VOLTS).toBe(1);
    expect(stepSupplyVoltage(3, 1, rules)).toBe(4);
    expect(stepSupplyVoltage(3, -1, rules)).toBe(2);
  });

  it('stops at the minimum and the maximum', () => {
    expect(stepSupplyVoltage(0, -1, rules)).toBe(0);
    expect(stepSupplyVoltage(12, 1, rules)).toBe(12);
    expect(canStepSupply(0, -1, rules)).toBe(false);
    expect(canStepSupply(0, 1, rules)).toBe(true);
    expect(canStepSupply(12, 1, rules)).toBe(false);
    expect(canStepSupply(12, -1, rules)).toBe(true);
    expect(canStepSupply(11, 1, rules)).toBe(true);
  });

  it('stays on a finer grid and inside the range', () => {
    const fine = { min: 0, max: 5, step: 0.5, default: 0, unit: 'V' as const };
    expect(stepSupplyVoltage(4.5, 1, fine)).toBe(5);
    expect(stepSupplyVoltage(5, 1, fine)).toBe(5);
    expect(stepSupplyVoltage(0.5, -1, fine)).toBe(0);
  });

  it('lands on the highest reachable setting when the range does not end on the grid', () => {
    const odd = { min: 0, max: 10, step: 4, default: 0, unit: 'V' as const };
    expect(stepSupplyVoltage(8, 1, odd)).toBe(8);
    expect(canStepSupply(8, 1, odd)).toBe(false);
  });
});

describe('clampCentre', () => {
  it('leaves a control that fits where it is', () => {
    expect(clampCentre(500, 200, 1100)).toBe(500);
  });

  it('pulls a control in from the left and right edges so both sides show', () => {
    expect(clampCentre(40, 250, 1100)).toBe(125);
    expect(clampCentre(1090, 250, 1100)).toBe(975);
  });

  it('centres a control wider than the layer, and ignores an unmeasured one (width 0)', () => {
    expect(clampCentre(10, 900, 600)).toBe(300);
    expect(clampCentre(0, 0, 1100)).toBe(0);
    expect(clampCentre(321, 0, 1100)).toBe(321);
  });
});

describe('slotPlacement with a gap', () => {
  it('uses the gap it is given instead of the control gap', () => {
    const layout = { scale: 1, offsetX: 0, offsetY: 0 };
    const place = slotPlacement(layout, FULL, { type: 'ammeter', x: 100, y: 200 }, 'above', 29, 18);
    expect(FULL.height - place.offset).toBe(200 - 18);
  });
});

describe('placementRect, segmentHitsRect and circleHitsRect', () => {
  const box = { width: 96, height: 44 };

  it('gives the rectangle of a centred, a start-aligned and an end-aligned control', () => {
    expect(placementRect({ left: 200, anchor: 'top', offset: 240, edge: 'below' }, FULL, box)).toEqual({ left: 152, top: 240, right: 248, bottom: 284 });
    expect(placementRect({ left: 308, anchor: 'top', offset: 148, edge: 'right', align: 'start' }, FULL, box)).toEqual({ left: 308, top: 148, right: 404, bottom: 192 });
    expect(placementRect({ left: 392, anchor: 'top', offset: 148, edge: 'left', align: 'end' }, FULL, box)).toEqual({ left: 296, top: 148, right: 392, bottom: 192 });
  });

  it('gives the rectangle of a control pinned to the bottom of the layer', () => {
    const rect = placementRect({ left: 200, anchor: 'bottom', offset: FULL.height - 92, edge: 'above' }, FULL, box);
    expect(rect).toEqual({ left: 152, top: 48, right: 248, bottom: 92 });
  });

  const rect = { left: 10, top: 10, right: 50, bottom: 30 };
  it('sees a segment that crosses, one that ends inside, and one that lies inside', () => {
    expect(segmentHitsRect({ from: { x: 0, y: 20 }, to: { x: 60, y: 20 } }, rect)).toBe(true);
    expect(segmentHitsRect({ from: { x: 0, y: 0 }, to: { x: 20, y: 20 } }, rect)).toBe(true);
    expect(segmentHitsRect({ from: { x: 20, y: 15 }, to: { x: 30, y: 25 } }, rect)).toBe(true);
  });

  it('does not see a segment that passes beside, above, or short of it', () => {
    expect(segmentHitsRect({ from: { x: 0, y: 40 }, to: { x: 60, y: 40 } }, rect)).toBe(false);
    expect(segmentHitsRect({ from: { x: 60, y: 0 }, to: { x: 60, y: 60 } }, rect)).toBe(false);
    expect(segmentHitsRect({ from: { x: 0, y: 0 }, to: { x: 8, y: 8 } }, rect)).toBe(false);
    expect(segmentHitsRect({ from: { x: 0, y: 25 }, to: { x: 5, y: 25 } }, rect)).toBe(false);
  });

  it('tells whether a circle reaches a rectangle', () => {
    expect(circleHitsRect({ x: 0, y: 20 }, 10, rect)).toBe(true);
    expect(circleHitsRect({ x: 0, y: 20 }, 9, rect)).toBe(false);
    expect(circleHitsRect({ x: 30, y: 20 }, 1, rect)).toBe(true);
  });
});

describe('wireLeads: the first part of the wires leaving a part', () => {
  const layout = { scale: 1, offsetX: 0, offsetY: 0 };
  const circuit: Circuit = {
    components: [
      { id: 'S', type: 'supply', x: 100, y: 100, voltage: 6 },
      { id: 'R', type: 'resistor', x: 100, y: 500, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 800, y: 100 },
    ],
    wires: [{ id: 'w1', from: 'S.pos', to: 'R.a' }],
  };

  it('starts at the supply’s own terminal and runs about WIRE_LEAD_PX along the wire', () => {
    const leads = wireLeads(layout, circuit, 'S');
    expect(leads.length).toBeGreaterThan(1);
    expect(leads[0]?.from).toEqual({ x: 250, y: 214 });
    const last = leads[leads.length - 1]?.to ?? { x: 0, y: 0 };
    const reach = Math.hypot(last.x - 250, last.y - 214);
    expect(reach).toBeGreaterThanOrEqual(WIRE_LEAD_PX);
    expect(reach).toBeLessThan(WIRE_LEAD_PX + 30);
  });

  it('follows the sag: a wire that goes straight across first heads down', () => {
    const sideways: Circuit = { ...circuit, wires: [{ id: 'w1', from: 'S.pos', to: 'A.pos' }] };
    const leads = wireLeads(layout, sideways, 'S');
    expect(leads[0]?.to.y).toBeGreaterThan(214);
  });

  it('starts at the supply’s terminal for a wire drawn the other way round', () => {
    const reversed: Circuit = { ...circuit, wires: [{ id: 'w1', from: 'R.a', to: 'S.pos' }] };
    expect(wireLeads(layout, reversed, 'S')[0]?.from).toEqual({ x: 250, y: 214 });
  });

  it('has nothing for a part with no wires, and the whole wire when it is short', () => {
    expect(wireLeads(layout, circuit, 'A')).toEqual([]);
    const near: Circuit = {
      components: [
        { id: 'S', type: 'supply', x: 100, y: 100, voltage: 6 },
        { id: 'R', type: 'resistor', x: 100, y: 260, role: 'R', ohms: 10 },
      ],
      wires: [{ id: 'w1', from: 'S.neg', to: 'R.a' }],
    };
    const leads = wireLeads(layout, near, 'S');
    expect(leads[leads.length - 1]?.to).toEqual({ x: 112, y: 298 });
  });

  it('is scaled with the scene', () => {
    const half = { scale: 0.5, offsetX: 0, offsetY: 0 };
    expect(wireLeads(half, circuit, 'S')[0]?.from).toEqual({ x: 125, y: 107 });
  });
});

describe('placeClear: a control kept off the terminals and the wires leaving them', () => {
  const layout = { scale: 1, offsetX: 0, offsetY: 0 };
  const box = { width: 96, height: 44 };
  const supply = { type: 'supply', x: 100, y: 100 } as const;
  const downFromPos = [{ from: { x: 250, y: 214 }, to: { x: 250, y: 300 } }];

  it('is the same as slotPlacement when no wire is in the way', () => {
    expect(placeClear(layout, FULL, supply, 'below', box, [])).toEqual(slotPlacement(layout, FULL, supply, 'below', box.height));
    const low = { type: 'supply', x: 100, y: 500 } as const;
    expect(placeClear(layout, FULL, low, 'below', box, [])).toEqual(slotPlacement(layout, FULL, low, 'below', box.height));
  });

  it('moves beside the supply when a wire hangs below its terminal, its bottom above the terminal ring', () => {
    const place = placeClear(layout, FULL, supply, 'below', box, downFromPos);
    expect(place).toEqual({ left: 308, anchor: 'top', offset: 148, edge: 'right', align: 'start' });
    const rect = placementRect(place, FULL, box);
    expect(rect.bottom).toBeLessThan(214 - 16);
  });

  it('goes to the left when the right side is blocked too, and then above as the last resort', () => {
    const wide = { type: 'supply', x: 400, y: 100 } as const;
    const lead = [{ from: { x: 450, y: 214 }, to: { x: 450, y: 300 } }];
    expect(placeClear(layout, FULL, wide, 'below', box, lead).edge).toBe('right');
    const acrossRight = [...lead, { from: { x: 600, y: 170 }, to: { x: 720, y: 170 } }];
    expect(placeClear(layout, FULL, wide, 'below', box, acrossRight)).toEqual({ left: 392, anchor: 'top', offset: 148, edge: 'left', align: 'end' });
    const acrossLeft = [...acrossRight, { from: { x: 290, y: 170 }, to: { x: 398, y: 170 } }];
    expect(placeClear(layout, FULL, wide, 'below', box, acrossLeft).edge).toBe('above');
  });

  it('never lands on a terminal ring: no side it picks touches a ring or a lead, with wires on both terminals', () => {
    const leads = [
      { from: { x: 250, y: 214 }, to: { x: 250, y: 300 } },
      { from: { x: 150, y: 214 }, to: { x: 150, y: 300 } },
    ];
    const place = placeClear(layout, FULL, supply, 'below', box, leads);
    const rect = placementRect(place, FULL, box);
    expect(place.edge).not.toBe('below');
    for (const lead of leads) expect(segmentHitsRect(lead, rect)).toBe(false);
    for (const ring of [{ x: 250, y: 214 }, { x: 150, y: 214 }]) expect(circleHitsRect(ring, 16, rect)).toBe(false);
  });

  it('flips above when there is no room below, as slotPlacement does, even with no wire in the way', () => {
    const low = { type: 'supply', x: 100, y: 500 } as const;
    expect(placeClear(layout, FULL, low, 'below', box, []).edge).toBe('above');
  });

  it('keeps clear of the space above the part that its label uses', () => {
    const low = { type: 'supply', x: 100, y: 500 } as const;
    const plain = placementRect(placeClear(layout, FULL, low, 'below', box, []), FULL, box);
    const lifted = placementRect(placeClear(layout, FULL, low, 'below', box, [], 40), FULL, box);
    expect(plain.bottom - lifted.bottom).toBe(40);
  });

  it('falls back to slotPlacement when no side fits in the layer', () => {
    const tiny = { width: 200, height: 60 };
    const corner = { type: 'supply', x: 0, y: 0 } as const;
    expect(placeClear(layout, tiny, corner, 'below', box, [])).toEqual(slotPlacement(layout, tiny, corner, 'below', box.height));
  });
});
