# v1.0.0-rc11 — Zero Wheel via GPIO, persistência de centro, gráficos centrados no zero, DFU com fetch do GitHub

> Iteração focada em ergonomia operacional: agora dá pra zerar o volante por um botão físico, o offset sobrevive a reboots, todos os gráficos respeitam o zero como centro visual, o DFU consegue puxar a última release direto do GitHub e o calculator de termistor ficou mais robusto.

## ✨ Highlights

- [x] 🎯 **Zero Wheel via GPIO** — qualquer GPIO 1-4/6 pode virar "botão de zerar volante"; pressionar dispara `ffb_axis_zeroenc()` na borda
- [x] 💾 **Persistência do offset de centro** em flash (2 slots EE de float32) — sobrevive a reboots; sem precisar refazer encoder offset cal toda vez que ligar
- [x] 📊 **Gráficos com zero forçado no centro** pra sinais bidirecionais (torque, posição, Iq, Ibus) em todos os 5 gráficos do tool — para de "flutuar" conforme os dados
- [x] 🌐 **DFU "Fetch latest from GitHub"** — botão pega o .bin da última release sem precisar fazer download manual
- [x] 📖 **Banner explicativo no topo da aba Encoder** — clareia o que é calibração de offset elétrico vs. centro mecânico vs. idleSpring
- [x] ⚠️ **Aviso pra encoder incremental sem index Z** — explica que vai precisar recalibrar a cada boot, e como mitigar com Zero Wheel persistente
- [x] 🌡️ **Calculator NTC com 3 bugs matemáticos corrigidos** — divisor invertido, normalização por Vref em vez de VDDA, ordem dos coeficientes (numpy.polyfit convention)
- [x] 🐛 **Bug crítico de aceitação do modo Zero Wheel** — handler ASCII e sanity check do load rejeitavam `mode=3` silenciosamente

---

## 🎯 1. Zero Wheel via GPIO

Caso de uso: sim racers querem um botão físico no volante (ou no shifter) que zera a posição instantaneamente — útil quando o jogo perde o centro depois de force loops longos ou quando o encoder é incremental sem index Z e precisa recentralizar a cada sessão.

### Firmware (`gpio_inputs.h/cpp`)

Novo modo `GPIO_INPUT_ZEROWHEEL = 3` (junta-se a 0=DISABLED, 1=BUTTON, 2=AXIS).

```c
#define GPIO_INPUT_DISABLED   0
#define GPIO_INPUT_BUTTON     1
#define GPIO_INPUT_AXIS       2
#define GPIO_INPUT_ZEROWHEEL  3   // ← novo
```

Configuração de pino igual ao modo BUTTON: digital input com pull-up interno. Edge detection no `gpio_inputs_update_report()`:

```cpp
// Detecta high → low (botão pressionado contra GND)
static bool s_zerowheel_was_high[GPIO_INPUTS_COUNT] = {true, true, true, true, true};
...
case GPIO_INPUT_ZEROWHEEL: {
    bool pin_high = (HAL_GPIO_ReadPin(...) == GPIO_PIN_SET);
    if (cfg.invert) pin_high = !pin_high;
    if (s_zerowheel_was_high[i] && !pin_high) {
        ffb_axis_zeroenc();   // dispara zero do encoder virtual
    }
    s_zerowheel_was_high[i] = pin_high;
    break;
}
```

Aplica debounce natural via taxa de leitura (1 kHz do thread FFB) + a histerese de transição high→low evita repetir o zero enquanto o usuário segura o botão.

### UI (Inputs tab)

Novo valor 4 = "Zero Wheel" no dropdown de modo (UI 3 já era thermistor offboard, UI 4 ficou pro modo novo pra não quebrar o mapeamento antigo):

```
Off    (0 → fw 0)
Button (1 → fw 1)
Axis   (2 → fw 2)
Thermistor (3 → fw 0 + motor_thermistor.enabled=True)
Zero Wheel (4 → fw 3)
```

`uiToFw()` e `effectiveMode` no reload() fazem a tradução nos dois sentidos. Hint verde aparece sob o card quando o modo está selecionado, explicando o comportamento + lembrando de clicar **Salvar** pra persistir.

### Bug crítico (descoberto durante validação)

Tinha **dois sanity checks** que silenciosamente rejeitavam `mode=3`:

1. **`cmd_table.cpp:238`** — handler ASCII `h_gpio_mode` validava `val > 2` → comando `gpio.6.mode 3` retornava erro, o set nunca chegava em `gpio_inputs_set_mode`, o valor em RAM permanecia DISABLED.
2. **`gpio_inputs.cpp:137`** — sanity do load no boot rejeitava `m > GPIO_INPUT_AXIS` → mesmo se o save tivesse gravado 3, o boot voltava pra DISABLED.

