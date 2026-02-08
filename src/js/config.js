(function(PLUGIN_ID) {
  'use strict';

  // kintone UI Componentの初期化を待つ
  if (typeof Kucs === 'undefined' || !Kucs['1.24.0']) {
    console.error('kintone UI Component が読み込まれていません');
    return;
  }

  const Kuc = Kucs['1.24.0'];
  const CONFIG_KEY = 'viewSettings';
  const LEGACY_CONFIG_KEY = 'hiddenViewIds';
  let allViews = {};
  let allGroups = [];
  const groupSelectors = {}; // viewId -> UserOrgGroupSelect インスタンスのマップ

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
   * グループの一覧を取得する関数
   */
  async function fetchGroups() {
    try {
      const url = kintone.api.url('/v1/groups.json', true);
      const resp = await kintone.api(url, 'GET', {});
      return resp.groups || [];
    } catch (error) {
      console.error('グループの一覧の取得に失敗しました:', error);
      return [];
    }
  }

  /**
   * 条件設定フォームを作成する関数
   */
  function createConditionForm(viewId, conditionData) {
    const conditionSettings = document.createElement('div');
    conditionSettings.className = 'condition-settings';
    conditionSettings.id = `condition-${viewId}`;

    const enabled = conditionData ? conditionData.enabled : false;
    const matchType = conditionData ? conditionData.matchType : 'includes';
    const selectedGroups = conditionData ? conditionData.groupCodes : [];

    // HTMLの基本構造を作成
    conditionSettings.innerHTML = `
      <div class="condition-enabled">
        <input type="checkbox" id="condition-enabled-${viewId}" ${enabled ? 'checked' : ''}>
        <label for="condition-enabled-${viewId}">条件付き非表示を有効にする</label>
      </div>

      <div class="condition-form-group">
        <label>条件タイプ</label>
        <select id="condition-matchtype-${viewId}">
          <option value="includes" ${matchType === 'includes' ? 'selected' : ''}>指定したグループのいずれかに所属する場合は非表示</option>
          <option value="notIncludes" ${matchType === 'notIncludes' ? 'selected' : ''}>指定したグループのいずれにも所属しない場合は非表示</option>
        </select>
      </div>

      <div class="condition-form-group">
        <label>グループ選択</label>
        <div id="condition-group-selector-${viewId}"></div>
      </div>
    `;

    // UserOrgGroupSelectコンポーネントの準備（後で追加）
    setTimeout(() => {
      const container = document.getElementById(`condition-group-selector-${viewId}`);
      if (container && allGroups.length > 0) {
        // グループアイテムの作成
        const groupItems = allGroups.map(group => ({
          label: group.name,
          value: group.code,
          type: 'group'
        }));

        // UserOrgGroupSelectコンポーネントの作成
        const groupSelector = new Kuc.UserOrgGroupSelect({
          items: groupItems,
          value: selectedGroups,
          placeholder: 'グループを選択してください',
          icon: 'group'
        });

        container.appendChild(groupSelector);
        groupSelectors[viewId] = groupSelector;
      }
    }, 0);

    return conditionSettings;
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
        padding: 12px 16px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        margin-bottom: 8px;
        background-color: #ffffff;
      `;

      // 保存済み設定から該当する一覧の設定を取得
      const viewSetting = savedConfig ? savedConfig.find(s => s.viewId === viewId) : null;
      const alwaysHidden = viewSetting ? viewSetting.alwaysHidden : false;
      const conditionData = viewSetting ? viewSetting.conditionalHidden : null;

      const viewItemHeader = document.createElement('div');
      viewItemHeader.className = 'plugin-config__view-item-header';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `view-${viewId}`;
      checkbox.value = viewId;
      checkbox.dataset.viewName = viewData.name;
      checkbox.checked = !alwaysHidden;
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
        margin-right: 8px;
      `;

      const conditionToggle = document.createElement('button');
      conditionToggle.type = 'button';
      conditionToggle.className = 'condition-toggle';
      conditionToggle.textContent = '条件';
      conditionToggle.onclick = () => toggleConditionSettings(viewId);

      viewItemHeader.appendChild(checkbox);
      viewItemHeader.appendChild(label);
      viewItemHeader.appendChild(viewType);
      viewItemHeader.appendChild(conditionToggle);

      // 条件設定フォームを作成
      const conditionForm = createConditionForm(viewId, conditionData);

      viewItem.appendChild(viewItemHeader);
      viewItem.appendChild(conditionForm);
      return viewItem;
    };

    // 既存の一覧を追加
    sortedViews.forEach(([, viewData]) => {
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
   * 条件設定エリアの表示/非表示を切り替える関数
   */
  function toggleConditionSettings(viewId) {
    const conditionSettings = document.getElementById(`condition-${viewId}`);
    conditionSettings.classList.toggle('show');
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
   * 現在の設定を取得する関数
   */
  function getCurrentConfig() {
    const viewSettings = [];
    const checkboxes = document.querySelectorAll('#views-list input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
      const viewId = checkbox.value;

      // 常に非表示かどうか
      const alwaysHidden = !checkbox.checked;

      // 条件設定を取得
      const conditionEnabled = document.getElementById(`condition-enabled-${viewId}`)?.checked || false;
      const matchType = document.getElementById(`condition-matchtype-${viewId}`)?.value || 'includes';

      // UserOrgGroupSelectコンポーネントから値を取得
      let groupCodes = [];
      if (groupSelectors[viewId]) {
        groupCodes = groupSelectors[viewId].value || [];
      }

      const viewSetting = {
        viewId: viewId,
        alwaysHidden: alwaysHidden,
        conditionalHidden: {
          enabled: conditionEnabled,
          matchType: matchType,
          groupCodes: groupCodes
        }
      };

      viewSettings.push(viewSetting);
    });

    return viewSettings;
  }

  /**
   * 設定を保存する関数
   */
  function saveConfig() {
    const viewSettings = getCurrentConfig();

    kintone.plugin.app.setConfig({
      [CONFIG_KEY]: JSON.stringify(viewSettings)
    }, function() {
      alert('設定を保存しました。');
      window.location.href = '../../flow?app=' + kintone.app.getId();
    });
  }

  /**
   * 保存済みの設定を取得する関数
   */
  function getSavedConfig() {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);

    // 新しい形式の設定があればそれを使用
    if (config && config[CONFIG_KEY]) {
      try {
        const parsed = JSON.parse(config[CONFIG_KEY]);
        return Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        console.error('設定の読み込みに失敗しました:', error);
      }
    }

    // 古い形式の設定からの移行処理
    if (config && config[LEGACY_CONFIG_KEY]) {
      try {
        const hiddenViewIds = JSON.parse(config[LEGACY_CONFIG_KEY]);
        if (Array.isArray(hiddenViewIds)) {
          // 古い形式を新しい形式に変換
          return hiddenViewIds.map(viewId => ({
            viewId: viewId,
            alwaysHidden: true,
            conditionalHidden: {
              enabled: false,
              matchType: 'includes',
              groupCodes: []
            }
          }));
        }
      } catch (error) {
        console.error('旧設定の読み込みに失敗しました:', error);
      }
    }

    return null;
  }

  /**
   * 初期化処理
   */
  async function init() {
    try {
      // 一覧の一覧とグループの一覧を取得
      const [views, groups] = await Promise.all([
        fetchViews(),
        fetchGroups()
      ]);

      allViews = views;
      allGroups = groups;

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
