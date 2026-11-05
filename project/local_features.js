/* ==========================================================================
   Safran Match Heroes — local_features.js
   --------------------------------------------------------------------------
   本地功能扩展层（Local Features Layer）

   目标：在「完全不修改 MVP_v1.0 的 game.js」的前提下，为视觉基线移植
   5 项功能：
     1. Login Page          —— 员工姓名 + 所属部门
     2. User Info Storage   —— localStorage 保存登录用户
     3. Score Binding       —— 每局成绩绑定当前登录用户
     4. Ranking Binding     —— 结算页「当前排名」由真实记录计算
     5. Local Leaderboard   —— 日榜 / 周榜 / 总榜全部来自真实对局记录

   约束：
     - 纯 localStorage，无后端、无数据库、无 API、无网络请求
       （本模块不发起任何远程调用，也不引用任何外部地址）
     - 不改颜色、不改布局、不改视觉风格、不改游戏素材、不改玩法
     - 只通过「包装 game.js 的公开方法」注入逻辑

   实现原理：
     game.js 是 classic <script>，顶层声明的 const（Game / Leaderboard /
     ScreenRouter / App / Integrations / EMPLOYEE_POOL / AvatarService /
     Utils）位于全局词法环境，后续 classic script 可直接按标识符访问。
     本文件在 game.js 之后同步加载、且早于 DOMContentLoaded，因此可以：
       · 覆盖 Leaderboard.getList / getUserRank / render → 真实本地榜单
       · 覆盖 Integrations.submitScore                  → 成绩写入本地
       · 包装 ScreenRouter.show                        → 进榜单时刷新
       · 包装 Game.start                              → 登录守卫
       · 包装 App.init                                → 追加事件挂载

   数据契约（localStorage）：
     smh_demo_user   : { userId, employeeName, department }
     smh_demo_scores : [ { employeeName, department, score, datetime }, ... ]

   ========================================================================== */
