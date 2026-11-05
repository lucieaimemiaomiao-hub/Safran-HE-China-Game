/* ==========================================================================
 * Safran Match Heroes (Safran 员工消消乐) — game.js
 * --------------------------------------------------------------------------
 * 纯 Vanilla JavaScript（ES5+ 语法，无构建、无依赖、无后端）
 * 直接双击 index.html 即可运行，也可零成本部署到 GitHub Pages。
 *
 * 模块划分（单一职责，便于后续扩展与维护）：
 *   M1  CONFIG              全局配置（所有可调数值集中在此，杜绝散落魔法数字）
 *   M2  EMPLOYEE_POOL       员工头像库（34 人）
 *   M3  Utils               通用工具函数
 *   M4  AvatarService       头像资源服务（含真实头像替换接口 + 加载失败兜底）
 *   M5  Storage             本地存储服务（最佳成绩 / 历史战绩）
 *   M6  Integrations        外部系统适配层（微信登录 / Power Automate / Excel Online）
 *   M7  ScreenRouter        页面路由（4 个页面的显隐与栈管理）
 *   M8  BoardEngine         棋盘引擎（生成 / 匹配 / 消除 / 下落 / 补充 / 洗牌）
 *   M9  ScoreEngine         积分引擎（基础分 / Combo / Lucky Hero 加分）
 *   M10 Game                游戏主控（状态机 / 倒计时 / 交互 / 结算）
 *   M11 Leaderboard         排行榜（Demo 阶段 Mock 数据）
 *   M12 App                 应用入口（事件绑定与启动）
 *
 * 数值口径全部来自《Safran Match Heroes V1.0 技术文档》与《游戏数值策划文档》。
 * ========================================================================== */

/* ==========================================================================
 * M1. CONFIG —— 全局配置
 * ========================================================================== */
const CONFIG = {
  /* ---- 棋盘 ---- */
  board: {
    rows: 8,                 // BOARD_ROWS
    cols: 8,                 // BOARD_COLS
    get total() { return this.rows * this.cols; }
  },

  /* ---- 时间 ---- */
  game: {
    duration: 60,            // 每局 60 秒
    tickMs: 200              // 倒计时刷新间隔（200ms 保证显示更平滑）
  },

  /* ---- 头像池 ---- */
  avatars: {
    employeePoolSize: 34,    // 全库 34 名员工
    activeCount: 8,          // 每局随机抽取 8 名
    minMatchLength: 3        // 最低消除长度
  },

  /* ---- 积分 ---- */
  score: {
    match3: 30,              // 三连
    match4: 60,              // 四连
    match5Plus: 100,         // 五连及以上
    luckyHeroPerHit: 20      // 每消除 1 个 Lucky Hero +20 分
  },

  /* ---- Combo 倍率 ---- */
  combo: {
    // key = 连击次数，value = 得分倍率
    multipliers: { 1: 1, 2: 1.2, 3: 1.5 },
    maxMultiplier: 2.0,      // 4 Combo 及以上
    minComboToShow: 2        // 从 2 Combo 开始在屏幕上提示
  },

  /* ---- 动画时长（毫秒，与技术文档动画规范一致） ---- */
  anim: {
    swap: 150,
    clear: 200,
    fall: 250,
    popDelay: 260
  },

  /* ---- 存储 Key（统一前缀，便于后续迁移 / 清理） ---- */
  storage: {
    prefix: 'smh_',
    bestScore: 'best_score',
    playHistory: 'play_history',
    lastResult: 'last_result'
  },

  /* ---- 外部集成开关（Demo 阶段全部关闭，上线时打开即可） ---- */
  integrations: {
    wechatLoginEnabled: false,   // 打开后接入微信授权登录
    scoreSubmitEnabled: false,  // 打开后把成绩提交到 Power Automate
    powerAutomateEndpoint: ''   // Power Automate "HTTP 触发器" 地址
  }
};

/* ==========================================================================
 * M2. EMPLOYEE_POOL —— 员工头像库（34 人）
 * --------------------------------------------------------------------------
 * avatar 字段留空表示使用默认占位头像路径（assets/avatars/0XX.png）。
 * 正式上线时：只需把 avatar 填成真实图片地址（例如 '/img/staff/david.png'），
 * 无需改动任何逻辑代码 —— 即「头像替换接口」。
 * ========================================================================== */
const EMPLOYEE_POOL = [
  { id: 1,  name: 'David',   department: 'Production',        avatar: '' },
  { id: 2,  name: 'Lucy',    department: 'Quality',           avatar: '' },
  { id: 3,  name: 'Kevin',   department: 'Engineering',       avatar: '' },
  { id: 4,  name: 'Tom',     department: 'R&D',               avatar: '' },
  { id: 5,  name: 'Amy',     department: 'Marketing',         avatar: '' },
  { id: 6,  name: 'Eric',    department: 'Sales',             avatar: '' },
  { id: 7,  name: 'Jude',    department: 'HR',                avatar: '' },
  { id: 8,  name: 'Yang',    department: 'Finance',           avatar: '' },
  { id: 9,  name: 'Sophie',  department: 'Procurement',       avatar: '' },
  { id: 10, name: 'Oliver',  department: 'Legal',             avatar: '' },
  { id: 11, name: 'Emma',    department: 'IT',                avatar: '' },
  { id: 12, name: 'Jack',    department: 'HSE',               avatar: '' },
  { id: 13, name: 'Nina',    department: 'Customer Service',  avatar: '' },
  { id: 14, name: 'Alex',    department: 'Maintenance',       avatar: '' },
  { id: 15, name: 'Lily',    department: 'Supply Chain',      avatar: '' },
  { id: 16, name: 'Ryan',    department: 'Logistics',         avatar: '' },
  { id: 17, name: 'Grace',   department: 'Operations',        avatar: '' },
  { id: 18, name: 'Leo',     department: 'Process Eng.',      avatar: '' },
  { id: 19, name: 'Chloe',   department: 'Test Eng.',         avatar: '' },
  { id: 20, name: 'Jason',   department: 'Manufacturing',     avatar: '' },
  { id: 21, name: 'Wendy',   department: 'Accounting',        avatar: '' },
  { id: 22, name: 'Victor',  department: 'Business Dev.',     avatar: '' },
  { id: 23, name: 'Julia',   department: 'Communication',     avatar: '' },
  { id: 24, name: 'Sean',    department: 'Safety',            avatar: '' },
  { id: 25, name: 'Rachel',  department: 'Training',          avatar: '' },
  { id: 26, name: 'Oscar',   department: 'Tooling',           avatar: '' },
  { id: 27, name: 'Bella',   department: 'Planning',          avatar: '' },
  { id: 28, name: 'Adam',    department: 'Configuration',     avatar: '' },
  { id: 29, name: 'Cindy',   department: 'Supplier Quality', avatar: '' },
  { id: 30, name: 'Frank',   department: 'Assembly',          avatar: '' },
  { id: 31, name: 'Helen',   department: 'Laboratory',        avatar: '' },
  { id: 32, name: 'Ivan',    department: 'Automation',        avatar: '' },
  { id: 33, name: 'Monica',  department: 'Program Mgmt.',     avatar: '' },
  { id: 34, name: 'Peter',   department: 'Non-conformity',    avatar: '' }
];

