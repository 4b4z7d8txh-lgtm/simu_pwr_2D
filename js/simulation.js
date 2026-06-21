/* PWR plant simulation core (DOM-free so it can be unit-tested in Node).
 *
 * Simplified but physically-motivated models:
 *  - Point kinetics, one delayed-neutron group, prompt-jump approximation,
 *    fixed neutron source (subcritical multiplication / 1-M behaviour).
 *  - Reactivity = excess + boron + control/shutdown rods + moderator + Doppler.
 *  - Lumped thermal model: fuel node, RCS coolant node, SG secondary node.
 *  - Pressurizer: water-solid mode (pressure from net volume change) and
 *    steam-bubble mode (pressure = Psat(T pressurizer)).
 *  - Decay heat as a first-order lag of fission power.
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {})
                                          : (global.PWR = global.PWR || {});
if (typeof require !== 'undefined' && !PWR.water) require('./water.js');

PWR.C = {
  P_NOM_MW: 3000,          // nominal core thermal power
  MWE_NOM: 1100,           // nominal electrical output
  TURB_EFF: 0.3667,        // MWe per MWth of steam
  BETA: 0.0065,            // delayed neutron fraction
  LAMBDA: 0.08,            // delayed precursor decay constant (1/s)
  GEN_TIME: 1e-4,          // effective generation time (s)
  SOURCE: 4.5e-5,          // neutron source strength (MW-equivalent units)

  EXCESS_PCM: 12000,       // core excess reactivity, rods out, no boron, HZP
  BORON_WORTH: -10,        // pcm / ppm (ref: ~-10 pcm/ppm at BOC)
  ALPHA_MOD: -20,          // moderator coefficient pcm/K (ref: -30..-50 hot in-core)
  ALPHA_FUEL: -3,          // Doppler coefficient pcm/K (ref: ~-3 pcm/K fuel)
  T_REF: 292,              // reference temperature for coefficients (C)
  CB_WORTH: -1200,         // control bank total worth (pcm)
  SD_WORTH: -6000,         // shutdown banks total worth (pcm)
  ROD_SPEED: 0.5,          // % of full travel per second

  C_FUEL: 30e3,            // fuel heat capacity kJ/K
  H_FC: 5e3,               // fuel->coolant conductance kW/K
  C_RCS: 1.5e6,            // RCS coolant+metal heat capacity kJ/K
  C_SG: 1.2e6,             // SG secondary heat capacity kJ/K
  C_PRZ: 120e3,            // pressurizer water heat capacity kJ/K
  UA_SG: 143e3,            // primary->secondary conductance kW/K (4 RCPs)
  PUMP_HEAT: 5.9,          // MW per RCP — GMPP hot shaft power ~5910 kW (1300 MWe),
                           // dissipated entirely into the closed primary loop
  AMB_LOSS: 2,             // MW losses to containment
  FLOW_NOM: 18000,         // kg/s primary flow, 4 pumps
  CP: 5.0,                 // kJ/kg.K average primary cp

  V_LOOPS: 270,            // m3 of loops + vessel (always liquid-full)
  V_PRZ: 50,               // m3 pressurizer volume
  M_RCS_REF: 250000,       // kg, used for boron mixing
  PRZ_HEATER_MW: 1.8,      // total heater power
  SPRAY_KGS: 35,           // max spray flow kg/s
  SOLID_STIFF: 60,         // bar per m3 net volume change when water-solid

  DUMP_CAP_MW: 1600,       // steam dump capacity at reference pressure
  SG_PREF: 75,             // reference SG pressure (bar)
  SG_SAFETY_BAR: 86,
  FEED_MAX: 2300,          // kg/s
  SG_KG_PER_PCT: 2400,     // SG inventory per % of level

  RCP_MIN_P: 24,           // bar needed to run RCPs (seal/NPSH)
  PORV_BAR: 163,           // power-operated relief valve lift
  SAFETY_BAR: 172,         // pressurizer safety valves (SEBIM) set pressure
  TRIP_HI_P: 169,          // reactor trip on PRZ high pressure (below safety set)
  TRIP_LO_P: 131,
  TRIP_HI_FLUX: 118,       // % nominal (ref: high neutron flux trip 118% Pn)
  TRIP_SUR: 5,             // decades per minute
  TRIP_HI_TAVG: 330,       // ref: max core-outlet 330 C; trip on high Tavg
  TRIP_LO_SGLVL: 15,
  HEATUP_LIMIT: 56         // C/h fatigue limit on primary components (ref)
};

/* ----------------------------------------------------------------------------
 * Difficulty levels. "real" reproduces the original full-fidelity behaviour
 * (tight bands, every protective trip armed); "beginner" relaxes the bands,
 * softens the pressurizer, raises trip setpoints and shortens the holds so the
 * sequence can be completed while learning. PWR.D is the active config and
 * defaults to "real" so the headless regression test is unaffected.
 * -------------------------------------------------------------------------- */