(function () {
  'use strict';

  /* ========================================================================
     L1. 常量与存储原语
     ======================================================================== */

  var KEYS = {
    user: 'smh_demo_user',
    scores: 'smh_demo_scores'
  };

  var MAX_NAME_LEN = 24;                       // 与登录框 maxlength 一致
  var MAX_DEPT_LEN = 40;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;      // 周榜：滚动 7 天窗口
  var MAX_RECORDS = 500;                       // 本地记录条数上限（防止无限增长）

  /** 读取并解析 localStorage，存储不可用时静默降级 */
  function readRaw(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  /** 序列化写入 localStorage，返回是否成功 */
  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  /** 解析 ISO 时间字符串为毫秒时间戳；无效返回 NaN */
  function parseTime(iso) {
    var t = Date.parse(iso);
    return isFinite(t) ? t : NaN;
  }

  /** 生成不依赖后端的本地 userId */
  function makeUserId() {
    return 'u_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  /* ========================================================================
     L2. 用户信息存储（User Information Storage）
     ======================================================================== */

  /** 读取当前登录用户；结构不合法时视为未登录 */
  function getUser() {
    var u = readRaw(KEYS.user, null);
    if (!u || typeof u !== 'object') return null;
    var name = typeof u.employeeName === 'string' ? u.employeeName.trim() : '';
    var dept = typeof u.department === 'string' ? u.department.trim() : '';
    if (!name || !dept) return null;
    var id = typeof u.userId === 'string' && u.userId ? u.userId : makeUserId();
    return {
      userId: id,
      employeeName: name.slice(0, MAX_NAME_LEN),
      department: dept.slice(0, MAX_DEPT_LEN)
    };
  }

  /** 保存登录用户；同一姓名+部门沿用原 userId，改名则生成新 userId */
  function saveUser(rawName, rawDept) {
    var name = String(rawName || '').trim().slice(0, MAX_NAME_LEN);
    var dept = String(rawDept || '').trim().slice(0, MAX_DEPT_LEN);
    var prev = getUser();
    var user = {
      userId: (prev && prev.employeeName === name && prev.department === dept)
        ? prev.userId
        : makeUserId(),
      employeeName: name,
      department: dept
    };
    writeRaw(KEYS.user, user);
    return user;
  }

  /* ========================================================================
     L3. 成绩记录（Score Binding）
     ======================================================================== */

  /** 读取全部成绩记录，并过滤掉结构非法的脏数据 */
  function getScores() {
    var list = readRaw(KEYS.scores, []);
    if (!Array.isArray(list)) return [];
    return list.filter(function (r) {
      return r && typeof r === 'object' &&
        typeof r.employeeName === 'string' && r.employeeName.trim() &&
        typeof r.department === 'string' &&
        typeof r.score === 'number' && isFinite(r.score) && r.score >= 0 &&
        typeof r.datetime === 'string' && r.datetime;
    });
  }

  /**
   * 把基线 Game.finish() 提交的成绩绑定到当前登录用户并落盘。
   * 基线 payload: { user_id, score, lucky_bonus, lucky_hero, lucky_hits, created_time }
   * 只取 score / created_time；身份信息一律以 localStorage 登录用户为准，
   * 避免基线写死的 'demo_user_001' 污染真实记录。
   */
  function saveScoreFromPayload(payload) {
    var user = getUser();
    if (!user) return null;                    // 未登录不产生成绩记录
    var p = payload || {};
    var score = Math.max(0, Math.round(Number(p.score) || 0));
    var when = typeof p.created_time === 'string' && p.created_time
      ? p.created_time
      : new Date().toISOString();

    var record = {
      employeeName: user.employeeName,
      department: user.department,
      score: score,
      datetime: when
    };

    var list = getScores();
    list.push(record);
    writeRaw(KEYS.scores, list.slice(-MAX_RECORDS));
    return record;
  }

  /* ========================================================================
     L4. 真实榜单聚合（Daily / Weekly / All Time）
     ======================================================================== */

  /** 判断某条记录是否落在指定周期内 */
  function inPeriod(iso, type, now) {
    var t = parseTime(iso);
    if (!isFinite(t)) return false;           // 时间非法的记录不进入任何榜单
    if (type === 'all') return true;
    if (type === 'weekly') return t >= now - WEEK_MS;
    // daily：以本地日历日的 00:00 为界
    var d = new Date(t);
    var n = new Date(now);
    return d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate();
  }

  /**
   * 按周期聚合成「每人最高分」榜单。
   * 分组键用姓名小写归一化（同名视为同一人）；同分时先达成者靠前。
   * 使用 Object.create(null) 避免姓名为 constructor / __proto__ 时的原型污染。
   */
  function aggregate(type) {
    var now = Date.now();
    var rows = getScores().filter(function (r) {
      return inPeriod(r.datetime, type, now);
    });
    var map = Object.create(null);

    rows.forEach(function (r) {
      var key = r.employeeName.trim().toLowerCase();
      var t = parseTime(r.datetime);
      var cur = map[key];
      if (!cur || r.score > cur.score || (r.score === cur.score && t < cur.time)) {
        map[key] = {
          name: r.employeeName,
          department: r.department,
          score: r.score,
          time: t
        };
      }
    });

    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) {
        return (b.score - a.score) || (a.time - b.time);
      });
  }

  /** 榜单数据源：返回基线渲染层期望的 { name, department, score } 数组 */
  function buildRanking(type) {
    var t = (type === 'weekly' || type === 'all') ? type : 'daily';
    return aggregate(t).map(function (r) {
      return { name: r.name, department: r.department, score: r.score };
    });
  }

  /**
   * 结算页「当前排名」：把本局成绩计入后，计算当前用户在总榜中的名次。
   * 本方法在 Game.finish() 中早于 submitScore() 调用，因此显式把本局 score
   * 合并进用户历史最高分后再排序，保证名次包含本局表现。
   */
  function computeRank(score) {
    var s = Math.max(0, Math.round(Number(score) || 0));
    var list = aggregate('all');
    var user = getUser();

    if (!user) {                              // 未登录兜底：等价于基线插入「我」
      var r0 = 1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].score > s) r0++;
      }
      return r0;
    }

    var key = user.employeeName.trim().toLowerCase();
    var mine = null;
    for (var j = 0; j < list.length; j++) {
      if (list[j].name.trim().toLowerCase() === key) { mine = list[j]; break; }
    }
    var myScore = mine ? Math.max(mine.score, s) : s;
    var rank = 1;
    for (var k = 0; k < list.length; k++) {
      if (list[k] === mine) continue;
      if (list[k].score > myScore) rank++;
    }
    return rank;
  }

  /* ========================================================================
     L5. 真实榜单渲染
     ------------------------------------------------------------------------
     完全复用基线 .rank__* 视觉类名（.rank__item / .rank__medal--N /
     .rank__avatar / .rank__name / .rank__dept / .rank__score / .is-me），
     但改用 DOM API + textContent 构建，杜绝用户输入触发 XSS。
     ======================================================================== */

  function makeSpan(className, text) {
    var span = document.createElement('span');
    span.className = className;
    if (text !== undefined) span.textContent = text;  // 纯文本，绝不解析 HTML
    return span;
  }

  function renderRanking() {
    var listEl = document.getElementById('rank-list');
    if (!listEl) return;

    // 清空列表（不使用 innerHTML，避免任何注入面）
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    var list = Leaderboard.getList(Leaderboard.currentTab);
    var user = getUser();
    var meKey = user ? user.employeeName.trim().toLowerCase() : '';

    // 空榜单：基线 Mock 数据已全部移除，此时给出本地化空态提示
    if (list.length === 0) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'rank__item';
      emptyLi.appendChild(makeSpan('rank__empty', '暂无战绩，快去挑战吧！'));
      listEl.appendChild(emptyLi);
      return;
    }

    list.forEach(function (item, index) {
      var rank = index + 1;
      var li = document.createElement('li');
      li.className = 'rank__item' +
        (meKey && item.name.trim().toLowerCase() === meKey ? ' is-me' : '');

      /* 排名列：前三名沿用基线奖牌样式 */
      var colRank = makeSpan('rank__col rank__col--rank');
      if (rank <= 3) {
        colRank.appendChild(makeSpan('rank__medal rank__medal--' + rank, String(rank)));
      } else {
        colRank.textContent = String(rank);
      }
      li.appendChild(colRank);

      /* 姓名列：头像 + 姓名；姓名用 textContent */
      var colName = makeSpan('rank__col rank__col--name');
      var employee = EMPLOYEE_POOL.filter(function (e) {
        return e.name === item.name;
      })[0];
      var img = document.createElement('img');
      img.className = 'rank__avatar';
      img.alt = '';
      img.src = employee ? AvatarService.resolve(employee) : AvatarService.fallback(null);
      img.onerror = function () {
        img.onerror = null;
        img.src = AvatarService.fallback(employee || null);
      };
      colName.appendChild(img);
      colName.appendChild(makeSpan('rank__name', item.name));
      li.appendChild(colName);

      /* 部门列 */
      var colDept = makeSpan('rank__col rank__col--dept');
      colDept.appendChild(makeSpan('rank__dept', item.department));
      li.appendChild(colDept);

      /* 分数列 */
      var colScore = makeSpan('rank__col rank__col--score');
      colScore.appendChild(makeSpan('rank__score', Utils.formatNumber(item.score)));
      li.appendChild(colScore);

      listEl.appendChild(li);
    });
  }

  /* ========================================================================
     L6. 登录页交互
     ======================================================================== */

  /** 部门下拉：从基线 EMPLOYEE_POOL 聚合去重，不引入任何新数据源 */
  function fillDepartments() {
    var sel = document.getElementById('login-department');
    if (!sel) return;
    var seen = Object.create(null);
    var list = [];
    EMPLOYEE_POOL.forEach(function (e) {
      if (e.department && !seen[e.department]) {
        seen[e.department] = true;
        list.push(e.department);
      }
    });
    list.sort(function (a, b) { return a.localeCompare(b); });
    list.forEach(function (dept) {
      var opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      sel.appendChild(opt);
    });
  }

  function showError(message) {
    var box = document.getElementById('login-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function clearError() {
    showError('');
    ['login-name', 'login-department'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('is-invalid');
    });
  }

  /** 预填上次登录信息，并按需显示「清除本机记录」入口 */
  function prefill() {
    var user = getUser();
    var nameEl = document.getElementById('login-name');
    var deptEl = document.getElementById('login-department');
    if (nameEl) nameEl.value = user ? user.employeeName : '';
    if (deptEl) deptEl.value = user ? user.department : '';
    clearError();

    var switchBtn = document.getElementById('btn-login-switch');
    if (switchBtn) switchBtn.hidden = !(user || getScores().length > 0);
  }

  function openLogin() {
    prefill();
    ScreenRouter.show('login', true);
  }

  /** 表单校验：姓名必填、部门必填；通过后保存用户并进入游戏 */
  function handleSubmit(event) {
    event.preventDefault();
    clearError();

    var nameEl = document.getElementById('login-name');
    var deptEl = document.getElementById('login-department');
    var name = (nameEl && nameEl.value ? nameEl.value : '').trim();
    var dept = (deptEl && deptEl.value ? deptEl.value : '').trim();

    if (!name) {
      if (nameEl) { nameEl.classList.add('is-invalid'); nameEl.focus(); }
      showError('请填写员工姓名');
      return;
    }
    if (name.length > MAX_NAME_LEN) {
      if (nameEl) nameEl.classList.add('is-invalid');
      showError('姓名不能超过 ' + MAX_NAME_LEN + ' 个字符');
      return;
    }
    if (!dept) {
      if (deptEl) { deptEl.classList.add('is-invalid'); deptEl.focus(); }
      showError('请选择所属部门');
      return;
    }

    saveUser(name, dept);
    Leaderboard.render();                     // 同步「我」的高亮
    Game.start();                             // 包装版：已登录 → 调用基线 start
  }

  /** 清除本机全部登录信息与成绩记录（本地 Demo 的可重置入口） */
  function clearAllLocal() {
    try {
      window.localStorage.removeItem(KEYS.user);
      window.localStorage.removeItem(KEYS.scores);
    } catch (err) { /* 存储不可用时忽略 */ }
    prefill();
    Leaderboard.render();
    if (Game && typeof Game.toast === 'function') Game.toast('本机记录已清除');
  }

  /** 在基线 App.init() 完成后追加的事件挂载 */
  function mount() {
    fillDepartments();

    var form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', handleSubmit);

    var back = document.getElementById('btn-login-back');
    if (back) {
      back.addEventListener('click', function () { ScreenRouter.back('home'); });
    }

    var resetBtn = document.getElementById('btn-login-switch');
    if (resetBtn) resetBtn.addEventListener('click', clearAllLocal);

    /*
     * 首页「开始游戏」→ 登录页。
     * 在 document 的捕获阶段拦截（早于 button 上已绑定的基线 handler），
     * 命中后 stopImmediatePropagation 阻止基线直接调用 Game.start()。
     * 其余所有按钮（开始/再来一局/查看排行榜/返回/Tab）完全不受影响。
     */
    document.addEventListener('click', function (event) {
      var target = event.target;
      var btn = target && target.closest ? target.closest('#btn-start') : null;
      if (!btn) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openLogin();
    }, true);

    /* 兜底：确保页面不残留任何 Mock 榜单说明文字 */
    var note = document.getElementById('rank-note');
    if (note) {
      note.textContent = '榜单来自本机真实对局记录，数据仅保存在当前浏览器。';
    }

    prefill();
    Leaderboard.render();
  }

  /* ========================================================================
     L7. 包装基线方法（脚本加载时立即执行，早于 DOMContentLoaded）
     ======================================================================== */

  function patch() {
    /* 1) 真实本地榜单数据源 + 真实名次 + 安全渲染 */
    Leaderboard.getList = function (type) {
      return buildRanking(type || this.currentTab);
    };
    Leaderboard.getUserRank = function (score) {
      return computeRank(score);
    };
    Leaderboard.render = renderRanking;

    /* 2) 成绩绑定：替换基线提交实现，只写 localStorage。
          刻意不调用原实现，因此基线内被开关保护的 fetch 分支永远不会执行，
          运行时零网络请求。 */
    Integrations.submitScore = function (payload) {
      var record = saveScoreFromPayload(payload);
      return Promise.resolve({ ok: true, local: true, record: record });
    };

    /* 3) 每次进入排行榜都按最新成绩重算，避免结算后榜单不刷新 */
    var originalShow = ScreenRouter.show;
    ScreenRouter.show = function (name, pushHistory) {
      if (name === 'rank') Leaderboard.render();
      return originalShow.call(ScreenRouter, name, pushHistory);
    };

    /* 4) 登录守卫：未登录时任何 Game.start() 都先导向登录页。
          已登录时（登录表单提交 / 再来一局）直接放行基线逻辑。 */
    var originalStart = Game.start;
    Game.start = function () {
      if (!getUser()) {
        openLogin();
        return undefined;
      }
      return originalStart.call(Game);
    };

    /* 5) 基线初始化完成后追加挂载 */
    var originalInit = App.init;
    App.init = function () {
      var ret = originalInit.call(App);
      mount();
      return ret;
    };
  }

  /* ========================================================================
     L8. 本地调试 / 测试接口
     ------------------------------------------------------------------------
     注意：这是纯内存 JS 对象，不是网络 API；不发送任何请求。
     供自动化测试和后续接入时读取真实本地数据使用。
     ======================================================================== */

  window.LocalDemo = {
    keys: { user: KEYS.user, scores: KEYS.scores },
    getUser: getUser,
    getScores: getScores,
    getRanking: buildRanking,
    myRank: computeRank,
    login: saveUser,
    saveScore: saveScoreFromPayload,
    openLogin: openLogin,
    resetAll: function () {
      try {
        window.localStorage.removeItem(KEYS.user);
        window.localStorage.removeItem(KEYS.scores);
      } catch (err) { /* 忽略 */ }
      if (typeof Leaderboard !== 'undefined') Leaderboard.render();
      return true;
    }
  };

  patch();
})();