/* 企业文化标语库（首页随机展示） */
const SLOGAN_LIBRARY = ['Safety First', 'One Safran', 'Together We Fly', 'Innovation Matters'];

/* ==========================================================================
 * M3. Utils —— 通用工具
 * ========================================================================== */
const Utils = {
  /** 延时（返回 Promise），用于编排动画时序 */
  sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  },

  /** 请求下一帧（用于触发 CSS transition） */
  nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  },

  /** [min, max] 闭区间随机整数 */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /** Fisher–Yates 洗牌（返回新数组，不修改原数组） */
  shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  },

  /** 不放回随机抽样：随机抽取 n 个元素 */
  sample(list, n) {
    return Utils.shuffle(list).slice(0, n);
  },

  /** 数值格式化：千分位 */
  formatNumber(num) {
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /** 秒 → mm:ss */
  formatTime(seconds) {
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss);
  },

  /**
   * 游戏倒计时专用格式：60 秒 → "00:60"，59 秒 → "00:59" … 0 → "00:00"。
   * 与设计线框图保持一致（秒数直接显示，不进位到分钟）。
   */
  formatTimer(seconds) {
    const s = seconds < 0 ? 0 : seconds;
    return '00:' + (s < 10 ? '0' + s : s);
  },

  /** 元素工厂 */
  createEl(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
};

/* ==========================================================================
 * M4. AvatarService —— 头像资源服务
 * --------------------------------------------------------------------------
 * 【头像替换接口】
 *  1) 替换单个员工：把 EMPLOYEE_POOL 中该员工的 avatar 字段填成图片地址；
 *  2) 批量替换：修改 AVATAR_CONFIG.basePath / prefix / ext 指向真实目录；
 *  3) 完全自定义：重写 AvatarService.resolve()。
 * 任何一种方式都不需要改动游戏逻辑代码。
 * ========================================================================== */
const AVATAR_CONFIG = {
  basePath: 'assets/avatars/',
  prefix: '',
  ext: '.png',
  padLength: 3          // 001.png ~ 034.png
};

