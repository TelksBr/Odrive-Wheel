import type { Locale } from '../messages';

const groupMeta: Record<string, Record<Locale, { title: string; description: string }>> = {
  psu: {
    pt: { title: 'PSU / Freio', description: 'Limites de alimentação e resistor de freio do ODrive.' },
    en: { title: 'PSU / Brake', description: 'Power supply and brake resistor limits from the ODrive config.' },
  },
  axis: {
    pt: { title: 'Eixo 0', description: 'Estado do eixo, boot e comportamento em closed loop.' },
    en: { title: 'Axis 0', description: 'Axis state, startup behavior, and closed-loop defaults.' },
  },
  motor: {
    pt: { title: 'Motor', description: 'Calibração, constante de torque e limites de corrente.' },
    en: { title: 'Motor', description: 'Motor calibration, torque constant, and current limits.' },
  },
  encoder: {
    pt: { title: 'Encoder', description: 'Modo, CPR, direção e flags de calibração.' },
    en: { title: 'Encoder', description: 'Encoder mode, CPR, direction, and calibration flags.' },
  },
  controller: {
    pt: { title: 'Controlador', description: 'Modo de controle e parâmetros de torque para FFB.' },
    en: { title: 'Controller', description: 'Controller mode and torque-mode parameters for FFB operation.' },
  },
  'motor-thermistor': {
    pt: { title: 'Termistor motor', description: 'Monitoramento NTC offboard e coeficientes do polinômio.' },
    en: { title: 'Motor thermistor', description: 'Offboard NTC monitoring and polynomial coefficients.' },
  },
  'ffb-wheel': {
    pt: { title: 'Volante FFB', description: 'Parâmetros OpenFFBoard do volante persistidos com sys.save.' },
    en: { title: 'FFB Wheel', description: 'OpenFFBoard-style wheel parameters persisted by sys.save.' },
  },
  'ffb-effects': {
    pt: { title: 'Efeitos FFB', description: 'Ganhos master e por efeito do EffectsCalculator.' },
    en: { title: 'FFB Effects', description: 'Master and per-effect gains from the EffectsCalculator.' },
  },
  'ffb-filters': {
    pt: { title: 'Filtros FFB', description: 'Parâmetros de filtro passa-baixa biquad por tipo de efeito.' },
    en: { title: 'FFB Filters', description: 'Biquad low-pass filter parameters exposed by EffectsCalculator.' },
  },
  inputs: {
    pt: { title: 'Entradas', description: 'GPIOs configuráveis como botão, eixo analógico ou zerar volante.' },
    en: { title: 'Inputs', description: 'GPIO joystick inputs exposed as buttons, analog axes, or zero-wheel trigger.' },
  },
  system: {
    pt: { title: 'Sistema', description: 'Identidade da placa e parâmetro configurável de sistema.' },
    en: { title: 'System', description: 'Board identity and one configurable system parameter.' },
  },
  live: {
    pt: { title: 'Telemetria ao vivo', description: 'Valores somente leitura para painéis de observação.' },
    en: { title: 'Live telemetry', description: 'Read-only runtime values for observe panels.' },
  },
};

export function translateGroupTitle(locale: Locale, groupId: string, fallback: string): string {
  return groupMeta[groupId]?.[locale]?.title ?? fallback;
}

export function translateGroupDescription(locale: Locale, groupId: string, fallback: string): string {
  return groupMeta[groupId]?.[locale]?.description ?? fallback;
}
