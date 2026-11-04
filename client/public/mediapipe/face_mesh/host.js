(function () {
  var fm = new FaceMesh({ locateFile: function (f) { return './' + f; } });
  fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  var pending = null;
  fm.onResults(function (r) {
    var lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0];
    var out = null;
    if (lm) { out = new Float32Array(lm.length * 2); for (var i = 0; i < lm.length; i++) { out[2 * i] = lm[i].x; out[2 * i + 1] = lm[i].y; } }
    pending = out;
  });
  fm.initialize().then(function () {
    parent.postMessage({ type: 'gaze-ready' }, location.origin);
  }, function (e) {
    parent.postMessage({ type: 'gaze-error', message: String(e) }, location.origin);
  });
  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'gaze-frame') return;
    var id = ev.data.id, bmp = ev.data.bitmap;
    pending = null;
    fm.send({ image: bmp }).then(function () {
      try { bmp.close(); } catch (e) {}
      parent.postMessage({ type: 'gaze-result', id: id, points: pending }, location.origin);
    }, function () {
      parent.postMessage({ type: 'gaze-result', id: id, points: null }, location.origin);
    });
  });
})();
