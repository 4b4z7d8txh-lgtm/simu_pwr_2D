/* Headless smoke test: drives the whole startup procedure through the
 * simulation and checks each phase can actually be completed.
 * Run with: node test/sim_test.js
 */
require('../js/water.js');
require('../js/simulation.js');
require('../js/phases.js');
var PWR = global.PWR;

var sim = new PWR.Simulation();
var DT = 0.25;
var failures = [];

function run(seconds, fn) {
  var n = Math.round(seconds / DT);
  for (var i = 0; i < n; i++) { if (fn) fn(sim); sim.step(DT); }
}
function runUntil(desc, cond, maxSec, fn) {
  var t0 = sim.t;
  while (!cond(sim)) {
    if (fn) fn(sim);
    sim.step(DT);
    if (sim.t - t0 > maxSec) {
      failures.push('TIMEOUT: ' + desc + ' (after ' + maxSec + 's)  state: ' + snap());
      return false;
    }
  }
  console.log('ok  (' + ((sim.t - t0) / 60).toFixed(1) + ' min) ' + desc + '   ' + snap());
  return true;
}
function snap() {
  return 'phase=' + sim.phase + ' P=' + sim.P.toFixed(1) + 'b Tavg=' + sim.Tavg.toFixed(1) +
    ' Tprz=' + sim.Tprz.toFixed(1) + ' lvl=' + sim.przLevel.toFixed(0) + '% Pn=' + sim.Pn.toExponential(1) +
    'MW rho=' + Math.round(sim.rho) + 'pcm B=' + Math.round(sim.boron) + 'ppm SG=' + sim.Psg.toFixed(1) +
    'b sgLvl=' + sim.sgLevel.toFixed(0) + '% MWe=' + Math.round(sim.mwe) + ' trips=' + (sim.tripped ? sim.tripReason : 'none');
}

/* ---- Phase 0: refueling ---- */
sim.loadFuel();
runUntil('core loaded', function (s) { return s.coreLoaded >= 100; }, 200);
sim.installHead(); sim.fillAndVent();
runUntil('phase 1 reached', function (s) { return s.phase >= 1; }, 30);

/* ---- Phase 1: pressurize solid ---- */
sim.ctrl.charging = 20; sim.ctrl.letdown = 2;
runUntil('solid pressurization to 30 bar', function (s) { return s.P >= 30; }, 4 * 3600);
sim.ctrl.charging = 5; sim.ctrl.letdown = 5;
for (var i = 0; i < 4; i++) sim.startRcp(i);
if (sim.nPumps() !== 4) failures.push('RCPs failed to start at P=' + sim.P.toFixed(1));

/* operator: hold a pressure target with heaters/spray/charging, level with CVCS */
function pTarget(s) {
  if (s.phase >= 2) return 155; // once hot, hold nominal pressure
  if (s.Tavg < 200) return 35;
  if (s.Tavg < 284) return Math.min(120, 35 + (s.Tavg - 200));
  return 155;
}
function holdP(s) {
  var pt = pTarget(s);
  if (!s.bubble) { // water-solid: pressure via charging/letdown balance
    s.ctrl.heater = 100; s.ctrl.heaterBackup = true;
    s.ctrl.charging = s.P < pt - 2 ? 14 : 5;
    s.ctrl.letdown = s.P > pt + 2 ? 16 : 5;
    s.ctrl.spray = 0;
  } else {
    s.ctrl.heaterBackup = s.P < pt - 1.5;
    s.ctrl.heater = s.P < pt - 0.2 ? 100 : 0;
    s.ctrl.spray = s.P > pt + 1.5 ? 50 : 0;
    s.ctrl.letdown = s.przLevel > 55 ? 16 : s.przLevel > 42 ? 7 : 2;
    s.ctrl.charging = s.przLevel < 38 ? 14 : 5;
  }
}
/* heat pressurizer with heaters; keep solid pressure near 35 bar */
runUntil('PRZ at 235C', function (s) { return s.Tprz >= 235; }, 8 * 3600, holdP);
if (sim.nPumps() < 4) failures.push('RCPs lost while heating PRZ (P=' + sim.P.toFixed(1) + ')');
/* draw bubble */
runUntil('bubble drawn', function (s) { return s.bubble; }, 2 * 3600, function (s) {
  s.ctrl.heater = 100; s.ctrl.heaterBackup = true;
  s.ctrl.letdown = 22; s.ctrl.charging = 4;
});
console.log('   bubble at P=' + sim.P.toFixed(1) + ' bar, RCPs=' + sim.nPumps());
if (sim.nPumps() < 4) failures.push('RCPs lost during bubble draw (P=' + sim.P.toFixed(1) + ')');

