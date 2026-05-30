# v1.0.0-rc10 — Motor thermistor, GPIO 6, max torque helper, Quick Start polish

> Iteração focada em monitoramento térmico do motor, expansão do suporte a GPIOs, melhor visibilidade dos limites físicos do motor no tool e proteção contra edição acidental de campos calibrados.

## ✨ Highlights

- [x] 🌡️ **Suporte completo a termistor NTC do motor** (offboard) — UI dedicada na aba Motor + calculator de coeficientes com modal próprio + diagrama de fiação + suporte a Vref de 3.3V ou 5V
- [x] ⚡ **Helper de Maximum torque** na aba FFB Wheel — mostra o limite físico real do motor (current_lim × Kt) e avisa em vermelho se `axis.maxtorque` está acima
- [x] 🔌 **GPIO 6 como botão** disponível nos Inputs (PB2 do STM32, digital only)
- [x] 🚀 **Quick Start mais claro**: passo 8 com descrição correta + alerta pra centralizar o volante; passo 9 desativa limites de velocidade automaticamente
- [x] 🛡️ **Campos calibrados read-only** com badge "RO" — não dá mais pra quebrar a calibração editando manualmente
- [x] 🎛️ Spinout detection mais tolerante pra sim racing (50/-50 W)

---

## 🌡️ 1. Termistor NTC do motor — suporte completo

ODrive 0.5.6 já tinha suporte nativo a termistor NTC offboard, mas nossa UI não expunha. Esta release implementa a stack inteira:

### Schema (aba Motor)

Duas seções novas:

**Termistor FET (onboard)** — sensor de temperatura do gate driver, já habilitado por default:
- `enabled` (bool)
- `temp_limit_lower` / `temp_limit_upper` (°C)

**Termistor do motor (NTC offboard)** — sensor externo conectado num GPIO ANALOG_IN:
- `enabled` (bool)
- `gpio_pin` (int — qual GPIO usar)
- `temp_limit_lower` / `temp_limit_upper` (°C)
- `poly_coefficient_0..3` (coeficientes do polinômio T(V))

Os limits de temperatura aplicam **current derating progressivo**: T < lower → current_lim normal. lower < T < upper → current_lim cai linearmente. T ≥ upper → erro + desarma.

### Calculator de coeficientes

Botão **🧮 Calcular coeficientes…** ao lado de `poly_coefficient_0` abre um modal:

```
β (beta):         3950
R @ 25°C (Ω):     10000
Pull-up (Ω):      10000
V referência:     3.3   (ou 5)
Range Tmin (°C):  10
Range Tmax (°C):  130

→ Coeficientes gerados (c0..c3, na ordem do ODrive)
→ Tabela de verificação com V_pino físico previsto pra 5 temperaturas
→ Erro RMS do ajuste
```

Math interno:
- Modelo Steinhart simplificado: `R(T) = R₀ · exp(β · (1/T − 1/T₀))`
- Divisor de tensão: `V_pin = Vref × R_NTC / (R_pullup + R_NTC)`
- Normalização por **3.3V VDDA** (o ADC do STM32 sempre referencia 3.3V, independente do Vref escolhido pro pull-up)
- Regressão polinomial de 3ª ordem por mínimos quadrados (normal equations + eliminação de Gauss)
- Coeficientes escritos na ordem do ODrive (`poly_coefficient_0` = maior ordem, igual ao numpy.polyfit)

### Diagrama de fiação visual

Banner com ASCII art mostrando o circuito + dicas sobre pull-up externo:

```
    3.3V
      │
   ┌──┴──┐
   │ 10k │  ← pull-up EXTERNO (obrigatório)
   └──┬──┘
      │
      ├──► GPIO (ANALOG_IN, no ADC)
      │
   ┌──┴──┐
   │ NTC │
   └──┬──┘
     GND
```

