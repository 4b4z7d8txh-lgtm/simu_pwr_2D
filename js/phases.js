/* Operating phases: ordered objectives the player must satisfy to progress
 * from refueling all the way to 100% power. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {})
                                          : (global.PWR = global.PWR || {});

PWR.phases = (function () {
  function timed(cond, key, seconds) {
    // require a condition to hold for `seconds` of sim time
    return function (s, dt) {
      s._hold = s._hold || {};
      if (cond(s)) s._hold[key] = (s._hold[key] || 0) + dt;
      else s._hold[key] = 0;
      return (s._hold[key] || 0) >= seconds;
    };
  }

  var list = [
    {
      name: 'MODE 6 — REFUELING',
      brief: 'The reactor vessel is open. Load the core, close it up and fill the primary circuit.',
      objectives: [
        { text: 'Load all 157 fuel assemblies (FUELING panel)', done: function (s) { return s.coreLoaded >= 100; } },
        { text: 'Verify all rods fully inserted', done: function (s) { return s.cbPos < 0.5 && s.sdPos < 0.5; } },
        { text: 'Verify boron ≥ 2000 ppm', done: function (s) { return s.boron >= 2000; } },
        { text: 'Install reactor vessel head', done: function (s) { return s.headOn; } },
        { text: 'Fill and vent the RCS (go water-solid)', done: function (s) { return s.filled; } }
      ]
    },
    {
      name: 'MODE 5→4 — HEATUP & PRESSURIZATION',
      brief: 'Pressurize the solid plant with charging, start the reactor coolant pumps, draw a steam bubble in the pressurizer, then heat up to hot conditions: 155 bar / 290°C. Respect the P-T limit and the 60°C/h heatup limit.',
      objectives: [
        { text: 'Raise RCS pressure above 26 bar (charging > letdown, water-solid)', done: function (s) { return s.P >= 26 || s.bubble; } },
        { text: 'Start all 4 reactor coolant pumps', done: function (s) { return s.nPumps() === 4; } },
        { text: 'Heat pressurizer above 230°C with heaters', done: function (s) { return s.Tprz >= 230; } },
        { text: 'Draw a steam bubble (letdown > charging until level < 100%)', done: function (s) { return s.bubble; } },
        { text: 'Pressurizer level 40-70%', done: function (s) { return s.bubble && s.przLevel >= 40 && s.przLevel <= 70; } },
        { text: 'RCS average temperature 286-296°C', done: function (s) { return s.Tavg >= 286 && s.Tavg <= 296; } },
        { text: 'RCS pressure 152-158 bar', done: function (s) { return s.bubble && s.P >= 152 && s.P <= 158; } }
      ]
    },
    {
      name: 'MODE 3→2 — APPROACH TO CRITICALITY',
      brief: 'Withdraw the shutdown banks, then dilute boron and withdraw the control bank slowly while watching source-range counts and startup rate. Stabilize the reactor just critical at low power. Keep SUR below 5 dpm or the reactor trips.',
      objectives: [
        { text: 'Withdraw shutdown banks to 100%', done: function (s) { return s.sdPos >= 99.5; } },
        { text: 'Dilute towards criticality (boron < 1600 ppm)', done: function (s) { return s.boron < 1600; } },
        { text: 'Reactor critical', done: function (s) { return s.critical && !s.tripped; } },
        { text: 'Stabilize: power 1 kW - 30 MW, |SUR| < 0.3 dpm for 60 s',
          done: timed(function (s) { return s.critical && !s.tripped && s.Pn > 1e-3 && s.Pn < 30 && Math.abs(s.sur) < 0.3; }, 'stab', 60) },
        { text: 'Hold conditions: 152-158 bar, Tavg 286-296°C', done: function (s) { return s.P >= 152 && s.P <= 158 && s.Tavg >= 286 && s.Tavg <= 296; } }
      ]
    },
    {
      name: 'MODE 1 — POWER ASCENSION & TURBINE SYNC',
      brief: 'Raise power into the power range. Nuclear heating will push Tavg up: open the steam dump to hold ~292°C and feed the steam generators. Latch and roll the turbine, synchronize the generator and pick up ~300 MWe, then close the dump.',
      objectives: [
        { text: 'Reactor power above 8%', done: function (s) { return s.powerPct() >= 8; } },
        { text: 'Feedwater in service, SG level 40-60%', done: function (s) { return s.ctrl.feed > 1 && s.sgLevel >= 40 && s.sgLevel <= 60; } },
        { text: 'Latch turbine and reach 3000 rpm', done: function (s) { return s.ctrl.turbLatched && s.rpm >= 2985; } },
        { text: 'Synchronize generator (close breaker)', done: function (s) { return s.ctrl.breaker; } },
        { text: 'Generator load ≥ 280 MWe', done: function (s) { return s.mwe >= 280; } },
        { text: 'Steam dump closed', done: function (s) { return s.mwe >= 280 && s.ctrl.dump < 1; } }
      ]
    },
    {
      name: 'MODE 1 — RAMP TO FULL POWER',
      brief: 'Raise the load setpoint towards 1100 MWe. As load rises Tavg should follow the program (292°C at 0% → 306°C at 100%): add reactivity with rods and dilution to keep Tavg on program, keep SG level 40-60% and all 4 RCPs running.',
      objectives: [
        { text: 'Generator load ≥ 1078 MWe', done: function (s) { return s.mwe >= 1078; } },
        { text: 'Reactor power 97-101%', done: function (s) { var p = s.powerPct(); return p >= 97 && p <= 101; } },
        { text: 'Tavg within ±4°C of program', done: function (s) { return Math.abs(s.Tavg - PWR.phases.tref(s)) <= 4; } },
        { text: 'SG level 40-60%', done: function (s) { return s.sgLevel >= 40 && s.sgLevel <= 60; } },
        { text: 'Pressure 152-158 bar', done: function (s) { return s.P >= 152 && s.P <= 158; } }
      ]
    },
    {
      name: 'FULL POWER — STEADY STATE',
      brief: 'Hold the unit at full power within limits for 5 minutes. Then you have done it: from an open vessel to 1100 MWe on the grid.',
      objectives: [
        { text: 'Hold ≥ 1078 MWe with all parameters in limits for 5 min',
          done: timed(function (s) {
            return s.mwe >= 1078 && s.powerPct() <= 102 && s.P >= 150 && s.P <= 160 &&
                   s.sgLevel >= 35 && s.sgLevel <= 65 && Math.abs(s.Tavg - PWR.phases.tref(s)) <= 5;
          }, 'win', 300) }
      ]
    }
  ];

  function tref(s) { return 292 + 14 * Math.min(1, Math.max(0, s.mwe / PWR.C.MWE_NOM)); }

  function update(s, dt) {
    if (s.gameOver) return;
    var ph = list[s.phase];
    var all = true;
    for (var i = 0; i < ph.objectives.length; i++) {
      var o = ph.objectives[i];
      var d = o.done.length >= 2 ? o.done(s, dt) : o.done(s);
      o._ok = d; if (!d) all = false;
    }
    if (all) {
      if (s.phase < list.length - 1) {
        s.phase++;
        s.score += 100;
        s.log('PHASE COMPLETE → ' + list[s.phase].name, 'good');
      } else {
        s.gameOver = true; s.win = true;
        s.score += 250;
        s.log('UNIT AT 100% POWER — STARTUP COMPLETE. Final score: ' + Math.round(s.score), 'good');
      }
    }
  }

  return { list: list, update: update, tref: tref };
})();

if (typeof module !== 'undefined') module.exports = PWR;
