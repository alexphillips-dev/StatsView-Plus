(function(window, $) {
  'use strict';

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
    var date = new Date(unixSeconds * 1000);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  function forceVersionRefresh(nextVersion) {
    try {
      var win = window;
      var current = String(win.statsViewDiskDashboardConfig && win.statsViewDiskDashboardConfig.assetVersion || '').trim();
      var target = String(nextVersion || '').trim();
      if (!target || !current || target === current) {
        return false;
      }
      var url = new URL(win.location.href);
      url.searchParams.set('svplusv', target);
      url.searchParams.set('svplusr', String(Date.now()));
      win.location.replace(url.toString());
      return true;
    } catch (_error) {
      return false;
    }
  }

  function buildThresholdMarkers(row) {
    var markers = [];
    if (row.warningThreshold > 0) {
      markers.push('<span class="svplus-threshold-marker is-warning" style="left:' + clampPercent(row.warningThreshold) + '%"></span>');
    }
    if (row.criticalThreshold > 0) {
      markers.push('<span class="svplus-threshold-marker is-critical" style="left:' + clampPercent(row.criticalThreshold) + '%"></span>');
    }
    return markers.join('');
  }

  function renderPercentBadge(row, labels) {
    return [
      '<div class="svplus-percent-badge">',
      '<span class="svplus-percent-value">', clampPercent(row.usedPercent), '%</span>',
      '<span class="svplus-percent-label">', escapeHtml(labels.usedPercent), '</span>',
      '</div>'
    ].join('');
  }

  function renderSummaryCard(label, value, tone, meta) {
    return [
      '<article class="svplus-summary-card tone-', escapeHtml(tone || 'normal'), '">',
      '<span class="svplus-summary-label">', escapeHtml(label), '</span>',
      '<strong class="svplus-summary-value">', escapeHtml(value), '</strong>',
      meta ? '<span class="svplus-summary-meta">' + escapeHtml(meta) + '</span>' : '',
      '</article>'
    ].join('');
  }

  function renderInventoryLine(label, value) {
    return [
      '<div class="svplus-detail-line">',
      '<span class="svplus-detail-label">', escapeHtml(label), '</span>',
      '<strong class="svplus-detail-value">', escapeHtml(value), '</strong>',
      '</div>'
    ].join('');
  }

  function renderWatchlistItem(row) {
    return [
      '<div class="svplus-watchlist-item tone-', escapeHtml(row.state), '">',
      '<div class="svplus-watchlist-copy">',
      '<strong>', escapeHtml(row.label), '</strong>',
      '<span>', escapeHtml(row.typeLabel), ' · ', escapeHtml(row.stateLabel), '</span>',
      '</div>',
      '<span class="svplus-watchlist-percent">', clampPercent(row.usedPercent), '%</span>',
      '</div>'
    ].join('');
  }

  function renderMetricItem(row) {
    return [
      '<div class="svplus-metric-item">',
      '<div class="svplus-metric-copy">',
      '<strong>', escapeHtml(row.label), '</strong>',
      '<span>', escapeHtml(row.usedLabel), ' / ', escapeHtml(row.sizeLabel), '</span>',
      '</div>',
      '<span class="svplus-metric-percent">', clampPercent(row.usedPercent), '%</span>',
      '</div>'
    ].join('');
  }

  function renderFleetRow(row, config) {
    var percentBadge = renderPercentBadge(row, config.labels);
    var usageRail = [
      '<div class="svplus-usage-rail tone-', escapeHtml(row.state), '">',
      '<div class="svplus-usage-fill" style="width:', clampPercent(row.usedPercent), '%"></div>',
      buildThresholdMarkers(row),
      '</div>'
    ].join('');
    var leftMetric = config.textPosition === 'left' ? percentBadge : usageRail;
    var rightMetric = config.textPosition === 'left' ? usageRail : percentBadge;

    return [
      '<article class="svplus-fleet-row tone-', escapeHtml(row.state), '">',
      '<div class="svplus-fleet-head">',
      '<div class="svplus-fleet-title-group">',
      '<h4 class="svplus-fleet-title">', escapeHtml(row.label), '</h4>',
      '<div class="svplus-chip-group">',
      '<span class="svplus-chip tone-neutral">', escapeHtml(row.typeLabel), '</span>',
      '<span class="svplus-chip tone-', escapeHtml(row.state), '">', escapeHtml(row.stateLabel), '</span>',
      '</div>',
      '</div>',
      config.showSize ? '<div class="svplus-fleet-capacity"><span>' + escapeHtml(config.labels.capacity) + '</span><strong>' + escapeHtml(row.sizeLabel) + '</strong></div>' : '',
      '</div>',
      '<div class="svplus-fleet-body">',
      '<div class="svplus-fleet-stat"><span>', escapeHtml(config.labels.used), '</span><strong>', escapeHtml(row.usedLabel), '</strong></div>',
      '<div class="svplus-fleet-stat"><span>', escapeHtml(config.labels.available), '</span><strong>', escapeHtml(row.freeLabel), '</strong></div>',
      '<div class="svplus-fleet-visuals">',
      '<div class="svplus-fleet-meter slot-left">', leftMetric, '</div>',
      '<div class="svplus-fleet-meter slot-right">', rightMetric, '</div>',
      '</div>',
      '</div>',
      '</article>'
    ].join('');
  }

  function DiskDashboard(config) {
    this.config = $.extend(true, {}, config || {});
    this.$root = $('#svplus-disk-dashboard');
    this.$error = $('#svplus-disk-dashboard-error');
    this.$hero = $('#svplus-array-hero');
    this.$summary = $('#svplus-summary-grid');
    this.$fleet = $('#svplus-fleet-rows');
    this.$fleetEmpty = $('#svplus-fleet-empty');
    this.$watchlist = $('#svplus-watchlist');
    this.$topUtilization = $('#svplus-top-utilization');
    this.$thresholds = $('#svplus-thresholds');
    this.$lastRefresh = $('#svplus-last-refresh');
    this.$refreshButton = $('#svplus-refresh-button');
    this.pollTimer = null;
    this.pending = null;
  }

  DiskDashboard.prototype.init = function() {
    var self = this;
    if (!this.$root.length) {
      return;
    }
    this.$refreshButton.on('click', function() {
      self.fetch(true);
    });
    this.fetch(false);
  };

  DiskDashboard.prototype.setBusy = function(isBusy) {
    this.$root.toggleClass('is-loading', !!isBusy);
    this.$refreshButton.prop('disabled', !!isBusy);
    if (isBusy && !this.$root.hasClass('is-ready')) {
      this.$lastRefresh.text(this.config.labels.refreshing);
    }
  };

  DiskDashboard.prototype.showError = function(message) {
    this.$error.text(message).prop('hidden', false);
  };

  DiskDashboard.prototype.clearError = function() {
    this.$error.prop('hidden', true).text('');
  };

  DiskDashboard.prototype.scheduleNext = function(delay) {
    var self = this;
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(function() {
      self.fetch(false);
    }, delay);
  };

  DiskDashboard.prototype.fetch = function(manual) {
    var self = this;
    if (this.pending && this.pending.readyState !== 4) {
      this.pending.abort();
    }

    this.setBusy(true);
    if (manual) {
      this.$lastRefresh.text(this.config.labels.refreshing);
    }

    this.pending = $.ajax({
      url: this.config.endpoint,
      method: 'POST',
      dataType: 'json',
      data: {
        cmd: 'disk_dashboard',
        startMode: this.config.startMode,
        pools: this.config.pools
      }
    });

    this.pending.done(function(payload) {
      self.render(payload || {});
      self.clearError();
      self.$root.addClass('is-ready');
      self.scheduleNext(self.config.pollMs);
    });

    this.pending.fail(function(xhr, status) {
      if (status === 'abort') {
        return;
      }
      self.showError(self.config.labels.refreshFailed);
      self.scheduleNext(Math.max(10000, self.config.pollMs));
    });

    this.pending.always(function() {
      self.setBusy(false);
    });
  };

  DiskDashboard.prototype.render = function(payload) {
    if (forceVersionRefresh(payload.pluginVersion)) {
      return;
    }
    var rows = payload.rows || [];
    var summary = payload.summary || {};
    var watchlistRows = rows.filter(function(row) {
      return row.state === 'critical' || row.state === 'warning';
    });
    var topRows = rows.slice().sort(function(left, right) {
      return (right.usedPercent || 0) - (left.usedPercent || 0);
    }).slice(0, 4);

    this.$hero.html(this.renderHero(summary, payload.modeLabel || this.config.labels.normal));
    this.$summary.html(this.renderSummary(summary));
    this.$fleet.html(rows.map(this.renderFleetRow.bind(this)).join(''));
    this.$fleetEmpty.prop('hidden', rows.length > 0);
    this.$watchlist.html(
      watchlistRows.length
        ? watchlistRows.map(renderWatchlistItem).join('')
        : '<div class="svplus-empty-inline">' + escapeHtml(this.config.labels.noWatchlist) + '</div>'
    );
    this.$topUtilization.html(
      topRows.length
        ? topRows.map(renderMetricItem).join('')
        : '<div class="svplus-empty-inline">' + escapeHtml(this.config.labels.noFleetRows) + '</div>'
    );
    this.$thresholds.html(this.renderThresholds(summary, payload.modeLabel || this.config.labels.normal));
    this.$lastRefresh.text(formatTimestamp(payload.generatedAt));
  };

  DiskDashboard.prototype.renderHero = function(summary, modeLabel) {
    var usedPercent = clampPercent(summary.arrayPercent);
    return [
      '<div class="svplus-array-hero-copy">',
      '<p class="svplus-panel-eyebrow">', escapeHtml(this.config.labels.arrayCapacity), '</p>',
      '<h3 class="svplus-array-value">', escapeHtml(summary.arraySizeLabel || '0'), '</h3>',
      '<p class="svplus-array-subtitle">', escapeHtml(summary.dataDiskCount || 0), ' ', escapeHtml(this.config.labels.dataDisks), ' · ',
      escapeHtml(summary.poolCount || 0), ' ', escapeHtml(this.config.labels.pools), ' · ',
      escapeHtml(summary.flashCount || 0), ' ', escapeHtml(this.config.labels.flashDevices), '</p>',
      '</div>',
      '<div class="svplus-array-hero-meter">',
      '<div class="svplus-array-hero-topline">',
      '<span class="svplus-chip tone-', escapeHtml(summary.state || 'normal'), '">', escapeHtml(summary.stateLabel || this.config.labels.normal), '</span>',
      '<strong>', usedPercent, '% ', escapeHtml(this.config.labels.usedPercent), '</strong>',
      '</div>',
      '<div class="svplus-array-rail tone-', escapeHtml(summary.state || 'normal'), '">',
      '<div class="svplus-array-fill" style="width:', usedPercent, '%"></div>',
      '</div>',
      '<div class="svplus-array-legend">',
      '<span>', escapeHtml(this.config.labels.used), ': <strong>', escapeHtml(summary.arrayUsedLabel || '0'), '</strong></span>',
      '<span>', escapeHtml(this.config.labels.free), ': <strong>', escapeHtml(summary.arrayFreeLabel || '0'), '</strong></span>',
      '<span>', escapeHtml(this.config.labels.mode), ': <strong>', escapeHtml(modeLabel), '</strong></span>',
      '</div>',
      '</div>'
    ].join('');
  };

  DiskDashboard.prototype.renderSummary = function(summary) {
    return [
      renderSummaryCard(this.config.labels.used, summary.arrayUsedLabel || '0', summary.state || 'normal', clampPercent(summary.arrayPercent) + '%'),
      renderSummaryCard(this.config.labels.free, summary.arrayFreeLabel || '0', 'normal', clampPercent(summary.freePercent) + '%'),
      renderSummaryCard(this.config.labels.parity, summary.parityLabel || '0', 'neutral', ''),
      renderSummaryCard(this.config.labels.fleetStatus, summary.stateLabel || this.config.labels.normal, summary.state || 'normal', String(summary.diskCount || 0))
    ].join('');
  };

  DiskDashboard.prototype.renderFleetRow = function(row) {
    return renderFleetRow(row, this.config);
  };

  DiskDashboard.prototype.renderThresholds = function(summary, modeLabel) {
    return [
      renderInventoryLine(this.config.labels.warning, summary.warningThreshold > 0 ? summary.warningThreshold + '%' : this.config.labels.off),
      renderInventoryLine(this.config.labels.critical, summary.criticalThreshold > 0 ? summary.criticalThreshold + '%' : this.config.labels.off),
      renderInventoryLine(this.config.labels.mode, modeLabel),
      renderInventoryLine(this.config.labels.dataDisks, summary.dataDiskCount || 0),
      renderInventoryLine(this.config.labels.pools, summary.poolCount || 0),
      renderInventoryLine(this.config.labels.flashDevices, summary.flashCount || 0)
    ].join('');
  };

  $(function() {
    if (!window.statsViewDiskDashboardConfig) {
      return;
    }
    new DiskDashboard(window.statsViewDiskDashboardConfig).init();
  });
})(window, window.jQuery);
