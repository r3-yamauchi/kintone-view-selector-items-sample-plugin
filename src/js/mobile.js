(function(PLUGIN_ID) {
  'use strict';

  const CONFIG_KEY = 'viewSettings';
  const LEGACY_CONFIG_KEY = 'hiddenViewIds';

  /**
   * プラグイン設定を取得する関数
   */
  function getConfig() {
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
   * 条件を評価する関数（グループ所属チェック）
   */
  function evaluateCondition(loginUser, condition) {
    if (!condition.enabled) {
      return false; // 条件が無効の場合は非表示にしない
    }

    const groupCodes = condition.groupCodes;
    const matchType = condition.matchType || 'includes';

    // グループコードが設定されていない場合は非表示にしない
    if (!groupCodes || groupCodes.length === 0) {
      return false;
    }

    // ユーザーの所属グループコードの配列を取得
    const userGroupCodes = loginUser.groups.map(group => group.code);

    // 指定されたグループコードのいずれかにユーザーが所属しているか
    const isInGroup = groupCodes.some(groupCode => userGroupCodes.includes(groupCode));

    // 条件タイプに基づいて評価
    if (matchType === 'includes') {
      // 指定したグループのいずれかに所属する場合は非表示
      return isInGroup;
    } else if (matchType === 'notIncludes') {
      // 指定したグループのいずれにも所属しない場合は非表示
      return !isInGroup;
    }

    return false;
  }

  /**
   * 一覧が非表示かどうかを判定する関数
   */
  function shouldHideView(viewSetting, loginUser) {
    // 常に非表示の場合
    if (viewSetting.alwaysHidden) {
      return true;
    }

    // 条件付き非表示の評価
    if (viewSetting.conditionalHidden && viewSetting.conditionalHidden.enabled) {
      return evaluateCondition(loginUser, viewSetting.conditionalHidden);
    }

    return false;
  }

  /**
   * 非表示にする一覧IDの配列を取得する関数
   */
  function getHiddenViewIds(viewSettings, loginUser) {
    const hiddenViewIds = [];

    viewSettings.forEach(viewSetting => {
      if (shouldHideView(viewSetting, loginUser)) {
        hiddenViewIds.push(viewSetting.viewId);
      }
    });

    return hiddenViewIds;
  }

  /**
   * 非表示一覧IDの配列からshowViewSelectorItems用のオブジェクトを作成する関数
   */
  function createHiddenViewsObject(hiddenViewIds) {
    const hiddenViewsObj = {};
    hiddenViewIds.forEach(viewId => {
      hiddenViewsObj[viewId] = 'HIDDEN';
    });
    return hiddenViewsObj;
  }

  /**
   * 全ての一覧情報を取得する関数
   */
  async function fetchAllViews() {
    try {
      const views = await kintone.app.getViews();
      return views;
    } catch (error) {
      console.error('一覧情報の取得に失敗しました:', error);
      return null;
    }
  }

  /**
   * 表示可能な一覧のIDを取得する関数
   */
  function getFirstVisibleViewId(allViews, hiddenViewIds) {
    // kintone.app.getViews() は一覧の並び順と同じ配列を返すため、ソート不要

    // 非表示でない最初の一覧を見つける
    for (const viewData of allViews) {
      if (!hiddenViewIds.includes(viewData.id)) {
        return viewData.id;
      }
    }

    // 表示可能な一覧がない場合は null を返す
    return null;
  }

  /**
   * 指定された一覧IDに画面遷移する関数
   */
  function redirectToView(viewId) {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('view', viewId);
    window.location.href = currentUrl.toString();
  }

  /**
   * kintone トップ画面に遷移する関数
   */
  function redirectToTop() {
    window.location.href = '/k/';
  }

  /**
   * 一覧メニューの表示を制御する関数
   */
  async function controlViewMenu(event) {
    const viewSettings = getConfig();

    if (!viewSettings || viewSettings.length === 0) {
      // 設定がない場合は何もしない
      return event;
    }

    // ログインユーザー情報を取得
    const loginUser = kintone.getLoginUser();

    // 非表示にする一覧IDを決定
    const hiddenViewIds = getHiddenViewIds(viewSettings, loginUser);

    if (hiddenViewIds.length === 0) {
      // 非表示にする一覧がない場合は何もしない
      return event;
    }

    // 現在表示しようとしている一覧IDをチェック
    const currentViewId = event.viewId ? String(event.viewId) : null;

    if (currentViewId && hiddenViewIds.includes(currentViewId)) {
      // 現在の一覧が非表示設定されている場合、表示可能な一覧にリダイレクト
      const allViews = await fetchAllViews();
      if (allViews) {
        const targetViewId = getFirstVisibleViewId(allViews, hiddenViewIds);
        if (targetViewId) {
          redirectToView(targetViewId);
        } else {
          // 表示可能な一覧がない場合はトップ画面へ
          redirectToTop();
        }
        return event;
      }
    }

    try {
      // 非表示にする一覧IDのオブジェクトを作成
      const hiddenViewsObj = createHiddenViewsObject(hiddenViewIds);

      // kintone.mobile.app.showViewSelectorItems() を使用して一覧の表示/非表示を制御
      await kintone.mobile.app.showViewSelectorItems(hiddenViewsObj);
    } catch (error) {
      console.error('一覧メニューの制御に失敗しました:', error);
    }

    return event;
  }

  /**
   * レコード一覧画面表示時のイベントハンドラー
   */
  kintone.events.on('mobile.app.record.index.show', async function(event) {
    return await controlViewMenu(event);
  });

})(kintone.$PLUGIN_ID);
