/** MKS XDrive Mini / Odrive-Wheel GPIO instances (firmware gpio_inputs.cpp). GPIO 5 is not exposed. */
export const GPIO_ANALOG_CHANNELS = [1, 2, 3, 4] as const;
export const GPIO_CHANNELS = [1, 2, 3, 4, 6] as const;
export type GpioChannelId = (typeof GPIO_CHANNELS)[number];

const MCU_PINS: Record<GpioChannelId, string> = {
  1: 'PA0',
  2: 'PA1',
  3: 'PA2',
  4: 'PA3',
  6: 'PB2',
};

export function isGpioChannelId(value: number): value is GpioChannelId {
  return (GPIO_CHANNELS as readonly number[]).includes(value);
}

export function gpioIsAnalog(gpio: number): boolean {
  return (GPIO_ANALOG_CHANNELS as readonly number[]).includes(gpio);
}

export function gpioMcuPin(gpio: number): string {
  return isGpioChannelId(gpio) ? MCU_PINS[gpio] : `GPIO${gpio}`;
}
