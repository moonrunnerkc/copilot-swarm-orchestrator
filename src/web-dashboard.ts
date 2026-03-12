import cors from 'cors';
import express from 'express';
import * as path from 'path';
import { createRunsRouter } from './api/routes/runs';
import MetricsCollector from './metrics-collector';

const DEFAULT_PORT = 3002;
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Swarm Orchestrator Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 20px; color: #58a6ff; }
  .header .auto-refresh { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8b949e; }
  .header .auto-refresh label { cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .header .auto-refresh input[type="checkbox"] { cursor: pointer; }
  .header .refresh-dot { width: 6px; height: 6px; border-radius: 50%; background: #8b949e; display: inline-block; }
  .header .refresh-dot.active { background: #3fb950; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .container { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
  .runs-list { display: grid; gap: 12px; }
  .run-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; cursor: pointer; transition: border-color 0.2s; }
  .run-card:hover { border-color: #58a6ff; }
  .run-card h3 { color: #58a6ff; font-size: 14px; margin-bottom: 4px; }
  .run-card p { color: #8b949e; font-size: 13px; }
  .run-card .meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #8b949e; }
  .detail { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; }
  .detail h2 { color: #58a6ff; margin-bottom: 12px; }
  .detail h3 { color: #c9d1d9; margin: 16px 0 8px; }
  .metrics-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .metric { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px; text-align: center; }
  .metric .value { font-size: 22px; font-weight: 700; color: #58a6ff; }
  .metric .label { font-size: 11px; color: #8b949e; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric.green .value { color: #3fb950; }
  .metric.red .value { color: #f85149; }
  .metric.yellow .value { color: #d29922; }
  .steps { display: grid; gap: 8px; margin-top: 12px; }
  .step { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 12px; }
  .step .agent { color: #d2a8ff; font-weight: 600; font-size: 13px; }
  .step .task { color: #c9d1d9; font-size: 13px; margin-top: 4px; }
  .step .step-header { display: flex; align-items: center; gap: 8px; }
  .back-btn { background: none; border: 1px solid #30363d; color: #58a6ff; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-bottom: 16px; }
  .back-btn:hover { background: #21262d; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.pass { background: #238636; color: #fff; }
  .badge.fail { background: #da3633; color: #fff; }
  .badge.info { background: #1f6feb; color: #fff; }
  .badge.warn { background: #9e6a03; color: #fff; }
  .collapsible { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; }
  .collapsible .arrow { transition: transform 0.15s; display: inline-block; font-size: 10px; color: #8b949e; }
  .collapsible .arrow.open { transform: rotate(90deg); }
  .collapse-body { display: none; }
  .collapse-body.open { display: block; }
  .transcript { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 12px; margin-top: 8px; max-height: 500px; overflow-y: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap; color: #8b949e; position: relative; }
  .copy-btn { position: absolute; top: 6px; right: 6px; background: #21262d; border: 1px solid #30363d; color: #8b949e; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; z-index: 1; }
  .copy-btn:hover { background: #30363d; color: #c9d1d9; }
  .wave-grid { display: grid; gap: 8px; margin-top: 8px; }
  .wave-card { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 12px; }
  .wave-card .wave-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .wave-card .wave-header strong { color: #c9d1d9; font-size: 13px; }
  .wave-steps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .wave-step-chip { font-size: 11px; padding: 2px 8px; border-radius: 3px; background: #21262d; border: 1px solid #30363d; }
  .wave-step-chip.pass { border-color: #238636; color: #3fb950; }
  .wave-step-chip.fail { border-color: #da3633; color: #f85149; }
  .pattern-list { display: grid; gap: 6px; margin-top: 8px; }
  .pattern-item { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 10px; font-size: 12px; }
  .pattern-item .pattern-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .pattern-item .insight { color: #c9d1d9; }
  .pattern-item .evidence { color: #8b949e; font-size: 11px; margin-top: 4px; }
  .section-sep { border: none; border-top: 1px solid #21262d; margin: 16px 0; }
  .empty { text-align: center; padding: 48px; color: #8b949e; }
  .loading { text-align: center; padding: 48px; color: #58a6ff; }
  .cost-panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; margin-top: 16px; }
  .cost-panel h3 { color: #d29922; margin-bottom: 12px; }
  .cost-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .cost-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .cost-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #30363d; color: #8b949e; cursor: pointer; user-select: none; white-space: nowrap; }
  .cost-table th:hover { color: #58a6ff; }
  .cost-table th .sort-arrow { font-size: 10px; margin-left: 4px; }
  .cost-table td { padding: 6px 10px; border-bottom: 1px solid #21262d; }
  .cost-table tr:hover td { background: #21262d; }
  .cost-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .burn-bar { margin-top: 12px; }
  .burn-bar .bar-track { height: 20px; background: #21262d; border-radius: 4px; overflow: hidden; position: relative; }
  .burn-bar .bar-fill { height: 100%; border-radius: 4px 0 0 4px; transition: width 0.3s; }
  .burn-bar .bar-label { position: absolute; top: 0; left: 8px; line-height: 20px; font-size: 11px; color: #c9d1d9; }
</style>
</head>
<body>
<div class="header">
  <span style="font-size: 24px;">&#x1F41D;</span>
  <h1>Swarm Orchestrator Dashboard</h1>
  <div class="auto-refresh">
    <span class="refresh-dot" id="refreshDot"></span>
    <label><input type="checkbox" id="autoRefreshToggle"> Auto-refresh</label>
  </div>
</div>
<div class="container" id="app">
  <div class="loading">Loading runs...</div>
</div>
<script>
const app = document.getElementById('app');
let currentView = 'list';
let currentRunId = null;
let refreshInterval = null;

// Auto-refresh toggle
const toggle = document.getElementById('autoRefreshToggle');
const dot = document.getElementById('refreshDot');
toggle.addEventListener('change', function() {
  if (this.checked) {
    dot.classList.add('active');
    refreshInterval = setInterval(function() {
      if (currentView === 'list') init();
      else if (currentView === 'detail' && currentRunId) showRun(currentRunId);
    }, 5000);
  } else {
    dot.classList.remove('active');
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  }
});

async function fetchRuns() {
  const res = await fetch('/api/runs');
  return res.json();
}

async function fetchRun(id) {
  const res = await fetch('/api/runs/' + encodeURIComponent(id));
  return res.json();
}

function fmtTime(ms) {
  if (!ms || ms <= 0) return '0s';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  s = s % 60;
  if (m < 60) return m + 'm ' + s + 's';
  var h = Math.floor(m / 60);
  m = m % 60;
  return h + 'h ' + m + 'm';
}

function toggleCollapse(id) {
  var body = document.getElementById('body-' + id);
  var arrow = document.getElementById('arrow-' + id);
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    arrow.classList.remove('open');
  } else {
    body.classList.add('open');
    arrow.classList.add('open');
  }
}

function copyText(id) {
  var el = document.getElementById('text-' + id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(function() {
    var btn = document.getElementById('copy-' + id);
    if (btn) { btn.textContent = 'Copied'; setTimeout(function() { btn.textContent = 'Copy'; }, 1500); }
  });
}

var costSortCol = 0;
var costSortAsc = true;
function sortCostTable(col) {
  var table = document.getElementById('costTable');
  if (!table) return;
  if (costSortCol === col) { costSortAsc = !costSortAsc; } else { costSortCol = col; costSortAsc = true; }
  var tbody = table.querySelector('tbody');
  var rows = Array.from(tbody.querySelectorAll('tr')).filter(function(r) { return r.querySelector('td'); });
  // Separate totals row (last row with font-weight 700)
  var totalsRow = rows.length > 0 && rows[rows.length - 1].style.fontWeight === '700' ? rows.pop() : null;
  rows.sort(function(a, b) {
    var aCell = a.querySelectorAll('td')[col];
    var bCell = b.querySelectorAll('td')[col];
    var aVal = aCell ? aCell.textContent.trim() : '';
    var bVal = bCell ? bCell.textContent.trim() : '';
    var aNum = parseFloat(aVal);
    var bNum = parseFloat(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) { return costSortAsc ? aNum - bNum : bNum - aNum; }
    return costSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  rows.forEach(function(r) { tbody.appendChild(r); });
  if (totalsRow) tbody.appendChild(totalsRow);
  // Update sort arrows in header
  var ths = table.querySelectorAll('th');
  ths.forEach(function(th, i) {
    var arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = i === col ? (costSortAsc ? '\\u25B2' : '\\u25BC') : '';
  });
}

function buildVerifyMap(data) {
  var map = {};
  if (data.verificationReports && data.verificationReports.length) {
    data.verificationReports.forEach(function(r) {
      var m = r.name.match(/step-(\\d+)/);
      if (m) {
        var passed = r.content.includes('PASSED') || r.content.includes('passed');
        map[parseInt(m[1], 10)] = passed;
      }
    });
  }
  if (data.waveAnalyses && data.waveAnalyses.length) {
    data.waveAnalyses.forEach(function(w) {
      (w.stepReviews || []).forEach(function(sr) {
        if (map[sr.stepNumber] === undefined) {
          map[sr.stepNumber] = sr.verificationPassed;
        }
      });
    });
  }
  return map;
}

function renderList(runs) {
  currentView = 'list';
  currentRunId = null;
  if (runs.length === 0) {
    app.innerHTML = '<div class="empty">No runs found. Execute a swarm plan to see results here.</div>';
    return;
  }
  app.innerHTML = '<h2 style="margin-bottom:16px;color:#c9d1d9;">Execution Runs</h2><div class="runs-list">' +
    runs.map(function(r) { return '<div class="run-card" onclick="showRun(\\'' + r.id + '\\')">' +
      '<h3>' + esc(r.id) + '</h3>' +
      '<p>' + esc(r.goal || 'No goal recorded') + '</p>' +
      '<div class="meta"><span>' + r.steps + ' steps</span><span>' + new Date(r.createdAt).toLocaleString() + '</span></div>' +
    '</div>'; }).join('') + '</div>';
}

async function showRun(id) {
  currentView = 'detail';
  currentRunId = id;
  var scrollY = window.scrollY;
  app.innerHTML = '<div class="loading">Loading run details...</div>';
  var data = await fetchRun(id);
  var verifyMap = buildVerifyMap(data);
  var html = '<button class="back-btn" onclick="init()">\\u2190 Back to runs</button>';
  html += '<div class="detail"><h2>' + esc(id) + '</h2>';
  if (data.plan) {
    html += '<p style="color:#8b949e;margin-bottom:12px;">' + esc(data.plan.goal) + '</p>';
  }

  // Metrics panel
  if (data.metrics) {
    var m = data.metrics;
    var passed = m.verificationsPassed || 0;
    var failed = m.verificationsFailed || 0;
    var total = passed + failed;
    var passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    html += '<div class="metrics-bar">';
    html += '<div class="metric"><div class="value">' + fmtTime(m.totalTimeMs) + '</div><div class="label">Total Time</div></div>';
    html += '<div class="metric"><div class="value">' + (m.stepCount || 0) + '</div><div class="label">Steps</div></div>';
    html += '<div class="metric"><div class="value">' + (m.waveCount || 0) + '</div><div class="label">Waves</div></div>';
    html += '<div class="metric"><div class="value">' + (m.commitCount || 0) + '</div><div class="label">Commits</div></div>';
    html += '<div class="metric' + (passRate === 100 ? ' green' : (passRate === 0 && total > 0 ? ' red' : ' yellow')) + '"><div class="value">' + passRate + '%</div><div class="label">Pass Rate</div></div>';
    html += '<div class="metric' + (failed > 0 ? ' red' : ' green') + '"><div class="value">' + passed + '/' + total + '</div><div class="label">Verified</div></div>';
    if (m.agentsUsed && m.agentsUsed.length) {
      html += '<div class="metric"><div class="value">' + m.agentsUsed.length + '</div><div class="label">Agents</div></div>';
    }
    html += '</div>';
  }

  // Cost attribution panel
  if (data.costAttribution) {
    var ca = data.costAttribution;
    var accPct = Math.round(ca.estimateAccuracy * 100);
    var accColor = accPct >= 80 ? 'green' : (accPct >= 50 ? 'yellow' : 'red');
    html += '<div class="cost-panel"><h3>\\u26A1 Cost Attribution</h3>';
    html += '<div class="cost-summary">';
    html += '<div class="metric"><div class="value">' + ca.totalEstimatedPremiumRequests + '</div><div class="label">Estimated Requests</div></div>';
    html += '<div class="metric"><div class="value">' + ca.totalActualPremiumRequests + '</div><div class="label">Actual Requests</div></div>';
    html += '<div class="metric ' + accColor + '"><div class="value">' + accPct + '%</div><div class="label">Estimate Accuracy</div></div>';
    html += '<div class="metric"><div class="value">' + esc(ca.modelUsed) + '</div><div class="label">Model (' + ca.modelMultiplier + 'x)</div></div>';
    if (ca.overageTriggered) {
      html += '<div class="metric red"><div class="value">Yes</div><div class="label">Overage Triggered</div></div>';
    }
    html += '</div>';

    // Budget burn rate bar
    if (ca.totalEstimatedPremiumRequests > 0) {
      var burnPct = Math.min(100, Math.round((ca.totalActualPremiumRequests / ca.totalEstimatedPremiumRequests) * 100));
      var burnColor = burnPct <= 100 ? '#3fb950' : '#f85149';
      if (burnPct > 80 && burnPct <= 100) burnColor = '#d29922';
      html += '<div class="burn-bar"><div style="font-size:11px;color:#8b949e;margin-bottom:4px;">Budget Burn Rate</div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + burnPct + '%;background:' + burnColor + ';"></div>';
      html += '<div class="bar-label">' + ca.totalActualPremiumRequests + ' / ' + ca.totalEstimatedPremiumRequests + ' premium requests (' + burnPct + '%)</div>';
      html += '</div></div>';
    }

    // Per-step cost breakdown (sortable table)
    if (ca.perStep && ca.perStep.length) {
      html += '<h4 style="margin-top:16px;color:#c9d1d9;font-size:13px;">Per-Step Breakdown</h4>';
      html += '<table class="cost-table" id="costTable"><thead><tr>';
      html += '<th onclick="sortCostTable(0)">Step <span class="sort-arrow">\\u25B2</span></th>';
      html += '<th onclick="sortCostTable(1)">Agent <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(2)">Est. <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(3)">Actual <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(4)">Retries <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(5)">Tokens <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(6)">Fleet <span class="sort-arrow"></span></th>';
      html += '<th onclick="sortCostTable(7)">Duration <span class="sort-arrow"></span></th>';
      html += '</tr></thead><tbody>';
      ca.perStep.forEach(function(sc) {
        html += '<tr>';
        html += '<td class="num">' + sc.stepNumber + '</td>';
        html += '<td>' + esc(sc.agentName) + '</td>';
        html += '<td class="num">' + sc.estimatedPremiumRequests + '</td>';
        html += '<td class="num">' + sc.actualPremiumRequests + '</td>';
        html += '<td class="num">' + sc.retryCount + '</td>';
        html += '<td class="num">' + sc.promptTokens + '</td>';
        html += '<td>' + (sc.fleetMode ? '<span class="badge info">fleet</span>' : '') + '</td>';
        html += '<td class="num">' + fmtTime(sc.durationMs) + '</td>';
        html += '</tr>';
      });

      // Totals row
      var totEst = ca.perStep.reduce(function(s, r) { return s + r.estimatedPremiumRequests; }, 0);
      var totAct = ca.perStep.reduce(function(s, r) { return s + r.actualPremiumRequests; }, 0);
      var totRetry = ca.perStep.reduce(function(s, r) { return s + r.retryCount; }, 0);
      var totTokens = ca.perStep.reduce(function(s, r) { return s + r.promptTokens; }, 0);
      html += '<tr style="border-top:2px solid #30363d;font-weight:700;">';
      html += '<td></td><td>Total</td>';
      html += '<td class="num">' + totEst + '</td>';
      html += '<td class="num">' + totAct + '</td>';
      html += '<td class="num">' + totRetry + '</td>';
      html += '<td class="num">' + totTokens + '</td>';
      html += '<td></td><td></td></tr>';
      html += '</tbody></table>';
    }
    html += '</div>';
  }

  // Steps with inline pass/fail badges
  if (data.plan && data.plan.steps) {
    html += '<h3>Steps</h3><div class="steps">';
    data.plan.steps.forEach(function(s) {
      var vStatus = verifyMap[s.stepNumber];
      html += '<div class="step"><div class="step-header">';
      if (vStatus === true) html += '<span class="badge pass">PASS</span>';
      else if (vStatus === false) html += '<span class="badge fail">FAIL</span>';
      html += '<span class="agent">[' + esc(s.agentName) + ']</span> Step ' + s.stepNumber;
      if (s.dependencies && s.dependencies.length) html += ' <span style="color:#8b949e;font-size:11px;">deps: ' + s.dependencies.join(', ') + '</span>';
      html += '</div><div class="task">' + esc(s.task) + '</div></div>';
    });
    html += '</div>';
  }

  // Wave analysis
  if (data.waveAnalyses && data.waveAnalyses.length) {
    html += '<hr class="section-sep"><h3>Wave Analysis</h3><div class="wave-grid">';
    data.waveAnalyses.forEach(function(w) {
      var healthColor = w.overallHealth === 'healthy' ? 'pass' : (w.overallHealth === 'degraded' ? 'warn' : 'fail');
      html += '<div class="wave-card"><div class="wave-header">';
      html += '<strong>Wave ' + w.waveAnalyzed + '</strong>';
      html += '<span class="badge ' + healthColor + '">' + esc(w.overallHealth || 'unknown') + '</span>';
      if (w.replanNeeded) html += '<span class="badge warn">replan needed</span>';
      html += '</div>';
      if (w.stepReviews && w.stepReviews.length) {
        html += '<div class="wave-steps">';
        w.stepReviews.forEach(function(sr) {
          var cls = sr.verificationPassed ? 'pass' : 'fail';
          html += '<span class="wave-step-chip ' + cls + '">Step ' + sr.stepNumber + ' (' + esc(sr.agentName) + ')</span>';
        });
        html += '</div>';
      }
      if (w.detectedPatterns && w.detectedPatterns.length) {
        html += '<div style="margin-top:8px;font-size:11px;color:#8b949e;">';
        w.detectedPatterns.forEach(function(p) {
          html += '<div style="margin-top:2px;"><span class="badge ' + (p.severity === 'high' ? 'fail' : 'info') + '">' + esc(p.severity) + '</span> ' + esc(p.pattern) + '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // Knowledge base patterns
  if (data.knowledgeBase && data.knowledgeBase.patterns && data.knowledgeBase.patterns.length) {
    html += '<hr class="section-sep"><h3>Learned Patterns</h3>';
    html += '<p style="font-size:12px;color:#8b949e;margin-bottom:8px;">' + data.knowledgeBase.patterns.length + ' pattern(s) from ' + (data.knowledgeBase.statistics?.totalRuns || 1) + ' run(s)</p>';
    html += '<div class="pattern-list">';
    data.knowledgeBase.patterns.forEach(function(p) {
      html += '<div class="pattern-item"><div class="pattern-header">';
      html += '<span class="badge ' + (p.impact === 'high' ? 'warn' : 'info') + '">' + esc(p.category) + '</span>';
      html += '<span class="badge info">' + esc(p.confidence) + '</span>';
      html += '</div>';
      html += '<div class="insight">' + esc(p.insight) + '</div>';
      if (p.evidence && p.evidence.length) {
        html += '<div class="evidence">' + p.evidence.map(function(e) { return esc(e); }).join('; ') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // Verification reports (collapsible)
  if (data.verificationReports && data.verificationReports.length) {
    html += '<hr class="section-sep"><h3>Verification Reports</h3>';
    data.verificationReports.forEach(function(r, i) {
      var vrId = 'vr-' + i;
      var passed = r.content.includes('PASSED') || r.content.includes('passed');
      html += '<div class="step">';
      html += '<div class="collapsible" onclick="toggleCollapse(\\'' + vrId + '\\')">';
      html += '<span class="arrow" id="arrow-' + vrId + '">\\u25B6</span>';
      html += '<span class="badge ' + (passed ? 'pass' : 'fail') + '">' + (passed ? 'PASS' : 'FAIL') + '</span> ' + esc(r.name);
      html += '</div>';
      html += '<div class="collapse-body" id="body-' + vrId + '">';
      html += '<div class="transcript" style="position:relative;"><button class="copy-btn" id="copy-' + vrId + '" onclick="event.stopPropagation();copyText(\\'' + vrId + '\\')">Copy</button><span id="text-' + vrId + '">' + esc(r.content) + '</span></div>';
      html += '</div></div>';
    });
  }

  // Transcripts (collapsible with copy)
  if (data.stepTranscripts && data.stepTranscripts.length) {
    html += '<hr class="section-sep"><h3>Transcripts</h3>';
    data.stepTranscripts.forEach(function(t, i) {
      var tId = 'tr-' + i;
      var charCount = t.transcript ? t.transcript.length : 0;
      html += '<div class="step">';
      html += '<div class="collapsible" onclick="toggleCollapse(\\'' + tId + '\\')">';
      html += '<span class="arrow" id="arrow-' + tId + '">\\u25B6</span>';
      html += '<strong>' + esc(t.step) + '</strong>';
      html += '<span style="color:#8b949e;font-size:11px;margin-left:8px;">' + (charCount > 0 ? Math.round(charCount / 1024) + ' KB' : 'empty') + '</span>';
      html += '</div>';
      html += '<div class="collapse-body" id="body-' + tId + '">';
      if (t.transcript) {
        html += '<div class="transcript" style="position:relative;"><button class="copy-btn" id="copy-' + tId + '" onclick="event.stopPropagation();copyText(\\'' + tId + '\\')">Copy</button><span id="text-' + tId + '">' + esc(t.transcript) + '</span></div>';
      } else {
        html += '<p style="color:#8b949e;font-size:12px;padding:8px;">No transcript available</p>';
      }
      html += '</div></div>';
    });
  }

  html += '</div>';
  app.innerHTML = html;
  window.scrollTo(0, scrollY);
}

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function init() {
  var runs = await fetchRuns();
  renderList(runs);
}
init();
</script>
</body>
</html>`;

/**
 * Start the web dashboard server.
 * Serves a single-page app that visualizes swarm execution runs.
 */
export function startWebDashboard(runsDir?: string, port?: number): ReturnType<typeof express.application.listen> {
  const resolvedRunsDir = runsDir || path.join(process.cwd(), 'runs');
  const resolvedPort = port || DEFAULT_PORT;

  const app = express();
  app.use(cors());

  // API routes
  app.use('/api/runs', createRunsRouter(resolvedRunsDir));

  // Audit report endpoint
  app.get('/api/audit/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const collector = new MetricsCollector(sessionId, '');
    const state = collector.loadSession(sessionId);
    if (!state) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.type('text/markdown').send(collector.generateAuditReport(state));
  });

  // Serve the dashboard HTML at root
  app.get('/', (_req, res) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  const server = app.listen(resolvedPort, () => {
    console.log(`Swarm Web Dashboard running at http://${process.env.DASHBOARD_HOST || 'localhost'}:${resolvedPort}`);
    console.log(`Watching runs directory: ${resolvedRunsDir}`);
  });

  return server;
}

// Allow running directly: node dist/src/web-dashboard.js [port] [runsDir]
if (require.main === module) {
  const port = parseInt(process.argv[2] || '', 10) || DEFAULT_PORT;
  const runsDir = process.argv[3] || path.join(process.cwd(), 'runs');
  startWebDashboard(runsDir, port);
}

export default startWebDashboard;
