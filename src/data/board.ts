import type { SlotRef } from "../types";
import { slotKey } from "../types";

// EXACT geometry extracted from the vector objects inside Card/Print/Map.pdf
// (126 slot objects of 340x295pt). Values are in px of the 1701px map render
// (= PDF points x 0.5). Even columns start lower (10 rows), odd higher (11).
export const MAP_SIZE = 1701;
export const X0 = 123.2;
export const COL_PITCH = 132.225;
export const ROW_PITCH = 152.05;
export const Y0_EVEN = 166.4;
export const Y0_ODD = 90.4;
export const COLS = 12;
export const ROWS_EVEN = 10;
export const ROWS_ODD = 11;
export const HEX_W = 176; // point-to-point (flat-top hex width)
export const HEX_H = 152; // flat-to-flat

export function rowsInCol(col: number): number {
  return col % 2 === 0 ? ROWS_EVEN : ROWS_ODD;
}

export function slotCenter(s: SlotRef): { x: number; y: number } {
  const x = X0 + COL_PITCH * s.col;
  const y = (s.col % 2 === 0 ? Y0_EVEN : Y0_ODD) + ROW_PITCH * s.row;
  return { x, y };
}

export function allSlots(): SlotRef[] {
  const out: SlotRef[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < rowsInCol(col); row++) out.push({ col, row });
  }
  return out;
}

// Flat-top hexagon corner points around a center.
export function hexPoints(cx: number, cy: number, w = HEX_W, h = HEX_H): string {
  const w2 = w / 2;
  const w4 = w / 4;
  const h2 = h / 2;
  return [
    [cx - w4, cy - h2],
    [cx + w4, cy - h2],
    [cx + w2, cy],
    [cx + w4, cy + h2],
    [cx - w4, cy + h2],
    [cx - w2, cy],
  ]
    .map((p) => p.map((n) => Math.round(n * 10) / 10).join(","))
    .join(" ");
}

// Neighbors of a flat-top hex in this column-offset layout.
// Even columns sit half a row LOWER than odd columns.
export function neighbors(s: SlotRef): SlotRef[] {
  const { col, row } = s;
  const even = col % 2 === 0;
  const cand: SlotRef[] = [
    { col, row: row - 1 },
    { col, row: row + 1 },
    { col: col - 1, row: even ? row : row - 1 },
    { col: col - 1, row: even ? row + 1 : row },
    { col: col + 1, row: even ? row : row - 1 },
    { col: col + 1, row: even ? row + 1 : row },
  ];
  return cand.filter(
    (c) => c.col >= 0 && c.col < COLS && c.row >= 0 && c.row < rowsInCol(c.col),
  );
}

export interface EdgeRef {
  a: SlotRef;
  b: SlotRef;
  mid: { x: number; y: number };
  angle: number; // degrees, orientation of the wall along the shared edge
}

export function allEdges(): EdgeRef[] {
  const seen = new Set<string>();
  const out: EdgeRef[] = [];
  for (const s of allSlots()) {
    const ca = slotCenter(s);
    for (const n of neighbors(s)) {
      const key = [slotKey(s), slotKey(n)].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const cb = slotCenter(n);
      const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
      // wall lies perpendicular to the center-to-center line
      const angle = (Math.atan2(cb.y - ca.y, cb.x - ca.x) * 180) / Math.PI + 90;
      out.push({ a: s, b: n, mid, angle });
    }
  }
  return out;
}
