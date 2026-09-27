import {Settings} from "../Settings";
import {PersistedSettings} from "./PersistedSettings";

/**
 * Create MBT-agnostic Settings class with defaults
 * for MBT
 */
export class SettingsFactory {
  static settings: Settings | null = null;

  static async create(): Promise<Settings> {
    if (null === this.settings) {
      const defaults = {
        close_old_folder: false,
        open_all_sub: true,
        animation_duration: 200,
        start_with_all_folders_closed: false,
        expand_bookmarks_bar: true,
        hide_empty_folders: false,
        remember_scroll_position: true,
        height: 500,
        width: 300,
        icon: 'default',
        confirm_bookmark_deletion: true,
        click_action: 'current',
        middle_click_action: 'background',
        super_click_action: 'new',
        font: '__default__',
        theme: 'light',
        keyboard_support: false,
        search_key: 's'
      };
      const values = await chrome.storage.sync.get(defaults);

      if (typeof values['close_old_folder'] === 'undefined' && typeof localStorage !== 'undefined') {
        // Migrate from localStorage to chrome storage, in a single write
        // instead of one awaited round trip per setting (this only runs
        // once, on the first popup open after upgrading).
        // Only options and browser action can migrate, as service worker doesn't have access to localStorage.
        const migrated: { [s: string]: any } = {};
        for (const key of Object.keys(defaults)) {
          const value = localStorage.getItem(`setting_${key}`);
          if (null === value) {
            continue;
          }
          migrated[key] = JSON.parse(value);
        }

        if (Object.keys(migrated).length > 0) {
          await chrome.storage.sync.set(migrated);
          Object.assign(values, migrated);
        }
      }

      this.settings = new PersistedSettings(
        values,
        (key: string, value: any) => chrome.storage.sync.set({ [key]: value }),
      )
    }

    return this.settings;
  }
}