PWR.difficulties = {
  real: {
    label: 'REAL SIMULATION',
    blurb: 'Full fidelity. Tight bands and every protective trip armed — the plant exactly as it behaves.',
    tripSUR: 5,            // startup-rate trip, decades/min
    heatupLimit: 56,       // C/h fatigue limit (alarm + readout)
    solidStiff: 60,        // bar per m3 net volume change, water-solid
    surStab: 0.3,          // |SUR| window to declare the reactor stable
    stabHold: 60,          // s to hold the stable criticality condition
    winHold: 300,          // s to hold full power for the win
    pBand: [152, 158],     // RCS pressure objective band, bar
    tavgBand: [286, 296],  // RCS Tavg objective band, C
    przBand: [40, 70],     // pressurizer level objective band, %
    sgBand: [40, 60],      // SG level objective band, %
    tavgTol: 4,            // +/- C of program at the power ramp
    pWin: [150, 160],      // pressure band held during the final 5 min
    sgWin: [35, 65],       // SG level band held during the final hold
    tavgWinTol: 5,         // +/- C of program during the final hold
    ptPointPenalty: 10,    // points lost per 30 s outside the P-T envelope
    tripScore: 150         // points lost on a reactor trip
  },
  beginner: {
    label: 'BEGINNER',
    blurb: 'Forgiving bands, a gentler pressurizer, relaxed trips and shorter holds. Learn the moves without tripping.',
    tripSUR: 9,
    heatupLimit: 120,
    solidStiff: 22,
    surStab: 0.7,
    stabHold: 20,
    winHold: 90,
    pBand: [146, 162],
    tavgBand: [281, 301],
    przBand: [28, 82],
    sgBand: [33, 67],
    tavgTol: 8,
    pWin: [144, 164],
    sgWin: [30, 70],
    tavgWinTol: 9,
    ptPointPenalty: 0,
    tripScore: 40
  }
};
PWR.D = PWR.difficulties.real;       // active difficulty (default = real)
PWR.setDifficulty = function (name) {
  if (PWR.difficulties[name]) PWR.D = PWR.difficulties[name];
  return PWR.D;
};

/* P-T operating envelope, after the French "chaussette" (sock) diagram:
 * - below 177 C (AN/RIS-RA domain): max 31 bar (RHR / cold overpressure limit)
 * - above 177 C (AN/GV sock): left edge jumps to 90 bar then rises ~1 bar/C
 * - lower boundary: saturation pressure at T + 35 K (subcooling margin)     */
PWR.ptMax = function (T) {
  if (T < 177) return 31;
  return Math.min(160, 90 + (T - 178));
};
PWR.ptMin = function (T) {
  return Math.max(1, PWR.water.psat(T + 35));
};

