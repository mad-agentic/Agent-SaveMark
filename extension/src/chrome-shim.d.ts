declare namespace chrome {
  interface ChromeEvent<TCallback extends (...args: any[]) => any> {
    addListener(callback: TCallback): void;
  }

  namespace storage {
    namespace local {
      function get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
      function remove(keys: string | string[]): Promise<void>;
    }
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
    }

    interface UpdateInfo {
      status?: string;
      url?: string;
    }

    interface OnActivatedActiveInfo {
      tabId: number;
    }

    function create(createProperties: { url: string }): Promise<Tab>;
    function query(queryInfo: QueryInfo): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;

    const onUpdated: ChromeEvent<(tabId: number, changeInfo: UpdateInfo, tab: Tab) => void>;
    const onActivated: ChromeEvent<(activeInfo: OnActivatedActiveInfo) => void>;
  }

  namespace runtime {
    interface MessageSender {
      id?: string;
    }

    interface RuntimeLastError {
      message?: string;
    }

    function openOptionsPage(): void;
    function sendMessage(
      message: unknown,
      responseCallback?: (response?: any) => void
    ): void;

    const id: string;
    const lastError: RuntimeLastError | undefined;
    const onInstalled: ChromeEvent<() => void>;
    const onMessage: ChromeEvent<
      (
        message: any,
        sender: MessageSender,
        sendResponse: (response?: any) => void
      ) => boolean | void
    >;
  }

  namespace contextMenus {
    type ContextType = "page" | "selection";

    interface CreateProperties {
      id: string;
      title: string;
      contexts: ContextType[];
    }

    interface OnClickData {
      menuItemId: string;
      pageUrl?: string;
      selectionText?: string;
    }

    function create(createProperties: CreateProperties): void;
    const onClicked: ChromeEvent<(info: OnClickData, tab?: tabs.Tab) => void>;
  }

  namespace action {
    interface BadgeTextDetails {
      text: string;
      tabId?: number;
    }

    function setBadgeText(details: BadgeTextDetails): void;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): void;
  }
}

interface ChromeApi {
  storage: typeof chrome.storage;
  tabs: typeof chrome.tabs;
  runtime: typeof chrome.runtime;
  contextMenus: typeof chrome.contextMenus;
  action: typeof chrome.action;
}

declare const chrome: ChromeApi;
