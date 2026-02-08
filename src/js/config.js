(function(PLUGIN_ID) {
  'use strict';

  const CONFIG_KEY = 'hiddenViewIds';
  let allViews = {};

  /**
   * エラーメッセージを表示する関数
   */
  function showError(message) {
    const errorElement = document.getElementById('error-message');
    const loadingElement = document.getElementById('loading-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    loadingElement.style.display = 'none';
  }

  /**
   * 一覧の一覧を取得する関数
   */
  async function fetchViews() {
    try {
      const appId = kintone.app.getId();
      if (!appId) {
        throw new Error('アプリIDが取得できませんでした。');
      }

      const url = kintone.api.url('/k/v1/preview/app/views.json', true);
      const resp = await kintone.api(url, 'GET', {app: appId});
      return resp.views;
    } catch (error) {
      console.error('一覧の一覧の取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 一覧の一覧をHTMLに表示する関数
   */
  function renderViews(views, savedConfig) {
    const viewsList = document.getElementById('views-list');
    viewsList.innerHTML = '';

    // 一覧をindexの昇順でソート
    const sortedViews = Object.entries(views).sort((a, b) => {
      const [, viewA] = a;
      const [, viewB] = b;

      return viewA.index - viewB.index;
    });

    // 一覧アイテムを作成する共通関数
    const createViewItem = (viewId, viewData) => {
      const viewItem = document.createElement('div');
      viewItem.className = 'plugin-config__view-item';
      viewItem.style.cssText = `
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        margin-bottom: 8px;
        background-color: #ffffff;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `view-${viewId}`;
      checkbox.value = viewId;
      checkbox.dataset.viewName = viewData.name;

      // 保存された設定（非表示一覧IDの配列）をチェック
      // 配列に含まれていればチェックを外す、含まれていなければチェックを入れる
      checkbox.checked = savedConfig
        ? !savedConfig.includes(viewId)
        : true;

      checkbox.style.cssText = `
        margin-right: 12px;
        width: 18px;
        height: 18px;
        cursor: pointer;
      `;

      const label = document.createElement('label');
      label.htmlFor = `view-${viewId}`;
      label.textContent = viewData.name;
      label.style.cssText = `
        cursor: pointer;
        flex: 1;
        font-size: 14px;
      `;

      const viewType = document.createElement('span');
      viewType.textContent = getViewTypeLabel(viewData.type);
      viewType.style.cssText = `
        font-size: 12px;
        color: #666;
        background-color: #f5f5f5;
        padding: 2px 8px;
        border-radius: 3px;
      `;

      viewItem.appendChild(checkbox);
      viewItem.appendChild(label);
      viewItem.appendChild(viewType);
      return viewItem;
    };

    // 既存の一覧を追加
    sortedViews.forEach(([, viewData]) => {
      // viewData.id を使用して一覧IDを取得
      const viewItem = createViewItem(viewData.id, viewData);
      viewsList.appendChild(viewItem);
    });

    // 末尾に「（すべて）」一覧を追加
    const allViewItem = createViewItem('20', {
      name: '（すべて）',
      type: 'LIST'
    });
    viewsList.appendChild(allViewItem);

    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('views-container').style.display = 'block';
  }

  /**
   * 一覧タイプのラベルを取得する関数
   */
  function getViewTypeLabel(type) {
    const typeLabels = {
      'LIST': '一覧',
      'CALENDAR': 'カレンダー',
      'CUSTOM': 'カスタマイズ'
    };
    return typeLabels[type] || type;
  }

  /**
   * 現在の設定を取得する関数（非表示にする一覧IDの配列を返す）
   */
  function getCurrentConfig() {
    const hiddenViewIds = [];
    const checkboxes = document.querySelectorAll('#views-list input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
      // チェックが外されている一覧を非表示リストに追加
      if (!checkbox.checked) {
        hiddenViewIds.push(checkbox.value);
      }
    });

    return hiddenViewIds;
  }

  /**
   * 設定を保存する関数
   */
  function saveConfig() {
    const hiddenViewIds = getCurrentConfig();

    kintone.plugin.app.setConfig({
      [CONFIG_KEY]: JSON.stringify(hiddenViewIds)
    }, function() {
      alert('設定を保存しました。');
      window.location.href = '../../flow?app=' + kintone.app.getId();
    });
  }

  /**
   * 保存済みの設定を取得する関数（非表示にする一覧IDの配列を返す）
   */
  function getSavedConfig() {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    if (config && config[CONFIG_KEY]) {
      try {
        const parsed = JSON.parse(config[CONFIG_KEY]);
        // 配列として返す（古い形式のオブジェクトの場合は空配列を返す）
        return Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        console.error('設定の読み込みに失敗しました:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * 初期化処理
   */
  async function init() {
    try {
      // 一覧の一覧を取得
      allViews = await fetchViews();

      // 保存済みの設定を取得
      const savedConfig = getSavedConfig();

      // 一覧の一覧を表示
      renderViews(allViews, savedConfig);

      // 保存ボタンのイベントリスナー
      document.getElementById('submit-button').addEventListener('click', saveConfig);

      // キャンセルボタンのイベントリスナー
      document.getElementById('cancel-button').addEventListener('click', function() {
        window.location.href = '../../flow?app=' + kintone.app.getId();
      });

    } catch (error) {
      showError('一覧の一覧の取得に失敗しました: ' + error.message);
    }
  }

  // ページ読み込み時に初期化
  init();

})(kintone.$PLUGIN_ID);