⚠️ **Importante:** STM32F405 desabilita pulls internos automaticamente em modo ANALOG_IN. Pull-up tem que ser **externo**. Setups documentados:
- **3.3V + 10kΩ pull-up** (padrão, swing 1.44V)
- **5V + 47kΩ pull-up** (mais swing — 2.5V — pra resolução melhor; pull-up menor que 47k com 5V queima o ADC em temperatura baixa)

### Modo "Thermistor" na aba Inputs (atalho)

Pra evitar usuário ter que pular entre Inputs e Motor:
- Cada card GPIO (1-4, ADC-capable) ganha 4° opção: **Thermistor (NTC)**
- Selecionar → tool escreve `motor_thermistor.gpio_pin = N`, `enabled = True`, `config.gpioN_mode = ANALOG_IN` automaticamente
- Aba muda pra **Motor** e scroll vai pra seção do termistor pra ajustar coeficientes
- Detecção automática no Read All: se o motor_thermistor já está configurado, o card do GPIO correto aparece marcado como Thermistor

### Bug do firmware corrigido

`gpio_inputs.cpp`: quando o GPIO estava no modo DISABLED do nosso sistema de inputs, ele forçava o pino pra `GPIO_MODE_INPUT` (digital), sobrescrevendo qualquer config de ANALOG_IN do ODrive. Isso quebrava o termistor — ADC ficava lendo através do input buffer digital → polinômio recebia valor errado.

Fix: modo DISABLED agora **não toca no pino** — preserva o que ODrive setou via `config.gpioN_mode`. Comportamento safe se nada antes configurou (default analog hi-Z no STM32).

---

## ⚡ 2. Helper de "Maximum torque" na aba FFB Wheel

Logo abaixo do campo `axis.maxtorque`, novo banner que mostra:

```
✓ Limite físico: 20.00 A × 0.870 Nm/A = 17.40 Nm
  Máximo efetivo: 17.40 Nm
  axis.maxtorque ≤ limite efetivo — OK              [VERDE]
```

Quando `torque_lim` está ativo, mostra os 2 caps:
```
Limite físico: 20.00 A × 0.870 Nm/A = 17.40 Nm · torque_lim: 10.00 Nm
Máximo efetivo: 10.00 Nm
```

Quando user seta `axis.maxtorque` acima do limite físico:
```
⚠ Limite físico: 20.00 A × 0.870 Nm/A = 17.40 Nm
  Máximo efetivo: 17.40 Nm
  axis.maxtorque (25.0 Nm) > limite efetivo (17.4 Nm) —
  efeitos FFB acima de 17.4 Nm vão saturar fisicamente,
  e o jogo calibra pra força que o motor não consegue
  entregar. Reduza axis.maxtorque ou aumente current_lim.    [VERMELHO]
```

Atualiza em **tempo real** quando o usuário muda qualquer um dos 4 fields (`axis.maxtorque`, `current_lim`, `torque_constant`, `torque_lim`) e ao clicar Read All.

Útil porque o consenso entre maxtorque do FFB e capacidade física do motor é **a config mais errada** dos usuários — pico de torque entregue não muda, mas efeitos saturam precocemente, resolução HID é desperdiçada, e jogo calibra errado.

---

## 🔌 3. GPIO 6 como botão

A MKS XDrive Mini expõe GPIO 6 (PB2) no header externo. Agora aparece nos cards da aba **Inputs**, mas com restrição visual:

- Modes disponíveis: `Off`, `Button` (sem `Axis` nem `Thermistor` porque PB2 não tem canal ADC no STM32F405)
- Label do pino: "PB2 (digital only)" pra deixar claro
- Subtitle da aba atualizada: "GPIOs 1-4 e 6"

Firmware refatorado pra suportar mapping descontínuo: instances ASCII 1, 2, 3, 4, **6** → índices internos 0, 1, 2, 3, **4**. Instance 5 retorna inválido (PC4 não exposto no header MKS).

`GPIO_INPUTS_COUNT` bumped de 4 → 5. EEPROM addresses adicionados pra GPIO 6 (`ADR_GPIO6_CFG/_AMIN/_AMAX`). Set_mode rejeita `AXIS` em pinos sem ADC.

---

## 🚀 4. Quick Start mais claro

