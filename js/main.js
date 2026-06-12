/* Game bootstrap and main loop. */
(function () {
  var sim = new PWR.Simulation();
  var diagram = new PWR.Diagram(document.getElementById('plantCanvas'));
  var panels = new PWR.Panels(sim);
  var ptDiag = new PWR.PTDiagram(document.getElementById('ptCanvas'));
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
    while (acc >= DT && steps < 6000) { sim.step(DT); acc -= DT; steps++; }
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
    panels.refresh();
    evLog.style.bottom = (annun.offsetHeight + 8) + 'px'; // keep log above the annunciator
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
