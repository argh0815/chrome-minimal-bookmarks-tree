import {SettingsFactory} from '../common/settings/SettingsFactory';
import {initDragDrop} from "./drag_drop";
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
import {BookmarkManager} from "./BookmarkManager";

// -------------------- INIT --------------------

const settings = await SettingsFactory.create();

const translator = new ChromeTranslator();
const dialogRenderer = new DialogRenderer(document, translator);
const bookmarkManager = new BookmarkManager(translator, dialogRenderer, settings);
const contextMenuFactory = new ContextMenuFactory(bookmarkManager, translator, dialogRenderer, settings);
const contextMenuRenderer = new ContextMenuRenderer(document, new WindowLocationCalculator(window));

const openFolders: PersistentSet<string> = new PersistentSet('openfolders');

// Start with Bookmarks Bar expanded?
if (settings.isEnabled('expand_bookmarks_bar')) {
  openFolders.clear();
  openFolders.add('1');
}

const treeRenderer = new TreeRenderer(
  openFolders,
  settings.isEnabled('hide_empty_folders'),
  settings.isEnabled('start_with_all_folders_closed')
);

const folderToggler = new FolderToggler(openFolders, treeRenderer, settings);

const clickHandler = new ClickHandler(
  settings,
  contextMenuFactory,
  contextMenuRenderer,
  folderToggler
);

const keyHandler = new KeyHandler(bookmarkManager);

// -------------------- DOM --------------------

const loading = document.querySelector('#loading') as HTMLElement;
const bm = document.querySelector('#bookmarks') as HTMLElement;
const wrapper = document.querySelector('#wrapper') as HTMLElement;
const search = document.querySelector('#search') as HTMLInputElement;

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
  const other = root.children?.[1];

  const bookmarksFolder = treeRenderer.renderTree(root, document, true);

  if (bookmarksFolder) {
    bm.appendChild(bookmarksFolder);
  }

  if (other) {
    bm.appendChild(
      treeRenderer.renderTree(other, document, true)
    );
  }
}

// -------------------- SEARCH RENDER --------------------

function renderSearchMode(query: string) {
  const q = query.trim().toLowerCase();

  bm.replaceChildren();

  if (!q) {
    renderTreeMode();
    return;
  }

  const results = flatBookmarks.filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.url || '').toLowerCase().includes(q)
  );

  for (const b of results) {
    const li = document.createElement('li');

    // ✅ Option 3: mimic TreeRenderer.renderBookmark()

    const span = document.createElement('span');
    span.className = 'bookmark';

    span.textContent = b.title || b.url!;
    span.title = `${b.title} [${b.url}]`;

    // favicon like TreeRenderer
    span.style.backgroundImage =
      `url("${chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(b.url!) + '&size=32'}")`;

    li.dataset.url = b.url!;
    li.dataset.itemId = b.id;

    li.appendChild(span);
    bm.appendChild(li);
  }
}

// -------------------- LOAD BOOKMARKS --------------------

chrome.bookmarks.getTree((bookmarksTree) => {
  if (!bookmarksTree[0]?.children) return;

  bookmarksTreeCache = bookmarksTree[0];

  flatBookmarks = [];
  collect(bookmarksTreeCache);

  renderTreeMode();

  (bm as HTMLElement).style.display = 'block';
  (loading.parentNode as HTMLElement).removeChild(loading);
});

// -------------------- EVENTS --------------------

search.addEventListener('input', () => {
  const value = search.value;

  if (value.trim() === '') {
    renderTreeMode();
  } else {
    renderSearchMode(value);
  }
});

bm.addEventListener('click', (event) => clickHandler.handleClick(event));
bm.addEventListener('contextmenu', (event) => clickHandler.handleRightClick(event));
bm.addEventListener('mousedown', (event) => clickHandler.handleMouseDown(event));

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

    if (!active && e.key.toLowerCase() === 's') {
      search.style.display = 'block';
      search.focus();
      search.select();
      return;
    }

    if (e.key === 'Escape') {
      if (search.style.display === 'block') {
        e.preventDefault();
        e.stopImmediatePropagation();

        search.value = '';
        search.style.display = 'none';
        renderTreeMode();
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

wrapper.style.width = `${width}px`;
wrapper.style.minWidth = `${width}px`;
wrapper.style.maxWidth = `${width}px`;
wrapper.style.maxHeight = `${height}px`;

const font = settings.getString('font');
if (font !== '__default__') {
  document.body.style.fontFamily = `"${font}"`;
}

document.body.classList.add(`theme--${settings.getString('theme')}`);