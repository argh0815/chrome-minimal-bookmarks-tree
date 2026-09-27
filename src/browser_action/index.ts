import {SettingsFactory} from '../common/settings/SettingsFactory';
import {ClickHandler} from "./ClickHandler";
import {ContextMenuFactory} from "./ContextMenuFactory";
import {ChromeTranslator} from "../common/translator/ChromeTranslator";
import {DialogRenderer} from "./DialogRenderer";
import {ContextMenuRenderer} from "./ContextMenuRenderer";
import {WindowLocationCalculator} from "./location_calculator/WindowLocationCalculator";
import {TreeRenderer} from "./TreeRenderer";
import PersistentSet from "./PersistentSet";
import {FolderToggler} from "./FolderToggler";
import {Utils} from "../common/Utils";
import {KeyHandler} from "./KeyHandler";
import {KeyboardNavigation} from "./KeyboardNavigation";
import {BookmarkManager} from "./BookmarkManager";

// -------------------- INIT --------------------

// Settings and the bookmark tree are independent, so fetch both right away
// instead of waiting for settings before even asking for the bookmarks —
// that turned two independent round trips into one twice as long.
const settingsPromise = SettingsFactory.create();
const bookmarksTreePromise = new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
  chrome.bookmarks.getTree(resolve);
});

const settings = await settingsPromise;

const translator = new ChromeTranslator();
const dialogRenderer = new DialogRenderer(document, translator);
const bookmarkManager = new BookmarkManager(translator, dialogRenderer, settings);
const contextMenuFactory = new ContextMenuFactory(bookmarkManager, translator, dialogRenderer, settings);
const contextMenuRenderer = new ContextMenuRenderer(document, new WindowLocationCalculator(window));

const openFolders: PersistentSet<string> = new PersistentSet('openfolders');

// Apply startup folder-state options in a deterministic order.
// First close everything when requested, then let the Bookmarks Bar option
// explicitly decide whether the Bookmarks Bar itself starts open.
if (settings.isEnabled('start_with_all_folders_closed')) {
  openFolders.clear();
}

if (settings.isEnabled('expand_bookmarks_bar')) {
  openFolders.add('1');
} else {
  openFolders.remove('1');
}

const treeRenderer = new TreeRenderer(openFolders, settings.isEnabled('hide_empty_folders'));

const folderToggler = new FolderToggler(openFolders, treeRenderer, settings);

const clickHandler = new ClickHandler(
  settings,
  contextMenuFactory,
  contextMenuRenderer,
  folderToggler
);

// -------------------- DOM --------------------

const loading = document.querySelector('#loading') as HTMLElement;
const bm = document.querySelector('#bookmarks') as HTMLElement;
const wrapper = document.querySelector('#wrapper') as HTMLElement;
const search = document.querySelector('#search') as HTMLInputElement;

const keyHandler = new KeyHandler(bookmarkManager);
const keyboardNavigation = new KeyboardNavigation(wrapper, search, bm);

// -------------------- SEARCH STATE --------------------

let bookmarksTreeCache: chrome.bookmarks.BookmarkTreeNode;
let flatBookmarks: chrome.bookmarks.BookmarkTreeNode[] = [];

// collect bookmarks recursively
function collect(node: chrome.bookmarks.BookmarkTreeNode) {
  if (node.url) {
    flatBookmarks.push(node);
  }

  node.children?.forEach(collect);
}

// -------------------- TREE RENDER --------------------

function renderTreeMode() {
  bm.replaceChildren();

  const root = bookmarksTreeCache;
  const bookmarksFolder = treeRenderer.renderTree(root, document, true);

  if (bookmarksFolder) {
    bm.appendChild(bookmarksFolder);
  }
}

// -------------------- SEARCH RENDER --------------------

function renderSearchMode(query: string) {
  const q = query.trim().toLowerCase();

  if (!q) {
    renderTreeMode();
    return;
  }

  const results = flatBookmarks.filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.url || '').toLowerCase().includes(q)
  );

  const fragment = document.createDocumentFragment();

  for (const b of results) {
    // Mirrors TreeRenderer.renderBookmark() as a flat (non-nested) row, since
    // search results ignore folder structure entirely.
    const li = document.createElement('li');
    li.dataset.url = b.url!;
    li.dataset.itemId = b.id;

    const span = document.createElement('span');
    span.className = 'bookmark';
    span.textContent = b.title || b.url!;
    span.title = `${b.title} [${b.url}]`;
    span.style.backgroundImage = `url("${TreeRenderer.getFaviconUrl(b.url!)}")`;

    li.appendChild(span);
    fragment.appendChild(li);
  }

  bm.replaceChildren(fragment);
}

// -------------------- LOAD BOOKMARKS --------------------

