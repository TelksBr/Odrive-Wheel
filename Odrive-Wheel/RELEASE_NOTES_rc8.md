# v1.0.0-rc8 — Performance Test, brake resistor power, dual end-stop

> Iteração focada em medição real do volante e em melhorias de controle do batente eletrônico.

## ✨ Highlights

- [x] 📊 **Performance Test tab** — mede pico de RPM, aceleração angular máxima, friction breakaway, inércia (J) e saturação do motor, usando HID input reports a ~1 kHz durante um launch controlado
- [x] 🔥 **Brake resistor power calculation** no overlay — calcula potência média dissipada (`P = R · ⟨I²⟩`) sobre janela de 60 s, com modo exclusivo 25 ms pra evitar dessync CDC
- [x] 🛑 **End-stop eletrônico dividido em mola + damper** — novos parâmetros independentes `axis.esgain` e `axis.esdamp` eliminam ricochete sem travar o volante
- [x] 🎛️ Defaults do `Controller` ajustados para robustez de anticogging em motores pesados (inertes em TORQUE mode)
- [x] 🎨 Refinamentos do tool: logo embutida no header, busca movida pra sidebar, fontes ~20% menores, console redesenhado, label/path separados na SCHEMA

---

## 📊 1. Performance Test

Tab nova dedicada a medir performance real do conjunto motor + volante sob drive HID FFB. Roda uma sequência de 6 fases:

1. **Centering** — leva o volante pra 0° via PID position
2. **Friction probe** — rampa de torque crescente até começar a mexer → captura `friction breakaway`
3. **Push to limit** — força constante negativa empurrando até o batente
4. **Stabilize** — para no batente pra ter referência de posição final
5. **LAUNCH** — força total no sentido oposto, captura posição a ~1 kHz via HID input reports + Iq via Web Serial ASCII
6. **Return to center** — desliga FFB e volta com PID

### Resultados extraídos

- [x] **Peak RPM** (módulo) e timestamp
- [x] **Peak angular acceleration** — 2ª derivada da posição com pipeline mediana + MA calibrado contra RFR Wheel
- [x] **Friction breakaway** em N·m (estimado pelo `maxtorque × fxratio × duty` no momento do break)
- [x] **Inércia (J)** em kg·m² e em unidades ODrive (Nm/(turn/s²)) — `J = T / α`
- [x] **Motor saturation flag** — detecta se `Iq ≥ 95% × current_lim` em qualquer momento do launch
- [x] **End-stop reach time** (tempo até 80% do range)
- [x] **CSV export** com posição, velocidade e aceleração em cada amostra

### Filtragem da aceleração

A derivada dupla de posição HID amplifica jitter de timestamp e quantização do encoder. Pipeline atual:

```
posição:    Mediana-5 → MA-11                  (mata quantização + suaviza jitter)
velocidade: diff central ±4ms                  (sem suavização adicional)
aceleração: diff central ±4ms → Mediana-7      (mata spikes 1-3 amostras, preserva pulso real)
```

Latência equivalente ~10 ms, próxima dos 7.9 ms reportados pelo RFR Wheel. Pico de aceleração é detectado apenas onde `v × a > 0` (velocidade crescendo), filtrando a desaceleração violenta contra o batente.

### Restrição

⚠️ **Deve ser rodado com o volante físico montado.** O resultado reflete a inércia + atrito do conjunto real, não do motor isolado.

📝 Arquivo: `Odrive-Wheel/tools/odrive-wheel.html` (funções `ptRunSequence`, `_ptComputeResults`, `_ptDrawChart`)

---

## 🔥 2. Brake resistor average power

O overlay agora calcula e exibe a **potência média dissipada no resistor de frenagem** ao longo de uma janela móvel de 60 s. Útil pra dimensionar resistor e fonte em sessões longas.

### Cálculo

```
P_avg = R_brake × ⟨I_brake²⟩      (média quadrática em 60 s)
```

R_brake vem do `config.brake_resistance` lido do ODrive. Cada amostra de `brake_resistor_current` é elevada ao quadrado antes de entrar no buffer rolante, depois a média é multiplicada por R.

### Modo exclusivo

A leitura única-tagueada do `brake_resistor_current` colidia com o poll geral do overlay (vbus / ibus / Iq) — chegava ocasionalmente um valor de 24 V interpretado como 24 A, explodindo P pra >10 kW.