const AvatarService = {
  /** 解析某个员工的头像地址 */
  resolve: function (employee) {
    if (!employee) return '';
    // 优先使用员工自定义头像（真实头像替换接口）
    if (employee.avatar) return employee.avatar;
    const idx = String(employee.id).padStart(AVATAR_CONFIG.padLength, '0');
    return AVATAR_CONFIG.basePath + AVATAR_CONFIG.prefix + idx + AVATAR_CONFIG.ext;
  },

  /** 生成「加载失败兜底头像」：通用人物剪影 SVG（data URI，无需额外文件） */
  fallback: function (employee) {
    const hue = (employee ? employee.id * 47 : 200) % 360;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="50" fill="hsl(' + hue + ',70%,58%)"/>' +
      '<circle cx="50" cy="38" r="16" fill="#fff" opacity="0.92"/>' +
      '<ellipse cx="50" cy="78" rx="26" ry="20" fill="#fff" opacity="0.92"/>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  /**
   * 创建头像 <img> 元素，并绑定加载失败兜底。
   *
   * 注意：alt 文本刻意使用通用文案「员工头像」，
   * 避免在 DOM 中暴露员工姓名 —— 防止玩家通过查看源码/无障碍面板
   * 推断出 Lucky Hero 身份（PRD 8.3 要求游戏过程中完全不可见）。
   *
   * @param {Object} employee 员工对象
   * @returns {HTMLImageElement}
   */
  createImage: function (employee) {
    const img = new Image();
    img.alt = '员工头像';
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = AvatarService.resolve(employee);
    img.onerror = function () {
      // 文件缺失或路径错误时使用内置占位头像，保证游戏可继续运行
      img.onerror = null;
      img.src = AvatarService.fallback(employee);
    };
    return img;
  }
};

/* ==========================================================================
 * M5. Storage —— 本地存储服务
 * ========================================================================== */
const Storage = {
  _key: function (name) { return CONFIG.storage.prefix + name; },

  get: function (name, defaultValue) {
    try {
      const raw = window.localStorage.getItem(Storage._key(name));
      return raw === null ? defaultValue : JSON.parse(raw);
    } catch (err) {
      return defaultValue;   // 隐私模式 / 存储不可用时降级
    }
  },

  set: function (name, value) {
    try {
      window.localStorage.setItem(Storage._key(name), JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  },

  /** 读取历史最高分 */
  getBestScore: function () {
    return Storage.get(CONFIG.storage.bestScore, 0) || 0;
  },

  /** 更新历史最高分（只升不降） */
  updateBestScore: function (score) {
    const best = Storage.getBestScore();
    if (score > best) {
      Storage.set(CONFIG.storage.bestScore, score);
      return score;
    }
    return best;
  },

  /** 追加一条历史战绩（最多保留 20 条） */
  pushHistory: function (record) {
    const list = Storage.get(CONFIG.storage.playHistory, []) || [];
    list.unshift(record);
    Storage.set(CONFIG.storage.playHistory, list.slice(0, 20));
  },

  /** 最近一次结算数据 */
  saveLastResult: function (result) { Storage.set(CONFIG.storage.lastResult, result); },
  getLastResult: function () { return Storage.get(CONFIG.storage.lastResult, null); }
};

/* ==========================================================================
 * M6. Integrations —— 外部系统适配层
 * --------------------------------------------------------------------------
 * Demo 阶段全部走本地 mock；上线时打开 CONFIG.integrations 中的开关即可，
 * 游戏逻辑无需改动。
 * ========================================================================== */
const Integrations = {
  /** 微信授权登录（Demo 返回模拟用户） */
  wechatLogin: function () {
    return new Promise(function (resolve) {
      if (!CONFIG.integrations.wechatLoginEnabled) {
        // ---- Demo：模拟微信用户 ----
        resolve({
          user_id: 'demo_user_001',
          nickname: '我',
          avatar: '',
          department: 'Demo'
        });
        return;
      }
      // ---- 上线：微信授权流程（需引入 jweixin-1.6.0.js） ----
      // wx.login({ success: res => { /* 用 code 换取 openid，调用后端 */ } });
      resolve({ user_id: 'demo_user_001', nickname: '我', avatar: '', department: 'Demo' });
    });
  },

  /**
   * 提交成绩到后端（Power Automate / Azure / 自建接口）
   * Demo 阶段仅打印日志，不发起任何网络请求。
   */
  submitScore: function (payload) {
    return new Promise(function (resolve) {
      if (!CONFIG.integrations.scoreSubmitEnabled || !CONFIG.integrations.powerAutomateEndpoint) {
        if (window.console && console.info) {
          console.info('[Safran] 成绩（Demo 未提交）:', payload);
        }
        resolve({ ok: true, mocked: true });
        return;
      }
      // ---- 上线：POST 到 Power Automate 流，Excel Online 负责落库 ----
      fetch(CONFIG.integrations.powerAutomateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { resolve({ ok: res.ok, mocked: false }); })
        .catch(function (err) {
          console.warn('[Safran] 成绩提交失败（已本地留存）:', err);
          resolve({ ok: false, mocked: false, error: String(err) });
        });
    });
  }
};

/* ==========================================================================
 * M7. ScreenRouter —— 页面路由
 * ========================================================================== */
const ScreenRouter = {
  screens: {},
  current: null,
  history: [],

  init: function () {
    const nodes = document.querySelectorAll('.screen');
    for (let i = 0; i < nodes.length; i++) {
      this.screens[nodes[i].dataset.screen] = nodes[i];
    }
    this.current = 'home';
    this.show('home', false);
  },

  /** 显示指定页面 */
  show: function (name, pushHistory) {
    if (!this.screens[name]) return;
    if (pushHistory !== false && this.current && this.current !== name) {
      this.history.push(this.current);
    }
    const self = this;
    Object.keys(this.screens).forEach(function (key) {
      self.screens[key].classList.toggle('is-active', key === name);
    });
    this.current = name;
    // 滚动回到顶部
    this.screens[name].scrollTop = 0;
  },

  /** 返回上一页 */
  back: function (fallback) {
    const prev = this.history.pop() || fallback || 'home';
    this.show(prev, false);
  }
};

/* ==========================================================================
 * M8. BoardEngine —— 棋盘引擎
 * --------------------------------------------------------------------------
 * 棋盘数据结构（二维数组，行列索引从 0 开始）：
 *   board[row][col] = Cell | null
 *   Cell = { id, row, col, avatarId, employee, el }
 * ========================================================================== */
const BoardEngine = {
  board: [],
  cellSeq: 0,

  /** 初始化引擎 */
  init: function () {
    this.board = [];
    this.cellSeq = 0;
  },

  /**
   * 生成一块「无天然三连」的初始棋盘。
   * 算法：逐格随机取值，若会与左侧两格 / 上方两格构成三连则重取。
   */
  generate: function (activePool) {
    const rows = CONFIG.board.rows;
    const cols = CONFIG.board.cols;
    let attempt = 0;
    let cells = null;

    // 最多重试 200 次，确保既无天然三连、又存在可行步
    while (attempt < 200) {
      attempt++;
      cells = [];
      for (let r = 0; r < rows; r++) {
        cells[r] = [];
        for (let c = 0; c < cols; c++) {
          const banned = {};
          // 左侧两格
          if (c >= 2 && cells[r][c - 1].avatarId === cells[r][c - 2].avatarId) {
            banned[cells[r][c - 1].avatarId] = true;
          }
          // 上方两格
          if (r >= 2 && cells[r - 1][c].avatarId === cells[r - 2][c].avatarId) {
            banned[cells[r - 1][c].avatarId] = true;
          }
          let candidates = activePool.filter(function (emp) { return !banned[emp.id]; });
          if (candidates.length === 0) candidates = activePool;
          const emp = candidates[Utils.randomInt(0, candidates.length - 1)];
          cells[r][c] = this.createCell(r, c, emp);
        }
      }
      if (this.hasValidMove(cells)) break;
    }
    this.board = cells;
    return this.board;
  },

  /** 创建一个 Cell 对象 */
  createCell: function (row, col, employee) {
    this.cellSeq++;
    return {
      id: this.cellSeq,
      row: row,
      col: col,
      avatarId: employee.id,
      employee: employee,
      el: null
    };
  },

  /**
   * 检测所有消除组合。
   * 返回数组，每个元素是一组「互相连通的匹配块」（含横向/纵向交叉的 L、T 形已合并）。
   */
  findMatches: function (board) {
    const rows = CONFIG.board.rows;
    const cols = CONFIG.board.cols;
    const runs = [];

    // —— 横向连续 ——
    for (let r = 0; r < rows; r++) {
      let run = [];
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        const prev = c > 0 ? board[r][c - 1] : null;
        if (cell && prev && cell.avatarId === prev.avatarId) {
          run.push(cell);
        } else {
          if (run.length >= CONFIG.avatars.minMatchLength) runs.push(run);
          run = cell ? [cell] : [];
        }
      }
      if (run.length >= CONFIG.avatars.minMatchLength) runs.push(run);
    }

    // —— 纵向连续 ——
    for (let c = 0; c < cols; c++) {
      let run = [];
      for (let r = 0; r < rows; r++) {
        const cell = board[r][c];
        const prev = r > 0 ? board[r - 1][c] : null;
        if (cell && prev && cell.avatarId === prev.avatarId) {
          run.push(cell);
        } else {
          if (run.length >= CONFIG.avatars.minMatchLength) runs.push(run);
          run = cell ? [cell] : [];
        }
      }
      if (run.length >= CONFIG.avatars.minMatchLength) runs.push(run);
    }

    return BoardEngine.mergeRuns(runs);
  },

  /** 把交叉的横/纵匹配块合并成连通分组（并查集） */
  mergeRuns: function (runs) {
    if (runs.length <= 1) return runs;

    const parent = {};
    const self = this;
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }

    runs.forEach(function (run) {
      run.forEach(function (cell) { if (parent[cell.id] === undefined) parent[cell.id] = cell.id; });
    });
    runs.forEach(function (run) {
      for (let i = 1; i < run.length; i++) union(run[0].id, run[i].id);
    });

    const buckets = {};
    const order = [];
    runs.forEach(function (run) {
      run.forEach(function (cell) {
        const root = find(cell.id);
        if (!buckets[root]) { buckets[root] = []; order.push(root); }
        if (buckets[root].indexOf(cell) === -1) buckets[root].push(cell);
      });
    });
    void self;
    return order.map(function (root) { return buckets[root]; });
  },

  /** 判断棋盘上是否存在任意可消除组合 */
  hasAnyMatch: function (board) {
    return this.findMatches(board).length > 0;
  },

  /**
   * 是否存在「交换后可消除」的合法步（用于死局检测）。
   */
  hasValidMove: function (board) {
    const rows = CONFIG.board.rows;
    const cols = CONFIG.board.cols;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (let d = 0; d < dirs.length; d++) {
          const nr = r + dirs[d][0];
          const nc = c + dirs[d][1];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          // 模拟交换
          const a = board[r][c];
          const b = board[nr][nc];
          board[r][c] = b;
          board[nr][nc] = a;
          const matched = this.hasAnyMatch(board);
          board[r][c] = a;
          board[nr][nc] = b;
          if (matched) return true;
        }
      }
    }
    return false;
  },

  /** 判断两个格子是否相邻（仅上下左右，禁用斜向） */
  isAdjacent: function (a, b) {
    if (!a || !b) return false;
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    return (dr + dc) === 1;
  },

  /** 洗牌（死局时重新排列，保证仍然合法） */
  shuffleBoard: function (board, activePool) {
    const flat = [];
    for (let r = 0; r < CONFIG.board.rows; r++) {
      for (let c = 0; c < CONFIG.board.cols; c++) flat.push(board[r][c]);
    }
    let attempt = 0;
    while (attempt < 200) {
      attempt++;
      const shuffled = Utils.shuffle(flat);
      let i = 0;
      for (let r = 0; r < CONFIG.board.rows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
          const cell = shuffled[i++];
          cell.row = r;
          cell.col = c;
          board[r][c] = cell;
        }
      }
      if (!this.hasAnyMatch(board) && this.hasValidMove(board)) return board;
    }
    // 极端情况：直接重新生成
    return this.generate(activePool);
  }
};