### Passo 8 (encoder calibration)

**Antes:** "Motor gira ~10 voltas"
**Depois:** "Motor gira ~1 volta (suave)" — descrição correta + aviso prominente pra **centralizar o volante mecanicamente ANTES** de iniciar:

> ⚠ ANTES de iniciar: posicione o volante PERFEITAMENTE NO CENTRO mecânico (lock-to-lock midpoint). Esse passo gira o motor ~1 volta — se o volante estiver fora do centro, a calibração pode bater no batente físico e falhar; e a posição "zero" resultante do encoder ficará deslocada do centro real.

### Passo 9 (mark pre-calibrated + startup flags)

Agora também **desativa automaticamente** os 3 flags de limite de velocidade:
- `enable_vel_limit = False`
- `enable_overspeed_error = False`
- `enable_torque_mode_vel_limit = False`

Era queixa comum: terminava o setup, girava o volante pra testar e batia `ERROR_OVERSPEED` (motor desarmava porque cruzou os 5 turn/s = 300 RPM do default). Usuário novo não sabia o que fazer.

Descrição atualizada explica que esses flags estão off pra primeiro setup e que o usuário pode reativar/ajustar na aba Controller quando o conjunto estiver estável.

---

## 🛡️ 5. Campos calibrados read-only

Cinco campos agora aparecem com badge laranja "RO" na UI + input desabilitado + sem botão `✓` de gravar:

- `axis0.motor.config.phase_resistance` (medido por motor cal)
- `axis0.motor.config.phase_inductance` (medido por motor cal)
- `axis0.encoder.config.direction` (calibrado por motor cal — inverter sentido aqui = inverter FOC, motor oscila)
- `axis0.encoder.config.phase_offset` (calibrado por encoder offset cal)
- `axis0.encoder.config.phase_offset_float` (idem)

Editar esses campos quebrava **silenciosamente** a calibração — Park transform com ângulo errado, PI de corrente com gains errados, etc. Usuário não sabia o que estava acontecendo. Agora protegido.

Pra inverter o sentido do volante do ponto de vista do usuário/jogo, usa `axis.invert` (aba FFB Wheel) — NÃO `encoder.direction`.

JSON export/import continua funcionando pra esses campos (pra clonagem de config entre placas idênticas), só edição manual no UI fica bloqueada.

---

## 🎛️ 6. Spinout detection mais tolerante

`controller.hpp` defaults atualizados pra sim racing:

| Campo | Stock ODrive | Odrive-Wheel rc10 |
|---|---|---|
| `mechanical_power_bandwidth` | 20 rad/s | **20 rad/s** (mantido) |
| `electrical_power_bandwidth` | 20 rad/s | **20 rad/s** (mantido) |
| `spinout_electrical_power_threshold` | 10 W | **50 W** |
| `spinout_mechanical_power_threshold` | -10 W | **-50 W** |

Picos legítimos de power em sim racing (counter-torque com MAIRA, batente eletrônico, kicks fortes de FFB) disparavam falso positivo com thresholds stock. 5× mais tolerante mantém a proteção contra spinout real (perda de calibração FOC) mas absorve transientes normais.

⚠️ Os defaults só entram em NVM nova ou após `se` (erase config). Quem já tem placa configurada mantém os valores antigos até setar manualmente (ou erase).

---

## 📦 Upgrade

- [x] **NVM forward-compatible** — todos os campos novos (motor_thermistor configs, GPIO 6 EE addresses) defaultam pra valores seguros
- [x] Sem necessidade de erase config
- [x] Após flash, hard-refresh do HTML (Ctrl+Shift+R) pra carregar nova UI
- [x] Pra usar termistor: requer cabling externo (pull-up + NTC) num GPIO 1-4 (com ADC), configura via aba Inputs → Thermistor ou aba Motor diretamente

## 🔗 Compare

[`v1.0.0-rc9...v1.0.0-rc10`](../../compare/v1.0.0-rc9...v1.0.0-rc10)

---

🤖 Co-authored with Claude Code
