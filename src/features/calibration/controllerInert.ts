/** @deprecated Import from ../config/fieldEditState — kept for existing imports. */
export {
  CONTROLLER_INERT_IN_TORQUE,
  CONTROLLER_PARTIAL_IN_TORQUE,
  getFieldEditState,
  isFieldInert,
  isFieldPartial,
  isTorqueControlMode,
  type FieldEditState,
} from '../config/fieldEditState';

import { getFieldEditState, isTorqueControlMode } from '../config/fieldEditState';

/** @deprecated Use isFieldInert(path, values) with full field values for flag-aware logic. */
export function isFieldInertInTorque(path: string, controlMode: string | undefined): boolean {
  if (!isTorqueControlMode(controlMode)) {
    return false;
  }
  return getFieldEditState(path, { 'axis0.controller.config.control_mode': controlMode ?? '' }) === 'inert';
}

/** @deprecated Use isFieldPartial(path, values). */
export function isFieldPartialInTorque(path: string, controlMode: string | undefined): boolean {
  if (!isTorqueControlMode(controlMode)) {
    return false;
  }
  return getFieldEditState(path, { 'axis0.controller.config.control_mode': controlMode ?? '' }) === 'partial';
}
