# v1.0.0-rc9 — Current control deadband, Quick Start UX, JSON import robustness

> Iteração focada em eliminar vibração de idle no controle de corrente do motor e robustecer o fluxo de import/export do tool.

## ✨ Highlights

- [x] 🔇 **`current_control_deadband`** no FOC — zona morta no erro do PI elimina vibração de idle (PI parava de perseguir ruído de ADC/encoder), default 100 mA
- [x] 🚀 **Quick Start UX**: passo 8 com descrição correta de 1 volta (era "~10 voltas") + passo 9 agora desativa limites de velocidade automaticamente pra evitar ERROR_OVERSPEED no primeiro setup
- [x] 🛡️ **JSON import robusto**: fix de dessync de fila quando o JSON contém paths readonly, lista explícita de paths readonly skipados, fix do bug "segundo import não funciona"
- [x] ⏳ **Progress toast** com barra de progresso durante apply de imports com muitos campos

---

## 🔇 1. Current control deadband — fim da vibração de idle

### Problema

Mesmo com `Iq_setpoint = 0` (nenhum torque comandado), o motor continuava emitindo um zumbido fino e vibração tátil perceptível no volante. Análise mostrou que o PI de corrente estava perseguindo:

- **Quantização do ADC** de corrente (~10 mA de LSB)
- **Quantização do encoder** causando cross-coupling Id↔Iq pela rotação imperfeita do Park transform
- **Ruído de chaveamento** dos MOSFETs amostrado pelo ADC

A cada ciclo de PWM (~125 µs), o PI gerava micro-pulsos de tensão pra "corrigir" esses ruídos, produzindo corrente AC residual nas fases que vira torque ripple audível e tátil.

### Solução

Zona morta sobre o erro do PI (não sobre a medição, não sobre o setpoint — sobre o **erro**):

```c
// foc.cpp, dentro do PI loop a 8 kHz
float Ierr_d = Id_setpoint - Id_measured;
float Ierr_q = Iq_setpoint - Iq_measured;
if (current_control_deadband_ > 0.0f) {
    if (std::abs(Ierr_d) < current_control_deadband_) Ierr_d = 0.0f;
    if (std::abs(Ierr_q) < current_control_deadband_) Ierr_q = 0.0f;
}
// resto do PI usa Ierr_d/Ierr_q (zerado se dentro da banda)
// integrador também congela porque integral += Ierr × Ki × dt = 0
```

Comportamento:
- **Dentro da banda** (idle, ruído puro) → P = 0, integrador congela → PI dorme → motor para de vibrar
- **Fora da banda** (comando real do FFB) → bit-idêntico ao stock — zero impacto na resposta dinâmica
- Quando `|Ierr|` cresce acima do limite (FFB chega), resposta é instantânea — sem efeito "snap"

### API

```
axis0.motor.config.current_control_deadband [A]
```

| Valor | Comportamento |
|---|---|
| `0` | Desativado (stock ODrive) |
| `0.02` (20 mA) | Conservador — incerteza estática de ~1 mNm |
| **`0.1` (100 mA, default rc9)** | Tuned para noise floor típico do MKS XDrive Mini |
| `0.2` (200 mA) | Agressivo — comandos pequenos do FFB começam a ser ignorados |

Incerteza de torque estático introduzida ≈ `deadband × torque_constant`. Pra `torque_constant = 0.05 Nm/A` e deadband 100 mA → ±5 mNm de incerteza. Imperceptível num volante que opera com picos de 3-5 Nm.

### Configuração

Novo campo na **aba Motor** do tool, com tooltips PT/EN explicando o trade-off:

```
axis0.motor.config.current_control_deadband
[0–0.5 A (0.02–0.20 típico)]      Float
```

Persistente em NVM (forward-compatible — flashes antigos leem 0, comportamento idêntico ao stock até usuário ativar).

### Arquivos modificados

- `ODrive-fw-v0.5.6/.../MotorControl/foc.hpp` — novo campo `current_control_deadband_` em `FieldOrientedController`
- `ODrive-fw-v0.5.6/.../MotorControl/motor.hpp` — novo campo + setter custom que propaga pro FOC
- `ODrive-fw-v0.5.6/.../MotorControl/motor.cpp::update_current_controller_gains()` — propaga valor
- `ODrive-fw-v0.5.6/.../MotorControl/foc.cpp` — aplica deadband nas linhas 135-142
- `ODrive-fw-v0.5.6/.../odrive-interface.yaml` — expõe propriedade ASCII (regenera autogen no build)

---

## 🚀 2. Quick Start UX

### Passo 8 — descrição da cal de encoder

**Antes:** "Motor gira ~10 voltas" — confundia usuários porque na prática gira ~1 volta dependendo da config de lockin.

**Depois:** "Motor gira ~1 volta (suave)" tanto em PT quanto em EN.

### Passo 9 — desativação automática de limites de velocidade

Quando o usuário termina o setup e gira o volante manualmente pra testar (sem o jogo conectado), com frequência batia `ERROR_OVERSPEED` em `axis0.controller.config.vel_limit` (default 5 turn/s = 300 RPM) e o motor desarmava. Causa confusão pra usuário novo que ainda não conhece o sistema.

