export interface FlashSector {
  start: number;
  size: number;
}

export interface ProtectedRange {
  start: number;
  end: number;
  name: string;
}

export const APP_BASE_ADDRESS = 0x08000000;
export const TRANSFER_SIZE = 2048;

/** STM32F405 sector layout — matches odrive-wheel.html DfuSe logic. */
export const STM32F4_SECTORS: FlashSector[] = [
  { start: 0x08000000, size: 16 * 1024 }, // S0
  { start: 0x08004000, size: 16 * 1024 }, // S1 — FFB EEPROM (protected)
  { start: 0x08008000, size: 16 * 1024 }, // S2 — FFB EEPROM (protected)
  { start: 0x0800c000, size: 16 * 1024 }, // S3
  { start: 0x08010000, size: 64 * 1024 }, // S4
  { start: 0x08020000, size: 128 * 1024 }, // S5
  { start: 0x08040000, size: 128 * 1024 }, // S6
  { start: 0x08060000, size: 128 * 1024 }, // S7
  { start: 0x08080000, size: 128 * 1024 }, // S8
  { start: 0x080a0000, size: 128 * 1024 }, // S9
];

/** FFB emulated EEPROM — must not be erased or overwritten during DFU. */
export const PROTECTED_RANGES: ProtectedRange[] = [
  { start: 0x08004000, end: 0x0800c000, name: 'FFB EEPROM (S1+S2)' },
];

export function inProtected(addr: number): boolean {
  return PROTECTED_RANGES.some((range) => addr >= range.start && addr < range.end);
}

/** True when [chunkAddr, chunkEndAddr) overlaps any protected range. */
export function chunkOverlapsProtected(chunkAddr: number, chunkEndAddr: number): boolean {
  return PROTECTED_RANGES.some((range) => chunkAddr < range.end && chunkEndAddr > range.start);
}

export function sectorIndex(sector: FlashSector): number {
  return STM32F4_SECTORS.indexOf(sector);
}

export function sectorsForImage(byteLength: number): FlashSector[] {
  const endAddr = APP_BASE_ADDRESS + byteLength;
  return STM32F4_SECTORS.filter(
    (sector) => sector.start < endAddr && sector.start + sector.size > APP_BASE_ADDRESS,
  );
}
