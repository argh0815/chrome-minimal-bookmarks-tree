import BookmarkTreeNode = chrome.bookmarks.BookmarkTreeNode;
import PersistentSet from "./PersistentSet";

export class TreeRenderer {
  private openFolders: PersistentSet<string>;
  private readonly hideEmptyFolders: boolean;
  private readonly emptyFolderCache = new WeakMap<BookmarkTreeNode, boolean>();

  constructor(openFolders: PersistentSet<string>, hideEmptyFolders: boolean) {
    this.openFolders = openFolders;
    this.hideEmptyFolders = hideEmptyFolders;
  }

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
      if (!child) {
        return;
      }

      if (child.url) {
        wrapper.appendChild(this.renderBookmark(child, document));
        return;
      }

      const isOpen = this.openFolders.contains(child.id);
      wrapper.appendChild(this.renderFolder(isOpen, document, child));
    });

    return wrapper;
  }

  private renderFolder(
    isOpen: boolean,
    document: Document,
    child: BookmarkTreeNode
  ): HTMLElement {
    if (typeof child.url !== 'undefined') {
      throw new Error('Folder expected but bookmark found');
    }

    const d = document.createElement('li');
    d.classList.add('folder');

    if (isOpen) {
      d.classList.add('open');
    }

    const folder = document.createElement('span');
    folder.innerText = child.title;
    d.appendChild(folder);

    if (this.hideEmptyFolders && this.isFolderEmpty(child)) {
      d.classList.add('hidden');
      return d;
    }

    d.dataset.itemId = child.id;

    if (child.children && child.children.length) {
      if (isOpen) {
        d.appendChild(this.renderTree(child, document, false, isOpen));
      }

      d.dataset.loaded = isOpen ? '1' : '0';
    }

    return d;
  }

  private renderBookmark(child: BookmarkTreeNode, document: Document): HTMLElement {
    if (!child.url) {
      throw new Error('Bookmark expected but folder found');
    }

    const d = document.createElement('li');
    d.dataset.url = child.url;
    d.dataset.itemId = child.id;

    const bookmark = document.createElement('span');
    bookmark.className = 'bookmark';

    if (/^\s*$/.test(child.title)) {
      bookmark.innerHTML = '&nbsp;';
    } else {
      bookmark.innerText = child.title;
    }

    bookmark.title = `${child.title} [${child.url}]`;
    bookmark.style.backgroundImage = `url("${TreeRenderer.getFaviconUrl(child.url)}")`;

    d.appendChild(bookmark);

    return d;
  }

  static getFaviconUrl(url: string): string {
    const urlObj = new URL(chrome.runtime.getURL('/_favicon/'));
    urlObj.searchParams.set('pageUrl', url);
    urlObj.searchParams.set('size', '32');
    return urlObj.toString();
  }

  isFolderEmpty(folder: BookmarkTreeNode): boolean {
    const cached = this.emptyFolderCache.get(folder);
    if (cached !== undefined) {
      return cached;
    }

    let empty: boolean;
    if (!folder.children) {
      empty = false;
    } else if (folder.children.length === 0) {
      empty = true;
    } else {
      empty = folder.children.every((child) => this.isFolderEmpty(child));
    }

    this.emptyFolderCache.set(folder, empty);
    return empty;
  }
}