/* ==========================================================================
 * M9. ScoreEngine —— 积分引擎
 * --------------------------------------------------------------------------
 * 最终得分 = Σ(每次消除基础分 × 对应 Combo 倍率) + Lucky Hero 奖励分
 * Lucky Hero 奖励分 = 消除次数 × 20（不受 Combo 倍率影响，独立累加）
 * ========================================================================== */
const ScoreEngine = {
  /** 按消除数量返回基础分 */
  baseScoreOf: function (count) {
    if (count >= 5) return CONFIG.score.match5Plus;
    if (count === 4) return CONFIG.score.match4;
    return CONFIG.score.match3;
  },

  /** Combo 倍率 */
  multiplierOf: function (combo) {
    if (combo <= 1) return 1;
    if (combo === 2) return CONFIG.combo.multipliers[2];
    if (combo === 3) return CONFIG.combo.multipliers[3];
    return CONFIG.combo.maxMultiplier;
  },

  /**
   * 计算单步消除得分。
   * @param {Array<Array>} groups  连通分组
   * @param {number} combo         当前连击次数
   * @param {number} luckyHitCount 本步消除的 Lucky Hero 数量
   * @returns {{base:number, gained:number, luckyGain:number, multiplier:number}}
   */
  evaluate: function (groups, combo, luckyHitCount) {
    let base = 0;
    for (let i = 0; i < groups.length; i++) {
      base += this.baseScoreOf(groups[i].length);
    }
    const multiplier = this.multiplierOf(combo);
    const gained = Math.round(base * multiplier);
    const luckyGain = luckyHitCount * CONFIG.score.luckyHeroPerHit;
    return { base: base, gained: gained, luckyGain: luckyGain, multiplier: multiplier };
  }
};

/* ==========================================================================
 * M10. Game —— 游戏主控
 * ========================================================================== */
