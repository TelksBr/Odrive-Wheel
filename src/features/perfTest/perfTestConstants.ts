export const PT_BLOCK = { cf: 1, sp: 2, da: 3 } as const;
export const PT_TYPE = { cf: 1, sp: 8, da: 9 } as const;

export const PT_DEFAULT_RANGE_DEG = 900;
export const PT_CENTER_TOLERANCE_DEG = 5;
export const PT_EXTREME_TOLERANCE_DEG = 10;
export const PT_STABLE_SAMPLES = 100;
export const PT_REACH_FRACTION = 0.80;
export const PT_STABILIZE_MS = 2000;
export const PT_PHASE_TIMEOUT_MS = 10000;
export const PT_LAUNCH_TIMEOUT_MS = 5000;

export const PT_BREAKAWAY_DEG_THRESHOLD = 3.0;
export const PT_BREAKAWAY_STEP_PCT = 1;
export const PT_BREAKAWAY_STEP_MS = 200;
export const PT_BREAKAWAY_MAX_PCT = 30;

export const PT_IQ_POLL_MS = 50;
export const PT_IQ_SAT_FRACTION = 0.95;

export const PT_DEFAULT_MAXTORQUE_NM = 5.0;
export const PT_DEFAULT_FXRATIO = 0.80;
export const PT_DEFAULT_CURRENT_LIM_A = 25.0;
