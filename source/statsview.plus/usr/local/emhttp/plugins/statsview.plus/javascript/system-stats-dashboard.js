(function(window, $, Highcharts) {
  'use strict';

  var MODULE_DEFS = {
    cpu: {
      key: 'cpu',
      historyCmd: 'cpu',
      stacked: true,
      tones: ['#4dd3ff', '#7ae4ff', '#ffb84d'],
      series: [
        { key: 'user', name: 'User' },
        { key: 'nice', name: 'Nice' },
        { key: 'system', name: 'System' }
      ]
    },
    ram: {
      key: 'ram',
      historyCmd: 'ram',
      stacked: true,
      tones: ['#4dd3ff', '#37d39a', '#ffb84d'],
      series: [
        { key: 'freeBytes', name: 'Free' },
        { key: 'cachedBytes', name: 'Cached' },
        { key: 'usedBytes', name: 'Used' }
      ]
    },
    com: {
      key: 'com',
      historyCmd: 'com',
      stacked: false,
      tones: ['#4dd3ff', '#37d39a'],
      series: [
        { key: 'receiveRate', name: 'Receive' },
        { key: 'transmitRate', name: 'Transmit' }
      ]
    },
    hdd: {
      key: 'hdd',
      historyCmd: 'hdd',
      stacked: false,
      tones: ['#ffb84d', '#ff6b6b'],
      series: [
        { key: 'readRate', name: 'Read' },
        { key: 'writeRate', name: 'Write' }
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
      if (!current || !target || current === target) {
        return false;
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
    this.peaks = {};
    this.lastSnapshot = null;
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
    this.$refreshButton = $('#svplus-system-refresh');
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
    this.bindControls();
    this.buildPanels();
    this.loadCharts();
    this.fetchSnapshot(false);
    reportBootSuccess();
  };

  Dashboard.prototype.bindControls = function() {
    var self = this;
    this.$refreshButton.on('click', function() {
      self.refreshAll(true);
    });
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
    this.resetPeaks();
    this.loadCharts();
    this.fetchSnapshot(manual);
  };

  Dashboard.prototype.resetPeaks = function() {
    this.peaks = {};
    this.renderPeaks();
  };

  Dashboard.prototype.setBusy = function(isBusy) {
    this.$root.toggleClass('is-loading', !!isBusy);
    this.$refreshButton.prop('disabled', !!isBusy);
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
    if (key === 'ram') {
      return this.config.labels.memoryUsed;
    }
    if (key === 'com') {
      return this.config.labels.networkRate;
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
        self.charts[key] = self.createChart(key, self.seedRealtimeSeries(key));
      });
      if (this.lastSnapshot && this.lastSnapshot.snapshot) {
        this.updateRealtimeCharts(this.lastSnapshot.snapshot, (this.lastSnapshot.generatedAt || 0) * 1000);
      }
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
            self.charts[moduleKey] = self.createChart(moduleKey, self.transformHistory(moduleKey, results[moduleKey] || {}));
          });
          if (self.lastSnapshot && self.lastSnapshot.snapshot) {
            self.renderCurrentMetrics(self.lastSnapshot.snapshot);
          }
        }
      });
    });
  };

  Dashboard.prototype.emptySeriesFor = function(key) {
    return $.map(MODULE_DEFS[key].series, function(series) {
      return {
        name: series.name,
        data: []
      };
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
      var source = payload[seriesDef.name] || [];
      var data = $.map(source, function(point) {
        var x = point[0];
        var y = Number(point[1]) || 0;
        if (key === 'ram') {
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

  Dashboard.prototype.seriesValueFromSnapshot = function(key, snapshot) {
    if (key === 'cpu') {
      return [snapshot.cpu.user, snapshot.cpu.nice, snapshot.cpu.system];
    }
    if (key === 'ram') {
      return [snapshot.ram.freeBytes, snapshot.ram.cachedBytes, snapshot.ram.usedBytes];
    }
    if (key === 'com') {
      return [snapshot.com.receiveRate, snapshot.com.transmitRate];
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
    if (key === 'cpu') {
      return (Number(value) || 0).toFixed(1) + '%';
    }
    if (key === 'ram') {
      return formatBytes(value);
    }
    if (key === 'com') {
      return formatRate(value, this.state.unit);
    }
    return formatIoRate(value);
  };

  Dashboard.prototype.createChart = function(key, seriesData) {
    var self = this;
    var def = MODULE_DEFS[key];
    var type = def.stacked ? 'area' : 'line';
    return new Highcharts.Chart({
      chart: {
        renderTo: 'svplus-system-chart-' + key,
        backgroundColor: 'transparent',
        defaultSeriesType: type,
        animation: false,
        spacingTop: 8,
        spacingRight: 8,
        spacingBottom: 8,
        spacingLeft: 8,
        marginTop: 10,
        marginRight: 12,
        marginBottom: 28,
        marginLeft: 44
      },
      credits: { enabled: false },
      title: { text: null },
      legend: {
        enabled: true,
        borderWidth: 0,
        itemStyle: { color: '#b8c6da', fontSize: '10px' },
        itemHoverStyle: { color: '#e7eef8' }
      },
      xAxis: {
        type: 'datetime',
        lineColor: 'rgba(148, 163, 184, 0.25)',
        tickColor: 'rgba(148, 163, 184, 0.25)',
        labels: {
          style: { color: '#91a4bf', fontSize: '10px' }
        }
      },
      yAxis: {
        min: 0,
        max: key === 'cpu' && this.config.cpuScale === 100 ? 100 : null,
        gridLineColor: 'rgba(148, 163, 184, 0.12)',
        title: { text: null },
        labels: {
          style: { color: '#91a4bf', fontSize: '10px' },
          formatter: function() {
            return self.chartValueFormatter(key, this.value);
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: 'rgba(11, 18, 32, 0.96)',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        style: { color: '#e7eef8' },
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
          color: def.tones[index] || '#4dd3ff',
          data: series.data
        };
      })
    });
  };

  Dashboard.prototype.renderSnapshot = function(payload) {
    var snapshot = payload.snapshot || {};
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
  };

  Dashboard.prototype.renderSummary = function(snapshot) {
    this.$summary.html([
      buildSummaryCard(this.config.labels.cpuTotal, snapshot.cpu.total.toFixed(1) + '%', this.config.labels.currentLoad, snapshot.cpu.total >= 85 ? 'critical' : snapshot.cpu.total >= 60 ? 'warning' : 'normal'),
      buildSummaryCard(this.config.labels.memoryUsed, formatBytes(snapshot.ram.usedBytes), clampPercent(snapshot.ram.usedPercent).toFixed(1) + '%', snapshot.ram.usedPercent >= 85 ? 'critical' : snapshot.ram.usedPercent >= 65 ? 'warning' : 'normal'),
      buildSummaryCard(this.config.labels.networkRate, formatRate(snapshot.com.totalRate, this.state.unit), this.state.port, 'normal'),
      buildSummaryCard(this.config.labels.storageRate, formatIoRate(snapshot.hdd.totalRate), this.config.labels.liveFeed, 'neutral')
    ].join(''));
  };

  Dashboard.prototype.renderCurrentMetrics = function(snapshot) {
    $('#svplus-system-current-cpu').html([
      '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.total) + ': ' + escapeHtml(snapshot.cpu.total.toFixed(1) + '%') + '</span>',
      '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.used) + ': ' + escapeHtml(snapshot.cpu.user.toFixed(1) + '%') + '</span>',
      '<span class="svplus-system-chip tone-warning">' + escapeHtml('System') + ': ' + escapeHtml(snapshot.cpu.system.toFixed(1) + '%') + '</span>'
    ].join(''));

    $('#svplus-system-current-ram').html([
      '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.used) + ': ' + escapeHtml(formatBytes(snapshot.ram.usedBytes)) + '</span>',
      '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.cached) + ': ' + escapeHtml(formatBytes(snapshot.ram.cachedBytes)) + '</span>',
      '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.free) + ': ' + escapeHtml(formatBytes(snapshot.ram.freeBytes)) + '</span>'
    ].join(''));

    $('#svplus-system-current-com').html([
      '<span class="svplus-system-chip tone-normal">' + escapeHtml(this.config.labels.receive) + ': ' + escapeHtml(formatRate(snapshot.com.receiveRate, this.state.unit)) + '</span>',
      '<span class="svplus-system-chip tone-neutral">' + escapeHtml(this.config.labels.transmit) + ': ' + escapeHtml(formatRate(snapshot.com.transmitRate, this.state.unit)) + '</span>'
    ].join(''));

    $('#svplus-system-current-hdd').html([
      '<span class="svplus-system-chip tone-warning">' + escapeHtml(this.config.labels.read) + ': ' + escapeHtml(formatIoRate(snapshot.hdd.readRate)) + '</span>',
      '<span class="svplus-system-chip tone-critical">' + escapeHtml(this.config.labels.write) + ': ' + escapeHtml(formatIoRate(snapshot.hdd.writeRate)) + '</span>'
    ].join(''));
  };

  Dashboard.prototype.renderSignalBoard = function(snapshot) {
    var items = [];
    items.push(buildStackItem(this.config.labels.cpu, snapshot.cpu.total.toFixed(1) + '%', this.config.labels.currentLoad, snapshot.cpu.total >= 85 ? 'critical' : snapshot.cpu.total >= 60 ? 'warning' : 'normal'));
    items.push(buildStackItem(this.config.labels.ram, formatBytes(snapshot.ram.usedBytes), clampPercent(snapshot.ram.usedPercent).toFixed(1) + '% ' + this.config.labels.used.toLowerCase(), snapshot.ram.usedPercent >= 85 ? 'critical' : snapshot.ram.usedPercent >= 65 ? 'warning' : 'normal'));
    items.push(buildStackItem(this.config.labels.com, formatRate(snapshot.com.totalRate, this.state.unit), this.state.port, 'normal'));
    items.push(buildStackItem(this.config.labels.hdd, formatIoRate(snapshot.hdd.totalRate), this.config.labels.updated, 'neutral'));
    this.$signalBoard.html(items.join(''));
  };

  Dashboard.prototype.updatePeaks = function(snapshot) {
    var current = {
      cpu: snapshot.cpu.total,
      ram: snapshot.ram.usedBytes,
      com: snapshot.com.totalRate,
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
    items.push(buildStackItem(this.config.labels.cpu, (Number(this.peaks.cpu || 0)).toFixed(1) + '%', this.config.labels.currentLoad, 'warning'));
    items.push(buildStackItem(this.config.labels.ram, formatBytes(this.peaks.ram || 0), this.config.labels.memoryUsed, 'critical'));
    items.push(buildStackItem(this.config.labels.com, formatRate(this.peaks.com || 0, this.state.unit), this.config.labels.networkRate, 'normal'));
    items.push(buildStackItem(this.config.labels.hdd, formatIoRate(this.peaks.hdd || 0), this.config.labels.storageRate, 'neutral'));
    this.$peaks.html(items.join(''));
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
