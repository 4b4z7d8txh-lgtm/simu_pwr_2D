# PWR Startup Simulator — 2D

A browser game where you are the main control room operator of a 1100 MWe
pressurized water reactor, and your job is to take the unit from an **open,
defueled reactor vessel all the way to 100% power on the grid** — refueling,
water-solid pressurization, heatup, drawing the pressurizer steam bubble,
approach to criticality, turbine synchronization and the power ramp.

No build step, no dependencies, and the layout works on phones as well as
desktops. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000      # then open http://localhost:8000
```

## The game

Six phases, each with a live checklist (top-left). Time acceleration up to
900x for slow evolutions (a realistic ~27 °C/h heatup takes hours of plant
time); the game automatically slows down when the startup rate gets high.
Reactor trips cost points; clean operation earns them. Press **MANUAL** in
the header for the full written procedure (per-stage goals plus a "what drives
what" cheat sheet), **space** to pause, **SCRAM** when it all goes wrong.

### Operating modes

The header **MODE** button cycles how much the computer does for you. Panels
the computer is driving are locked and badged **⬡ AUTO** — you watch their
sliders and switches move as it adapts the plant:

- **Manual** — the full real simulation: you operate everything, tight real
  acceptance bands (155 bar ±3, Tavg ±5 °C), every protective trip armed, the
  full 5-minute steady-state hold.
- **Semi-Auto** (forgiving bands) — *you* run the **primary circuit**
  (reactivity, pressurizer, CVCS, reactor coolant pumps) while the **computer
  runs the secondary side**: steam dump, feedwater and the entire
  turbine-generator (latch, roll, sync, load). A gentle way to learn the
  reactor side without juggling the balance of plant. Replaces the old beginner
  level: wider bands, a softer pressurizer, relaxed trips and shorter holds.
- **Auto** — the computer takes the plant from an open vessel all the way to
  1100 MWe on its own, on the real plant. Accelerate time and watch; take over
  any time by switching back to Semi-Auto or Manual.

The autonomous operator uses the same proven control sequence as the
regression test, so a full hands-off startup reaches full power without
tripping (`node test/autopilot_test.js`).

The **P-T "chaussette" diagram** is pinned to the top of the right-hand column
so it stays visible while you scroll, and every control section below it
collapses (click its header) so you can hide the panels you don't need in the
current phase.

| Phase | What you do |
|---|---|
| 1. Refueling | Load the core, install the head, fill & vent the RCS |
| 2. Heatup | Pressurize water-solid, start RCPs, draw the bubble, heat to 155 bar / 291 °C along the P-T limit |
| 3. Criticality | Withdraw shutdown banks, dilute boron, go critical, stabilize at low power |
| 4. Power & turbine | Climb above 8%, control Tavg with steam dump, roll & sync the turbine, pick up 300 MWe |
| 5. Ramp | To 1100 MWe, keeping Tavg on program with rods and dilution |
| 6. Steady state | Hold full power within limits for 5 minutes |

### Controls (right-hand panels)

- **Reactivity**: control bank and shutdown banks (IN/HOLD/OUT), CVCS
  boration/dilution, trip reset
- **Pressurizer**: proportional + backup heaters, spray, PORV indication
- **CVCS**: charging and letdown flows (inventory, solid-plant pressure, boron transport)
- **RCPs**: 4 reactor coolant pumps (need ≥ 24 bar, trip on low pressure)
- **Secondary**: steam dump, feedwater
- **Turbine-generator**: latch & roll, sync breaker, load setpoint

## Physics model (simplified, but honest)

- Point kinetics with one delayed-neutron group (prompt-jump approximation)
  and a fixed source, so the subcritical 1/M count-rate behaviour, startup
  rate in dpm, and trip on 5 dpm are all real consequences of the model.
- Constants tuned against *La Chaudière des REP* (Framatome ANP, 2004):
  boron worth ~−10 pcm/ppm, Doppler ~−3 pcm/K, GMPP shaft power ~5.9 MW/pump
  (deposited into the primary as the heatup source — running 1–4 pumps sets a
  9–52 °C/h heatup rate under the 56 °C/h fatigue limit), Tavg programme rising
  from the no-load value to 306.5 °C by 60% load, trips on 118% flux / 169 bar /
  330 °C core outlet, saturation at 155 bar ≈ 345 °C.
- Reactivity = excess + boron worth + S-curve rod worth + moderator and
  Doppler feedback. The negative moderator coefficient makes the reactor
  naturally follow turbine steam demand, just like the real thing.
- Lumped thermal nodes: fuel, RCS coolant, SG secondary, pressurizer water,
  with saturation-curve water properties (Antoine equation).
- A live P-T "chaussette" diagram (after the French CPP temperature-pressure
  diagram) with the APR / AN-RIS-RA / AN-GV / RP operating domains, the
  plant's trail and operating point. Leaving the envelope raises the
  P-T ENV HIGH/LOW alarms and bleeds score.
- Pressurizer with two regimes: **water-solid** (pressure stiff against net
  volume/expansion changes — manage with charging and letdown) and **steam
  bubble** (pressure = saturation pressure of the pressurizer water —
  manage with heaters and spray). Level comes from inventory and thermal
  swell of the loops.
- Decay heat lag, P-T (brittle fracture) limit, subcooling margin, SG safety
  valves, PORV, RCP minimum-pressure interlocks, and a full annunciator with
  reactor trip logic.

What's deliberately left out (future ideas): xenon/samarium transients,
multi-loop asymmetry, RHR system, grid events, random malfunctions.

## Tests

A headless harness drives a scripted "operator" through the entire startup
(refueling → 1100 MWe, no trips) against the same physics code the game runs.
A second harness drives the same startup with the autonomous operator
(`js/autopilot.js`) in full-auto and semi-auto scope:

```
node test/sim_test.js
node test/autopilot_test.js
```

## Code layout

```
index.html             layout + operations manual
css/style.css          control-room theme
js/water.js            saturation curve, density, latent heat
js/simulation.js       the plant model (DOM-free, used by game and tests)
js/phases.js           phase objectives and progression
js/autopilot.js        autonomous operator (drives any subset of the controls)
js/diagram.js          2D canvas rendering of the plant
js/ptdiagram.js        live P-T "chaussette" diagram
js/panels.js           control panels, annunciator, indicators
js/main.js             game loop, time acceleration, mode selection
test/sim_test.js       full-startup regression test (scripted operator)
test/autopilot_test.js full-startup test driven by the autopilot
```
