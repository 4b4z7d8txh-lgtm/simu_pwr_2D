/* Game bootstrap and main loop. */
(function () {
  var sim = new PWR.Simulation();
  var diagram = new PWR.Diagram(document.getElementById('plantCanvas'));
  var panels = new PWR.Panels(sim);
  var ptDiag = new PWR.PTDiagram(document.getElementById('ptCanvas'));
  var gauges = new PWR.Gauges(document.getElementById('gaugeCluster'));
  var trends = new PWR.Trends(document.getElementById('trendCanvas'), document.getElementById('trendLegend'));
  var autopilot = new PWR.Autopilot();
  window.sim = sim; // handy for curious players / debugging

  var DT = 0.25;          // physics substep, sim seconds
  var speed = 1;          // sim seconds per real second (0 = paused)
  var acc = 0, lastT = performance.now();
  var lastTripped = false;

  /* speed buttons */
  var speeds = [0, 1, 10, 60, 300, 900];
  var spdBox = document.getElementById('spdBox');
  speeds.forEach(function (v) {
    var b = document.createElement('button');
    b.textContent = v === 0 ? '⏸' : v + 'x';
    b.addEventListener('click', function () { setSpeed(v); });
    spdBox.appendChild(b);
  });
  function setSpeed(v) {
    speed = v;
    spdBox.querySelectorAll('button').forEach(function (b, i) {
      b.classList.toggle('on', speeds[i] === v);
    });
  }
  setSpeed(1);
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
  });

  document.getElementById('scramBtn').addEventListener('click', function () {
    sim.scram('manual scram');
  });
  document.getElementById('manualBtn').addEventListener('click', function () {
    document.getElementById('modal').classList.add('open');
  });

  /* operating mode: a single compact header button cycles MANUAL → SEMI-AUTO →
     AUTO. Each mode sets the difficulty bands and hands the matching control
     groups to the autopilot; the panels it owns are locked and visibly badged
     so the player can watch the computer adapt them. */
  var levelBtn = document.getElementById('levelBtn');
  var modes = ['manual', 'semi', 'auto'];
  var modeCfg = {
    manual: { diff: 'real', scope: [], label: 'MODE: MANUAL',
      title: 'Manual — full real simulation, you operate everything. Click for Semi-Auto.' },
    semi: { diff: 'beginner', scope: ['sec'], label: 'MODE: SEMI-AUTO',
      title: 'Semi-Auto — you run the primary circuit (reactivity, pressurizer, CVCS, pumps); the computer runs the secondary (steam dump, feedwater, turbine). Click for Auto.' },
    auto: { diff: 'real', scope: ['mech', 'react', 'press', 'rcp', 'sec'], label: 'MODE: AUTO',
      title: 'Auto — the computer runs the entire startup; sit back and watch the parameters adapt. Click for Manual.' }
  };
  var curMode = 'manual';
  function applyMode(name) {
    curMode = name;
    var m = modeCfg[name];
    PWR.setDifficulty(m.diff);
    autopilot.setScope(m.scope);
    panels.setAutoGroups(autopilot.owned);
    levelBtn.textContent = m.label;
    levelBtn.title = m.title;
    levelBtn.classList.toggle('beginner', name === 'semi');
    levelBtn.classList.toggle('auto', name === 'auto');
    sim.log('Operating mode: ' + m.label.replace('MODE: ', '') +
      (name === 'manual' ? '' : ' — computer ' + autopilot.statusText() + '.'), 'info');
  }
  levelBtn.addEventListener('click', function () {
    applyMode(modes[(modes.indexOf(curMode) + 1) % modes.length]);
  });
  applyMode('semi'); // start with the secondary side automated as a helpful default
  document.getElementById('modalClose').addEventListener('click', function () {
    document.getElementById('modal').classList.remove('open');
  });
  document.getElementById('clToggle').addEventListener('click', function () {
    var b = document.getElementById('clBody');
    b.style.display = b.style.display === 'none' ? '' : 'none';
  });
  // on small screens start with the checklist collapsed so the plant is visible
  if (window.innerWidth < 920) document.getElementById('clBody').style.display = 'none';

  function clock() {
    var t = Math.floor(sim.t);
    var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return 'T+' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var evLog = document.getElementById('eventLog');
  var annun = document.getElementById('annunciator');

  function frame(now) {
    var dtReal = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    acc += dtReal * speed;
    var steps = 0;
    while (acc >= DT && steps < 6000) { autopilot.step(sim, DT); sim.step(DT); acc -= DT; steps++; }
    if (steps >= 6000) acc = 0;

    // guardrails: drop acceleration when things get fast or the reactor trips
    if (sim.alarms.HI_SUR && speed > 10) { setSpeed(10); sim.log('Time acceleration reduced: high startup rate.', 'warn'); }
    if (sim.tripped && !lastTripped && speed > 10) setSpeed(10);
    lastTripped = sim.tripped;

    document.getElementById('clock').textContent = clock();
    document.getElementById('phaseName').textContent =
      'PHASE ' + (sim.phase + 1) + '/6 · ' + PWR.phases.list[sim.phase].name;
    diagram.draw(sim, dtReal);
    ptDiag.draw(sim);
    gauges.draw(sim);
    trends.sample(sim);
    trends.draw(sim);
    panels.refresh();
    evLog.style.bottom = (annun.offsetHeight + 8) + 'px'; // keep log above the annunciator
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