PWR.Simulation = function () {
  var C = PWR.C, W = PWR.water;
  var S = this;

  /* ---------------- state ---------------- */
  S.t = 0;                       // simulation time, s
  S.phase = 0;                   // index into PWR.phases
  S.score = 1000;
  S.gameOver = false; S.win = false;

  // neutronics
  S.Pn = 5e-8;                   // fission power, MW
  S.prec = C.BETA * S.Pn / (C.GEN_TIME * C.LAMBDA); // precursors (consistent)
  S.decay = 0;                   // decay heat, MW
  S.rho = -10000;                // last computed reactivity, pcm
  S.sur = 0;                     // startup rate, decades/min
  S.cbPos = 0;                   // control bank, 0 (in) .. 100 (out)
  S.sdPos = 0;                   // shutdown banks
  S.boron = 2200;                // ppm
  S.tripped = false; S.tripReason = '';
  S.critical = false;            // latched once criticality reached

  // thermal-hydraulics
  S.Tfuel = 45; S.Tavg = 45; S.Tprz = 45; S.Tsg = 45;
  S.P = 1.0;                     // RCS pressure, bar
  S.Psg = 1.0;
  S.bubble = false;              // pressurizer steam bubble exists
  S.przLevel = 100;
  S.mass = 0;                    // RCS liquid mass kg (0 = not filled yet)
  S.filled = false; S.headOn = false; S.coreLoaded = 0; // 0..100 %
  S.sgLevel = 50;
  S.heatupRate = 0;              // C/h, smoothed
  S.mwe = 0; S.rpm = 0; S.qTurb = 0; S.qDump = 0; S.qSafety = 0;
  S.steamFlow = 0; S.feedFlow = 0;
  S.porvOpen = false; S.turbTripped = false;
  S.surgeRate = 0;               // kg/s into pressurizer (display)
  S.ptHistory = [];              // sampled [Tavg, P] trail for the P-T diagram
  S._prevVliq = null; S._logP = Math.log10(S.Pn);

  /* ---------------- player controls ---------------- */
  S.ctrl = {
    rodDir: 0,                   // -1 in, 0 hold, +1 out (control bank)
    sdDir: 0,                    // shutdown banks
    charging: 5, letdown: 5,     // kg/s
    cvcs: 'normal',              // 'normal' | 'dilute' | 'borate'
    heater: 0,                   // proportional heaters %
    heaterBackup: false,
    spray: 0,                    // %
    rcp: [false, false, false, false],
    dump: 0,                     // steam dump %
    feed: 0,                     // feedwater % of max
    turbLatched: false, breaker: false, turbTarget: 0 // MWe setpoint
  };

  S.alarms = {};                 // id -> true while condition present
  S.events = [];                 // log of {t, msg, kind}

  S.log = function (msg, kind) {
    S.events.push({ t: S.t, msg: msg, kind: kind || 'info' });
    if (S.events.length > 200) S.events.shift();
  };

  /* ---------------- actions ---------------- */
  S.loadFuel = function () { if (!S.headOn) S._loading = true; };
  S.installHead = function () {
    if (S.coreLoaded >= 100 && !S.headOn) { S.headOn = true; S.log('Reactor vessel head installed and tensioned.', 'good'); }
  };
  S.fillAndVent = function () {
    if (S.headOn && !S.filled) {
      S.filled = true; S.bubble = false; S.P = 2.0;
      S.mass = (PWR.C.V_LOOPS + PWR.C.V_PRZ) * PWR.water.rho(S.Tavg);
      S.log('RCS filled and vented - plant is water-solid.', 'good');
    }
  };
  S.scram = function (reason) {
    if (S.tripped) return;
    S.tripped = true; S.tripReason = reason;
    S.cbPos = 0; S.sdPos = 0; S.ctrl.rodDir = 0; S.ctrl.sdDir = 0;
    S.tripTurbine('reactor trip');
    S.score -= PWR.D.tripScore;
    S.log('REACTOR TRIP: ' + reason, 'bad');
  };
  S.resetTrip = function () {
    if (S.tripped && S.Pn < 1 && Math.abs(S.sur) < 0.5) {
      S.tripped = false; S.tripReason = ''; S.critical = false;
      S.log('Reactor trip reset. Rods may be withdrawn.', 'good');
      return true;
    }
    return false;
  };
  S.tripTurbine = function (why) {
    if (S.ctrl.turbLatched || S.rpm > 1) {
      S.turbTripped = true; S.ctrl.turbLatched = false; S.ctrl.breaker = false;
      S.ctrl.turbTarget = 0;
      S.log('Turbine trip (' + why + ').', 'bad');
    }
  };
  S.latchTurbine = function () {
    if (S.Psg >= 60 && !S.tripped) {
      S.ctrl.turbLatched = true; S.turbTripped = false;
      S.log('Turbine latched, rolling to 3000 rpm.', 'good');
    } else S.log('Cannot latch turbine: need SG pressure >= 60 bar.', 'warn');
  };
  S.closeBreaker = function () {
    if (S.ctrl.turbLatched && Math.abs(S.rpm - 3000) < 15) {
      S.ctrl.breaker = true; S.log('Generator synchronized to grid.', 'good');
    } else S.log('Sync blocked: turbine must be at 3000 rpm.', 'warn');
  };
  S.startRcp = function (i) {
    if (S.ctrl.rcp[i]) return;
    if (!S.filled) { S.log('Cannot start RCP: RCS not filled.', 'warn'); return; }
    if (S.P < C.RCP_MIN_P) { S.log('RCP ' + (i + 1) + ' start blocked: RCS pressure < ' + C.RCP_MIN_P + ' bar (seal injection).', 'warn'); return; }
    S.ctrl.rcp[i] = true; S.log('RCP ' + (i + 1) + ' started.', 'good');
  };

  /* ---------------- helpers ---------------- */
  function sCurve(x) { x = Math.min(1, Math.max(0, x)); return x - Math.sin(2 * Math.PI * x) / (2 * Math.PI); }

  S.rodWorth = function () {
    return C.CB_WORTH * (1 - sCurve(S.cbPos / 100)) + C.SD_WORTH * (1 - S.sdPos / 100);
  };
  S.reactivity = function () {
    if (S.coreLoaded < 100) return -99000;
    var r = C.EXCESS_PCM + C.BORON_WORTH * S.boron + S.rodWorth();
    r += C.ALPHA_MOD * (S.Tavg - C.T_REF) + C.ALPHA_FUEL * (S.Tfuel - C.T_REF);
    return r;
  };
  S.nPumps = function () { var n = 0; S.ctrl.rcp.forEach(function (p) { if (p) n++; }); return n; };
  S.subcooling = function () {
    var dTcore = S.thermalPower() * 1000 / (Math.max(0.04, S.nPumps() / 4) * C.FLOW_NOM * C.CP);
    return W.tsat(S.P) - (S.Tavg + dTcore / 2);
  };
  S.coreDT = function () {
    return S.thermalPower() * 1000 / (Math.max(0.04, S.nPumps() / 4) * C.FLOW_NOM * C.CP);
  };
  S.tHot = function () { return S.Tavg + S.coreDT() / 2; };
  S.tCold = function () { return S.Tavg - S.coreDT() / 2; };
  S.thermalPower = function () { return S.Pn * 0.94 + S.decay; };
  S.powerPct = function () { return 100 * S.thermalPower() / C.P_NOM_MW; };
  S.ptMaxP = function () { return PWR.ptMax(S.Tavg); };

  /* ---------------- main step ---------------- */
  S.step = function (dt) {
    if (S.gameOver) return;
    S.t += dt;
    var ct = S.ctrl;

    /* --- phase 0 mechanical actions --- */
    if (S._loading && S.coreLoaded < 100) {
      S.coreLoaded = Math.min(100, S.coreLoaded + dt * (100 / 120));
      if (S.coreLoaded >= 100) { S._loading = false; S.log('Core loading complete: 157 fuel assemblies in place.', 'good'); }
    }

    /* --- rods --- */
    if (!S.tripped) {
      S.cbPos = Math.min(100, Math.max(0, S.cbPos + ct.rodDir * C.ROD_SPEED * dt));
      S.sdPos = Math.min(100, Math.max(0, S.sdPos + ct.sdDir * C.ROD_SPEED * dt));
    }

    /* --- CVCS: boron and inventory --- */
    if (S.filled) {
      var srcPpm = ct.cvcs === 'dilute' ? 0 : ct.cvcs === 'borate' ? 7000 : S.boron;
      S.boron += ct.charging * (srcPpm - S.boron) / C.M_RCS_REF * dt;
      S.mass += (ct.charging - ct.letdown) * dt;
    }

    /* --- neutronics (prompt jump approximation) --- */
    S.rho = S.reactivity();
    var rhoAbs = Math.min(S.rho * 1e-5, C.BETA * 0.95); // dk/k, clamped below prompt critical
    S.Pn = Math.max(0, C.GEN_TIME * (C.LAMBDA * S.prec + C.SOURCE) / (C.BETA - rhoAbs));
    S.prec += (C.BETA * S.Pn / C.GEN_TIME - C.LAMBDA * S.prec) * dt;
    // startup rate (decades per minute), smoothed
    var lp = Math.log10(Math.max(S.Pn, 1e-12));
    var surInst = (lp - S._logP) / dt * 60;
    S._logP = lp;
    S.sur += (surInst - S.sur) * Math.min(1, dt / 2);
    // decay heat
    S.decay += (0.06 * S.Pn - S.decay) * dt / 1500;
    if (!S.critical && !S.tripped && S.Pn > 5e-3 && S.rho > -50) {
      S.critical = true; S.log('REACTOR CRITICAL.', 'good');
    }

    /* --- core / RCS thermal --- */
    var Pth = S.thermalPower();
    S.Tfuel += (Pth * 1000 - C.H_FC * (S.Tfuel - S.Tavg)) * dt / C.C_FUEL;
    var nP = S.nPumps();
    var ua = C.UA_SG * Math.max(0.05, nP / 4);          // natural circ ~5%
    var qSG = ua * (S.Tavg - S.Tsg) / 1000;             // MW to secondary
    if (!S.filled) qSG = 0;
    var qIn = C.H_FC * (S.Tfuel - S.Tavg) / 1000 + nP * C.PUMP_HEAT;
    var dTavg = (qIn - qSG - C.AMB_LOSS) * 1000 * dt / C.C_RCS;
    if (!S.filled) dTavg = (qIn) * 1000 * dt / (C.C_RCS); // open vessel: just core pool
    S.Tavg = Math.max(20, S.Tavg + dTavg);
    S.heatupRate += ((dTavg / dt) * 3600 - S.heatupRate) * Math.min(1, dt / 10);

    /* --- pressurizer --- */
    if (S.filled) {
      var qHtr = (ct.heater / 100 + (ct.heaterBackup ? 1 : 0)) * 0.5 * C.PRZ_HEATER_MW;
      if (S.bubble && S.przLevel < 8) qHtr = 0;         // heaters uncovered: cut off
      var sprayOk = ct.rcp[0] || ct.rcp[1];             // spray driven by loop dP
      var qSpray = sprayOk ? (ct.spray / 100) * C.SPRAY_KGS * 4.8 * Math.max(0, S.Tprz - S.Tavg) / 1000 : 0;
      // PORV
      S.porvOpen = S.bubble && S.P > C.PORV_BAR;
      var qPorv = S.porvOpen ? 6 : 0;
      // insurge mixing: rising level pushes cooler loop water into PRZ
      var qSurge = Math.max(0, S.surgeRate) * 4.8 * (S.Tavg - S.Tprz) / 1000;
      S.Tprz += (qHtr - qSpray - qPorv + qSurge - 0.15) * 1000 * dt / C.C_PRZ;
      S.Tprz = Math.max(20, Math.min(370, S.Tprz));
      if (!S.bubble) S.Tprz = Math.max(S.Tprz, S.Tavg - 5); // solid: loop water circulates through

      // level from inventory: loops always full, remainder sits in pressurizer
      var mLoops = C.V_LOOPS * W.rho(S.Tavg);
      var mPrz = S.mass - mLoops;
      var przCap = C.V_PRZ * W.rho(S.Tprz);
      var lvl = Math.min(100, Math.max(0, 100 * mPrz / przCap));
      S.surgeRate = (lvl - S.przLevel) / 100 * przCap / dt;
      S.przLevel = lvl;

      if (!S.bubble) {
        // water-solid: pressure responds stiffly to net volume change
        // (loop water at Tavg + thermal expansion of the hotter PRZ volume)
        var vLiq = S.mass / W.rho(S.Tavg) + C.V_PRZ * (1 - W.rho(S.Tprz) / W.rho(S.Tavg));
        if (S._prevVliq === null) S._prevVliq = vLiq;
        var dP = PWR.D.solidStiff * (vLiq - S._prevVliq);
        S.P += Math.max(-8 * dt, Math.min(8 * dt, dP));
        S._prevVliq = vLiq;
        S.P = Math.max(W.psat(S.Tprz), Math.max(1, S.P));
        if (S.przLevel < 99.7) {
          S.bubble = true;
          S.log('Steam bubble drawn in pressurizer at ' + S.P.toFixed(1) + ' bar.', 'good');
        }
      } else {
        S.P = Math.max(1, W.psat(S.Tprz));
        S._prevVliq = null;
        if (S.przLevel > 99.7) { S.bubble = false; S.log('Pressurizer went water-solid!', 'bad'); S.score -= 20; }
      }
    }

    /* --- steam generator secondary --- */
    if (S.filled) {
      // turbine
      if (ct.turbLatched) S.rpm = Math.min(3000, S.rpm + 25 * dt);
      else S.rpm = Math.max(0, S.rpm - 15 * dt);
      var qTurbReq = 0;
      if (ct.breaker && ct.turbLatched) {
        var ramp = 25 / 60; // MWe per s
        S.mwe += Math.max(-ramp * dt * 4, Math.min(ramp * dt, ct.turbTarget - S.mwe));
        qTurbReq = S.mwe / C.TURB_EFF;
        // steam pressure derate: can't draw rated steam from a cold SG
        var qAvail = C.P_NOM_MW * 1.05 * Math.min(1, Math.max(0, (S.Psg - 20) / 50));
        if (qTurbReq > qAvail) { qTurbReq = qAvail; S.mwe = qTurbReq * C.TURB_EFF; }
      } else S.mwe = 0;
      S.qTurb = qTurbReq;
      var pFactor = Math.max(0, (S.Psg - 1)) / C.SG_PREF;
      S.qDump = (ct.dump / 100) * C.DUMP_CAP_MW * pFactor;
      S.qSafety = Math.max(0, S.Psg - C.SG_SAFETY_BAR) * 200;
      var qSteam = S.qTurb + S.qDump + S.qSafety;
      S.feedFlow = (ct.feed / 100) * C.FEED_MAX;
      var hfg = W.hfg(Math.max(100, S.Tsg));
      S.steamFlow = qSteam * 1000 / Math.max(800, hfg);
      var tFeed = ct.breaker ? 180 : 90; // main feed heated, aux feed from deaerator
      var qFeedMis = Math.max(0, S.feedFlow - S.steamFlow) * 4.5 * Math.max(0, S.Tsg - tFeed) / 1000;
      S.Tsg += (qSG - qSteam - qFeedMis) * 1000 * dt / C.C_SG;
      S.Tsg = Math.max(20, S.Tsg);
      S.Psg = Math.max(1, W.psat(S.Tsg));
      S.sgLevel += (S.feedFlow - S.steamFlow) / C.SG_KG_PER_PCT * dt;
      S.sgLevel = Math.min(100, Math.max(0, S.sgLevel));
      // RCPs trip on loss of pressure
      if (S.P < C.RCP_MIN_P - 4) {
        for (var i = 0; i < 4; i++) if (ct.rcp[i]) { ct.rcp[i] = false; S.log('RCP ' + (i + 1) + ' tripped on low RCS pressure!', 'bad'); }
      }
    }

    // P-T trail for the chaussette diagram
    if (S.filled && S.t - (S._histT || 0) >= 20) {
      S._histT = S.t;
      S.ptHistory.push([S.Tavg, S.P]);
      if (S.ptHistory.length > 900) S.ptHistory.shift();
    }

    S.updateAlarms(dt);
    S.checkTrips();
    if (PWR.phases) PWR.phases.update(S, dt);
  };

  /* ---------------- alarms & trips ---------------- */
  S.updateAlarms = function (dt) {
    var A = {}, hot = S.bubble && S.Tavg > 200;
    A.RX_TRIP = S.tripped;
    A.TURB_TRIP = S.turbTripped;
    A.HI_SUR = S.sur > 3;
    A.HI_FLUX = S.powerPct() > 105;
    A.PRZ_HI_P = S.P > 160;
    A.PRZ_LO_P = hot && S.Tavg > 280 && S.P < 140;
    A.PRZ_HI_L = S.filled && S.bubble && S.przLevel > 80;
    A.PRZ_LO_L = S.filled && S.bubble && S.przLevel < 18;
    A.HTR_UNCOV = S.filled && S.bubble && S.przLevel < 8;
    A.PORV = S.porvOpen;
    A.PT_HI = S.filled && S.P > PWR.ptMax(S.Tavg) + 2;
    A.PT_LO = S.filled && S.bubble && S.P < PWR.ptMin(S.Tavg) - 2;
    A.LO_SUBCOOL = S.filled && S.Tavg > 200 && S.subcooling() < 15;
    A.HI_HEATUP = S.filled && Math.abs(S.heatupRate) > PWR.D.heatupLimit;
    A.SG_LO_L = S.filled && S.powerPct() > 2 && S.sgLevel < 30;
    A.SG_HI_L = S.filled && S.sgLevel > 75;
    A.SG_SAFETY = S.qSafety > 1;
    A.HI_TAVG = S.filled && S.tHot() > 326;   // core outlet nearing 330 C limit
    A.LO_FLOW = S.powerPct() > 25 && S.nPumps() < 4;
    // sustained operation outside the P-T envelope costs points
    if (A.PT_HI || A.PT_LO) {
      S._violT = (S._violT || 0) + (dt || 0);
      if (PWR.D.ptPointPenalty > 0 && S._violT >= 30) {
        S._violT -= 30; S.score -= PWR.D.ptPointPenalty;
        S.log('Operating outside the P-T envelope: -' + PWR.D.ptPointPenalty + ' points.', 'warn');
      }
    } else S._violT = 0;
    S.alarms = A;
  };

  S.checkTrips = function () {
    if (S.tripped || !S.filled) return;
    var C = PWR.C;
    var armed = S.critical || S.Pn > 0.5;
    if (armed && S.powerPct() > C.TRIP_HI_FLUX) return S.scram('high neutron flux (>' + C.TRIP_HI_FLUX + '%)');
    if (armed && S.sur > PWR.D.tripSUR) return S.scram('high startup rate (>' + PWR.D.tripSUR + ' dpm)');
    if (S.bubble && S.P > C.TRIP_HI_P) return S.scram('high pressurizer pressure');
    if (armed && S.bubble && S.Tavg > 280 && S.P < C.TRIP_LO_P) return S.scram('low pressurizer pressure');
    if (armed && S.tHot() > C.TRIP_HI_TAVG) return S.scram('high core-outlet temperature (>' + C.TRIP_HI_TAVG + 'C)');
    if (S.powerPct() > 5 && S.sgLevel < C.TRIP_LO_SGLVL) return S.scram('low-low steam generator level');
    if (S.powerPct() > 30 && S.nPumps() < 4) return S.scram('low reactor coolant flow');
    if (S.bubble && S.powerPct() > 5 && S.przLevel < 10) return S.scram('low pressurizer level');
  };
};

if (typeof module !== 'undefined') module.exports = PWR;
