/* Autonomous operator.
 *
 * Drives the plant through the entire startup the way a real I&C system / a
 * careful operator would: every actuator is moved by PROPORTIONAL control and
 * RATE-LIMITED ("slewed") so nothing slams fully on and off. Heaters modulate,
 * spray and dump valves stroke gradually, charging/letdown trim around a base
 * flow, and the reactor coolant pumps are started one at a time and then left
 * running (never cycled). A player can copy what they see.
 *
 * Each game mode gives the autopilot a "scope" — the set of control groups the
 * computer owns; it only writes to those, leaving the rest to the player:
 *   mech   refuelling actions (load core, install head, fill & vent)
 *   react  reactivity (control/shutdown rods, boron makeup)
 *   press  pressurizer + CVCS (heaters, spray, charging, letdown)
 *   rcp    reactor coolant pumps
 *   sec    secondary side (steam dump, feedwater, turbine-generator)
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {})
                                          : (global.PWR = global.PWR || {});

PWR.Autopilot = function () {
  var C = PWR.C, W = PWR.water;
  var AP = this;
  AP.stage = 0;
  AP.owned = {};
  AP.active = false;
  AP._bkup = false;        // backup-heater latch (hysteresis, no chatter)
  AP._pumpT = -1e9;        // time of last RCP start (sequential starts)

  AP.setScope = function (groups) {
    AP.owned = {};
    (groups || []).forEach(function (g) { AP.owned[g] = true; });
    AP.active = !!(groups && groups.length);
  };
  function own(g) { return !!AP.owned[g]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* move a control toward its target at a limited rate (per sim-second), so the
     valve/heater appears to stroke smoothly instead of snapping. */
  function slew(s, field, tgt, rate, dt) {
    var c = s.ctrl[field], d = tgt - c, st = rate * dt;
    s.ctrl[field] = Math.abs(d) <= st ? tgt : c + (d > 0 ? st : -st);
  }
  function slewP(s, f, t, r, dt) { if (own('press')) slew(s, f, t, r, dt); }
  function slewS(s, f, t, r, dt) { if (own('sec')) slew(s, f, t, r, dt); }

  /* ---- pressurizer / CVCS (group: press) ---- */
  function pTarget(s) {                                   // ride the chaussette, hold 155 once hot
    if (s.phase >= 2 || s.Tavg >= 286) return 155;
    var p = Math.max(28, Math.min(120, W.psat(s.Tavg + 35) + 10));
    return Math.min(p, PWR.ptMax(s.Tavg) - 2);
  }
  // water-solid: pressure is set by the charging/letdown balance; heaters warm
  // the pressurizer toward saturation. Gains are gentle so the stiff solid
  // plant doesn't overshoot.
  function solidCtrl(s, dt, pTgt, warm) {
    if (!own('press')) return;
    var e = pTgt - s.P;                                   // +ve: need to raise pressure
    var diff = clamp(e * 0.7, -4, 4);                     // kg/s charging-letdown bias
    slewP(s, 'charging', clamp(6 + diff, 0, 22), 1.2, dt);
    slewP(s, 'letdown', clamp(6 - diff, 0, 22), 1.2, dt);
    slewP(s, 'heater', warm ? 100 : 0, 10, dt);
    s.ctrl.heaterBackup = warm && s.Tprz < 236;
    slewP(s, 'spray', 0, 8, dt);
  }
  // draw the steam bubble: a gentle, steady net drain while the pressurizer is
  // held at saturation, instead of dumping letdown wide open.
  function drawCtrl(s, dt) {
    if (!own('press')) return;
    slewP(s, 'heater', 100, 10, dt);
    s.ctrl.heaterBackup = true;
    slewP(s, 'charging', 4, 1.2, dt);
    slewP(s, 'letdown', 8, 1.2, dt);
    slewP(s, 'spray', 0, 8, dt);
  }
  // bubble: hold pressure with modulating heaters and spray (proportional band).
  function pressCtrl(s, dt, pTgt) {
    if (!own('press')) return;
    var e = pTgt - s.P;
    slewP(s, 'heater', clamp(38 + e * 24, 0, 100), 10, dt); // ~38% holds losses, +24%/bar
    if (e > 2.0) AP._bkup = true; else if (e < 0.6) AP._bkup = false;
    s.ctrl.heaterBackup = AP._bkup;
    var sprayOk = s.ctrl.rcp[0] || s.ctrl.rcp[1];
    slewP(s, 'spray', sprayOk ? clamp((s.P - pTgt - 0.8) * 26, 0, 75) : 0, 6, dt);
  }
  // bubble: hold level with the charging/letdown differential around a base flow.
  function levelCtrl(s, dt, lvlTgt, base) {
    if (!own('press')) return;
    base = base || 8;
    var diff = clamp((lvlTgt - s.przLevel) * 0.55, -6, 6);
    slewP(s, 'charging', clamp(base + diff, 0, 26), 1.0, dt);
    slewP(s, 'letdown', clamp(base - diff, 0, 26), 1.0, dt);
  }

  /* ---- secondary (group: sec) ---- */
  function dumpCtrl(s, dt, tProg, gain) {
    slewS(s, 'dump', clamp((s.Tavg - tProg) * (gain || 14), 0, 100), 7, dt);
  }
  function feedCtrl(s, dt, lvlTgt, cap) {
    if (!own('sec')) return;
    var ff = 100 * s.steamFlow / C.FEED_MAX;              // feed-forward on steam flow
    slewS(s, 'feed', clamp(ff + (lvlTgt - s.sgLevel) * 1.4, 0, cap || 110), 4, dt);
  }
  function loadCtrl(s, dt, tgt) { slewS(s, 'turbTarget', tgt, 3, dt); } // MWe/s setpoint ramp

  /* ---- reactivity (group: react) — deadbands prevent rod hunting ---- */
  function rodTavg(s, tProg, db) {
    if (!own('react')) return;
    db = db || 0.6;
    s.ctrl.rodDir = s.Tavg < tProg - db ? 1 : s.Tavg > tProg + db ? -1 : 0;
  }
  function rodPower(s, tgtPct, db) {
    if (!own('react')) return;
    db = db || 0.5;
    s.ctrl.rodDir = s.powerPct() < tgtPct - db ? 1 : s.powerPct() > tgtPct + db ? -1 : 0;
  }
  function sd(s, d) { if (own('react')) s.ctrl.sdDir = d; }
  function cvcs(s, v) { if (own('react')) s.ctrl.cvcs = v; }

  /* ---- reactor coolant pumps (group: rcp) — sequential, no cycling ---- */
  function runPumps(s, n) {
    if (!own('rcp') || s.nPumps() >= n || s.P < 27) return;
    if (s.t - AP._pumpT < 25) return;                     // 25 s dwell between starts
    for (var i = 0; i < 4; i++) if (!s.ctrl.rcp[i]) { s.startRcp(i); AP._pumpT = s.t; break; }
  }

  /* ---------------- the staged startup procedure ---------------- */
  AP.step = function (s, dt) {
    if (!AP.active || s.tripped || s.gameOver) return;

    if (own('mech')) {
      if (s.coreLoaded < 100 && !s._loading) s.loadFuel();
      else if (s.coreLoaded >= 100 && !s.headOn) s.installHead();
      else if (s.headOn && !s.filled) s.fillAndVent();
    }

    var tprog, excess, loadPct, dilute;
    switch (AP.stage) {
      case 0:                                              // wait for a filled RCS
        if (s.filled) AP.stage = 1;
        break;
      case 1:                                              // pressurize water-solid to ~28 bar
        solidCtrl(s, dt, 28, true);
        if (s.P >= 27 || s.bubble) AP.stage = 2;
        break;
      case 2:                                              // heat the pressurizer to saturation
        solidCtrl(s, dt, pTarget(s), true);
        runPumps(s, 3);                                    // bring pumps up one at a time
        if (s.bubble || s.Tprz >= 233) AP.stage = 3;
        break;
      case 3:                                              // draw the steam bubble (gentle drain)
        drawCtrl(s, dt); runPumps(s, 3);
        if (s.bubble) AP.stage = 4;
        break;
      case 4:                                              // heat up to hot standby 155 bar / 291 C
        pressCtrl(s, dt, pTarget(s)); levelCtrl(s, dt, 52);
        runPumps(s, s.Tavg > 270 ? 4 : 3);                 // 4th pump as we near hot standby
        dumpCtrl(s, dt, 291.5); feedCtrl(s, dt, 50, 25);
        if (s.phase >= 2 || (s.P >= 152 && s.P <= 158 && s.Tavg >= 286 && s.Tavg <= 296 &&
            s.przLevel >= 40 && s.przLevel <= 70)) AP.stage = 5;
        break;
      case 5:                                              // withdraw shutdown banks
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        runPumps(s, 4); dumpCtrl(s, dt, 291.5); feedCtrl(s, dt, 50, 25);
        sd(s, 1);
        if (s.sdPos >= 99.5) { sd(s, 0); AP.stage = 6; }
        break;
      case 6:                                              // dilute & withdraw control bank to 60%
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52, 14);   // matched higher flow dilutes
        cvcs(s, 'dilute'); dumpCtrl(s, dt, 291.5); feedCtrl(s, dt, 50, 25);
        if (own('react')) s.ctrl.rodDir = s.cbPos < 60 ? 1 : 0;
        if (s.cbPos >= 60) { if (own('react')) s.ctrl.rodDir = 0; AP.stage = 7; }
        break;
      case 7:                                              // dilute to criticality
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52, 14); cvcs(s, 'dilute');
        dumpCtrl(s, dt, 291.5); feedCtrl(s, dt, 50, 25);
        if (s.critical) { cvcs(s, 'normal'); AP.stage = 8; }
        break;
      case 8:                                              // stabilize at low power
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        dumpCtrl(s, dt, 291.5); feedCtrl(s, dt, 50, 25);
        if (own('react'))
          s.ctrl.rodDir = (s.Pn > 5 && s.sur > 0.1) ? -1 : (s.Pn < 0.5 && s.sur < 0.1) ? 1 : 0;
        if (s.phase >= 3) { if (own('react')) s.ctrl.rodDir = 0; AP.stage = 9; }
        break;
      case 9:                                              // raise power above 8%
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        if (own('react')) s.ctrl.rodDir = (s.powerPct() < 8 && s.sur < 1.2) ? 1 : 0;
        dumpCtrl(s, dt, 292, 18); feedCtrl(s, dt, 50, 30);
        if (s.powerPct() >= 8) { if (own('react')) s.ctrl.rodDir = 0; AP.stage = 10; }
        break;
      case 10:                                             // settle SG level, hold ~10% power
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        dumpCtrl(s, dt, 292, 18); feedCtrl(s, dt, 50, 40);
        rodPower(s, 10, 1.0);
        if (s.sgLevel >= 45 && s.sgLevel <= 60) { if (own('react')) s.ctrl.rodDir = 0; AP.stage = 11; }
        break;
      case 11:                                             // latch and roll the turbine
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        dumpCtrl(s, dt, 292, 18); feedCtrl(s, dt, 50, 40);
        if (own('sec') && !s.ctrl.turbLatched && !s.turbTripped && s.Psg >= 60) s.latchTurbine();
        if (s.rpm >= 2990) AP.stage = 12;
        break;
      case 12:                                             // sync and pick up ~300 MWe
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52);
        if (own('sec') && s.ctrl.turbLatched && !s.ctrl.breaker && Math.abs(s.rpm - 3000) < 15) s.closeBreaker();
        loadCtrl(s, dt, 320);
        loadPct = 100 * (s.mwe / C.TURB_EFF) / C.P_NOM_MW;
        excess = s.powerPct() - loadPct;
        slewS(s, 'dump', clamp((excess - 1) * 4, 0, 40), 7, dt);
        feedCtrl(s, dt, 50, 60);
        if (own('react')) s.ctrl.rodDir = excess > 1.5 ? -1 : excess < -1 ? 1 : 0;
        if (s.phase >= 4) AP.stage = 13;
        break;
      case 13:                                             // ramp to full load
        pressCtrl(s, dt, 155); slewS(s, 'dump', 0, 7, dt);
        loadCtrl(s, dt, 1100); feedCtrl(s, dt, 50, 110);
        tprog = PWR.phases.tref(s);
        rodTavg(s, tprog);
        dilute = (s.Tavg < tprog - 0.3) && s.cbPos > 90;
        cvcs(s, dilute ? 'dilute' : 'normal');
        levelCtrl(s, dt, 52, dilute ? 16 : 8);
        if (s.mwe >= 1078) { cvcs(s, 'normal'); AP.stage = 14; }
        break;
      default:                                             // 14: hold at full power
        pressCtrl(s, dt, 155); levelCtrl(s, dt, 52); slewS(s, 'dump', 0, 7, dt);
        loadCtrl(s, dt, 1100); feedCtrl(s, dt, 50, 110);
        rodTavg(s, PWR.phases.tref(s));
        break;
    }
  };

  /* a short human-readable note on what the computer is doing right now */
  AP.statusText = function () {
    var msg = ['filling the RCS', 'pressurizing water-solid', 'heating the pressurizer',
      'drawing the steam bubble', 'heating to hot standby', 'withdrawing shutdown banks',
      'diluting & withdrawing rods', 'approaching criticality', 'stabilizing at low power',
      'raising power above 8%', 'settling SG level', 'rolling the turbine',
      'synchronizing the generator', 'ramping to full load', 'holding at full power'];
    return msg[Math.min(AP.stage, msg.length - 1)];
  };
};

if (typeof module !== 'undefined') module.exports = PWR;
