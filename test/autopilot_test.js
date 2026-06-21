/* Headless test for the autonomous operator.
 *
 * Drives the simulation with PWR.Autopilot in full-scope (AUTO) mode and checks
 * it takes the plant from an open vessel all the way to 1100 MWe with no manual
 * input and no reactor trip. Also smoke-tests semi-auto scope (secondary only).
 * Run with: node test/autopilot_test.js
 */
require('../js/water.js');
require('../js/simulation.js');
require('../js/phases.js');
require('../js/autopilot.js');
var PWR = global.PWR;

function snap(s) {
  return 'phase=' + s.phase + ' stage=?' + ' P=' + s.P.toFixed(1) + 'b Tavg=' + s.Tavg.toFixed(1) +
    ' Pn=' + s.Pn.toExponential(1) + 'MW B=' + Math.round(s.boron) + 'ppm SG=' + s.Psg.toFixed(1) +
    'b sgLvl=' + s.sgLevel.toFixed(0) + '% MWe=' + Math.round(s.mwe) +
    ' trips=' + (s.tripped ? s.tripReason : 'none');
}

/* ---- full AUTO run ---- */
PWR.setDifficulty('real');
var sim = new PWR.Simulation();
var ap = new PWR.Autopilot();
ap.setScope(['mech', 'react', 'press', 'rcp', 'sec']);

var DT = 0.25, maxSec = 60 * 3600, t0 = 0;
var failures = [];
var lastStage = -1;
while (!sim.win && sim.t < maxSec) {
  ap.step(sim, DT);
  sim.step(DT);
  if (ap.stage !== lastStage) {
    lastStage = ap.stage;
    console.log('  stage ' + (ap.stage < 10 ? ' ' : '') + ap.stage + ' @ T+' +
      (sim.t / 3600).toFixed(2) + 'h  (' + ap.statusText() + ')   ' + snap(sim));
  }
  if (sim.tripped) { failures.push('AUTO tripped: ' + sim.tripReason + '  ' + snap(sim)); break; }
}
if (!sim.win) failures.push('AUTO did not complete the startup within ' + (maxSec / 3600) + 'h  ' + snap(sim));
else console.log('\nAUTO complete in ' + (sim.t / 3600).toFixed(1) + 'h, score=' + Math.round(sim.score) + '  ' + snap(sim));

/* ---- SEMI-AUTO smoke test: computer drives only the secondary while a tiny
   scripted "player" runs the primary; just confirm it reaches the turbine and
   syncs without the computer tripping the plant on the secondary side. ---- */
PWR.setDifficulty('beginner');
var s2 = new PWR.Simulation();
var ap2 = new PWR.Autopilot();
ap2.setScope(['sec']);
// reuse a full-scope autopilot as the stand-in "player" for the primary groups
var human = new PWR.Autopilot();
human.setScope(['mech', 'react', 'press', 'rcp']);
var reached = false;
while (!s2.win && s2.t < maxSec) {
  human.step(s2, DT);   // player side (primary)
  ap2.step(s2, DT);     // computer side (secondary)
  s2.step(DT);
  if (!reached && s2.ctrl.breaker) { reached = true; console.log('\nSEMI: generator synced @ T+' + (s2.t / 3600).toFixed(1) + 'h  ' + snap(s2)); }
  if (s2.tripped) { failures.push('SEMI tripped: ' + s2.tripReason + '  ' + snap(s2)); break; }
}
if (!s2.win) failures.push('SEMI did not complete  ' + snap(s2));
else console.log('SEMI complete in ' + (s2.t / 3600).toFixed(1) + 'h  ' + snap(s2));

if (failures.length) {
  console.error('\nFAILURES:'); failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
} else {
  console.log('\nALL AUTOPILOT CHECKS PASSED');
}
