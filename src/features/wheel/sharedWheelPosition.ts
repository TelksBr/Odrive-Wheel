/** Latest wheel angle from a live poller (dashboard / observe) for the chrome logo. */
export const sharedWheelPosition: { deg: number | null } = { deg: null };

export function publishWheelPosition(deg: number | null): void {
  sharedWheelPosition.deg = deg;
}
