// ==UserScript==
// @name         Insta Friends Only
// @namespace    https://github.com/11291996/insta-friends-only
// @version      0.3.0
// @description  Hide Reels, Explore, suggested and sponsored content on instagram.com. Keep posts and stories from people you follow.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// This one file is both the Chrome extension's content script (see manifest.json)
// and a userscript for Tampermonkey / the iOS "Userscripts" app.

(() => {
  'use strict';

  const CONFIG = {
    // Hide reels in the feed even when a friend posted them. Set to false to keep friends' reels.
    hideReelPosts: true,
    // Send the home page to Instagram's chronological Following feed. That page has no stories bar,
    // so this is off by default: the normal home feed keeps stories and the filters below remove the rest.
    useFollowingFeed: false,
    // Outline filtered items in red instead of removing them, to check what gets caught.
    debug: false,
  };

  const HOME = CONFIG.useFollowingFeed ? '/?variant=following' : '/';
  const EXPLORE_REPLACEMENT = '/explore/search/';

  // Matched against the full text of short elements, so they must be exact.
  const SUGGESTED_LABELS = ['Suggested for you', 'Suggested posts', '회원님을 위한 추천', '추천 게시물'];
  const SPONSORED_LABELS = ['Sponsored', '광고'];
  const FOLLOW_LABELS = ['Follow', '팔로우'];

  const CSS = `
    /* The Reels tab link (it may carry a reel id on mobile) and the Reels tab on profiles. */
    a[href^="/reels"], a[href$="/reels/"] { display: none !important; }
    /* On mobile the /explore/ link is the search tab, so only hide it on desktop. */
    @media (min-width: 768px) { a[href="/explore/"] { display: none !important; } }
    ${CONFIG.debug
      ? '[data-ifo-hidden] { outline: 3px solid red !important; opacity: .35 !important; }'
      : '[data-ifo-hidden] { display: none !important; }'}
  `;

  // ---- Routing: keep the user off Reels and Explore ----

  const REDIRECT_KEY = 'ifo-redirects';

  function targetFor(url) {
    const { pathname, searchParams } = url;
    if (/^\/reels(\/|$)/.test(pathname)) return HOME;
    if (pathname === '/explore/' || pathname === '/explore') return EXPLORE_REPLACEMENT;
    if (CONFIG.useFollowingFeed && pathname === '/' && searchParams.get('variant') !== 'following') return HOME;
    return null;
  }

  // Each redirect is a full page load. If Instagram keeps sending us back to a blocked address
  // (or rewrites /?variant=following to /), stop after two redirects in 10s and say which address did it.
  function go(target, from) {
    let recent;
    try {
      recent = JSON.parse(sessionStorage.getItem(REDIRECT_KEY) || '[]').filter((t) => Date.now() - t < 10000);
      if (recent.length >= 2) {
        showNotice(`Insta Friends Only: stopped a reload loop (${from} → ${target})`);
        return false;
      }
      sessionStorage.setItem(REDIRECT_KEY, JSON.stringify([...recent, Date.now()]));
    } catch {
      return false;
    }
    location.replace(target);
    return true;
  }

  let noticeShown = false;
  function showNotice(text) {
    if (noticeShown) return;
    // The script starts before <body> exists, so wait for it.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => showNotice(text), { once: true });
      return;
    }
    noticeShown = true;
    const box = document.createElement('div');
    box.textContent = text;
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom, 0px));'
      + 'z-index:2147483647;padding:10px 12px;border-radius:10px;background:#c62828;color:#fff;'
      + 'font:13px/1.4 -apple-system,system-ui,sans-serif;word-break:break-all;';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 10000);
  }

  function route() {
    const target = targetFor(new URL(location.href));
    if (target) go(target, location.pathname + location.search);
  }

  // Catch nav clicks before Instagram's router so Reels/Explore never render.
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target instanceof Element && e.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const target = targetFor(url);
    if (target && go(target, url.pathname + url.search)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // Instagram is a single-page app, so watch for in-page URL changes too.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      route();
      scheduleSweep();
    }
  }, 300);
  window.addEventListener('popstate', route);

  // ---- Feed filtering ----

  function findExact(root, selector, labels) {
    for (const el of root.querySelectorAll(selector)) {
      const text = el.textContent;
      if (text.length < 40 && labels.includes(text.trim())) return el;
    }
    return null;
  }

  function classifyPost(article) {
    if (findExact(article, 'span, a', SPONSORED_LABELS)) return 'sponsored';
    if (findExact(article, 'span, a', SUGGESTED_LABELS)) return 'suggested';
    // A Follow button on a feed post means you don't follow the author.
    if (findExact(article, 'button, div[role="button"]', FOLLOW_LABELS)) return 'not-following';
    if (CONFIG.hideReelPosts && article.querySelector('a[href*="/reel/"]')) return 'reel';
    return null;
  }

  // Once a post is hidden it stays hidden, and is remembered by its link for when Instagram re-creates it.
  // Judge only by things that don't change while you look at a post (labels, Follow button, reel link),
  // never by a <video>: Instagram adds and removes those as you scroll or swipe, which made posts flicker.
  const hiddenPosts = new Map();

  function postKey(article) {
    for (const link of article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
      const m = link.getAttribute('href').match(/\/(p|reel)\/([^/?#]+)/);
      if (m) return m[2];
    }
    return null;
  }

  function judgePost(article) {
    const prev = article.dataset.ifoHidden;
    if (prev) return prev;
    const key = postKey(article);
    const cached = key && hiddenPosts.get(key);
    if (cached) return cached;
    const reason = classifyPost(article);
    if (key && reason) hiddenPosts.set(key, reason);
    return reason;
  }

  function setHidden(el, reason) {
    if ((reason || null) === (el.dataset.ifoHidden || null)) return;
    if (reason) el.dataset.ifoHidden = reason;
    else delete el.dataset.ifoHidden;
  }

  const POST_CONTENT = 'article, video, a[href*="/p/"], a[href*="/reel/"]';

  // "Suggested for you" blocks outside posts: the desktop sidebar and in-feed account carousels.
  function hideSuggestionBlocks() {
    for (const label of document.querySelectorAll('span, h4, div[dir="auto"]')) {
      const text = label.textContent;
      if (text.length >= 40 || !SUGGESTED_LABELS.includes(text.trim())) continue;
      if (label.closest('article, [data-ifo-hidden]')) continue;
      // The desktop notifications panel opens over the home page, outside <main>; leave it alone.
      if (!label.closest('main, [role="main"]')) continue;
      // Climb to the smallest block that also holds Follow buttons, without swallowing the feed.
      // Posts aren't always <article>, so also stop at anything holding a post link or a video.
      for (let el = label.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.matches('main, [role="main"]') || el.querySelector(POST_CONTENT)) break;
        if (findExact(el, 'button, div[role="button"]', FOLLOW_LABELS)) {
          setHidden(el, 'suggested-accounts');
          break;
        }
      }
    }
  }

  function sweep() {
    // Only filter the home feed. Elsewhere Follow buttons are normal: a stranger's post you opened,
    // or "follow back" buttons in the notifications list.
    if (location.pathname !== '/') return;
    // Check new posts as they load in.
    for (const article of document.querySelectorAll('article')) {
      setHidden(article, judgePost(article));
    }
    hideSuggestionBlocks();
  }

  let sweepTimer = 0;
  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 150);
  }

  // ---- Start ----

  route();
  const style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
  new MutationObserver(scheduleSweep).observe(document.documentElement, { childList: true, subtree: true });
})();
