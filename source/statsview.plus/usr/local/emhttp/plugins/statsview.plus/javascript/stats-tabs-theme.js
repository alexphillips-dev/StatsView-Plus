(function(window, document) {
  'use strict';

  var observerKey = '__svplusStatsTabsObserver';

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

  function normalizedText(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isStatsTabLabel(node) {
    var text = normalizedText(node);
    return text === 'disk stats' || text === 'system stats';
  }

  function closestTabItem(node) {
    if (!node) {
      return null;
    }
    if (typeof node.closest === 'function') {
      return node.closest('li, [role="tab"], .tab, .tabs, .ui-state-default');
    }
    return node.parentElement || null;
  }

  function findBarsByText(doc) {
    var nodes;
    var items = [];
    var bars = [];
    var seen = [];
    var index = 0;
    var item = null;
    var bar = null;

    if (!doc || !doc.querySelectorAll) {
      return bars;
    }

    nodes = doc.querySelectorAll('a, button, [role="tab"], span');
    for (index = 0; index < nodes.length; index += 1) {
      if (!isStatsTabLabel(nodes[index])) {
        continue;
      }
      item = closestTabItem(nodes[index]) || nodes[index].parentElement;
      if (item) {
        items.push(item);
      }
    }

    for (index = 0; index < items.length; index += 1) {
      bar = items[index] && items[index].parentElement;
      if (!bar || seen.indexOf(bar) !== -1) {
        continue;
      }
      if (isStatsTabBar(bar) || (bar.textContent || '').toLowerCase().indexOf('disk stats') !== -1 && (bar.textContent || '').toLowerCase().indexOf('system stats') !== -1) {
        seen.push(bar);
        bars.push(bar);
      }
    }

    return bars;
  }

  function activeTabItem(nav) {
    return nav.querySelector('li.ui-state-active, li.ui-tabs-active, li[aria-selected="true"]');
  }

  function styleTabAnchor(anchor) {
    if (!anchor) {
      return;
    }

    anchor.style.alignItems = 'center';
    anchor.style.color = '#b8c6da';
    anchor.style.display = 'inline-flex';
    anchor.style.fontFamily = '"Segoe UI Variable Text", "Segoe UI", sans-serif';
    anchor.style.fontSize = '12px';
    anchor.style.fontWeight = '700';
    anchor.style.gap = '8px';
    anchor.style.letterSpacing = '0.06em';
    anchor.style.lineHeight = '1';
    anchor.style.padding = '11px 14px 10px';
    anchor.style.textDecoration = 'none';
    anchor.style.textTransform = 'uppercase';
  }

  function styleTabItem(item, isActive) {
    var links = item ? item.querySelectorAll('a') : [];
    var icons = item ? item.querySelectorAll('.fa, .icon, i') : [];
    var index = 0;

    if (!item) {
      return;
    }

    item.style.background = isActive ? 'linear-gradient(180deg, rgba(17, 28, 47, 0.98) 0%, rgba(13, 24, 42, 0.98) 100%)' : 'rgba(13, 24, 42, 0.9)';
    item.style.border = isActive ? '1px solid rgba(77, 211, 255, 0.28)' : '1px solid rgba(148, 163, 184, 0.16)';
    item.style.borderBottom = isActive ? '2px solid #4dd3ff' : '1px solid rgba(148, 163, 184, 0.16)';
    item.style.borderRadius = '12px 12px 0 0';
    item.style.boxShadow = 'none';
    item.style.margin = '0';
    item.style.minHeight = '0';
    item.style.padding = '0';
    item.style.position = 'relative';

    for (index = 0; index < links.length; index += 1) {
      styleTabAnchor(links[index]);
      links[index].style.color = isActive ? '#f3f8ff' : '#b8c6da';
    }

    for (index = 0; index < icons.length; index += 1) {
      icons[index].style.color = '#7ae4ff';
      icons[index].style.fontSize = '11px';
    }
  }

  function styleTabBar(nav) {
    var items;
    var active;
    var index;

    if (!nav) {
      return;
    }

    nav.style.alignItems = 'center';
    nav.style.background = 'transparent';
    nav.style.border = 'none';
    nav.style.display = 'flex';
    nav.style.gap = '8px';
    nav.style.margin = '0 0 12px';
    nav.style.padding = '0';

    if (nav.parentElement) {
      nav.parentElement.style.background = 'transparent';
      nav.parentElement.style.border = 'none';
      nav.parentElement.style.padding = '0';
    }

    items = nav.querySelectorAll('li');
    active = activeTabItem(nav);

    for (index = 0; index < items.length; index += 1) {
      styleTabItem(items[index], items[index] === active);
    }
  }

  function observeTabBar(nav) {
    var observer;

    if (!nav || nav[observerKey]) {
      return;
    }

    observer = new MutationObserver(function() {
      styleTabBar(nav);
    });

    observer.observe(nav, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected']
    });

    nav[observerKey] = observer;
  }

  function applyTheme(doc) {
    var navs;
    var textBars;
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
      styleTabBar(navs[index]);
      observeTabBar(navs[index]);
    }

    textBars = findBarsByText(doc);
    for (index = 0; index < textBars.length; index += 1) {
      if (textBars[index].classList) {
        textBars[index].classList.add('svplus-stats-tabbar');
      }
      if (textBars[index].parentElement && textBars[index].parentElement.classList) {
        textBars[index].parentElement.classList.add('svplus-stats-tabframe');
      }
      styleTabBar(textBars[index]);
      observeTabBar(textBars[index]);
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
