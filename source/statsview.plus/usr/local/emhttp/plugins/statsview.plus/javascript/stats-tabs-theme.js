(function(window, document) {
  'use strict';

  function stylesheetHref() {
    var script = document.currentScript;
    var scripts;
    var index;

    if (!script) {
      scripts = document.getElementsByTagName('script');
      for (index = scripts.length - 1; index >= 0; index -= 1) {
        if ((scripts[index].src || '').indexOf('stats-tabs-theme.js') !== -1) {
          script = scripts[index];
          break;
        }
      }
    }

    if (!script || !script.src) {
      return '';
    }

    return script.src.replace('/javascript/stats-tabs-theme.js', '/sheets/StatsTabs.css');
  }

  function ensureStylesheet(doc, href) {
    var head;
    var linkId = 'svplus-stats-tabs-theme-link';
    var link;

    if (!doc || !href) {
      return;
    }

    head = doc.head || doc.getElementsByTagName('head')[0];
    if (!head) {
      return;
    }

    link = doc.getElementById(linkId);
    if (!link) {
      link = doc.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      head.appendChild(link);
    }
    link.href = href;
  }

  function tabLabelSet(nav) {
    var labels = {};
    var links = nav.querySelectorAll('a');
    var index = 0;

    for (index = 0; index < links.length; index += 1) {
      labels[String((links[index].textContent || '').trim()).toLowerCase()] = true;
    }

    return labels;
  }

  function isStatsTabBar(nav) {
    var labels = tabLabelSet(nav);
    return !!(labels['disk stats'] && labels['system stats']);
  }

  function applyTheme(doc) {
    var navs;
    var index;

    if (!doc || !doc.querySelectorAll) {
      return;
    }

    navs = doc.querySelectorAll('.ui-tabs-nav.ui-helper-reset.ui-helper-clearfix.ui-widget-header');
    for (index = 0; index < navs.length; index += 1) {
      if (!isStatsTabBar(navs[index])) {
        continue;
      }

      navs[index].classList.add('svplus-stats-tabbar');
      if (navs[index].parentElement) {
        navs[index].parentElement.classList.add('svplus-stats-tabframe');
      }
    }
  }

  function run() {
    var href = stylesheetHref();

    ensureStylesheet(document, href);
    applyTheme(document);
    try {
      if (window.top && window.top.document && window.top.document !== document) {
        ensureStylesheet(window.top.document, href);
        applyTheme(window.top.document);
      }
    } catch (_statsTabsThemeTopError) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.setTimeout(run, 0);
  window.setTimeout(run, 250);
  window.setTimeout(run, 1000);
})(window, document);