const Game = {
  /* ---- DOM 引用 ---- */
    el: {
    board: null,
    timer: null,
    score: null,
    comboBadge: null,
    comboLabel: null,
    comboValue: null,
    comboMult: null,
    comboPop: null,
    boardMask: null,
    toast: null
  },

  /* ---- 游戏状态 ---- */
  state: {
    board: [],
    activePool: [],         // 本局 8 名员工
    luckyHero: null,        // Lucky Hero 员工对象（玩家不可见）
    luckyHeroHits: 0,       // Lucky Hero 被消除次数
    baseScore: 0,           // 经过 Combo 加权的基础消除分
    luckyBonus: 0,          // Lucky Hero 额外奖励分
    score: 0,               // 当前总分 = baseScore + luckyBonus
    combo: 0,               // 当前连击数（同一次交换引发的连锁连续计数）
    remaining: 0,           // 剩余秒数
    running: false,         // 计时是否运行
    over: false,            // 本局是否结束
    busy: false,            // 动画处理中，屏蔽输入
    selected: null,         // 当前选中的格子
    endAt: 0,               // 结束时间戳（保证切后台后倒计时依然准确）
    timerId: null
  },

  /* ---- 初始化 ---- */
  init: function () {
    this.el.board = document.getElementById('board');
    this.el.timer = document.getElementById('timer-value');
    this.el.score = document.getElementById('score-value');
    this.el.comboBadge = document.getElementById('combo-badge');
    this.el.comboLabel = document.getElementById('combo-label');
    this.el.comboValue = document.getElementById('combo-value');
    this.el.comboMult = document.getElementById('combo-mult');
    this.el.comboPop = document.getElementById('combo-pop');
    this.el.boardMask = document.getElementById('board-mask');
    this.el.toast = document.getElementById('toast');

    const self = this;
    // 棋盘点击交互（pointerup 避免滑动误触）
    this.el.board.addEventListener('pointerup', function (event) {
      const cellEl = event.target.closest ? event.target.closest('.cell') : null;
      if (!cellEl) return;
      self.onCellTap(Number(cellEl.dataset.id));
    });

    // 依据可用高度动态调整棋盘尺寸（充分利用竖屏空间，保持正方形）
    window.addEventListener('resize', function () { self.fitBoard(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self.fitBoard(); }, 260);
    });
  },

  /**
   * 自适应棋盘尺寸：
   * 边长 = min(屏幕宽度 × 90%, 容器可用高度)，保证棋盘始终为正方形且完整可见。
   * 技术文档要求「棋盘区域占屏幕宽度 90%」，此处以 screen 宽度为基准。
   */
  fitBoard: function () {
    const wrap = this.el.board.parentNode;
    const screen = document.getElementById('screen-game');
    if (!wrap || !screen) return;

    // 容器可用高度（已扣除 HUD 与提示文字）
    const availH = wrap.clientHeight;
    // 屏幕宽度 × 90%（符合技术文档「棋盘占屏幕宽度 90%」的要求）
    const availW = screen.clientWidth * 0.9;

    const size = Math.max(200, Math.min(availW, availH));
    this.el.board.style.width = size + 'px';
    this.el.board.style.height = size + 'px';
  },

  /* ---- 开局 ---- */
  start: function () {
    const s = this.state;
    s.board = [];
    s.activePool = [];
    s.luckyHero = null;
    s.luckyHeroHits = 0;
    s.baseScore = 0;
    s.luckyBonus = 0;
    s.score = 0;
    s.combo = 0;
    s.remaining = CONFIG.game.duration;
    s.running = true;
    s.over = false;
    s.busy = false;
    s.selected = null;

    // 1) 从 34 人中不放回随机抽 8 人作为本局头像池
    s.activePool = Utils.sample(EMPLOYEE_POOL, CONFIG.avatars.activeCount);

    // 2) 从本局 8 人中随机选 1 人作为 Lucky Hero（玩家全程不可见）
    s.luckyHero = s.activePool[Utils.randomInt(0, s.activePool.length - 1)];

    // 3) 生成无天然三连的棋盘
    BoardEngine.init();
    s.board = BoardEngine.generate(s.activePool);

    // 4) 渲染
    this.renderBoard();
    this.updateHud();
    this.el.boardMask.classList.remove('is-visible');
    this.hideComboBadge();

    // 5) 启动倒计时
    this.startTimer();

    ScreenRouter.show('game', true);
    // 布局稳定后再计算棋盘尺寸（确保拿到真实可用高度）
    const self = this;
    requestAnimationFrame(function () { self.fitBoard(); });
    this.toast('开始！60 秒冲榜');
  },

  /* ---- 渲染棋盘 ---- */
  renderBoard: function () {
    const boardEl = this.el.board;
    boardEl.innerHTML = '';
    const s = this.state;

    for (let r = 0; r < CONFIG.board.rows; r++) {
      for (let c = 0; c < CONFIG.board.cols; c++) {
        const cell = s.board[r][c];
        if (!cell) continue;
        const el = Utils.createEl('div', 'cell');
        el.dataset.id = String(cell.id);
        el.dataset.row = String(r);
        el.dataset.col = String(c);
        el.appendChild(AvatarService.createImage(cell.employee));
        this.setCellPosition(el, r, c);
        cell.el = el;
        boardEl.appendChild(el);
      }
    }
  },

  /** 设置格子位置（transform 百分比实现动画位移） */
  setCellPosition: function (el, row, col) {
    el.style.transform = 'translate(' + (col * 100) + '%, ' + (row * 100) + '%)';
  },

  /** 根据 cell.row / cell.col 同步所有格子的位置 */
  syncPositions: function () {
    const s = this.state;
    for (let r = 0; r < CONFIG.board.rows; r++) {
      for (let c = 0; c < CONFIG.board.cols; c++) {
        const cell = s.board[r][c];
        if (cell && cell.el) this.setCellPosition(cell.el, cell.row, cell.col);
      }
    }
  },

  /* ---- 单元格点击 ---- */
  onCellTap: function (cellId) {
    const s = this.state;
    if (!s.running || s.over || s.busy) return;

    const cell = this.findCellById(cellId);
    if (!cell) return;

    // 第一次点击：选中
    if (!s.selected) {
      s.selected = cell;
      cell.el.classList.add('is-selected');
      return;
    }

    // 点击同一个：取消选中
    if (s.selected.id === cell.id) {
      s.selected.el.classList.remove('is-selected');
      s.selected = null;
      return;
    }

    // 点击非相邻：改为重新选中
    if (!BoardEngine.isAdjacent(s.selected, cell)) {
      s.selected.el.classList.remove('is-selected');
      s.selected = cell;
      cell.el.classList.add('is-selected');
      return;
    }

    // 相邻：执行交换
    const first = s.selected;
    s.selected.el.classList.remove('is-selected');
    s.selected = null;
    this.attemptSwap(first, cell);
  },

  /** 通过 id 查找格子对象 */
  findCellById: function (id) {
    const s = this.state;
    for (let r = 0; r < CONFIG.board.rows; r++) {
      for (let c = 0; c < CONFIG.board.cols; c++) {
        const cell = s.board[r][c];
        if (cell && cell.id === id) return cell;
      }
    }
    return null;
  },

  /**
   * 交换两个格子（数据层 + 坐标）。
   * 该操作是自反的：连续调用两次即可还原，因此「无效交换回退」可直接复用。
   */
  swapCells: function (a, b) {
    const s = this.state;
    s.board[a.row][a.col] = b;
    s.board[b.row][b.col] = a;
    const tmpRow = a.row; a.row = b.row; b.row = tmpRow;
    const tmpCol = a.col; a.col = b.col; b.col = tmpCol;
  },

  /* ---- 交换处理 ---- */
  attemptSwap: function (a, b) {
    const s = this.state;
    const self = this;
    s.busy = true;
    s.combo = 0;                      // 新的一次独立交换 → Combo 计数重置

    // 1) 数据层交换
    this.swapCells(a, b);

    // 2) 视图层交换（150ms 动画）
    a.el.classList.add('is-swapping');
    b.el.classList.add('is-swapping');
    this.setCellPosition(a.el, a.row, a.col);
    this.setCellPosition(b.el, b.row, b.col);

    Utils.sleep(CONFIG.anim.swap).then(function () {
      a.el.classList.remove('is-swapping');
      b.el.classList.remove('is-swapping');

      const matches = BoardEngine.findMatches(s.board);
      if (matches.length === 0) {
        // 3) 无效交换 → 恢复原位（swapCells 再执行一次即可还原）
        self.swapCells(a, b);
        a.el.classList.add('is-swapping');
        b.el.classList.add('is-swapping');
        self.setCellPosition(a.el, a.row, a.col);
        self.setCellPosition(b.el, b.row, b.col);
        s.busy = false;
        return Utils.sleep(CONFIG.anim.swap).then(function () {
          a.el.classList.remove('is-swapping');
          b.el.classList.remove('is-swapping');
        });
      }
      // 4) 有效交换 → 保留并进入消除流程
      return self.resolveCascade(matches);
    });
  },

  /**
   * 连锁消除主循环。
   * 同一次交换引发的连续消除按 Combo 依次计数：
   * 第 1 次 = Combo 1（无加成），第 2 次 = ×1.2，第 3 次 = ×1.5，第 4 次起 = ×2.0。
   */
  resolveCascade: function (firstMatches) {
    const s = this.state;
    const self = this;
    let groups = firstMatches;
    let step = 0;

    /** 处理一轮消除，返回 Promise（链式推进） */
    function next() {
      if (!groups || groups.length === 0) {
        s.busy = false;
        return Promise.resolve();
      }
      step++;
      s.combo = step;

      // 统计本步消除的 Lucky Hero 数量（去重）
      const removed = {};
      let luckyHits = 0;
      for (let i = 0; i < groups.length; i++) {
        for (let j = 0; j < groups[i].length; j++) {
          const cell = groups[i][j];
          if (removed[cell.id]) continue;
          removed[cell.id] = true;
          if (s.luckyHero && cell.avatarId === s.luckyHero.id) luckyHits++;
        }
      }

      // 计分（基础分 × Combo 倍率 + Lucky Hero 独立奖励）
      const result = ScoreEngine.evaluate(groups, s.combo, luckyHits);
      s.baseScore += result.gained;
      s.luckyBonus += result.luckyGain;
      s.luckyHeroHits += luckyHits;
      s.score = s.baseScore + s.luckyBonus;

      // 反馈
      self.updateHud();
      self.showCombo(step, result.multiplier);
      self.pulseScore();

      // 消除 → 下落 → 补充 → 再检测
      return self.clearStep(groups).then(function (nextGroups) {
        groups = nextGroups;
        return next();
      });
    }

    return next();
  },

  /**
   * 单步消除流程：消除动画 → 下落 → 补充 → 再次检测。
   * @returns {Promise<Array>} 下一轮的匹配组合（空数组表示连锁结束）
   */
  clearStep: function (groups) {
    const s = this.state;
    const self = this;

    // 1) 收集待消除格子（去重）
    const toRemove = {};
    groups.forEach(function (group) {
      group.forEach(function (cell) { toRemove[cell.id] = cell; });
    });

    // 2) 消除动画（200ms）
    Object.keys(toRemove).forEach(function (id) {
      const cell = toRemove[id];
      if (cell.el) cell.el.classList.add('is-matched');
    });

    return Utils.sleep(CONFIG.anim.clear).then(function () {
      // 3) 移除 DOM 与数据
      Object.keys(toRemove).forEach(function (id) {
        const cell = toRemove[id];
        if (cell.el && cell.el.parentNode) cell.el.parentNode.removeChild(cell.el);
        s.board[cell.row][cell.col] = null;
      });

      // 4) 下落：每列紧凑排列（250ms）
      self.collapseColumns();
      self.syncPositions();

      return Utils.sleep(CONFIG.anim.fall).then(function () {
        // 5) 补充新头像
        self.refillColumns();

        return Utils.nextFrame().then(function () {
          self.syncPositions();     // 新头像从棋盘上方落入

          return Utils.sleep(CONFIG.anim.fall).then(function () {
            // 6) 再次检测连锁；死局则自动洗牌
            const nextGroups = BoardEngine.findMatches(s.board);
            if (nextGroups.length === 0 && !BoardEngine.hasValidMove(s.board)) {
              self.shuffleBoard();
              return Utils.sleep(CONFIG.anim.fall).then(function () {
                return BoardEngine.findMatches(s.board);
              });
            }
            return nextGroups;
          });
        });
      });
    });
  },

  /**
   * 列内头像下落（紧凑排列到列底部）。
   * 实现方式：自底向上收集存活格子，再自底向上重新填回，实现「悬空落体」。
   */
  collapseColumns: function () {
    const s = this.state;
    const rows = CONFIG.board.rows;
    const cols = CONFIG.board.cols;

    for (let c = 0; c < cols; c++) {
      // 1) 自底向上收集本列存活的格子
      const survivors = [];
      for (let r = rows - 1; r >= 0; r--) {
        if (s.board[r][c]) survivors.push(s.board[r][c]);
      }
      // 2) 清空整列
      for (let r = 0; r < rows; r++) s.board[r][c] = null;
      // 3) 自底向上回填（survivors[0] 是最底部的格子）
      let write = rows - 1;
      for (let i = 0; i < survivors.length; i++) {
        const cell = survivors[i];
        cell.row = write;
        cell.col = c;
        s.board[write][c] = cell;
        write--;
      }
    }
  },

  /**
   * 从本局头像池中等概率补充新头像（8 种各 12.5%）。
   * 新格子先放置在棋盘上方的「虚拟行」，再由 syncPositions 动画落入。
   */
  refillColumns: function () {
    const s = this.state;
    const rows = CONFIG.board.rows;
    const cols = CONFIG.board.cols;

    for (let c = 0; c < cols; c++) {
      // 收集本列的空位（自上而下）
      const empties = [];
      for (let r = 0; r < rows; r++) {
        if (!s.board[r][c]) empties.push(r);
      }
      if (empties.length === 0) continue;

      const count = empties.length;
      for (let i = 0; i < count; i++) {
        const row = empties[i];
        const emp = s.activePool[Utils.randomInt(0, s.activePool.length - 1)];
        const cell = BoardEngine.createCell(row, c, emp);
        const el = Utils.createEl('div', 'cell');
        el.dataset.id = String(cell.id);
        el.dataset.row = String(row);
        el.dataset.col = String(c);
        el.appendChild(AvatarService.createImage(emp));
        // 起始位置在棋盘上方（负行号），落入后形成下落动画
        this.setCellPosition(el, row - count, c);
        cell.el = el;
        s.board[row][c] = cell;
        this.el.board.appendChild(el);
      }
    }
  },

  /** 死局洗牌 */
  shuffleBoard: function () {
    const s = this.state;
    s.board = BoardEngine.shuffleBoard(s.board, s.activePool);
    this.syncPositions();
    this.toast('重新洗牌');
  },

  /* ---- HUD 更新 ---- */
  updateHud: function () {
    const s = this.state;
    this.el.timer.textContent = Utils.formatTimer(s.remaining);
    this.el.score.textContent = Utils.formatNumber(s.score);
    const urgent = s.remaining <= 10 && s.running;
    this.el.timer.parentNode.classList.toggle('is-urgent', urgent);
  },

  /** 分数跳动反馈 */
  pulseScore: function () {
    const el = this.el.score.parentNode;
    el.style.transform = 'scale(1.14)';
    setTimeout(function () { el.style.transform = 'scale(1)'; }, 140);
  },

  /* ---- Combo 提示 ---- */
  showCombo: function (combo, multiplier) {
    if (combo < CONFIG.combo.minComboToShow) {
      this.hideComboBadge();
      return;
    }
    this.el.comboLabel.textContent = 'COMBO';
    this.el.comboValue.textContent = '×' + combo;
    this.el.comboMult.textContent = '得分 ×' + multiplier;
    this.el.comboBadge.classList.add('is-visible');

    // 中部弹出动画
    const pop = this.el.comboPop;
    pop.textContent = 'COMBO ×' + combo;
    pop.classList.remove('is-show');
    void pop.offsetWidth;           // 强制重排以重启动画
    pop.classList.add('is-show');

    const self = this;
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(function () {
      self.el.comboBadge.classList.remove('is-visible');
    }, 1600);
  },

  hideComboBadge: function () {
    this.el.comboBadge.classList.remove('is-visible');
  },

  /* ---- 倒计时 ---- */
  startTimer: function () {
    const s = this.state;
    const self = this;
    this.stopTimer();
    s.running = true;                 // stopTimer() 会置 false，这里必须重新置回
    s.endAt = Date.now() + s.remaining * 1000;

    s.timerId = setInterval(function () {
      // 以时间戳计算，避免浏览器切后台导致计时漂移
      const left = Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000));
      if (left !== s.remaining) {
        s.remaining = left;
        self.updateHud();
      }
      if (left <= 0) {
        self.stopTimer();
        self.finish();
      }
    }, CONFIG.game.tickMs);
  },

  stopTimer: function () {
    const s = this.state;
    if (s.timerId) {
      clearInterval(s.timerId);
      s.timerId = null;
    }
    s.running = false;
  },

  /* ---- 结束与结算 ---- */
  finish: function () {
    const s = this.state;
    if (s.over) return;
    s.over = true;
    s.running = false;
    s.busy = true;
    s.selected = null;

    this.el.boardMask.classList.add('is-visible');
    this.hideComboBadge();

    const best = Storage.updateBestScore(s.score);
    const result = {
      score: s.score,
      baseScore: s.baseScore,
      luckyBonus: s.luckyBonus,
      luckyHeroName: s.luckyHero ? s.luckyHero.name : '',
      luckyHeroDept: s.luckyHero ? s.luckyHero.department : '',
      luckyHeroAvatar: s.luckyHero ? AvatarService.resolve(s.luckyHero) : '',
      luckyHeroHits: s.luckyHeroHits,
      bestScore: best,
      rank: Leaderboard.getUserRank(s.score),
      endedAt: Date.now()
    };

    Storage.saveLastResult(result);
    Storage.pushHistory({
      score: result.score,
      luckyBonus: result.luckyBonus,
      luckyHero: result.luckyHeroName,
      hits: result.luckyHeroHits,
      time: result.endedAt
    });

    // 上线后此处会调用 Integrations.submitScore 上传成绩
    Integrations.submitScore({
      user_id: 'demo_user_001',
      score: result.score,
      lucky_bonus: result.luckyBonus,
      lucky_hero: result.luckyHeroName,
      lucky_hits: result.luckyHeroHits,
      created_time: new Date(result.endedAt).toISOString()
    });

    const self = this;
    setTimeout(function () {
      ResultPage.render(result);
      ScreenRouter.show('result', true);
    }, 700);
  },

  /* ---- Toast ---- */
  toast: function (message) {
    const el = this.el.toast;
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 1600);
  }
};

