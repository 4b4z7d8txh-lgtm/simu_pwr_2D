/* Water property approximations (good enough for a simulation game, 1..175 bar) */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {})
                                          : (global.PWR = global.PWR || {});

PWR.water = (function () {
  // Antoine equation (valid ~99..374 C), pressure in bar absolute
  function psat(Tc) {
    var mmHg = Math.pow(10, 8.14019 - 1810.94 / (244.485 + Tc));
    return mmHg / 750.06;
  }
  function tsat(Pbar) {
    var p = Math.max(Pbar, 0.01);
    return 1810.94 / (8.14019 - Math.log10(p * 750.06)) - 244.485;
  }
  // Liquid density kg/m3 (compressed liquid, rough fit 20..340 C)
  function rho(Tc) {
    return Math.max(620, 1011 - 0.22 * Tc - 0.0023 * Tc * Tc);
  }
  // Latent heat kJ/kg (Watson correlation)
  function hfg(Tc) {
    var x = Math.max(0.02, (374 - Tc) / 274);
    return 2257 * Math.pow(x, 0.38);
  }
  return { psat: psat, tsat: tsat, rho: rho, hfg: hfg };
})();

if (typeof module !== 'undefined') module.exports = PWR;
