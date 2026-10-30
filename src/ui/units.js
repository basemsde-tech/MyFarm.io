// Milk is stored in litres; it is shown in the farm's chosen unit (kilograms by default).
import { fmtQty, } from '../core/money.mjs';
import { lToKg } from '../core/milk.mjs';

let unit = 'kg';
let label = (u) => u;
export function setMilkView(u, t) { unit = u === 'L' ? 'L' : 'kg'; label = (x) => t(`u.${x}`); }
export const milkUnit = () => unit;
/** "182.8 kg" from litres. */
export function milkQ(litres, digits = 1) {
  const v = unit === 'kg' ? lToKg(Number(litres) || 0) : Number(litres) || 0;
  return `${fmtQty(v, digits)} ${label(unit)}`;
}
/** Just the number, in the chosen unit. */
export const milkN = (litres, digits = 1) => fmtQty(unit === 'kg' ? lToKg(Number(litres) || 0) : Number(litres) || 0, digits);
