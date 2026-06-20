/* Live P-T ("chaussette") diagram: operating domains, boundaries, the plant's
 * trail and current operating point. Modeled after the French CPP
 * temperature-pressure diagram, drawn in the dark control-room HMI style:
 *   APR       refueling shutdown (open/cold, ~1 bar)
 *   AN/RIS-RA cold shutdown on RHR (<= 31 bar, < 177 C)
 *   AN/GV     normal shutdown on steam generators (the sock)
 *   RP        reactor in production (155 bar, ~290-310 C)
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.PTDiagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var mL = 34, mR = 8, mT = 12, mB = 22;
  var TMAX = 360, PMAX = 180;

  var BG = '#0b1219', FRAME = '#34495e', GRIDC = 'rgba(52,73,94,0.40)',
      TXT = '#9fb1c2', TXT2 = '#647688',
      CYAN = '#45d4e6', AMBER = '#ffb13b', RED = '#ff4759', GRN = '#34d27f', BLUE = '#4ea4ff';

  function X(t) { return mL + (W - mL - mR) * t / TMAX; }
  function Y(p) { return H - mB - (H - mB - mT) * p / PMAX; }

  function curve(fn, t0, t1, close) {
    ctx.beginPath();
    for (var t = t0; t <= t1; t += 4) {
      var x = X(t), y = Y(Math.min(PMAX, fn(t)));
      t === t0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    if (close) close();
  }

  function fillPath(color) { ctx.save(); ctx.fillStyle = color; ctx.fill(); ctx.restore(); }

  this.draw = function (s) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = GRIDC; ctx.lineWidth = 1;
    ctx.font = '500 8.5px "IBM Plex Mono", monospace'; ctx.fillStyle = TXT2;
    for (var t = 0; t <= TMAX; t += 60) {
      ctx.beginPath(); ctx.moveTo(X(t), Y(0)); ctx.lineTo(X(t), mT); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(t, X(t), H - 9);
    }
    for (var p = 0; p <= PMAX; p += 30) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(p)); ctx.lineTo(W - mR, Y(p)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(p, mL - 4, Y(p) + 3);
    }
    ctx.fillStyle = TXT; ctx.textAlign = 'left';
    ctx.fillText('bar', 4, mT + 4);
    ctx.textAlign = 'right'; ctx.fillText('Tavg \u00b0C', W - mR, H - 9);

    // APR domain (refueling, cold & open)
    ctx.beginPath(); ctx.rect(X(15), Y(4), X(70) - X(15), Y(0.5) - Y(4));
    fillPath('rgba(255,177,59,0.16)');
    // AN/RIS-RA domain
    ctx.beginPath(); ctx.rect(X(15), Y(31), X(177) - X(15), Y(1) - Y(31));
    fillPath('rgba(78,164,255,0.14)');
    // AN/GV sock
    ctx.beginPath();
    var t1;
    for (t1 = 177; t1 <= 310; t1 += 2) {
      var y = Y(Math.max(28, PWR.ptMin(t1)));
      t1 === 177 ? ctx.moveTo(X(t1), y) : ctx.lineTo(X(t1), y);
    }
    for (t1 = 310; t1 >= 177; t1 -= 2) ctx.lineTo(X(t1), Y(PWR.ptMax(t1)));
    ctx.closePath();
    fillPath('rgba(69,212,230,0.12)');
    // RP domain — production
    ctx.beginPath(); ctx.rect(X(286), Y(158), X(320) - X(286), Y(152) - Y(158));
    fillPath('rgba(52,210,127,0.32)');

    // boundaries
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    curve(PWR.ptMax, 15, 310, function () { ctx.stroke(); });           // upper limit
    ctx.strokeStyle = AMBER; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.8;
    curve(PWR.ptMin, 130, 320, function () { ctx.stroke(); });          // lower limit (margin)
    ctx.strokeStyle = RED; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.5;
    curve(function (t) { return PWR.water.psat(t); }, 100, 355, function () { ctx.stroke(); }); // saturation
    ctx.setLineDash([]);

    // domain labels
    ctx.font = '600 8.5px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = AMBER; ctx.fillText('APR', X(20), Y(6) - 2);
    ctx.fillStyle = BLUE; ctx.fillText('AN/RIS-RA', X(56), Y(20));
    ctx.fillStyle = CYAN; ctx.fillText('AN/GV', X(214), Y(100));
    ctx.fillStyle = GRN; ctx.fillText('RP', X(303), Y(165));
    ctx.fillStyle = RED; ctx.fillText('sat.', X(330), Y(PWR.water.psat(330)) + 10);

    // trail
    if (s.ptHistory.length > 1) {
      ctx.strokeStyle = 'rgba(159,177,194,0.6)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]);
      ctx.beginPath();
      s.ptHistory.forEach(function (q, i) {
        i === 0 ? ctx.moveTo(X(q[0]), Y(Math.min(PMAX, q[1]))) : ctx.lineTo(X(q[0]), Y(Math.min(PMAX, q[1])));
      });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // current operating point
    if (s.filled) {
      var bad = s.alarms.PT_HI || s.alarms.PT_LO;
      var x0 = X(s.Tavg), y0 = Y(Math.min(PMAX, s.P));
      ctx.strokeStyle = 'rgba(159,177,194,0.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, mT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mL, y0); ctx.lineTo(W - mR, y0); ctx.stroke();
      var col = bad ? RED : CYAN;
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x0, y0, 4.5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x0, y0, 8.5, 0, 7); ctx.stroke();
      if (bad) {
        ctx.fillStyle = RED; ctx.font = '600 10px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('OUT OF ENVELOPE', W / 2, mT + 14);
      }
    }
  };
};
