# PWR Startup Simulator — 2D

A browser game where you are the main control room operator of a 1100 MWe
pressurized water reactor, and your job is to take the unit from an **open,
defueled reactor vessel all the way to 100% power on the grid** — refueling,
water-solid pressurization, heatup, drawing the pressurizer steam bubble,
approach to criticality, turbine synchronization and the power ramp.

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder:

```
python3 -m http.server 8000      # then open http://localhost:8000
```

## The game

Six phases, each with a live checklist (top-left). Time acceleration up to
900x for slow evolutions (a realistic ~27 °C/h heatup takes hours of plant
time); the game automatically slows down when the startup rate gets high.
Reactor trips cost points; clean operation earns them. Press **MANUAL** in
the header for the full written procedure, **space** to pause, **SCRAM**
when it all goes wrong.

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
- Reactivity = excess + boron worth + S-curve rod worth + moderator and
  Doppler feedback. The negative moderator coefficient makes the reactor
  naturally follow turbine steam demand, just like the real thing.
- Lumped thermal nodes: fuel, RCS coolant, SG secondary, pressurizer water,
  with saturation-curve water properties (Antoine equation).
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
(refueling → 1100 MWe, no trips) against the same physics code the game runs:

```
node test/sim_test.js
```

## Code layout

```
index.html        layout + operations manual
css/style.css     control-room theme
js/water.js       saturation curve, density, latent heat
js/simulation.js  the plant model (DOM-free, used by both game and tests)
js/phases.js      phase objectives and progression
js/diagram.js     2D canvas rendering of the plant
js/panels.js      control panels, annunciator, indicators
js/main.js        game loop, time acceleration
test/sim_test.js  full-startup regression test
```