bookmarksTreePromise.then((bookmarksTree) => {
  if (!bookmarksTree[0]?.children) return;

  bookmarksTreeCache = bookmarksTree[0];

  renderTreeMode();

  (bm as HTMLElement).style.display = 'block';
  (loading.parentNode as HTMLElement).removeChild(loading);

  // The search index isn't needed for the first frame, so build it in a
  // follow-up task rather than delaying the tree that's already visible.
  window.setTimeout(() => {
    flatBookmarks = [];
    collect(bookmarksTreeCache);
  }, 0);
});

// -------------------- EVENTS --------------------

let searchDebounceTimer: number | undefined;

search.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);

  searchDebounceTimer = window.setTimeout(() => {
    const value = search.value;
    if (value.trim() === '') {
      renderTreeMode();
    } else {
      renderSearchMode(value);
    }
  }, 60);
});

// Capture mouse selection first so a clicked row becomes the keyboard anchor.
bm.addEventListener('click', (event) => keyboardNavigation.handleTreeClick(event), true);
bm.addEventListener('click', (event) => clickHandler.handleClick(event));
bm.addEventListener('contextmenu', (event) => clickHandler.handleRightClick(event));
bm.addEventListener('mousedown', (event) => clickHandler.handleMouseDown(event));
bm.addEventListener('mousemove', () => keyboardNavigation.handleMouseMove());

// Escape while the empty search box is open must close only the search box.
// Prevent Chrome from treating Escape as a request to close the browser-action popup.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.activeElement === search && search.value.trim() === '') {
    event.preventDefault();
    event.stopImmediatePropagation();
    search.style.display = 'none';
  }
}, true);

// Tree/search navigation is always available. The legacy Delete-key feature
// remains controlled by the existing keyboard_support setting.
document.addEventListener('keydown', (event) => keyboardNavigation.handleKeyDown(event), true);

if (settings.isEnabled('keyboard_support')) {
  window.addEventListener('keyup', (event) => keyHandler.handleKeyUp(event));
}

document.addEventListener('contextmenu', () => false);

// Disable Drag & Drop as it creates an issue with clicks on folders not registering
// initDragDrop(bm, wrapper);

// -------------------- SCROLL RESTORE --------------------

if (settings.isEnabled('remember_scroll_position')) {
  const scrolltop = localStorage.getItem('scrolltop');
  if (scrolltop !== null) {
    setTimeout(() => {
      wrapper.scrollTop = parseInt(scrolltop, 10);
    }, 10);
  }

  let scrollTimeout: number | undefined;

  wrapper.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);

    scrollTimeout = window.setTimeout(() => { localStorage.setItem('scrolltop', String(wrapper.scrollTop)); }, 100);
  });
}

// -------------------- SEARCH BOX --------------------
window.addEventListener(
  'keyup',
  (e) => {
    const active = document.activeElement === search;

    if (!active && e.key.toLowerCase() === settings.getString('search_key').toLowerCase()) {
      search.style.display = 'block';
      search.focus();
      search.select();
      return;
    }

    if (e.key === 'Escape') {
      if (search.style.display === 'block') {
        e.preventDefault();
        e.stopImmediatePropagation();

        const hadSearchText = search.value.trim().length > 0;
        search.value = '';
        search.style.display = 'none';

        // Only rebuild the tree when we were actually showing search results.
        // If the search box is already empty, closing it must leave the tree
        // (including its open folders) untouched.
        if (hadSearchText) {
          renderTreeMode();
        }
      }
    }
  },
  true // <-- IMPORTANT: capture phase
);

// -------------------- TRANSLATION --------------------

Utils.translateDocument(window.document);

// -------------------- SIZE + THEME --------------------

const browserActionMaxHeight = 600;
const browserActionMaxWidth = 800;

const width = Math.floor(Math.min(browserActionMaxWidth, settings.getNumber('width')));
const height = Math.floor(Math.min(browserActionMaxHeight, settings.getNumber('height')));

// Give the popup viewport the configured width as well as the wrapper.
// When every folder is closed, the bookmark rows have very little intrinsic
// width because their text uses overflow:hidden.  If only #wrapper is sized,
// Chromium can keep the popup viewport at roughly icon width and clip the
// folder names.
document.documentElement.style.width = `${width}px`;
document.body.style.width = `${width}px`;
document.body.style.minWidth = `${width}px`;
wrapper.style.width = `${width}px`;
wrapper.style.minWidth = `${width}px`;
wrapper.style.maxWidth = `${width}px`;
wrapper.style.maxHeight = `${height}px`;

const font = settings.getString('font');
if (font !== '__default__') {
  document.body.style.fontFamily = `"${font}"`;
}

document.body.classList.add(`theme--${settings.getString('theme')}`);