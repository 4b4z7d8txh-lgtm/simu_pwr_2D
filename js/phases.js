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
      brief: 'Pressurize the solid plant with charging, start the reactor coolant pumps, draw a steam bubble in the pressurizer, then heat up to hot conditions: 155 bar / 290°C. Follow the P-T "chaussette" diagram: stay under 31 bar until 177°C, then climb the sock keeping ≥35 K of margin to saturation. Respect the 60°C/h heatup limit.',
      objectives: [
        { text: 'Raise RCS pressure to 26-31 bar (charging > letdown, stay in the green domain)', done: function (s) { return s.P >= 26 || s.bubble; } },
        { text: 'Start all 4 reactor coolant pumps', done: function (s) { return s.nPumps() === 4; } },
        { text: 'Heat pressurizer above 230°C with heaters', done: function (s) { return s.Tprz >= 230; } },
        { text: 'Draw a steam bubble (letdown > charging until level < 100%)', done: function (s) { return s.bubble; } },
        { text: 'Pressurizer level in band', done: function (s) { return s.bubble && s.przLevel >= PWR.D.przBand[0] && s.przLevel <= PWR.D.przBand[1]; } },
        { text: 'RCS average temperature on target', done: function (s) { return s.Tavg >= PWR.D.tavgBand[0] && s.Tavg <= PWR.D.tavgBand[1]; } },
        { text: 'RCS pressure in band (~155 bar)', done: function (s) { return s.bubble && s.P >= PWR.D.pBand[0] && s.P <= PWR.D.pBand[1]; } }
      ]
    },
    {
      name: 'MODE 3→2 — APPROACH TO CRITICALITY',
      brief: 'Withdraw the shutdown banks, then dilute boron and withdraw the control bank slowly while watching source-range counts and startup rate. Stabilize the reactor just critical at low power. Keep SUR below 5 dpm or the reactor trips.',
      objectives: [
        { text: 'Withdraw shutdown banks to 100%', done: function (s) { return s.sdPos >= 99.5; } },
        { text: 'Dilute towards criticality (boron < 1600 ppm)', done: function (s) { return s.boron < 1600; } },
        { text: 'Reactor critical', done: function (s) { return s.critical && !s.tripped; } },
        { text: 'Stabilize: power 1 kW - 30 MW with a steady startup rate',
          done: function (s, dt) { return timed(function (q) { return q.critical && !q.tripped && q.Pn > 1e-3 && q.Pn < 30 && Math.abs(q.sur) < PWR.D.surStab; }, 'stab', PWR.D.stabHold)(s, dt); } },
        { text: 'Hold conditions: pressure and Tavg in band', done: function (s) { return s.P >= PWR.D.pBand[0] && s.P <= PWR.D.pBand[1] && s.Tavg >= PWR.D.tavgBand[0] && s.Tavg <= PWR.D.tavgBand[1]; } }
      ]
    },
    {
      name: 'MODE 1 — POWER ASCENSION & TURBINE SYNC',
      brief: 'Raise power into the power range. Nuclear heating will push Tavg up: open the steam dump to hold ~292°C and feed the steam generators. Latch and roll the turbine, synchronize the generator and pick up ~300 MWe, then close the dump.',
      objectives: [
        { text: 'Reactor power above 8%', done: function (s) { return s.powerPct() >= 8; } },
        { text: 'Feedwater in service, SG level in band', done: function (s) { return s.ctrl.feed > 1 && s.sgLevel >= PWR.D.sgBand[0] && s.sgLevel <= PWR.D.sgBand[1]; } },
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
        { text: 'Tavg on program', done: function (s) { return Math.abs(s.Tavg - PWR.phases.tref(s)) <= PWR.D.tavgTol; } },
        { text: 'SG level in band', done: function (s) { return s.sgLevel >= PWR.D.sgBand[0] && s.sgLevel <= PWR.D.sgBand[1]; } },
        { text: 'Pressure in band (~155 bar)', done: function (s) { return s.P >= PWR.D.pBand[0] && s.P <= PWR.D.pBand[1]; } }
      ]
    },
    {
      name: 'FULL POWER — STEADY STATE',
      brief: 'Hold the unit at full power within limits (5 min real / 90 s beginner). Then you have done it: from an open vessel to 1100 MWe on the grid.',
      objectives: [
        { text: 'Hold ≥ 1078 MWe with all parameters in limits',
          done: function (s, dt) {
            return timed(function (q) {
              return q.mwe >= 1078 && q.powerPct() <= 102 && q.P >= PWR.D.pWin[0] && q.P <= PWR.D.pWin[1] &&
                     q.sgLevel >= PWR.D.sgWin[0] && q.sgLevel <= PWR.D.sgWin[1] && Math.abs(q.Tavg - PWR.phases.tref(q)) <= PWR.D.tavgWinTol;
            }, 'win', PWR.D.winHold)(s, dt);
          } }
      ]
    }
  ];

  // Tavg programme vs turbine load (ref 1300 MWe): rises from the no-load
  // value to ~306.5 C over 0-60% load, then held roughly constant.
  function tref(s) {
    var load = Math.min(1, Math.max(0, s.mwe / PWR.C.MWE_NOM));
    return Math.max(291, 284 + 22.5 * Math.min(1, load / 0.6));
  }

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
