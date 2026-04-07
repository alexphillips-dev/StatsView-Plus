(function(window, $, Highcharts) {
  'use strict';

  var MODULE_DEFS = {
    cpu: {
      key: 'cpu',
      historyCmd: 'cpu',
      stacked: true,
      tones: ['#4dd3ff', '#7ae4ff', '#ffb84d'],
      series: [
        { key: 'user', name: 'User', historyField: 'User' },
        { key: 'nice', name: 'Nice', historyField: 'Nice' },
        { key: 'system', name: 'System', historyField: 'System' }
      ]
    },
    load: {
      key: 'load',
      historyCmd: 'load',
      stacked: false,
      tones: ['#4dd3ff', '#37d39a', '#ffb84d'],
      series: [
        { key: 'one', name: '1m', historyField: 'Load 1m' },
        { key: 'five', name: '5m', historyField: 'Load 5m' },
        { key: 'fifteen', name: '15m', historyField: 'Load 15m' }
      ]
    },
    cpux: {
      key: 'cpux',
      historyCmd: 'cpux',
      stacked: false,
      tones: ['#ffb84d', '#ff6b6b', '#4dd3ff'],
      series: [
        { key: 'iowait', name: 'I/O Wait', historyField: 'I/O Wait' },
        { key: 'steal', name: 'Steal', historyField: 'Steal' },
        { key: 'idle', name: 'Idle', historyField: 'Idle' }
      ]
    },
    ram: {
      key: 'ram',
      historyCmd: 'ram',
      stacked: true,
      tones: ['#4dd3ff', '#37d39a', '#ffb84d'],
      series: [
        { key: 'freeBytes', name: 'Free', historyField: 'Free' },
        { key: 'cachedBytes', name: 'Cached', historyField: 'Cached' },
        { key: 'usedBytes', name: 'Used', historyField: 'Used' }
      ]
    },
    swap: {
      key: 'swap',
      historyCmd: 'swap',
      stacked: true,
      tones: ['#4dd3ff', '#37d39a', '#ffb84d'],
      series: [
        { key: 'freeBytes', name: 'Free', historyField: 'Free' },
        { key: 'cachedBytes', name: 'Cached', historyField: 'Cached' },
        { key: 'usedBytes', name: 'Used', historyField: 'Used' }
      ]
    },
    com: {
      key: 'com',
      historyCmd: 'com',
      stacked: false,
      tones: ['#4dd3ff', '#37d39a'],
      series: [
        { key: 'receiveRate', name: 'Receive', historyField: 'Receive' },
        { key: 'transmitRate', name: 'Transmit', historyField: 'Transmit' }
      ]
    },
    edev: {
      key: 'edev',
      historyCmd: 'edev',
      stacked: false,
      tones: ['#4dd3ff', '#ff6b6b', '#37d39a', '#ffb84d'],
      series: [
        { key: 'rxErrors', name: 'RX Errors', historyField: 'RX Errors' },
        { key: 'txErrors', name: 'TX Errors', historyField: 'TX Errors' },
        { key: 'rxDrops', name: 'RX Drops', historyField: 'RX Drops' },
        { key: 'txDrops', name: 'TX Drops', historyField: 'TX Drops' }
      ]
    },
    hdd: {
      key: 'hdd',
      historyCmd: 'hdd',
      stacked: false,
      tones: ['#ffb84d', '#ff6b6b'],
      series: [
        { key: 'readRate', name: 'Read', historyField: 'Read' },
        { key: 'writeRate', name: 'Write', historyField: 'Write' }
      ]
    }
  };

  function clampPercent(value) {
    var numeric = Number(value) || 0;
    return Math.max(0, Math.min(100, numeric));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTimestamp(unixSeconds) {
    if (!unixSeconds) {
      return '';
    }
    return new Date(unixSeconds * 1000).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function forceVersionRefresh(nextVersion) {
    try {
      var current = String(window.statsViewSystemDashboardConfig && window.statsViewSystemDashboardConfig.assetVersion || '').trim();
      var target = String(nextVersion || '').trim();
      var refreshKey = '';
      if (!current || !target || current === target) {
        return false;
      }

      refreshKey = 'statsview.reload:system-stats:' + target + ':' + String(window.location && window.location.pathname || '');
      if (window.sessionStorage) {
        if (window.sessionStorage.getItem(refreshKey) === '1') {
          return false;
        }
        window.sessionStorage.setItem(refreshKey, '1');
      }

      var url = new URL(window.location.href);
      url.searchParams.set('svplusv', target);
      url.searchParams.set('svplusr', String(Date.now()));
      window.location.replace(url.toString());
      return true;
    } catch (_error) {
      return false;
    }
  }

  function formatBytes(value) {
    var size = Math.max(0, Number(value) || 0);
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size = size / 1024;
      index += 1;
    }
    return (size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[index];
  }

  function formatRate(value, unit) {
    var size = Math.max(0, Number(value) || 0);
    var suffixes = unit === 'b'
      ? ['bits/s', 'Kbits/s', 'Mbits/s', 'Gbits/s', 'Tbits/s']
      : ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    var index = 0;
    while (size >= 1024 && index < suffixes.length - 1) {
      size = size / 1024;
      index += 1;
    }
    return (size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + suffixes[index];
  }

  function formatIoRate(value) {
    var numeric = Math.max(0, Number(value) || 0);
    return (numeric >= 100 ? numeric.toFixed(0) : numeric.toFixed(1)) + ' /s';
  }

  function formatCountRate(value) {
    var numeric = Math.max(0, Number(value) || 0);
    return (numeric >= 100 ? numeric.toFixed(0) : numeric.toFixed(1)) + ' /s';
  }

  function formatLoadValue(value) {
    return (Number(value) || 0).toFixed(2);
  }

  function readCssToken(style, name, fallback) {
    var value = style && typeof style.getPropertyValue === 'function'
      ? String(style.getPropertyValue(name) || '').trim()
      : '';
    return value || fallback;
  }

  function resolveDashboardTheme($root) {
    var node = $root && $root[0] ? $root[0] : document.documentElement;
    var style = window.getComputedStyle(node);
    return {
      axisLine: readCssToken(style, '--sv-chart-axis-line', 'rgba(148, 163, 184, 0.25)'),
      axisText: readCssToken(style, '--sv-chart-axis-text', '#91a4bf'),
      gridLine: readCssToken(style, '--sv-chart-grid', 'rgba(148, 163, 184, 0.12)'),
      tooltipBg: readCssToken(style, '--sv-chart-tooltip-bg', 'rgba(11, 18, 32, 0.96)'),
      tooltipBorder: readCssToken(style, '--sv-chart-tooltip-border', 'rgba(148, 163, 184, 0.2)'),
      tooltipText: readCssToken(style, '--sv-chart-tooltip-text', '#e7eef8'),
      series: {
        cpu: [
          readCssToken(style, '--sv-series-blue', '#4dd3ff'),
          readCssToken(style, '--sv-series-cyan', '#7ae4ff'),
          readCssToken(style, '--sv-series-amber', '#ffb84d')
        ],
        load: [
          readCssToken(style, '--sv-series-blue', '#4dd3ff'),
          readCssToken(style, '--sv-series-green', '#37d39a'),
          readCssToken(style, '--sv-series-amber', '#ffb84d')
        ],
        cpux: [
          readCssToken(style, '--sv-series-amber', '#ffb84d'),
          readCssToken(style, '--sv-series-red', '#ff6b6b'),
          readCssToken(style, '--sv-series-blue', '#4dd3ff')
        ],
        ram: [
          readCssToken(style, '--sv-series-blue', '#4dd3ff'),
          readCssToken(style, '--sv-series-green', '#37d39a'),
          readCssToken(style, '--sv-series-amber', '#ffb84d')
        ],
        swap: [
          readCssToken(style, '--sv-series-blue-strong', '#3b9be3'),
          readCssToken(style, '--sv-series-green-strong', '#2ca978'),
          readCssToken(style, '--sv-series-amber-strong', '#d59128')
        ],
        com: [
          readCssToken(style, '--sv-series-blue', '#4dd3ff'),
          readCssToken(style, '--sv-series-green', '#37d39a')
        ],
        edev: [
          readCssToken(style, '--sv-series-blue', '#4dd3ff'),
          readCssToken(style, '--sv-series-red', '#ff6b6b'),
          readCssToken(style, '--sv-series-green', '#37d39a'),
          readCssToken(style, '--sv-series-amber', '#ffb84d')
        ],
        hdd: [
          readCssToken(style, '--sv-series-amber', '#ffb84d'),
          readCssToken(style, '--sv-series-red', '#ff6b6b')
        ]
      }
    };
  }

  function buildSummaryCard(label, value, meta, tone) {
    return [
      '<article class="svplus-system-summary-card tone-', escapeHtml(tone || 'normal'), '">',
      '<span class="svplus-system-summary-label">', escapeHtml(label), '</span>',
      '<strong class="svplus-system-summary-value">', escapeHtml(value), '</strong>',
      meta ? '<span class="svplus-system-summary-meta">' + escapeHtml(meta) + '</span>' : '',
      '</article>'
    ].join('');
  }

  function buildStackItem(label, value, meta, tone) {
    return [
      '<div class="svplus-system-stack-item tone-', escapeHtml(tone || 'normal'), '">',
      '<div class="svplus-system-stack-copy">',
      '<strong>', escapeHtml(label), '</strong>',
      meta ? '<span>' + escapeHtml(meta) + '</span>' : '',
      '</div>',
      '<span class="svplus-system-stack-value">', escapeHtml(value), '</span>',
      '</div>'
    ].join('');
  }

  function buildDetailLine(label, value) {
    return [
      '<div class="svplus-system-detail-line">',
      '<span class="svplus-system-detail-label">', escapeHtml(label), '</span>',
      '<strong class="svplus-system-detail-value">', escapeHtml(value), '</strong>',
      '</div>'
    ].join('');
  }

  function reportFatal(message, error) {
    if (window.statsViewSystemDashboardBoot && typeof window.statsViewSystemDashboardBoot.fail === 'function') {
      window.statsViewSystemDashboardBoot.fail(message, error);
      return;
    }
    if (window.console && typeof window.console.error === 'function') {
      window.console.error('StatsView Plus System Stats failure:', message, error || '');
    }
  }

  function reportBootSuccess() {
    if (window.statsViewSystemDashboardBoot && typeof window.statsViewSystemDashboardBoot.succeed === 'function') {
      window.statsViewSystemDashboardBoot.succeed();
    }
  }

  function Dashboard(config) {
    this.config = $.extend(true, {}, config || {});
    this.state = {
      graph: String(this.config.initialGraph || '0'),
      frame: String(this.config.initialFrame || '150'),
      port: String(this.config.initialPort || 'eth0'),
      unit: this.config.initialUnit === 'B' ? 'B' : 'b'
    };
    this.modules = (this.config.modules || []).filter(function(key) {
      return !!MODULE_DEFS[key];
    });
    this.charts = {};
    this.chartSeriesData = {};
    this.pendingCharts = {};
    this.peaks = {};
    this.lastSnapshot = null;
    this.previousCpuStateRaw = null;
    this.previousErrorCounters = null;
    this.theme = null;
    this.layoutProbeTimer = null;
    this.pollTimer = null;
    this.snapshotRequest = null;
    this.historyRequests = [];
    this.$root = $('#svplus-system-dashboard');
    this.$error = $('#svplus-system-error');
    this.$summary = $('#svplus-system-summary');
    this.$panels = $('#svplus-system-panels');
    this.$empty = $('#svplus-system-empty');
    this.$signalBoard = $('#svplus-system-signal-board');
    this.$peaks = $('#svplus-system-peaks');
    this.$context = $('#svplus-system-context');
    this.$lastRefresh = $('#svplus-system-last-refresh');
    this.$graph = $('#svplus-system-graph');
    this.$frame = $('#svplus-system-frame');
    this.$port = $('#svplus-system-port');
    this.$unit = $('#svplus-system-unit');
    this.$reset = $('#svplus-system-reset');
  }

  Dashboard.prototype.init = function() {
    if (!this.$root.length) {
      reportFatal('System Stats root element was not found.');
      return;
    }
    if (!$ || typeof $.ajax !== 'function' || typeof $.extend !== 'function') {
      reportFatal('jQuery is unavailable for System Stats.');
      return;
    }
    if (!Highcharts || typeof Highcharts.Chart !== 'function') {
      reportFatal('Highcharts failed to load for System Stats.');
      return;
    }

    Highcharts.setOptions({ global: { useUTC: false } });
    this.theme = resolveDashboardTheme(this.$root);
    this.bindControls();
    this.buildPanels();
    this.startLayoutProbe();
    this.loadCharts();
    this.fetchSnapshot(false);
    reportBootSuccess();
  };

  Dashboard.prototype.bindControls = function() {
    var self = this;
    this.$graph.on('change', function() {
      self.state.graph = String($(this).val() || '0');
      self.refreshAll(true);
    });
    this.$frame.on('change', function() {
      self.state.frame = String($(this).val() || '150');
      self.refreshAll(true);
    });
    this.$port.on('change', function() {
      self.state.port = String($(this).val() || self.state.port);
      self.refreshAll(true);
    });
    this.$unit.on('change', function() {
      self.state.unit = $(this).val() === 'B' ? 'B' : 'b';
      self.refreshAll(true);
    });
    this.$reset.on('click', function() {
      self.state.graph = '0';
      self.$graph.val('0');
      self.refreshAll(true);
    });
  };

  Dashboard.prototype.refreshAll = function(manual) {
    this.resetDerivedCaches();
    this.resetPeaks();
    this.theme = resolveDashboardTheme(this.$root);
    this.loadCharts();
    this.fetchSnapshot(manual);
  };

  Dashboard.prototype.resetDerivedCaches = function() {
    this.previousCpuStateRaw = null;
    this.previousErrorCounters = null;
  };

  Dashboard.prototype.startLayoutProbe = function() {
    var self = this;
    if (this.layoutProbeTimer) {
      return;
    }

    this.layoutProbeTimer = window.setInterval(function() {
      self.ensureChartsVisible();
    }, 1200);

    $(window).on('resize.svplusSystemStats', function() {
      self.ensureChartsVisible();
    });

    $(document).on('visibilitychange.svplusSystemStats', function() {
      self.ensureChartsVisible();
    });
  };

  Dashboard.prototype.resetPeaks = function() {
    this.peaks = {};
    this.renderPeaks();
  };

  Dashboard.prototype.setBusy = function(isBusy) {
    this.$root.toggleClass('is-loading', !!isBusy);
    if (isBusy && !this.lastSnapshot) {
      this.$lastRefresh.text(this.config.labels.refreshing);
    }
  };

  Dashboard.prototype.scheduleNext = function(delay) {
    var self = this;
    clearTimeout(this.pollTimer);
    this.pollTimer = window.setTimeout(function() {
      self.fetchSnapshot(false);
    }, delay);
  };

  Dashboard.prototype.showError = function(message) {
    this.$error.text(message).prop('hidden', false);
  };

  Dashboard.prototype.clearError = function() {
    this.$error.prop('hidden', true).text('');
  };

  Dashboard.prototype.fetchSnapshot = function(manual) {
    var self = this;
    if (this.snapshotRequest && this.snapshotRequest.readyState !== 4) {
      this.snapshotRequest.abort();
    }

    this.setBusy(true);
    if (manual) {
      this.$lastRefresh.text(this.config.labels.refreshing);
    }

    this.snapshotRequest = $.ajax({
      url: this.config.endpoint,
      method: 'POST',
      dataType: 'json',
      data: {
        cmd: 'system_dashboard',
        graph: this.state.graph,
        frame: this.state.frame,
        port: this.state.port,
        unit: this.state.unit,
        show: this.modules.join(','),
        cpuScale: String(this.config.cpuScale || 0)
      }
    });

    this.snapshotRequest.done(function(payload) {
      if (forceVersionRefresh(payload.pluginVersion)) {
        return;
      }
      self.lastSnapshot = payload || {};
      self.renderSnapshot(payload || {});
      self.clearError();
      self.$root.addClass('is-ready');
      self.scheduleNext(self.state.graph === '0' ? self.config.pollMs : 10000);
    });

    this.snapshotRequest.fail(function(xhr, status) {
      if (status === 'abort') {
        return;
      }
      self.showError(self.config.labels.refreshFailed);
      self.scheduleNext(Math.max(self.config.pollMs, 10000));
    });

    this.snapshotRequest.always(function() {
      self.setBusy(false);
    });
  };

  Dashboard.prototype.buildPanels = function() {
    var html = [];
    var self = this;

    if (!this.modules.length) {
      this.$empty.prop('hidden', false);
      this.$panels.empty();
      return;
    }

    $.each(this.modules, function(_, key) {
      var title = self.config.labels[key] || key.toUpperCase();
      html.push(
        '<section class="svplus-system-chart-card" data-module="' + escapeHtml(key) + '">' +
          '<div class="svplus-system-chart-head">' +
            '<div>' +
              '<p class="svplus-system-panel-eyebrow">' + escapeHtml(title) + '</p>' +
              '<h3 class="svplus-system-chart-title">' + escapeHtml(self.chartSubtitle(key)) + '</h3>' +
            '</div>' +
            '<div id="svplus-system-current-' + escapeHtml(key) + '" class="svplus-system-chip-group"></div>' +
          '</div>' +
          '<div id="svplus-system-chart-' + escapeHtml(key) + '" class="svplus-system-chart"></div>' +
          '<div id="svplus-system-legend-' + escapeHtml(key) + '" class="svplus-system-chart-legend"></div>' +
        '</section>'
      );
    });

    this.$empty.prop('hidden', true);
    this.$panels.html(html.join(''));
  };

  Dashboard.prototype.chartSubtitle = function(key) {
    if (key === 'cpu') {
      return this.config.labels.currentLoad;
    }
    if (key === 'load') {
      return this.config.labels.loadAverage;
    }
    if (key === 'cpux') {
      return this.config.labels.cpuState;
    }
    if (key === 'ram') {
      return this.config.labels.memoryUsed;
    }
    if (key === 'swap') {
      return this.config.labels.swapUsage;
    }
    if (key === 'com') {
      return this.config.labels.networkRate;
    }
    if (key === 'edev') {
      return this.config.labels.networkErrors;
    }
    return this.config.labels.storageRate;
  };

  Dashboard.prototype.destroyCharts = function() {
    $.each(this.charts, function(key, chart) {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts = {};
    this.pendingCharts = {};
  };

  Dashboard.prototype.chartContainerSize = function(key) {
    var node = document.getElementById('svplus-system-chart-' + key);
    return {
      width: node ? Math.max(0, node.clientWidth || 0) : 0,
      height: node ? Math.max(0, node.clientHeight || 0) : 0
    };
  };

  Dashboard.prototype.chartNeedsRepair = function(chart) {
    return !chart || chart.chartWidth <= 40 || chart.chartHeight <= 40 || chart.plotWidth <= 20 || chart.plotHeight <= 20;
  };

  Dashboard.prototype.canRenderChart = function(key) {
    var size = this.chartContainerSize(key);
    return size.width > 40 && size.height > 40;
  };

  Dashboard.prototype.queueChartRender = function(key, seriesData) {
    this.chartSeriesData[key] = $.map(seriesData, function(series) {
      return {
        name: series.name,
        data: $.map(series.data || [], function(point) {
          return [[point[0], point[1]]];
        })
      };
    });

    if (!this.canRenderChart(key)) {
      this.pendingCharts[key] = true;
      return null;
    }

    delete this.pendingCharts[key];
    return this.createChart(key, this.chartSeriesData[key]);
  };

  Dashboard.prototype.renderPendingCharts = function() {
    var self = this;

    $.each(this.modules, function(_, key) {
      if (!self.pendingCharts[key] || self.charts[key] || !self.canRenderChart(key) || !self.chartSeriesData[key]) {
        return;
      }

      self.charts[key] = self.createChart(key, self.chartSeriesData[key]);

      if (self.lastSnapshot && self.lastSnapshot.snapshot && self.state.graph === '0') {
        self.updateRealtimeCharts(self.lastSnapshot.snapshot, (self.lastSnapshot.generatedAt || 0) * 1000);
      }
    });
  };

  Dashboard.prototype.rebuildChart = function(key) {
    var chart = this.charts[key];
    var seriesData = this.chartSeriesData[key];

    if (!seriesData) {
      return;
    }

    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }

    if (!this.canRenderChart(key)) {
      delete this.charts[key];
      this.pendingCharts[key] = true;
      return;
    }

    delete this.pendingCharts[key];
    this.charts[key] = this.createChart(key, seriesData);

    if (this.lastSnapshot && this.lastSnapshot.snapshot && this.state.graph === '0') {
      this.updateRealtimeCharts(this.lastSnapshot.snapshot, (this.lastSnapshot.generatedAt || 0) * 1000);
    }
  };

  Dashboard.prototype.ensureChartsVisible = function() {
    var self = this;

    this.renderPendingCharts();

    $.each(this.modules, function(_, key) {
      var chart = self.charts[key];
      var size = self.chartContainerSize(key);

      if (!chart || size.width <= 40 || size.height <= 40) {
        return;
      }

      if (typeof chart.setSize === 'function') {
        chart.setSize(size.width, size.height, false);
      }
      if (typeof chart.reflow === 'function') {
        chart.reflow();
      }
      if (typeof chart.redraw === 'function') {
        chart.redraw(false);
      }

      if (self.chartNeedsRepair(chart)) {
        self.rebuildChart(key);
      }
    });
  };

  Dashboard.prototype.loadCharts = function() {
    var self = this;
    this.$frame.prop('disabled', this.state.graph !== '0');
    this.destroyCharts();

    if (!this.modules.length) {
      return;
    }

    if (this.state.graph === '0') {
      $.each(this.modules, function(_, key) {
        self.charts[key] = self.queueChartRender(key, self.seedRealtimeSeries(key));
      });
      if (this.lastSnapshot && this.lastSnapshot.snapshot) {
        this.updateRealtimeCharts(this.lastSnapshot.snapshot, (this.lastSnapshot.generatedAt || 0) * 1000);
      }
      this.ensureChartsVisible();
      return;
    }

    this.fetchHistoryCharts();
  };

  Dashboard.prototype.fetchHistoryCharts = function() {
    var self = this;
    var remaining = this.modules.length;
    var results = {};

    $.each(this.historyRequests, function(_, request) {
      if (request && request.readyState !== 4) {
        request.abort();
      }
    });
    this.historyRequests = [];

    $.each(this.modules, function(_, key) {
      var request = $.ajax({
        url: self.config.endpoint,
        method: 'POST',
        dataType: 'json',
        data: {
          cmd: MODULE_DEFS[key].historyCmd,
          graph: self.state.graph,
          port: self.state.port
        }
      });

      self.historyRequests.push(request);

      request.done(function(payload) {
        results[key] = payload || {};
      });

      request.always(function() {
        remaining -= 1;
        if (remaining === 0) {
          $.each(self.modules, function(__, moduleKey) {
            self.charts[moduleKey] = self.queueChartRender(moduleKey, self.transformHistory(moduleKey, results[moduleKey] || {}));
          });
          if (self.lastSnapshot && self.lastSnapshot.snapshot) {
            self.renderCurrentMetrics(self.lastSnapshot.snapshot);
          }
          self.ensureChartsVisible();
        }
      });
    });
  };

  Dashboard.prototype.seedRealtimeSeries = function(key) {
    var now = new Date().getTime();
    var older = now - (this.config.pollMs * 2);
    var recent = now - this.config.pollMs;
    return $.map(MODULE_DEFS[key].series, function(series) {
      return {
        name: series.name,
        data: [
          [older, 0],
          [recent, 0]
        ]
      };
    });
  };

  Dashboard.prototype.transformHistory = function(key, payload) {
    var stateUnit = this.state.unit;
    return $.map(MODULE_DEFS[key].series, function(seriesDef) {
      var source = payload[seriesDef.historyField || seriesDef.name] || [];
      var data = $.map(source, function(point) {
        var x = point[0];
        var y = Number(point[1]) || 0;
        if (key === 'ram' || key === 'swap') {
          y = y * 1024;
        } else if (key === 'com') {
          y = stateUnit === 'b' ? y * 8192 : y * 1024;
        }
        return [[x, y]];
      });
      return {
        name: seriesDef.name,
        data: data
      };
    });
  };

  Dashboard.prototype.decorateSnapshot = function(snapshot, generatedAt) {
    if (!snapshot || typeof snapshot !== 'object') {
      return snapshot;
    }

    snapshot.cpux = snapshot.cpux || {};
    snapshot.edev = snapshot.edev || {};
    snapshot.load = snapshot.load || {};
    snapshot.swap = snapshot.swap || {};

    snapshot.cpux.current = this.computeCpuState(snapshot.cpux.raw || {}, generatedAt);
    snapshot.edev.current = this.computeNetworkErrors(snapshot.edev || {}, generatedAt);
    return snapshot;
  };

  Dashboard.prototype.computeCpuState = function(raw, generatedAt) {
    var current = {
      user: Number(raw.user) || 0,
      nice: Number(raw.nice) || 0,
      system: Number(raw.system) || 0,
      idle: Number(raw.idle) || 0,
      iowait: Number(raw.iowait) || 0,
      irq: Number(raw.irq) || 0,
      softirq: Number(raw.softirq) || 0,
      steal: Number(raw.steal) || 0
    };
    var previous = this.previousCpuStateRaw;
    var totalDelta;
    var irqDelta;
    var idleDelta;
    var iowaitDelta;
    var stealDelta;
    var userDelta;
    var niceDelta;
    var systemDelta;

    this.previousCpuStateRaw = {
      generatedAt: Number(generatedAt) || 0,
      counters: current
    };

    if (!previous) {
      return { iowait: 0, steal: 0, idle: 0 };
    }

    idleDelta = Math.max(0, current.idle - previous.counters.idle);
    iowaitDelta = Math.max(0, current.iowait - previous.counters.iowait);
    irqDelta = Math.max(0, current.irq - previous.counters.irq) + Math.max(0, current.softirq - previous.counters.softirq);
    stealDelta = Math.max(0, current.steal - previous.counters.steal);
    userDelta = Math.max(0, current.user - previous.counters.user);
    niceDelta = Math.max(0, current.nice - previous.counters.nice);
    systemDelta = Math.max(0, current.system - previous.counters.system);
    totalDelta = userDelta + niceDelta + systemDelta + idleDelta + iowaitDelta + irqDelta + stealDelta;

    if (totalDelta <= 0) {
      return { iowait: 0, steal: 0, idle: 0 };
    }

    return {
      iowait: (iowaitDelta / totalDelta) * 100,
      steal: (stealDelta / totalDelta) * 100,
      idle: (idleDelta / totalDelta) * 100
    };
  };

  Dashboard.prototype.computeNetworkErrors = function(raw, generatedAt) {
    var current = {
      rxErrors: Number(raw.rxErrorsCounter) || 0,
      txErrors: Number(raw.txErrorsCounter) || 0,
      rxDrops: Number(raw.rxDropsCounter) || 0,
      txDrops: Number(raw.txDropsCounter) || 0
    };
    var previous = this.previousErrorCounters;
    var elapsed;

    this.previousErrorCounters = {
      generatedAt: Number(generatedAt) || 0,
      counters: current
    };

    if (!previous) {
      return { rxErrors: 0, txErrors: 0, rxDrops: 0, txDrops: 0 };
    }

    elapsed = Math.max(1, (Number(generatedAt) || 0) - (Number(previous.generatedAt) || 0));
    return {
      rxErrors: Math.max(0, current.rxErrors - previous.counters.rxErrors) / elapsed,
      txErrors: Math.max(0, current.txErrors - previous.counters.txErrors) / elapsed,
      rxDrops: Math.max(0, current.rxDrops - previous.counters.rxDrops) / elapsed,
      txDrops: Math.max(0, current.txDrops - previous.counters.txDrops) / elapsed
    };
  };

  Dashboard.prototype.seriesValueFromSnapshot = function(key, snapshot) {
    if (key === 'cpu') {
      return [snapshot.cpu.user, snapshot.cpu.nice, snapshot.cpu.system];
    }
    if (key === 'load') {
      return [snapshot.load.one, snapshot.load.five, snapshot.load.fifteen];
    }
    if (key === 'cpux') {
      return [snapshot.cpux.current.iowait, snapshot.cpux.current.steal, snapshot.cpux.current.idle];
    }
    if (key === 'ram') {
      return [snapshot.ram.freeBytes, snapshot.ram.cachedBytes, snapshot.ram.usedBytes];
    }
    if (key === 'swap') {
      return [snapshot.swap.freeBytes, snapshot.swap.cachedBytes, snapshot.swap.usedBytes];
    }
    if (key === 'com') {
      return [snapshot.com.receiveRate, snapshot.com.transmitRate];
    }
    if (key === 'edev') {
      return [snapshot.edev.current.rxErrors, snapshot.edev.current.txErrors, snapshot.edev.current.rxDrops, snapshot.edev.current.txDrops];
    }
    return [snapshot.hdd.readRate, snapshot.hdd.writeRate];
  };

  Dashboard.prototype.updateRealtimeCharts = function(snapshot, timestamp) {
    var self = this;
    var maxPoints = Math.max(15, parseInt(this.state.frame, 10) || 150);
    $.each(this.modules, function(_, key) {
      var chart = self.charts[key];
      var values;
      if (!chart) {
        return;
      }
      values = self.seriesValueFromSnapshot(key, snapshot);
      $.each(chart.series, function(index, series) {
        var shift = series.data.length >= maxPoints;
        series.addPoint([timestamp, Number(values[index]) || 0], false, shift, false);
      });
      chart.redraw();
    });
  };

  Dashboard.prototype.chartValueFormatter = function(key, value) {
    if (key === 'cpu' || key === 'cpux') {
      return (Number(value) || 0).toFixed(1) + '%';
    }
    if (key === 'ram' || key === 'swap') {
      return formatBytes(value);
    }
    if (key === 'load') {
      return formatLoadValue(value);
    }
    if (key === 'com') {
      return formatRate(value, this.state.unit);
    }
    if (key === 'edev') {
      return formatCountRate(value);
    }
    return formatIoRate(value);
  };

  Dashboard.prototype.renderChartLegend = function(key, seriesData) {
    var tones = ((this.theme && this.theme.series && this.theme.series[key]) || MODULE_DEFS[key].tones || []);
    var html = $.map(seriesData || [], function(series, index) {
      return [
        '<span class="svplus-system-legend-item">',
        '<span class="svplus-system-legend-swatch" style="background:',
        escapeHtml(tones[index] || '#4dd3ff'),
        '"></span>',
        '<span class="svplus-system-legend-text">',
        escapeHtml(series.name),
        '</span>',
        '</span>'
      ].join('');
    }).join('');

    $('#svplus-system-legend-' + key).html(html);
  };

  Dashboard.prototype.createChart = function(key, seriesData) {
    var self = this;
    var def = MODULE_DEFS[key];
    var theme = this.theme || resolveDashboardTheme(this.$root);
    var tones = (theme.series && theme.series[key]) || def.tones || [];
    var type = def.stacked ? 'area' : 'line';
    var chart = new Highcharts.Chart({
      chart: {
        renderTo: 'svplus-system-chart-' + key,
        backgroundColor: 'transparent',
        defaultSeriesType: type,
        animation: false,
        spacingTop: 8,
        spacingRight: 8,
        spacingBottom: 14,
        spacingLeft: 8,
        marginTop: 10,
        marginRight: 12,
        marginBottom: 46,
        marginLeft: 44
      },
      credits: { enabled: false },
      title: { text: null },
      legend: { enabled: false },
      xAxis: {
        type: 'datetime',
        lineColor: theme.axisLine,
        tickColor: theme.axisLine,
        labels: {
          style: { color: theme.axisText, fontSize: '10px' },
          y: 16
        }
      },
      yAxis: {
        min: 0,
        max: key === 'cpux' ? 100 : (key === 'cpu' && this.config.cpuScale === 100 ? 100 : null),
        gridLineColor: theme.gridLine,
        title: { text: null },
        labels: {
          style: { color: theme.axisText, fontSize: '10px' },
          formatter: function() {
            return self.chartValueFormatter(key, this.value);
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        style: { color: theme.tooltipText },
        formatter: function() {
          var lines = ['<strong>' + Highcharts.dateFormat('%b %e, %H:%M:%S', this.x) + '</strong>'];
          $.each(this.points || [], function(_, point) {
            lines.push('<span style="color:' + point.series.color + '">\u25CF</span> ' + point.series.name + ': <strong>' + escapeHtml(self.chartValueFormatter(key, point.y)) + '</strong>');
          });
          return lines.join('<br>');
        }
      },
      plotOptions: {
        series: {
          animation: false,
          marker: {
            enabled: false,
            radius: 2
          },
          lineWidth: 2
        },
        area: {
          stacking: def.stacked ? 'normal' : null,
          fillOpacity: 0.18
        }
      },
      series: $.map(seriesData, function(series, index) {
        return {
          name: series.name,
          color: tones[index] || '#4dd3ff',
          data: series.data
        };
      })
    });
    this.renderChartLegend(key, seriesData);
    return chart;
  };

  Dashboard.prototype.renderSnapshot = function(payload) {
    var snapshot = this.decorateSnapshot(payload.snapshot || {}, payload.generatedAt || 0);
    if (!snapshot.cpu || !snapshot.ram || !snapshot.com || !snapshot.hdd) {
      return;
    }

    if (this.state.graph === '0') {
      this.updateRealtimeCharts(snapshot, (payload.generatedAt || 0) * 1000);
    }

    this.updatePeaks(snapshot);
    this.renderSummary(snapshot);
    this.renderCurrentMetrics(snapshot);
    this.renderSignalBoard(snapshot);
    this.renderPeaks();
    this.renderContext(payload);
    this.$lastRefresh.text(formatTimestamp(payload.generatedAt));
    this.ensureChartsVisible();
  };

  Dashboard.prototype.renderSummary = function(snapshot) {
    this.$summary.html([
      buildSummaryCard(this.config.labels.cpuTotal, snapshot.cpu.total.toFixed(1) + '%', this.config.labels.currentLoad, snapshot.cpu.total >= 85 ? 'critical' : snapshot.cpu.total >= 60 ? 'warning' : 'normal'),
      buildSummaryCard(this.config.labels.memoryUsed, formatBytes(snapshot.ram.usedBytes), clampPercent(snapshot.ram.usedPercent).toFixed(1) + '%', snapshot.ram.usedPercent >= 85 ? 'critical' : snapshot.ram.usedPercent >= 65 ? 'warning' : 'normal'),
      buildSummaryCard(this.config.labels.networkRate, formatRate(snapshot.com.totalRate, this.state.unit), this.state.port, 'normal'),
      buildSummaryCard(this.config.labels.storageRate, formatIoRate(snapshot.hdd.totalRate), this.config.labels.liveFeed, 'neutral')
    ].join(''));
  };

  Dashboard.prototype.currentMetricChips = function(key, snapshot) {
    if (key === 'cpu') {
      return [
        '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.total) + ': ' + escapeHtml(snapshot.cpu.total.toFixed(1) + '%') + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.used) + ': ' + escapeHtml(snapshot.cpu.user.toFixed(1) + '%') + '</span>',
        '<span class="svplus-system-chip tone-warning">' + escapeHtml('System') + ': ' + escapeHtml(snapshot.cpu.system.toFixed(1) + '%') + '</span>'
      ];
    }
    if (key === 'load') {
      return [
        '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.load1) + ': ' + escapeHtml(formatLoadValue(snapshot.load.one)) + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.load5) + ': ' + escapeHtml(formatLoadValue(snapshot.load.five)) + '</span>',
        '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.load15) + ': ' + escapeHtml(formatLoadValue(snapshot.load.fifteen)) + '</span>'
      ];
    }
    if (key === 'cpux') {
      return [
        '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.iowait) + ': ' + escapeHtml((snapshot.cpux.current.iowait || 0).toFixed(1) + '%') + '</span>',
        '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.steal) + ': ' + escapeHtml((snapshot.cpux.current.steal || 0).toFixed(1) + '%') + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.idle) + ': ' + escapeHtml((snapshot.cpux.current.idle || 0).toFixed(1) + '%') + '</span>'
      ];
    }
    if (key === 'ram') {
      return [
        '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.used) + ': ' + escapeHtml(formatBytes(snapshot.ram.usedBytes)) + '</span>',
        '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.cached) + ': ' + escapeHtml(formatBytes(snapshot.ram.cachedBytes)) + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.free) + ': ' + escapeHtml(formatBytes(snapshot.ram.freeBytes)) + '</span>'
      ];
    }
    if (key === 'swap') {
      return [
        '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.used) + ': ' + escapeHtml(formatBytes(snapshot.swap.usedBytes)) + '</span>',
        '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.cached) + ': ' + escapeHtml(formatBytes(snapshot.swap.cachedBytes)) + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.free) + ': ' + escapeHtml(formatBytes(snapshot.swap.freeBytes)) + '</span>'
      ];
    }
    if (key === 'com') {
      return [
        '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.receive) + ': ' + escapeHtml(formatRate(snapshot.com.receiveRate, this.state.unit)) + '</span>',
        '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.transmit) + ': ' + escapeHtml(formatRate(snapshot.com.transmitRate, this.state.unit)) + '</span>'
      ];
    }
    if (key === 'edev') {
      return [
        '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.rxErrors) + ': ' + escapeHtml(formatCountRate(snapshot.edev.current.rxErrors)) + '</span>',
        '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.txErrors) + ': ' + escapeHtml(formatCountRate(snapshot.edev.current.txErrors)) + '</span>',
        '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.rxDrops) + ': ' + escapeHtml(formatCountRate(snapshot.edev.current.rxDrops)) + '</span>',
        '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.txDrops) + ': ' + escapeHtml(formatCountRate(snapshot.edev.current.txDrops)) + '</span>'
      ];
    }
    return [
      '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.read) + ': ' + escapeHtml(formatIoRate(snapshot.hdd.readRate)) + '</span>',
      '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.write) + ': ' + escapeHtml(formatIoRate(snapshot.hdd.writeRate)) + '</span>'
    ];
  };

  Dashboard.prototype.renderCurrentMetrics = function(snapshot) {
    var self = this;
    $.each(this.modules, function(_, key) {
      $('#svplus-system-current-' + key).html(self.currentMetricChips(key, snapshot).join(''));
    });
  };

  Dashboard.prototype.renderSignalBoard = function(snapshot) {
    var items = [];
    var self = this;
    $.each(this.modules, function(_, key) {
      items.push(self.buildSignalBoardItem(key, snapshot));
    });
    this.$signalBoard.html(items.join(''));
  };

  Dashboard.prototype.buildSignalBoardItem = function(key, snapshot) {
    if (key === 'cpu') {
      return buildStackItem(this.config.labels.cpu, snapshot.cpu.total.toFixed(1) + '%', this.config.labels.currentLoad, snapshot.cpu.total >= 85 ? 'critical' : snapshot.cpu.total >= 60 ? 'warning' : 'normal');
    }
    if (key === 'load') {
      return buildStackItem(this.config.labels.load, formatLoadValue(snapshot.load.one), '1m average', snapshot.load.one >= 8 ? 'critical' : snapshot.load.one >= 4 ? 'warning' : 'normal');
    }
    if (key === 'cpux') {
      return buildStackItem(this.config.labels.cpux, (snapshot.cpux.current.iowait || 0).toFixed(1) + '%', this.config.labels.iowait, snapshot.cpux.current.iowait >= 20 ? 'critical' : snapshot.cpux.current.iowait >= 10 ? 'warning' : 'normal');
    }
    if (key === 'ram') {
      return buildStackItem(this.config.labels.ram, formatBytes(snapshot.ram.usedBytes), clampPercent(snapshot.ram.usedPercent).toFixed(1) + '% ' + this.config.labels.used.toLowerCase(), snapshot.ram.usedPercent >= 85 ? 'critical' : snapshot.ram.usedPercent >= 65 ? 'warning' : 'normal');
    }
    if (key === 'swap') {
      return buildStackItem(this.config.labels.swap, formatBytes(snapshot.swap.usedBytes), clampPercent(snapshot.swap.usedPercent).toFixed(1) + '% ' + this.config.labels.used.toLowerCase(), snapshot.swap.usedPercent >= 60 ? 'critical' : snapshot.swap.usedPercent >= 30 ? 'warning' : 'normal');
    }
    if (key === 'com') {
      return buildStackItem(this.config.labels.com, formatRate(snapshot.com.totalRate, this.state.unit), this.state.port, 'normal');
    }
    if (key === 'edev') {
      return buildStackItem(this.config.labels.edev, formatCountRate((snapshot.edev.current.rxErrors || 0) + (snapshot.edev.current.txErrors || 0)), this.state.port, ((snapshot.edev.current.rxErrors || 0) + (snapshot.edev.current.txErrors || 0)) > 0 ? 'critical' : 'normal');
    }
    return buildStackItem(this.config.labels.hdd, formatIoRate(snapshot.hdd.totalRate), this.config.labels.updated, 'neutral');
  };

  Dashboard.prototype.updatePeaks = function(snapshot) {
    var current = {
      cpu: snapshot.cpu.total,
      load: snapshot.load.one,
      cpux: snapshot.cpux.current.iowait,
      ram: snapshot.ram.usedBytes,
      swap: snapshot.swap.usedBytes,
      com: snapshot.com.totalRate,
      edev: (snapshot.edev.current.rxErrors || 0) + (snapshot.edev.current.txErrors || 0) + (snapshot.edev.current.rxDrops || 0) + (snapshot.edev.current.txDrops || 0),
      hdd: snapshot.hdd.totalRate
    };
    var self = this;

    $.each(current, function(key, value) {
      var numeric = Number(value) || 0;
      self.peaks[key] = Math.max(numeric, Number(self.peaks[key] || 0));
    });
  };

  Dashboard.prototype.renderPeaks = function() {
    var items = [];
    var self = this;
    $.each(this.modules, function(_, key) {
      items.push(self.buildPeakItem(key));
    });
    this.$peaks.html(items.join(''));
  };

  Dashboard.prototype.buildPeakItem = function(key) {
    if (key === 'cpu') {
      return buildStackItem(this.config.labels.cpu, (Number(this.peaks.cpu || 0)).toFixed(1) + '%', this.config.labels.currentLoad, 'warning');
    }
    if (key === 'load') {
      return buildStackItem(this.config.labels.load, formatLoadValue(this.peaks.load || 0), '1m average', 'warning');
    }
    if (key === 'cpux') {
      return buildStackItem(this.config.labels.cpux, (Number(this.peaks.cpux || 0)).toFixed(1) + '%', this.config.labels.iowait, 'warning');
    }
    if (key === 'ram') {
      return buildStackItem(this.config.labels.ram, formatBytes(this.peaks.ram || 0), this.config.labels.memoryUsed, 'critical');
    }
    if (key === 'swap') {
      return buildStackItem(this.config.labels.swap, formatBytes(this.peaks.swap || 0), this.config.labels.swapUsage, 'critical');
    }
    if (key === 'com') {
      return buildStackItem(this.config.labels.com, formatRate(this.peaks.com || 0, this.state.unit), this.config.labels.networkRate, 'normal');
    }
    if (key === 'edev') {
      return buildStackItem(this.config.labels.edev, formatCountRate(this.peaks.edev || 0), this.config.labels.networkErrors, 'warning');
    }
    return buildStackItem(this.config.labels.hdd, formatIoRate(this.peaks.hdd || 0), this.config.labels.storageRate, 'neutral');
  };

  Dashboard.prototype.renderContext = function(payload) {
    this.$context.html([
      buildDetailLine(this.config.labels.currentView, this.labelForOption(this.config.graphOptions, this.state.graph)),
      buildDetailLine(this.config.labels.windowSeconds, this.labelForOption(this.config.frameOptions, this.state.frame)),
      buildDetailLine(this.config.labels.interface, this.state.port),
      buildDetailLine(this.config.labels.networkUnit, this.state.unit === 'B' ? 'Bytes per second' : 'Bits per second'),
      buildDetailLine(this.config.labels.cpuScaling, this.config.cpuScale === 100 ? this.config.labels.cpuScaleFixed : this.config.labels.cpuScaleAuto),
      buildDetailLine(this.config.labels.enabledModules, this.modules.map(this.moduleLabel.bind(this)).join(', ')),
      buildDetailLine(this.config.labels.moduleCount, String(this.modules.length)),
      buildDetailLine(this.config.labels.lastRefresh, formatTimestamp(payload.generatedAt))
    ].join(''));
  };

  Dashboard.prototype.moduleLabel = function(key) {
    return this.config.labels[key] || key.toUpperCase();
  };

  Dashboard.prototype.labelForOption = function(options, value) {
    var target = String(value);
    var match = '';
    $.each(options || [], function(_, option) {
      if (String(option.value) === target) {
        match = option.label;
        return false;
      }
      return true;
    });
    return match || target;
  };

  $(function() {
    if (!window.statsViewSystemDashboardConfig) {
      reportFatal('System Stats configuration is missing from the page.');
      return;
    }
    try {
      new Dashboard(window.statsViewSystemDashboardConfig).init();
    } catch (error) {
      reportFatal('System Stats failed to initialize.', error);
    }
  });
})(window, window.jQuery, window.Highcharts);