/* ==========================================================================
 * M10.1 ResultPage —— 结算页渲染
 * ========================================================================== */
const ResultPage = {
  render: function (result) {
    // 总分
    document.getElementById('result-score').textContent = Utils.formatNumber(result.score);
    document.getElementById('result-energy').innerHTML =
      '今天你为 Safran 贡献了 <b>' + Utils.formatNumber(result.score) + '</b> 点能量值！';

    // Lucky Hero 揭晓
    const avatarEl = document.getElementById('lucky-avatar');
    const hero = EMPLOYEE_POOL.filter(function (e) { return e.name === result.luckyHeroName; })[0];
    avatarEl.src = result.luckyHeroAvatar || (hero ? AvatarService.resolve(hero) : '');
    avatarEl.onerror = function () {
      avatarEl.onerror = null;
      avatarEl.src = AvatarService.fallback(hero);
    };
    document.getElementById('lucky-name').textContent = result.luckyHeroName || '—';
    document.getElementById('lucky-count').textContent = result.luckyHeroHits;
    document.getElementById('lucky-bonus').textContent = Utils.formatNumber(result.luckyBonus);

    // 历史数据
    document.getElementById('result-best').textContent = Utils.formatNumber(result.bestScore);
    document.getElementById('result-rank').textContent = '第 ' + result.rank + ' 名';

    this.confetti();
  },

  /** 结算页彩带动画 */
  confetti: function () {
    const box = document.getElementById('result-confetti');
    if (!box) return;
    box.innerHTML = '';
    const colors = ['#00AEEF', '#003DA5', '#F5A623', '#FFC93C', '#7FD4F7', '#E8556D'];
    for (let i = 0; i < 26; i++) {
      const piece = Utils.createEl('i');
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = colors[Utils.randomInt(0, colors.length - 1)];
      piece.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      piece.style.animationDelay = (Math.random() * 0.9) + 's';
      box.appendChild(piece);
    }
  }
};