/* heat up to hot standby following the P-T schedule */
var ptViol = 0;
runUntil('hot standby 155 bar / 291C', function (s) {
  if (s.alarms.PT_LIMIT) ptViol++;
  return s.P >= 152 && s.P <= 158 && s.Tavg >= 286 && s.Tavg <= 296 && s.przLevel >= 40 && s.przLevel <= 70;
}, 24 * 3600, function (s) {
  holdP(s);
  s.ctrl.dump = s.Tavg > 291 ? 8 : 0; // hold temperature with dump
  s.ctrl.feed = s.sgLevel < 50 ? 3 : 0;
});
if (ptViol > 40) failures.push('P-T limit violated for ' + (ptViol * DT).toFixed(0) + 's during heatup');
runUntil('phase 2 reached', function (s) { return s.phase >= 2; }, 3600, holdHot);

function holdHot(s) { holdP(s); }

/* ---- Phase 2: criticality ---- */
sim.ctrl.sdDir = 1;
runUntil('shutdown banks out', function (s) { return s.sdPos >= 99.5; }, 600, holdHot);
sim.ctrl.sdDir = 0;
sim.ctrl.cvcs = 'dilute'; sim.ctrl.charging = 20; sim.ctrl.letdown = 20;
sim.ctrl.rodDir = 1;
runUntil('control bank to 60%', function (s) { return s.cbPos >= 60; }, 600, holdHot);
sim.ctrl.rodDir = 0;
runUntil('reactor critical', function (s) { return s.critical; }, 4 * 3600, function (s) {
  holdHot(s); s.ctrl.charging = 20; s.ctrl.letdown = 20;
  s.ctrl.dump = s.Tavg > 291.5 ? 6 : 0;
});
sim.ctrl.cvcs = 'normal';
console.log('   critical at boron=' + Math.round(sim.boron) + ' ppm, cb=' + sim.cbPos.toFixed(0) + '%');

/* stabilize at ~1 MW: trim rods against SUR */
runUntil('phase 3 reached (stable low power)', function (s) { return s.phase >= 3; }, 2 * 3600, function (s) {
  holdHot(s);
  if (s.Pn > 5 && s.sur > 0.1) s.ctrl.rodDir = -1;
  else if (s.Pn < 0.5 && s.sur < 0.1) s.ctrl.rodDir = 1;
  else s.ctrl.rodDir = 0;
  s.ctrl.dump = s.Tavg > 291.5 ? 6 : 0;
});
sim.ctrl.rodDir = 0;