Passo 9 agora também escreve:
```
axis0.controller.config.enable_vel_limit             = False
axis0.controller.config.enable_overspeed_error       = False
axis0.controller.config.enable_torque_mode_vel_limit = False
```

Descrição atualizada (PT/EN) explica que esses flags estão desligados pra primeiro setup e que o usuário deve reativar manualmente na aba **Controller** quando o conjunto estiver estável e a velocidade máxima for conhecida.

---

## 🛡️ 3. JSON import robusto

### Bug 1 — Dessync de fila com paths readonly

**Sintoma:** ao importar JSON que continha `axis0.controller.config.anticogging.index` (readonly no firmware), o campo seguinte na sequência (ex: `axis.range`) aparecia com o valor literal "not implemented" em verde, como se fosse aceito.

**Causa raiz:** ODrive ASCII responde "not implemented" pra writes em propriedades readonly. A função `writeProp` enviava o write e **retornava imediatamente sem aguardar resposta**. A resposta tardia chegava enquanto o `readProp` do próximo campo já tinha pushado um pending na fila — `pendingReplies.shift()` resolvia o pending errado com "not implemented".

**Fix:** `writeProp` agora pusha um pending temporário com janela de **80 ms**. Se uma resposta chega nesse intervalo, é o erro do ODrive — é loggado e descartado. Se nenhuma resposta vem, assume sucesso e segue.

```js
async function writeProp(path, value) {
    // ... envia o write
    return new Promise((resolve) => {
        const entry = { resolve: null, timeout: null };
        entry.timeout = setTimeout(() => {
            // sem resposta = sucesso, remove pending da fila
            const idx = pendingReplies.indexOf(entry);
            if (idx >= 0) pendingReplies.splice(idx, 1);
            resolve(null);
        }, 80);
        entry.resolve = (line) => {
            clearTimeout(entry.timeout);
            logLine('write rejeitado: ' + cmd + ' → ' + line, 'err');
            resolve(line);
        };
        pendingReplies.push(entry);
    });
}
```

### Bug 2 — Paths readonly contaminando exports

JSONs exportados estavam incluindo `anticogging.index` (counter runtime) e `anticogging.calib_anticogging` (trigger, não estado persistente). Re-importar gerava writes inúteis e logs ruidosos.

**Fix:** lista explícita `READONLY_EXPORT_PATHS` filtrada em ambos export e import. Conservadora — apenas paths confirmadamente readonly no YAML do ODrive **e** presentes no nosso schema.

```js
const READONLY_EXPORT_PATHS = new Set([
    'axis0.controller.config.anticogging.index',
    'axis0.controller.config.anticogging.calib_anticogging',
]);
```

### Bug 3 — Segundo import "trava" silenciosamente

**Sintoma:** primeiro import funciona perfeito. Tentar importar de novo (mesmo arquivo ou diferente) abre o file picker mas nada acontece — nem log, nem toast, nem aplica nada.

**Causa raiz:** o evento `change` do `<input type="file">` só dispara quando o **value** muda. Selecionar o mesmo arquivo de novo não muda value → change não dispara. Bug clássico do HTML.

**Fix:** clear de `value = ''` em duas oportunidades:
1. Antes de `inp.click()` em `importJSON()` — garante que próxima seleção parte de estado vazio
2. Logo após consumir o arquivo no handler `onchange` — garante que próxima vez parte de estado vazio

Cobre todos os cenários (mesmo arquivo 2x, arquivo diferente, cancelar picker e retentar, drag-and-drop futuro).

---

## ⏳ 4. Progress toast pra operações longas

Imports com 100+ campos podiam demorar vários segundos. Sem feedback, usuário ficava achando que travou.

Novo sistema de toast persistente com barra de progresso:

```
┌─────────────────────────────────────────┐
│ ⏳ Aplicando configuração (47/120)      │
│    axis0.controller.config.pos_gain     │  ← path atual em monospace
│    ███████████████░░░░░░░░░░░░░░░░  39% │  ← barra azul anima suave
└─────────────────────────────────────────┘
```

API genérica reutilizável:

```js
toastSticky(id, msg, sub, pct, kind)   // cria/atualiza, identificado por id
toastStickyClose(id)                    // remove com fade-out
```

Chamadas subsequentes com mesmo `id` atualizam in-place (sem flicker). Cor da barra acompanha `kind` (`ok`/`err`/`warn`). Pronto pra ser usado em outras ops longas no futuro (save sequence, batch read, etc).

---

## 📦 Upgrade

- [x] **NVM forward-compatible** — `current_control_deadband` default 0.1 já vem ativo no firmware novo. Sem `erase config`. Antigos campos preservados
- [x] Após flash, **hard-refresh** do HTML tool (Ctrl+Shift+R) pra carregar o novo campo no schema da aba Motor
- [x] Se sua placa estava com `enable_vel_limit=true` (default antigo) e quer adotar o novo comportamento, rode o **Passo 9** do Quick Start novamente ou ajuste manualmente na aba Controller
- [x] JSONs antigos exportados antes do rc9 podem ter `anticogging.index` — agora são silenciosamente ignorados no import

## 🔗 Compare

[`v1.0.0-rc8...v1.0.0-rc9`](../../compare/v1.0.0-rc8...v1.0.0-rc9)

---

🤖 Co-authored with Claude Code