Os dois checks foram escritos antes do modo ZEROWHEEL existir. Fix: trocar limite pra `GPIO_INPUT_ZEROWHEEL` nos dois sites.

---

## 💾 2. Persistência do offset de centro

ODrive faz encoder offset calibration (alinhamento elétrico polo-encoder) — não é centro mecânico. Quando o usuário usa o botão **"Zero wheel position"** na aba Encoder, o tool capturava o offset em RAM (`zeroOffset_`) mas perdia ao reiniciar.

Agora persiste em flash. Dois slots EE novos:

```c
#define ADR_AXIS1_ZEROOFS_LO    0x020B   // 16 LSB do float32
#define ADR_AXIS1_ZEROOFS_HI    0x020C   // 16 MSB do float32
```

Empacotamento via union float32↔uint32, sanity checks na carga (rejeita NaN/Inf), preserva 0.0f se EE virgem (ambos os slots = 0xFFFF).

Combinação com a feature acima é poderosa: mesmo num encoder incremental sem index Z, o usuário pode (1) ligar a placa, (2) posicionar manualmente o volante no centro, (3) pressionar o botão GPIO de Zero Wheel, (4) clicar Salvar. Da próxima vez que ligar, basta posicionar centralizado antes do encoder offset calibration — o offset salvo cuida do micro-ajuste de centro.

---

## 📊 3. Gráficos com zero forçado no centro

Antes, todos os gráficos do tool usavam auto-scale simétrico ao dataset (`min..max` do buffer). Pra sinais bidirecionais (torque pode ser ±, posição pode ser ±, corrente Iq pode ser ±), isso fazia o eixo "flutuar" — se o sinal varresse só pra um lado, o zero ficava no canto.

Pra todos os 5 gráficos do tool (Performance Test, FFB Test, Overview Bus, Overview Wheel, e o gráfico geral), os sinais bidirecionais agora têm escala **`±max(|min|, |max|)`** — zero permanece sempre no centro:

```js
const absMax = Math.max(Math.abs(yMin), Math.abs(yMax));
yMin = -absMax;
yMax = +absMax;
```

Sinais unidirecionais (Vbus que nunca é negativo, Ibrake que tá sempre positivo) continuam com auto-scale tradicional.

---

## 🌐 4. DFU — Fetch latest from GitHub

Antes só dava pra escolher um `.bin` local. Agora tem um botão "**📡 Fetch latest from GitHub**" que:

1. Hit em `https://api.github.com/repos/dnegris/Odrive-Wheel/releases/latest`
2. Lista os assets `.bin` da release
3. Faz download direto pra um `Blob` na memória
4. Pode flashar imediatamente sem passar por filesystem

Bug interessante encontrado e corrigido: usar `Accept: application/vnd.github+json` no header dispara CORS preflight que o GitHub não responde — `Failed to fetch`. Tirando o header customizado, GitHub atende a requisição como CORS simples.

---

## 📖 5. Aba Encoder — banner explicativo + aviso de incremental

Vários usuários confundiram **encoder offset calibration** (alinhamento elétrico fase-polo, que ODrive precisa pra fazer FOC) com **centro mecânico do volante** (onde o motorista percebe que está reto). São coisas diferentes:

- Encoder offset: alinha o campo elétrico do motor com o sinal do encoder. Não tem relação com onde a roda está "fisicamente reta".
- Centro mecânico: posição angular onde o volante deve estar quando o piloto não tá girando.

Banner azul no topo da aba explica os dois conceitos + linka mentalmente com idleSpring (que faz o volante voltar pro centro mecânico salvo).

Adicional: detecção de encoder incremental SEM index Z mostra alerta amarelo:
> "Você tá usando encoder incremental sem index Z. Significa que cada vez que ligar a placa, a posição absoluta do volante é desconhecida — o ODrive vai pedir uma volta completa pra recalibrar o offset elétrico, mas o centro mecânico vai estar em qualquer lugar."

Mitigação sugerida: usar Zero Wheel persistente (feature acima) + ligar sempre com o volante centralizado.

---

## 🌡️ 6. Calculator NTC — 3 bugs matemáticos corrigidos

Usuário reportou que os coeficientes gerados pelo calculator do rc10 não batiam com a temperatura real do motor. Investigação revelou **três bugs**:

### Bug A: divisor de tensão invertido

Estava: `V_pin = Vref × R_pullup / (R_pullup + R_NTC)` — errado, isso seria se o NTC estivesse pro lado do GND, mas o esquema oficial do ODrive coloca NTC entre o pino e GND, pull-up entre Vref e o pino.

Fix: `V_pin = Vref × R_NTC / (R_pullup + R_NTC)` (NTC no numerador).

### Bug B: normalização errada

O ADC do STM32 sempre referencia **VDDA = 3.3V**, independente da tensão de pull-up. Se o usuário escolhe Vref=5V, o pino pode chegar a 5V (proibido — fritaria o STM32), mas o ADC só enxerga até 3.3V. O ODrive lê `V_normalizada = V_pin / 3.3` (sempre 3.3, não Vref).