/* ==========================================================================
 * M11. Leaderboard —— 排行榜（Demo 阶段 Mock 数据）
 * --------------------------------------------------------------------------
 * 技术文档要求的最小 Mock 数据（保持原样，便于后续替换为真实接口）。
 * ========================================================================== */
const mockRanking = [
  { name: 'David', department: 'Production', score: 8560 },
  { name: 'Lucy', department: 'Quality', score: 8220 },
  { name: 'Kevin', department: 'Engineering', score: 7990 }
];

/* 扩展 Mock 榜单（覆盖日榜 / 周榜 / 总榜三个维度） */
const Leaderboard = {
  rankings: {
    daily: [
      { name: 'David', department: 'Production', score: 8560 },
      { name: 'Lucy', department: 'Quality', score: 8220 },
      { name: 'Kevin', department: 'Engineering', score: 7990 },
      { name: 'Tom', department: 'R&D', score: 7560 },
      { name: 'Amy', department: 'Marketing', score: 7230 },
      { name: 'Eric', department: 'Sales', score: 7010 },
      { name: 'Jude', department: 'HR', score: 6880 },
      { name: 'Yang', department: 'Finance', score: 6610 }
    ],
    weekly: [
      { name: 'Kevin', department: 'Engineering', score: 9120 },
      { name: 'David', department: 'Production', score: 8840 },
      { name: 'Lucy', department: 'Quality', score: 8605 },
      { name: 'Amy', department: 'Marketing', score: 8290 },
      { name: 'Eric', department: 'Sales', score: 7950 },
      { name: 'Tom', department: 'R&D', score: 7740 },
      { name: 'Jude', department: 'HR', score: 7210 },
      { name: 'Yang', department: 'Finance', score: 6980 }
    ],
    all: [
      { name: 'David', department: 'Production', score: 18640 },
      { name: 'Lucy', department: 'Quality', score: 17220 },
      { name: 'Kevin', department: 'Engineering', score: 15990 },
      { name: 'Amy', department: 'Marketing', score: 14780 },
      { name: 'Tom', department: 'R&D', score: 13360 },
      { name: 'Eric', department: 'Sales', score: 12710 },
      { name: 'Jude', department: 'HR', score: 11880 },
      { name: 'Yang', department: 'Finance', score: 10610 }
    ]
  },

  currentTab: 'daily',

  /** 获取榜单（已按分数降序） */
  getList: function (type) {
    const list = this.rankings[type] || this.rankings.daily;
    return list.slice().sort(function (a, b) { return b.score - a.score; });
  },

  /**
   * 计算当前用户在总榜中的名次。
   * Demo 阶段把玩家分数插入 Mock 总榜后排序得出。
   */
  getUserRank: function (score) {
    const list = this.getList('all').map(function (item) {
      return { name: item.name, score: item.score };
    });
    list.push({ name: '我', score: score });
    list.sort(function (a, b) { return b.score - a.score; });
    for (let i = 0; i < list.length; i++) {
      if (list[i].name === '我') return i + 1;
    }
    return list.length;
  },

  /** 渲染当前 Tab 的榜单 */
  render: function () {
    const listEl = document.getElementById('rank-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const list = this.getList(this.currentTab);

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rank = i + 1;
      const li = Utils.createEl('li', 'rank__item');

      // 排名（前三名显示奖牌）
      let rankHtml = '<span class="rank__col rank__col--rank">';
      if (rank <= 3) {
        rankHtml += '<span class="rank__medal rank__medal--' + rank + '">' + rank + '</span>';
      } else {
        rankHtml += rank;
      }
      rankHtml += '</span>';

      // 昵称（带头像）
      const employee = EMPLOYEE_POOL.filter(function (e) { return e.name === item.name; })[0];
      let nameHtml = '<span class="rank__col rank__col--name">';
      if (employee) {
        nameHtml += '<img class="rank__avatar" src="' + AvatarService.resolve(employee) + '" alt="">';
      }
      nameHtml += '<span class="rank__name">' + item.name + '</span></span>';

      const deptHtml = '<span class="rank__col rank__col--dept"><span class="rank__dept">' +
        item.department + '</span></span>';
      const scoreHtml = '<span class="rank__col rank__col--score"><span class="rank__score">' +
        Utils.formatNumber(item.score) + '</span></span>';

      li.innerHTML = rankHtml + nameHtml + deptHtml + scoreHtml;

      // 头像加载失败兜底
      const img = li.querySelector('.rank__avatar');
      if (img) {
        img.onerror = function () {
          img.onerror = null;
          img.src = AvatarService.fallback(employee);
        };
      }

      listEl.appendChild(li);
    }
  },

  /** 切换 Tab */
  switchTab: function (type) {
    this.currentTab = type;
    this.render();
  }
};

