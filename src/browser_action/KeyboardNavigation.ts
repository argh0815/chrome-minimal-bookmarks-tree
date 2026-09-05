export class KeyboardNavigation {
  private wrapper: HTMLElement;
  private search: HTMLInputElement;
  private bookmarks: HTMLElement;
  private anchor: HTMLElement | null = null;
  private keyboardClickInProgress = false;

  constructor(
    wrapper: HTMLElement,
    search: HTMLInputElement,
    bookmarks: HTMLElement
  ) {
    this.wrapper = wrapper;
    this.search = search;
    this.bookmarks = bookmarks;
  }

  /**
   * Mouse movement returns the popup to normal hover highlighting.
   * Keyboard selection itself is preserved.
   */
  handleMouseMove(): void {
    this.bookmarks.classList.remove('keyboard-navigation-active');
  }

  /**
   * Mouse clicks establish the starting point for tree keyboard navigation.
   * This deliberately never changes the scroll position.
   */
  handleTreeClick(event: MouseEvent): void {
    if (!this.keyboardClickInProgress && event.isTrusted) {
      this.bookmarks.classList.remove('keyboard-navigation-active');
    }

    if (this.searchIsActive()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest('li');
    if (
      item instanceof HTMLElement &&
      this.bookmarks.contains(item) &&
      this.directSpan(item) !== null
    ) {
      this.setAnchor(item, false);
    }
  }

  /**
   * Full keyboard navigation for both the normal tree and search results.
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (this.searchIsActive()) {
      this.handleSearchKeyDown(event);
      return;
    }

    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    ) {
      return;
    }

    const handled = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ];

    if (!handled.includes(event.key)) {
      return;
    }

    const items = this.visibleTreeItems();
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.bookmarks.classList.add('keyboard-navigation-active');

    let index = this.currentIndex(items);

    if (event.key === 'Home') {
      this.wrapper.scrollTop = 0;
      this.setAnchor(items[0], false);
      return;
    }

    if (event.key === 'End') {
      this.wrapper.scrollTop = this.wrapper.scrollHeight;
      this.setAnchor(items[items.length - 1], false);
      return;
    }

    if (event.key === 'ArrowDown') {
      index = index < 0 ? 0 : Math.min(index + 1, items.length - 1);
      this.setAnchor(items[index], true);
      return;
    }

    if (event.key === 'ArrowUp') {
      index = index < 0 ? items.length - 1 : Math.max(index - 1, 0);
      this.setAnchor(items[index], true);
      return;
    }

    if (event.key === 'PageDown' || event.key === 'PageUp') {
      this.handlePageMove(event.key === 'PageDown' ? 1 : -1, items, index);
      return;
    }

    const item = index >= 0 ? items[index] : items[0];
    if (index < 0) {
      this.setAnchor(item, true);
    }

    if (event.key === 'Enter') {
      const target = this.directSpan(item);
      if (target) {
        this.keyboardClick(target);
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      if (!item.classList.contains('folder')) {
        return;
      }

      if (!item.classList.contains('open')) {
        const target = this.directSpan(item);
      if (target) {
        this.keyboardClick(target);
      }
      } else {
        const child = this.firstVisibleChild(item);
        if (child) {
          this.setAnchor(child, true);
        }
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (item.classList.contains('folder') && item.classList.contains('open')) {
        const target = this.directSpan(item);
      if (target) {
        this.keyboardClick(target);
      }
      } else {
        const parent = this.parentFolder(item);
        if (parent) {
          this.setAnchor(parent, true);
        }
      }
    }
  }

  private handleSearchKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    const handled = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'];
    if (!handled.includes(event.key)) {
      return;
    }

    const results = this.searchResults();

    if (event.key === 'Enter') {
      const selectedIndex = this.selectedSearchIndex(results);
      if (selectedIndex < 0) {
        return;
      }

      const target = results[selectedIndex].querySelector('span.bookmark');
      if (target instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        this.keyboardClick(target);
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.bookmarks.classList.add('keyboard-navigation-active');

    if (results.length === 0) {
      return;
    }

    const selectedIndex = this.selectedSearchIndex(results);

    if (event.key === 'ArrowDown') {
      this.selectSearchResult(results, selectedIndex < 0 ? 0 : selectedIndex + 1);
    } else if (event.key === 'ArrowUp') {
      this.selectSearchResult(results, selectedIndex < 0 ? results.length - 1 : selectedIndex - 1);
    } else if (event.key === 'Home') {
      this.selectSearchResult(results, 0);
    } else if (event.key === 'End') {
      this.selectSearchResult(results, results.length - 1);
    }
  }

  private keyboardClick(target: HTMLElement): void {
    this.keyboardClickInProgress = true;
    try {
      target.click();
    } finally {
      this.keyboardClickInProgress = false;
    }
  }

  private searchIsActive(): boolean {
    return this.search.value.trim().length > 0;
  }

  private searchResults(): HTMLElement[] {
    if (!this.searchIsActive()) {
      return [];
    }

    return Array.from(this.bookmarks.querySelectorAll(':scope > li[data-url]'))
      .filter((item): item is HTMLElement => item instanceof HTMLElement);
  }

  private selectedSearchIndex(results: HTMLElement[]): number {
    return results.findIndex((item) => item.classList.contains('selected'));
  }

  private selectSearchResult(results: HTMLElement[], index: number): void {
    this.bookmarks.querySelectorAll(':scope > li.selected').forEach((item) => {
      item.classList.remove('selected');
    });

    if (results.length === 0) {
      return;
    }

    const normalizedIndex = (index + results.length) % results.length;
    const item = results[normalizedIndex];
    item.classList.add('selected');

    // Search results are simple one-row LI elements (no nested subtree), so
    // scrollIntoView is safe here and gives the desired wrap-around behavior.
    item.scrollIntoView({block: 'nearest'});
  }

  private directSpan(item: HTMLElement): HTMLElement | null {
    for (const child of Array.from(item.children)) {
      if (child instanceof HTMLElement && child.tagName === 'SPAN') {
        return child;
      }
    }

    return null;
  }

  private isTreeVisible(item: HTMLElement): boolean {
    let node: HTMLElement | null = item;

    while (node && node !== this.bookmarks) {
      const parentSub: HTMLElement | null = node.parentElement;
      if (parentSub && parentSub.classList.contains('sub')) {
        const parentFolder: HTMLElement | null = parentSub.parentElement;
        if (
          !(parentFolder instanceof HTMLElement) ||
          !parentFolder.classList.contains('folder') ||
          !parentFolder.classList.contains('open')
        ) {
          return false;
        }

        node = parentFolder;
        continue;
      }

      node = node.parentElement;
    }

    return true;
  }

  private visibleTreeItems(): HTMLElement[] {
    return Array.from(this.bookmarks.querySelectorAll('li'))
      .filter((item) => this.directSpan(item) !== null)
      .filter((item) => this.isTreeVisible(item));
  }

  private clearKeyboardSelection(): void {
    this.bookmarks.querySelectorAll('li.kb-selected').forEach((item) => {
      item.classList.remove('kb-selected');
    });
  }

  private setAnchor(item: HTMLElement, ensureVisible: boolean): void {
    if (!this.bookmarks.contains(item)) {
      return;
    }

    this.anchor = item;
    this.clearKeyboardSelection();
    item.classList.add('kb-selected');

    if (ensureVisible) {
      this.keepItemVisible(item);
    }
  }

  /**
   * Keep a tree row visible by moving ONLY the popup wrapper.  Never call
   * scrollIntoView() on tree LI elements: an expanded folder LI contains its
   * whole subtree and Chromium can otherwise jump the folder root to the top.
   */
  private keepItemVisible(item: HTMLElement): void {
    const span = this.directSpan(item);
    if (!span) {
      return;
    }

    const wrapperRect = this.wrapper.getBoundingClientRect();
    const rowRect = span.getBoundingClientRect();

    if (rowRect.top < wrapperRect.top) {
      this.wrapper.scrollTop -= wrapperRect.top - rowRect.top;
    } else if (rowRect.bottom > wrapperRect.bottom) {
      this.wrapper.scrollTop += rowRect.bottom - wrapperRect.bottom;
    }
  }

  private currentIndex(items: HTMLElement[]): number {
    if (this.anchor instanceof HTMLElement) {
      const index = items.indexOf(this.anchor);
      if (index >= 0) {
        return index;
      }
    }

    const selected = this.bookmarks.querySelector('li.kb-selected');
    if (selected instanceof HTMLElement) {
      const index = items.indexOf(selected);
      if (index >= 0) {
        this.anchor = selected;
        return index;
      }
    }

    return -1;
  }

  private parentFolder(item: HTMLElement): HTMLElement | null {
    const sub = item.parentElement;
    if (!sub || !sub.classList.contains('sub')) {
      return null;
    }

    const folder = sub.parentElement;
    return folder instanceof HTMLElement && folder.classList.contains('folder')
      ? folder
      : null;
  }

  private firstVisibleChild(folder: HTMLElement): HTMLElement | null {
    const sub = Array.from(folder.children).find(
      (child) => child instanceof HTMLElement && child.classList.contains('sub')
    );

    if (!(sub instanceof HTMLElement)) {
      return null;
    }

    for (const child of Array.from(sub.children)) {
      if (
        child instanceof HTMLElement &&
        child.tagName === 'LI' &&
        this.isTreeVisible(child)
      ) {
        return child;
      }
    }

    return null;
  }

  private handlePageMove(direction: 1 | -1, items: HTMLElement[], index: number): void {
    if (index < 0) {
      index = direction > 0 ? 0 : items.length - 1;
    }

    const currentSpan = this.directSpan(items[index]);
    if (!currentSpan) {
      return;
    }

    const wrapperRect = this.wrapper.getBoundingClientRect();
    const currentRect = currentSpan.getBoundingClientRect();
    const currentY = this.wrapper.scrollTop + (currentRect.top - wrapperRect.top);
    const targetY = currentY + direction * this.wrapper.clientHeight;

    let targetIndex = index;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (
      let i = index + direction;
      i >= 0 && i < items.length;
      i += direction
    ) {
      const span = this.directSpan(items[i]);
      if (!span) {
        continue;
      }

      const rect = span.getBoundingClientRect();
      const y = this.wrapper.scrollTop + (rect.top - wrapperRect.top);
      const distance = Math.abs(y - targetY);

      if (distance <= bestDistance) {
        bestDistance = distance;
        targetIndex = i;
      } else {
        break;
      }
    }

    if (targetIndex === index) {
      targetIndex = direction > 0 ? items.length - 1 : 0;
    }

    this.setAnchor(items[targetIndex], true);
  }
}
