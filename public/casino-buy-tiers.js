/**
 * USD-pegged casino buy-in tiers from GET /api/casino/buy-tiers.
 */
(function (global) {
  'use strict';

  var tiers = null;
  var xmaUsd = null;

  function populateCostSelect(selectEl, preferredXma) {
    if (!selectEl || !tiers || !tiers.length) return null;
    selectEl.innerHTML = '';
    tiers.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = String(t.xma);
      opt.textContent = t.optionLabel || t.xmaLabel + ' XMA (' + t.usdLabel + ')';
      selectEl.appendChild(opt);
    });
    if (preferredXma != null) return selectCost(selectEl, preferredXma);
    var def = getDefaultXma();
    if (def != null) selectEl.value = String(def);
    return def;
  }

  function selectCost(selectEl, cost) {
    if (!selectEl || !selectEl.options.length) return Number(cost) || 0;
    var target = Number(cost);
    var opts = Array.prototype.slice.call(selectEl.options);
    var exact = opts.find(function (o) { return Number(o.value) === target; });
    if (exact) {
      selectEl.value = exact.value;
      return Number(exact.value);
    }
    var best = opts[0];
    var bestDiff = Math.abs(Number(best.value) - target);
    opts.forEach(function (o) {
      var d = Math.abs(Number(o.value) - target);
      if (d < bestDiff) {
        best = o;
        bestDiff = d;
      }
    });
    selectEl.value = best.value;
    return Number(best.value);
  }

  function isAllowedCost(cost) {
    var c = Number(cost);
    if (!tiers || !tiers.length) return c > 0;
    return tiers.some(function (t) { return Number(t.xma) === c; });
  }

  function load() {
    return fetch('/api/casino/buy-tiers', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.tiers) && data.tiers.length) {
          tiers = data.tiers;
          xmaUsd = data.xmaUsd;
        }
        return tiers || [];
      })
      .catch(function () { return []; });
  }

  function getTiers() {
    return tiers || [];
  }

  function getDefaultXma() {
    if (!tiers || !tiers.length) return null;
    var one = tiers.find(function (t) { return t.usd === 1; });
    return one ? one.xma : tiers[Math.floor(tiers.length / 2)].xma;
  }

  function getXmaUsd() {
    return xmaUsd;
  }

  global.CasinoBuyTiers = {
    load: load,
    getTiers: getTiers,
    getDefaultXma: getDefaultXma,
    getXmaUsd: getXmaUsd,
    populateCostSelect: populateCostSelect,
    selectCost: selectCost,
    isAllowedCost: isAllowedCost,
  };
})(typeof window !== 'undefined' ? window : global);