Fix: normalizar por 3.3V independente do Vref escolhido. Bonus: filtro de saturação no fit — pontos com V_pin > 3.3V são excluídos do least squares (preservados na tabela de preview pra que o usuário veja que tá saturando).

### Bug C: ordem dos coeficientes

ODrive usa convenção do numpy.polyfit: `poly_coefficient_0` = coeficiente de MAIOR ordem (x³), `poly_coefficient_3` = constante. Eu estava escrevendo na ordem oposta (matematicamente intuitiva: c0 = constante).

Fix: reverter a ordem antes de gravar. `poly_coefficient_0 ← c3`, `poly_coefficient_3 ← c0`.

Feedback do usuário no diagnóstico: *"voce devia ter verificado antes de sair fazendo"* — perfeitamente certo, devia ter olhado o código do `thermistor.cpp` do ODrive antes de implementar.

---

## 🔧 Outros ajustes

- **GPIO disabled preserva config do ODrive**: antes, mode=DISABLED forçava o pino pra digital input genérico, sobrescrevendo configs ANALOG_IN do ODrive. Agora é no-op (preserva o que ODrive configurou — necessário pro thermistor offboard funcionar mesmo com GPIO disabled na nossa tabela).
- **Cleanup do arquivo `odrive-wheel-visual.html`** — versão antiga obsoleta removida do repo.
- **JSON config sample (Hoverboard)** — atualizado pros novos thresholds de spinout (50/-50 W).

---

## 🐛 Bugs corrigidos

| # | Bug | Fix |
|---|---|---|
| 1 | Zero Wheel mode não persistia (ASCII handler rejeitava `val>2`) | `cmd_table.cpp:238` — limite passou pra `GPIO_INPUT_ZEROWHEEL` |
| 2 | Zero Wheel mode não persistia (load sanity rejeitava `m>AXIS`) | `gpio_inputs.cpp:137` — sanity passou pra `<= ZEROWHEEL` |
| 3 | Calculator NTC: divisor de tensão errado | NTC no numerador |
| 4 | Calculator NTC: normalização por Vref em vez de VDDA | Sempre /3.3V |
| 5 | Calculator NTC: ordem inversa dos coeficientes | numpy.polyfit convention (c0 = maior ordem) |
| 6 | DFU GitHub fetch: CORS preflight bloqueado | Remover header `Accept: application/vnd.github+json` |
| 7 | FFB Test chart não usava axis zero-centered | Aplicado o mesmo pattern dos outros 4 gráficos |

---

## 📁 Arquivos alterados

**Firmware:**
- `inc/eeprom_addresses.h` — slots `ADR_AXIS1_ZEROOFS_LO/HI`
- `inc/gpio_inputs.h` — `GPIO_INPUT_ZEROWHEEL = 3` + comentário
- `src/gpio_inputs.cpp` — modo ZEROWHEEL (apply_pin_mode, update_report edge detect, set_mode, read_raw) + load sanity fix
- `src/cmd_table.cpp` — ASCII handler aceita mode=3
- `src/ffb_task.cpp` — `zeroOffset_` movido pra public + load/save em 2 slots EE

**Tool:**
- `tools/odrive-wheel.html` — UI Zero Wheel mode, banner Encoder, aviso incremental sem Z, fix dos 3 bugs do calculator NTC, gráficos zero-centered (5 sites), botão DFU fetch GitHub
- `tools/odrive-wheel-visual.html` — removido (obsoleto)
- `tools/odrive_config_*-Hoverboard.json` — sample config atualizado

---

## 🚀 Como atualizar

1. Flashar `build/odrive-wheel.bin` da release rc11 via DFU (USB com botão BOOT0 pressionado, ou via novo botão "Fetch latest from GitHub" se já estiver no rc10).
2. Abrir `tools/odrive-wheel.html` no navegador.
3. Conectar via Web Serial.
4. (Opcional) Configurar GPIO 6 como Zero Wheel + ligar um momentary button entre o GPIO e GND.
5. (Opcional) Centralizar volante manualmente + pressionar o botão GPIO + clicar Salvar → centro mecânico persistido em flash.

---

## ⚠️ Notas / quebra de compatibilidade

- **Layout EE incrementado** indiretamente: dois slots novos foram alocados (`0x020B`, `0x020C`) e a constante `NB_OF_VAR` foi atualizada. EEs antigas continuam compatíveis (slots virgens = 0xFFFF, sanity preserva default 0.0f). Não é preciso bumpar `EE_LAYOUT_VERSION` — só foi adicionado, nada foi renumerado.
- **Modo UI 4 (Zero Wheel)** é novo. Configs JSON salvas em rc10 importadas em rc11 continuam OK porque rc10 nunca emitia esse valor.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
