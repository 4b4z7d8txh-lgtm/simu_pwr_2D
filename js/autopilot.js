/* Autonomous operator.
 *
 * Drives the plant through the entire startup using the same proven control
 * sequence as the headless regression test (test/sim_test.js), expressed as a
 * forward state machine. Each game mode gives the autopilot a "scope" — the set
 * of control groups the computer owns:
 *
 *   mech   refuelling actions (load core, install head, fill & vent)
 *   react  reactivity (control/shutdown rods, boron makeup)
 *   press  pressurizer + CVCS (heaters, spray, charging, letdown)
 *   rcp    reactor coolant pumps
 *   sec    secondary side (steam dump, feedwater, turbine-generator)
 *
 * It only writes to the controls it owns; everything else is left to the player.
 * The stage machine still advances on real plant state, so in semi-autonomous
 * mode the computer waits on the player's primary-side progress and runs the
 * balance of plant around it.
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {})
                                          : (global.PWR = global.PWR || {});

PWR.Autopilot = function () {
  var C = PWR.C, W = PWR.water;
  var AP = this;
  AP.stage = 0;
  AP.owned = {};
  AP.active = false;

  AP.setScope = function (groups) {
    AP.owned = {};
    (groups || []).forEach(function (g) { AP.owned[g] = true; });
    AP.active = !!(groups && groups.length);
  };
  function own(g) { return !!AP.owned[g]; }

  /* ---- ported control helpers (write only to owned groups) ---- */
  function pTarget(s) {
    if (s.phase >= 2 || s.Tavg >= 286) return 155;        // hold nominal once hot
    var p = Math.max(28, Math.min(120, W.psat(s.Tavg + 35) + 10));
    return Math.min(p, PWR.ptMax(s.Tavg) - 2);            // ride the chaussette
  }
  function holdP(s) {                                      // pressurizer + CVCS pressure
    if (!own('press')) return;
    var ct = s.ctrl, pt = pTarget(s);
    if (!s.bubble) {                                       // water-solid: charge/letdown
      ct.heater = 100; ct.heaterBackup = true;
      ct.charging = s.P < pt - 2 ? 14 : 5;
      ct.letdown = s.P > pt + 2 ? 16 : 5;
      ct.spray = 0;
    } else {                                               // bubble: heaters/spray
      ct.heaterBackup = s.P < pt - 1.5;
      ct.heater = s.P < pt - 0.2 ? 100 : 0;
      ct.spray = s.P > pt + 1.5 ? 50 : 0;
      ct.letdown = s.przLevel > 55 ? 16 : s.przLevel > 42 ? 7 : 2;
      ct.charging = s.przLevel < 38 ? 14 : 5;
    }
  }
  function dumpTo(s, v) { if (own('sec')) s.ctrl.dump = v; }
  function feedHot(s) {                                    // gentle feed to hold ~50%
    if (!own('sec')) return;
    var base = 100 * s.steamFlow / C.FEED_MAX;
    s.ctrl.feed = Math.min(12, s.sgLevel < 48 ? base + 3 : s.sgLevel > 52 ? 0 : base);
  }
  function feedCtl(s, gentle) {                            // match steam flow + level trim
    if (!own('sec')) return;
    var base = 100 * s.steamFlow / C.FEED_MAX;
    var trim = s.sgLevel < 48 ? (gentle ? 4 : 8) : s.sgLevel > 52 ? -6 : 0;
    s.ctrl.feed = Math.max(0, Math.min(gentle ? 12 : 105, base + trim));
  }
  function dumpHot(s) { dumpTo(s, s.Tavg > 291.5 ? Math.min(30, 4 + (s.Tavg - 291.5) * 20) : 0); }
  function rod(s, d) { if (own('react')) s.ctrl.rodDir = d; }
  function sd(s, d) { if (own('react')) s.ctrl.sdDir = d; }
  function cvcs(s, v) { if (own('react')) s.ctrl.cvcs = v; }
  function flush(s, on) { if (own('press')) { s.ctrl.charging = on ? 20 : 5; s.ctrl.letdown = on ? 20 : 5; } }

  /* ---- the staged startup procedure ---- */
  AP.step = function (s, dt) {
    if (!AP.active || s.tripped || s.gameOver) return;

    /* mechanical actions and pump starts, when owned */
    if (own('mech')) {
      if (s.coreLoaded < 100 && !s._loading) s.loadFuel();
      else if (s.coreLoaded >= 100 && !s.headOn) s.installHead();
      else if (s.headOn && !s.filled) s.fillAndVent();
    }
    if (own('rcp') && s.filled && s.P >= 27 && s.nPumps() < 4) {
      for (var k = 0; k < 4; k++) s.startRcp(k);
    }

    /* baseline secondary regulation; later stages override for the turbine */
    if (own('sec') && s.filled && AP.stage < 9) { dumpHot(s); feedHot(s); }

    var loadPct, excess, tr, dil;
    switch (AP.stage) {
      case 0:                                              // wait for a filled RCS
        if (s.filled) AP.stage = 1;
        break;
      case 1:                                              // pressurize water-solid to ~27 bar
        if (own('press')) { s.ctrl.charging = 20; s.ctrl.letdown = 2; }
        if (s.P >= 27 || s.bubble) { if (own('press')) { s.ctrl.charging = 5; s.ctrl.letdown = 5; } AP.stage = 2; }
        break;
      case 2:                                              // heat the pressurizer to ~232 C
        holdP(s);
        if (s.bubble || s.Tprz >= 232) AP.stage = 3;
        break;
      case 3:                                              // draw the steam bubble
        if (own('press')) { s.ctrl.heater = 100; s.ctrl.heaterBackup = true; s.ctrl.letdown = 22; s.ctrl.charging = 4; }
        if (s.bubble) AP.stage = 4;
        break;
      case 4:                                              // heat up to hot standby 155 bar / 291 C
        holdP(s); dumpHot(s); feedHot(s);
        if (s.phase >= 2 || (s.P >= 152 && s.P <= 158 && s.Tavg >= 286 && s.Tavg <= 296 &&
            s.przLevel >= 40 && s.przLevel <= 70)) AP.stage = 5;
        break;
      case 5:                                              // withdraw shutdown banks
        holdP(s); dumpHot(s); feedHot(s); sd(s, 1);
        if (s.sdPos >= 99.5) { sd(s, 0); AP.stage = 6; }
        break;
      case 6:                                              // dilute + control bank to 60%
        holdP(s); dumpHot(s); feedHot(s); cvcs(s, 'dilute'); flush(s, true); rod(s, 1);
        if (s.cbPos >= 60) { rod(s, 0); AP.stage = 7; }
        break;
      case 7:                                              // dilute to criticality
        holdP(s); flush(s, true); cvcs(s, 'dilute');
        dumpTo(s, s.Tavg > 291.5 ? 6 : 0); feedHot(s);
        if (s.critical) { cvcs(s, 'normal'); AP.stage = 8; }
        break;
      case 8:                                              // stabilize at low power
        holdP(s); dumpHot(s); feedHot(s);
        if (own('react')) {
          s.ctrl.rodDir = (s.Pn > 5 && s.sur > 0.1) ? -1 : (s.Pn < 0.5 && s.sur < 0.1) ? 1 : 0;
        }
        dumpTo(s, s.Tavg > 291.5 ? 6 : 0);
        if (s.phase >= 3) { rod(s, 0); AP.stage = 9; }
        break;
      case 9:                                              // raise power above 8%
        holdP(s);
        rod(s, (s.powerPct() < 8 && s.sur < 1.5) ? 1 : 0);
        dumpTo(s, s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0);
        feedCtl(s, true);
        if (s.powerPct() >= 8) { rod(s, 0); AP.stage = 10; }
        break;
      case 10:                                             // settle SG level, hold power
        holdP(s);
        dumpTo(s, s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0);
        feedCtl(s, true);
        if (own('react')) s.ctrl.rodDir = s.powerPct() > 12 ? -1 : s.powerPct() < 8 ? 1 : 0;
        if (s.sgLevel >= 45 && s.sgLevel <= 60) { rod(s, 0); AP.stage = 11; }
        break;
      case 11:                                             // latch and roll the turbine
        holdP(s);
        dumpTo(s, s.Tavg > 292 ? Math.min(100, (s.Tavg - 292) * 25) : 0);
        feedCtl(s, true);
        if (own('sec') && !s.ctrl.turbLatched && !s.turbTripped && s.Psg >= 60) s.latchTurbine();
        if (s.rpm >= 2990) AP.stage = 12;
        break;
      case 12:                                             // sync and pick up ~300 MWe
        holdP(s);
        if (own('sec') && s.ctrl.turbLatched && !s.ctrl.breaker && Math.abs(s.rpm - 3000) < 15) s.closeBreaker();
        if (own('sec')) s.ctrl.turbTarget = 320;
        loadPct = 100 * (s.mwe / C.TURB_EFF) / C.P_NOM_MW;
        excess = s.powerPct() - loadPct;
        dumpTo(s, Math.max(0, Math.min(40, (excess - 1) * 4)));
        feedCtl(s, false);
        if (own('react')) s.ctrl.rodDir = excess > 1.5 ? -1 : excess < -1 ? 1 : 0;
        if (s.phase >= 4) AP.stage = 13;
        break;
      case 13:                                             // ramp to full load
        holdP(s); dumpTo(s, 0); cvcs(s, 'dilute');
        if (own('sec')) {
          s.ctrl.turbTarget = 1100;
          s.ctrl.feed = 100 * (s.steamFlow / C.FEED_MAX) + (s.sgLevel < 48 ? 6 : s.sgLevel > 52 ? -6 : 0);
        }
        tr = PWR.phases.tref(s);
        if (own('react')) s.ctrl.rodDir = s.Tavg < tr - 0.5 ? 1 : s.Tavg > tr + 0.5 ? -1 : 0;
        dil = (s.Tavg < tr - 0.3) && s.cbPos > 90;
        if (own('press')) { s.ctrl.charging = dil ? 25 : 8; s.ctrl.letdown = dil ? 25 : (s.przLevel > 58 ? 14 : 8); }
        if (s.mwe >= 1078) { cvcs(s, 'normal'); AP.stage = 14; }
        break;
      default:                                             // 14: hold at full power
        holdP(s); dumpTo(s, 0);
        if (own('sec')) {
          s.ctrl.turbTarget = 1100;
          s.ctrl.feed = 100 * (s.steamFlow / C.FEED_MAX) + (s.sgLevel < 48 ? 6 : s.sgLevel > 52 ? -6 : 0);
        }
        tr = PWR.phases.tref(s);
        if (own('react')) s.ctrl.rodDir = s.Tavg < tr - 0.5 ? 1 : s.Tavg > tr + 0.5 ? -1 : 0;
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
