import {BookmarkOpener, BookmarkOpeningDisposition} from "../common/BookmarkOpener";
import {ContextMenuFactory} from "./ContextMenuFactory";
import {ContextMenuRenderer} from "./ContextMenuRenderer";
import {Settings} from "../common/Settings";
import {FolderToggler} from "./FolderToggler";
import {Utils} from "../common/Utils";

export class ClickHandler {
  private settings: Settings;
  private contextMenuFactory: ContextMenuFactory;
  private contextMenuRenderer: ContextMenuRenderer;
  private folderToggler: FolderToggler;

  constructor(
    settings: Settings,
    contextMenuFactory: ContextMenuFactory,
    contextMenuRenderer: ContextMenuRenderer,
    folderToggler: FolderToggler
  ) {
    this.settings = settings;
    this.contextMenuFactory = contextMenuFactory;
    this.contextMenuRenderer = contextMenuRenderer;
    this.folderToggler = folderToggler;
  }

  handleClick(event: MouseEvent) {
    if (this.contextMenuRenderer.isMenuOpen()) {
      this.contextMenuRenderer.clear();

      return;
    }

    const row = ClickHandler.getRow(event);
    if (!row) {
      return false;
    }

    ClickHandler.clearSelection();

    if (row.classList.contains('folder')) {
      this.folderToggler.toggle(row);

      return false;
    }

    if (event.button !== 0) {
      return false;
    }

    const actionType = event.ctrlKey || event.metaKey ? 'super_click_action' : 'click_action';

    const url = Utils.getElementData(row, 'url');
    ClickHandler.openBookmark(url, this.settings.getString(actionType));

    return Utils.nothing(event);
  }

  handleRightClick(event: MouseEvent) {
    const row = ClickHandler.getRow(event);
    if (!row) {
      return Utils.nothing(event);
    }

    ClickHandler.clearSelection();
    row.classList.add('selected');

    const offset = {
      x: event.pageX,
      y: event.pageY,
    };

    const menu = row.classList.contains('folder')
      ? this.contextMenuFactory.forFolder(row)
      : this.contextMenuFactory.forBookmark(row);

    this.contextMenuRenderer.render(menu, offset);

    return Utils.nothing(event);
  }

  handleMouseDown(event: MouseEvent) {
    event.preventDefault();

    const row = ClickHandler.getRow(event);
    if (!row) {
      return false;
    }

    ClickHandler.clearSelection();

    if (event.button !== 1) {
      return false;
    }

    if (row.classList.contains('folder')) {
      Utils.openAllBookmarks(Utils.getElementData(row, 'itemId'));
      return Utils.nothing(event);
    }

    const url = Utils.getElementData(row, 'url');
    ClickHandler.openBookmark(url, this.settings.getString('middle_click_action'));
  }

  /**
   * Every handler only cares about clicks on a bookmark/folder row, which is
   * always the parent <li> of the clicked <span>. Returns null for anything
   * else so callers can bail out early.
   */
  private static getRow(event: MouseEvent): HTMLElement | null {
    if (!(event.target instanceof HTMLElement) || event.target.nodeName !== 'SPAN') {
      return null;
    }

    return event.target.parentNode instanceof HTMLElement ? event.target.parentNode : null;
  }

  private static clearSelection(): void {
    document.querySelectorAll('.selected').forEach((element: Element) => {
      element.classList.remove('selected');
    });
  }

  static openBookmark(url: string, where: string): void {
    let disposition: BookmarkOpeningDisposition;
    let closeWindow: boolean = true;

    switch (where) {
      case 'new':
        disposition = BookmarkOpeningDisposition.foregroundTab;
        break;
      case 'background':
        disposition = BookmarkOpeningDisposition.backgroundTab;
        closeWindow = false;
        break;
      case 'new-window':
        disposition = BookmarkOpeningDisposition.newWindow;
        break;
      case 'new-incognito-window':
        disposition = BookmarkOpeningDisposition.newIncognitoWindow;
        break;
      default:
        disposition = BookmarkOpeningDisposition.activeTab;
    }

    BookmarkOpener.open(url, disposition).then(() => {
      if (closeWindow) {
        window.close();
      }
    });
  }
}