/* ---- Phase 3: power up, sync turbine ---- */
function feedCtl(s, gentle) {
  // match steam flow plus a level trim; gentle while on cold aux feed
  var base = 100 * s.steamFlow / PWR.C.FEED_MAX;
  var trim = s.sgLevel < 48 ? (gentle ? 4 : 8) : s.sgLevel > 52 ? -6 : 0;
  s.ctrl.feed = Math.max(0, Math.min(gentle ? 12 : 105, base + trim));
}
runUntil('power > 8%', function (s) { return s.powerPct() >= 8; }, 2 * 3600, function (s) {
  holdHot(s);
  s.ctrl.rodDir = (s.powerPct() < 8 && s.sur < 1.5) ? 1 : 0;
  s.ctrl.dump = s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0;
  feedCtl(s, true);
});
sim.ctrl.rodDir = 0;
runUntil('SG level 40-60 & holding power', function (s) { return s.sgLevel >= 45 && s.sgLevel <= 60; }, 3 * 3600, function (s) {
  holdHot(s);
  s.ctrl.dump = s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0;
  feedCtl(s, true);
  s.ctrl.rodDir = s.powerPct() > 12 ? -1 : s.powerPct() < 8 ? 1 : 0;
});
sim.ctrl.rodDir = 0;
sim.latchTurbine();
if (!sim.ctrl.turbLatched) failures.push('turbine latch refused: Psg=' + sim.Psg.toFixed(1));
runUntil('turbine at 3000 rpm', function (s) { return s.rpm >= 2990; }, 600, function (s) {
  holdHot(s);
  s.ctrl.dump = s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0;
  feedCtl(s, true);
});
sim.closeBreaker();
if (!sim.ctrl.breaker) failures.push('breaker close refused: rpm=' + sim.rpm.toFixed(0));
sim.ctrl.turbTarget = 320;
runUntil('phase 4 reached (300 MWe, dump closed)', function (s) { return s.phase >= 4; }, 2 * 3600, function (s) {
  holdHot(s);
  var loadPct = 100 * (s.mwe / PWR.C.TURB_EFF) / PWR.C.P_NOM_MW;
  var excess = s.powerPct() - loadPct;
  s.ctrl.dump = Math.max(0, Math.min(40, (excess - 1) * 4));
  feedCtl(s, false);
  // match reactor power to generator load; the dump then winds down
  s.ctrl.rodDir = excess > 1.5 ? -1 : excess < -1 ? 1 : 0;
});

/* ---- Phase 4: ramp to 1100 MWe ---- */
sim.ctrl.cvcs = 'dilute';
runUntil('full load 1078+ MWe', function (s) { return s.mwe >= 1078; }, 8 * 3600, function (s) {
  holdHot(s);
  s.ctrl.dump = 0;
  s.ctrl.turbTarget = 1100;
  s.ctrl.feed = 100 * (s.steamFlow / PWR.C.FEED_MAX) + (s.sgLevel < 48 ? 6 : s.sgLevel > 52 ? -6 : 0);
  var tr = PWR.phases.tref(s);
  s.ctrl.rodDir = s.Tavg < tr - 0.5 ? 1 : s.Tavg > tr + 0.5 ? -1 : 0;
  // use dilution for the big reactivity swing, rods for trim
  var dil = (s.Tavg < tr - 0.3) && s.cbPos > 90;
  s.ctrl.charging = dil ? 25 : 8; s.ctrl.letdown = dil ? 25 : (s.przLevel > 58 ? 14 : 8);
});
sim.ctrl.cvcs = 'normal';
runUntil('phase 5 reached', function (s) { return s.phase >= 5; }, 3600, atPower);
function atPower(s) {
  holdHot(s);
  s.ctrl.turbTarget = 1100;
  s.ctrl.feed = 100 * (s.steamFlow / PWR.C.FEED_MAX) + (s.sgLevel < 48 ? 6 : s.sgLevel > 52 ? -6 : 0);
  var tr = PWR.phases.tref(s);
  s.ctrl.rodDir = s.Tavg < tr - 0.5 ? 1 : s.Tavg > tr + 0.5 ? -1 : 0;
}

/* ---- Phase 5: hold ---- */
runUntil('WIN: startup complete', function (s) { return s.win; }, 3600, atPower);

console.log('\nFinal: ' + snap() + '  score=' + Math.round(sim.score));
var trips = sim.events.filter(function (e) { return e.msg.indexOf('REACTOR TRIP') === 0; });
if (trips.length) console.log('Trips during run: ' + trips.map(function (e) { return e.msg; }).join(' | '));

if (failures.length) {
  console.error('\nFAILURES:'); failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
} else {
  console.log('\nALL CHECKS PASSED');
}
