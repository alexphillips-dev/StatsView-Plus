(function(window, document) {
  'use strict';

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
    applyTheme(document);
    try {
      if (window.top && window.top.document && window.top.document !== document) {
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
