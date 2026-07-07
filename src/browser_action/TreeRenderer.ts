import BookmarkTreeNode = chrome.bookmarks.BookmarkTreeNode;
import PersistentSet from "./PersistentSet";

export class TreeRenderer {
  private openFolders: PersistentSet<string>;
  private readonly hideEmptyFolders: boolean;
  private readonly startWithAllFoldersClosed: boolean;

  // ✅ SEARCH STATE
  private filter: string = '';

  constructor(
    openFolders: PersistentSet<string>,
    hideEmptyFolders: boolean,
    startWithAllFoldersClosed: boolean
  ) {
    this.openFolders = openFolders;
    this.hideEmptyFolders = hideEmptyFolders;
    this.startWithAllFoldersClosed = startWithAllFoldersClosed;
  }

  // ✅ SET SEARCH FILTER
  setFilter(filter: string): void {
    this.filter = filter.trim().toLowerCase();
  }

  // =========================
  // SEARCH HELPERS
  // =========================

  private matches(node: BookmarkTreeNode): boolean {
    if (!this.filter) return true;

    const title = (node.title || '').toLowerCase();

    if (title.includes(this.filter)) return true;

    if (node.url && node.url.toLowerCase().includes(this.filter)) {
      return true;
    }

    return false;
  }

  private folderContainsMatch(folder: BookmarkTreeNode): boolean {
    if (this.matches(folder)) return true;

    if (!folder.children) return false;

    for (const child of folder.children) {
      if (this.folderContainsMatch(child)) {
        return true;
      }
    }

    return false;
  }

  // =========================
  // MAIN RENDER
  // =========================

  renderTree(
    treeNode: BookmarkTreeNode,
    document: Document,
    topLevel: boolean = false,
    visible: boolean = true
  ): HTMLElement | DocumentFragment {

    let wrapper: HTMLElement | DocumentFragment;

    if (topLevel) {
      wrapper = document.createDocumentFragment();
    } else {
      wrapper = document.createElement('ul');
      wrapper.className = 'sub';

      if (visible) {
        (wrapper as HTMLElement).style.height = 'auto';
      }
    }

    if (typeof treeNode.children === 'undefined') {
      return wrapper;
    }

    treeNode.children.forEach((child: BookmarkTreeNode) => {
      if (!child) return;

      // ✅ SEARCH FILTER (skip whole subtree if no match)
      if (this.filter && !this.folderContainsMatch(child)) {
        return;
      }

      if (child.url) {
        wrapper.appendChild(this.renderBookmark(child, document));
        return;
      }

      const isOpen =
        this.filter !== '' ||
        (!this.startWithAllFoldersClosed && this.openFolders.contains(child.id));

      wrapper.appendChild(
        this.renderFolder(isOpen, document, child)
      );
    });

    return wrapper;
  }

  // =========================
  // FOLDER
  // =========================

  private renderFolder(
    isOpen: boolean,
    document: Document,
    child: BookmarkTreeNode
  ): HTMLElement {

    const d = document.createElement('li');

    if (typeof child.url !== 'undefined') {
      throw new Error('Folder expected but bookmark found');
    }

    d.classList.add('folder');

    if (isOpen) {
      d.classList.add('open');
    }

    const folder = document.createElement('span');
    folder.innerText = child.title;
    d.appendChild(folder);

    if (this.hideEmptyFolders && this.isFolderEmpty(child)) {
      d.classList.add('hidden');
    } else {
      d.dataset.itemId = child.id;

      if (child.children && child.children.length) {
        if (isOpen) {
          const children = this.renderTree(child, document, false, isOpen);
          d.appendChild(children);
        }

        d.dataset.loaded = isOpen ? '1' : '0';
      }
    }

    return d;
  }

  // =========================
  // BOOKMARK
  // =========================

  private renderBookmark(
    child: BookmarkTreeNode,
    document: Document
  ): HTMLElement {

    if (!child.url) {
      throw new Error('Bookmark expected but folder found');
    }

    // ✅ FILTER BOOKMARKS
    if (!this.matches(child)) {
      return document.createDocumentFragment() as unknown as HTMLElement;
    }

    const d = document.createElement('li');

    d.dataset.url = child.url;
    d.dataset.itemId = child.id;

    const bookmark = document.createElement('span');

    if (!/^\s*$/.test(child.title)) {
      bookmark.innerText = child.title;
    } else {
      bookmark.innerHTML = '&nbsp;';
    }

    bookmark.title = `${child.title} [${child.url}]`;
    bookmark.style.backgroundImage = `url("${this.getFaviconUrl(child.url)}")`;

    bookmark.className = 'bookmark';

    d.appendChild(bookmark);

    return d;
  }

  // =========================
  // FAVICON
  // =========================

  private getFaviconUrl(url: string): string {
    const urlObj = new URL(chrome.runtime.getURL('/_favicon/'));
    urlObj.searchParams.set('pageUrl', url);
    urlObj.searchParams.set('size', '32');
    return urlObj.toString();
  }

  // =========================
  // UTIL
  // =========================

  isFolderEmpty(folder: BookmarkTreeNode): boolean {
    if (!folder.children) return false;

    if (folder.children.length === 0) return true;

    for (const child of folder.children) {
      if (!this.isFolderEmpty(child)) {
        return false;
      }
    }

    return true;
  }
}