/* ==========================================================================
 * M12. App —— 应用入口
 * ========================================================================== */
const App = {
  init: function () {
    ScreenRouter.init();
    Game.init();
    Leaderboard.render();
    this.bindEvents();
    this.rollSlogan();

    // 微信授权登录（Demo 为模拟登录，异步执行不影响首屏）
    const self = this;
    Integrations.wechatLogin().then(function (profile) {
      self.userProfile = profile;
    });
  },

  /** 首页随机企业文化标语 */
  rollSlogan: function () {
    const el = document.getElementById('home-slogan');
    if (!el) return;
    el.textContent = SLOGAN_LIBRARY[Utils.randomInt(0, SLOGAN_LIBRARY.length - 1)];
  },

  /** 事件绑定 */
  bindEvents: function () {
    const self = this;

    // 开始游戏
    document.getElementById('btn-start').addEventListener('click', function () {
      self.rollSlogan();
      Game.start();
    });

    // 再来一局
    document.getElementById('btn-again').addEventListener('click', function () {
      Game.start();
    });

    // 结算页 → 排行榜 / 首页
    document.getElementById('btn-result-rank').addEventListener('click', function () {
      ScreenRouter.show('rank', true);
    });
    document.getElementById('btn-result-home').addEventListener('click', function () {
      ScreenRouter.show('home', true);
    });

    // 首页 → 排行榜
    document.getElementById('btn-home-rank').addEventListener('click', function () {
      ScreenRouter.show('rank', true);
    });

    // 排行榜返回
    document.getElementById('btn-rank-back').addEventListener('click', function () {
      ScreenRouter.back('home');
    });

    // 排行榜 Tab
    const tabs = document.querySelectorAll('#rank-tabs .tabs__btn');
    Array.prototype.forEach.call(tabs, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        Leaderboard.switchTab(btn.dataset.rank);
      });
    });

    // 阻止移动端双击缩放 / 双指放大
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    let lastTouch = 0;
    document.addEventListener('touchend', function (event) {
      const now = Date.now();
      if (now - lastTouch <= 300) event.preventDefault();
      lastTouch = now;
    }, { passive: false });

    // 页面隐藏时暂停倒计时展示（回到前台自动校正）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Game.state.running) Game.updateHud();
    });
  }
};

/* 启动 */
document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