Solução: quando o cálculo de potência está ativo, o overlay entra em **modo exclusivo**:

- [x] Para o poll multi-sinal padrão
- [x] Lê APENAS `brake_resistor_current` a cada **25 ms** (rate alta porque é um único request/reply)
- [x] Quando desligado, restaura o poll normal (mínimo 50 ms)

📝 Funções: `_ovlUpdateBrakePower`, `_ovlStartBrakePowerFastPoll`, `_ovlStopBrakePowerFastPoll`

---

## 🛑 3. End-stop eletrônico: mola + damper independentes

### Problema

Em rc7 o batente eletrônico era só uma mola (`axis.esgain`). Mola muito firme = ricochete; mola suave = volante atravessa o batente lentamente. Não tinha como dosar.

### Solução

Endstop agora soma duas componentes independentes na região de overshoot (`|pos| > range/2`):

```c
F_spring = -overshoot_deg × esgain × 25.0     // mola (compat OpenFFBoard)
F_damper = -speed          × esdamp ×  1.0    // amortecedor proporcional à velocidade
F_total  = clamp(F_spring + F_damper, ±32767)
```

| Parâmetro | Função | Default |
|---|---|---|
| `axis.esgain` | Força da mola na região overshoot | 0 (off) |
| `axis.esdamp` | Amortecimento, INDEPENDENTE da mola | 15 (leve) |

Combinações típicas:
- **Mola firme + damper leve** → batente "duro" com resposta tátil
- **Mola leve + damper forte** → batente "macio" que absorve impacto
- **Damper 100 +** → satura a partir de ~330°/s — uso só pra carros de simulação extrema

### Storage backwards-compatible

`ADR_AXIS1_ENC_RATIO` (16 bits) empacota:
- low byte = `esgain`
- high byte = `esdamp`

Firmware antigo gravava só o low byte (high byte = 0). Ao ler, se high byte = 0 o firmware assume formato antigo e preserva o default inicial de `esdamp = 15`. NVM existente continua compatível.

📝 Arquivos: `Odrive-Wheel/src/ffb_task.cpp`, `Odrive-Wheel/src/cmd_table.cpp`

---

## 🎛️ 4. Controller defaults bumped

`Controller::Config_t` (em `ODrive-fw-v0.5.6/.../MotorControl/controller.hpp`):

| Campo | Stock ODrive | Odrive-Wheel rc8 |
|---|---|---|
| `pos_gain` | 20.0 | **100.0** |
| `vel_gain` | 1/6 ≈ 0.1667 | **0.566** |
| `vel_integrator_gain` | 2/6 ≈ 0.333 | **1.33** |

> ⚠️ **Inertes em TORQUE mode.** Só afetam **anticogging calibration** (que força POSITION_CONTROL temporariamente). Necessário pra fazer a cal funcionar com motores pesados como o MKS Mini.

---

## 🎨 5. Refinamentos do tool

- [x] **Logo embutida** (data URI base64) no header e como ícone PWA — sem dependência de arquivo externo
- [x] **Busca movida do header pra sidebar** — fica logo abaixo do logo, sempre visível
- [x] **Fontes ~20% menores** em todo o tool — mais conteúdo cabe na viewport
- [x] **Console redesenhado** — picker de console, auto-scroll com pause-on-hover, dropdown de filtros
- [x] **PSU/RBrake** — renomeada a tab "ODrive" pra refletir que mostra parâmetros do estágio de potência
- [x] **Overlay sempre dark + compacto** — removidas opções de tema e tamanho (480 × 400 fixo)
- [x] **SCHEMA label/path desacoplados** — fields aceitam segundo argumento opcional de displayName, permitindo editar rótulo no HTML sem quebrar o path

---

## 📦 Upgrade

- [x] NVM do rc7 é **forward-compatible** — não precisa erase config
- [x] `esdamp` será inicializado em 15 (default leve) ao primeiro boot
- [x] Após flash, hard refresh do HTML (Ctrl+Shift+R) pra carregar Performance Test + brake power UI
- [x] Performance Test exige **volante físico montado** — sem isso o resultado de inércia é só do rotor

## 🔗 Compare

[`v1.0.0-rc7...v1.0.0-rc8`](../../compare/v1.0.0-rc7...v1.0.0-rc8)

---

🤖 Co-authored with Claude Code
