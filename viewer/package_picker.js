/* Viewer 制品选择器（独立模块，app.js 只读其最小接口）。
 *
 * - 从同源 packages.json 读取已发布制品摘要（不加载包体）；
 * - 顶栏下拉选择制品：显式选择写 ?package=<pkg> 后整页重载，由 app.js 在
 *   加载 bundle 前解析该参数（并做 formalMotionTools 预检，失败自动回退默认）；
 * - 右键“属性”弹窗展示完整身份与溯源信息；
 * - 默认（viewer-root / 无参数）保持加载当前 viewer/bundle.json，身份不切换。
 */
(function () {
  "use strict";

  const PKG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

  function currentPackageName() {
    const value = new URLSearchParams(window.location.search).get("package");
    return value && PKG_RE.test(value) ? value : null;
  }

  function resolveRequestedPath() {
    const pkg = currentPackageName();
    if (!pkg || pkg === "viewer-root") return null;
    return "packages/" + encodeURIComponent(pkg) + "/bundle.json";
  }

  // Minimal interface consumed by app.js before bundle fetch.
  window.__VIEWER_PACKAGE_PICKER_INIT__ = { resolveRequestedPath: resolveRequestedPath };

  let index = null; // packages.json document
  let entries = []; // ready & visible entries
  let activePkg = "viewer-root";
  let activeEntry = null;

  const SHORT = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" };

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate()
    ).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}Z`;
  }

  function windowText(entry) {
    const s = entry.simulation_start ? fmtDate(entry.simulation_start) : "";
    const e = entry.simulation_end ? fmtDate(entry.simulation_end) : "";
    return s && e ? `${s} → ${e}` : s || e || "";
  }

  function corridorName(entry) {
    const id = entry.corridor_id || "";
    if (id === "tromso_to_isfjorden_outer") return "Tromsø → Isfjorden";
    if (id === "offshore_murmansk_to_offshore_dikson") return "Murmansk → Dikson";
    return id || "未知航线";
  }

  function explainBadge(entry) {
    return entry.has_risk_explanation
      ? '<span class="pkg-flag-yes">可解释制品</span>'
      : '<span class="pkg-flag-no">无解释</span>';
  }

  /* ---------- DOM builders (no innerHTML for untrusted strings) ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildTrigger() {
    const active = activeEntry || {};
    const isExplain = Boolean(active.has_risk_explanation);
    const wrap = el("div", "pkg-picker");
    wrap.setAttribute("aria-expanded", "false");
    const btn = el("button", "pkg-trigger");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-label", "选择已发布制品");
    const dot = el("span", "pkg-dot" + (isExplain ? "" : " is-muted"));
    const label = el("span", "pkg-trigger-label");
    const title = el("span", "pkg-trigger-title",
      activeEntry ? activeEntry.display_name : "正在加载制品清单");
    const sub = el("span", "pkg-trigger-sub", activeEntry
      ? `${corridorName(activeEntry)} · ${windowText(activeEntry)}`
      : "");
    label.append(title, sub);
    const chevron = el("span", "pkg-chevron", "▾");
    btn.append(dot, label, chevron);
    wrap.append(btn);
    btn.addEventListener("click", () => toggleOpen(wrap));
    return wrap;
  }

  function buildDropdown(wrap) {
    const list = el("ul", "pkg-dropdown");
    list.hidden = true;
    list.setAttribute("role", "listbox");
    for (const entry of entries) {
      const option = el("li", "");
      const btn = el("button", "pkg-option");
      btn.type = "button";
      btn.setAttribute("role", "option");
      if (entry.package_dir === activePkg) btn.classList.add("is-current");
      const title = el("span", "pkg-option-title", entry.display_name);
      const meta = el("span", "pkg-option-meta");
      meta.innerHTML = ""; // clear
      const bits = document.createElement("span");
      bits.textContent = `${corridorName(entry)} · ${windowText(entry)}`;
      const metaLine = document.createElement("span");
      metaLine.append(bits, document.createTextNode(" · "));
      const badgeWrap = document.createElement("span");
      badgeWrap.innerHTML = explainBadge(entry);
      metaLine.append(badgeWrap);
      meta.append(metaLine);
      const counts = el("span", "", `路线 ${entry.route_count ?? 0} · 风险帧 ${entry.risk_frame_count ?? 0}`);
      meta.append(counts);
      btn.append(title, meta);
      if (entry.status !== "ready" && entry.reason) {
        btn.setAttribute("aria-disabled", "true");
        btn.classList.add("is-disabled");
        btn.title = entry.reason || "";
      }
      btn.addEventListener("click", () => {
        closeOpen(wrap);
        if (entry.status !== "ready") return;
        selectPackage(entry);
      });
      btn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openMenu(event.clientX, event.clientY, entry, wrap);
      });
      option.append(btn);
      list.append(option);
    }
    wrap.append(list);
    return list;
  }

  function toggleOpen(wrap) {
    const list = wrap.querySelector(".pkg-dropdown");
    const expanded = wrap.getAttribute("aria-expanded") === "true";
    closeAllDropdowns();
    list.hidden = expanded;
    wrap.setAttribute("aria-expanded", String(!expanded));
    if (!expanded) {
      const first = list.querySelector(".pkg-option");
      if (first) first.focus();
    }
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".pkg-picker").forEach((w) => {
      w.setAttribute("aria-expanded", "false");
      const list = w.querySelector(".pkg-dropdown");
      if (list) list.hidden = true;
    });
    closeMenu();
  }

  function selectPackage(entry) {
    const next = entry.package_dir === "viewer-root" ? null : entry.package_dir;
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("package", next);
    else params.delete("package");
    const qs = params.toString();
    window.location.search = qs ? `?${qs}` : "";
  }

  /* ---------- context menu ---------- */

  let menuEl = null;
  let menuCleanup = null;

  function openMenu(x, y, entry, wrap) {
    closeMenu();
    menuEl = el("div", "pkg-menu");
    menuEl.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
    menuEl.style.top = `${Math.min(y, window.innerHeight - 110)}px`;
    const props = el("button", "pkg-menu-item", "属性");
    props.addEventListener("click", () => { closeMenu(); openProperties(entry, wrap); });
    const copyId = el("button", "pkg-menu-item", "复制制品 ID");
    copyId.addEventListener("click", async () => {
      await copyText(entry.dataset_bundle_id || entry.package_dir);
      closeMenu();
    });
    const copyPath = el("button", "pkg-menu-item", "复制 bundle 路径");
    copyPath.addEventListener("click", async () => {
      await copyText(entry.bundle_path);
      closeMenu();
    });
    menuEl.append(props, el("div", "pkg-menu-sep"), copyId, copyPath);
    document.body.append(menuEl);
    menuCleanup = () => closeMenu();
    menuEl.querySelector("button").focus();
    setTimeout(() => document.addEventListener("click", menuCleanup, { once: true }), 0);
    document.addEventListener("keydown", menuKeydown);
  }

  function menuKeydown(event) {
    if (event.key === "Escape") closeMenu();
  }

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener("keydown", menuKeydown);
    if (menuCleanup) { document.removeEventListener("click", menuCleanup); menuCleanup = null; }
  }

  function closeOpen(wrap) {
    closeAllDropdowns();
    closeMenu();
  }

  /* ---------- properties modal ---------- */

  function openProperties(entry, wrap) {
    closeMenu();
    const overlay = el("div", "pkg-overlay");
    const modal = el("div", "pkg-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const head = el("div", "pkg-modal-head");
    const headText = el("div", "");
    headText.append(el("strong", "", entry.display_name || entry.package_dir));
    const tag = el("span", "pkg-tag", corridorName(entry));
    headText.append(tag);
    const closeBtn = el("button", "pkg-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    head.append(headText, closeBtn);
    const body = el("div", "pkg-modal-body");

    const addBlock = (title, rows) => {
      const block = el("div", "pkg-block");
      block.append(el("h4", "pkg-block-title", title));
      const dl = el("dl", "pkg-kv");
      for (const [label, value, copyable] of rows) {
        const dt = el("dt", "", label);
        const dd = el("dd", "");
        if (copyable && value) {
          const span = el("span", "pkg-mono", String(value));
          const copy = el("button", "pkg-copy", "复制");
          copy.type = "button";
          copy.addEventListener("click", () => copyText(String(value)));
          dd.append(span, copy);
        } else {
          dd.textContent = value ? String(value) : "—";
        }
        dl.append(dt, dd);
      }
      block.append(dl);
      body.append(block);
    };

    addBlock("基础信息", [
      ["显示名称", entry.display_name],
      ["航线", `${corridorName(entry)}（${entry.corridor_id || "—"}）`],
      ["场景", entry.scenario_id || "—"],
      ["模拟时间", `${entry.simulation_start || "—"} → ${entry.simulation_end || "—"}`],
      ["风险帧数", entry.risk_frame_count ?? 0],
      ["渲染路线", entry.route_count ?? 0],
    ]);
    addBlock("身份溯源", [
      ["DatasetBundle", entry.dataset_bundle_id, true],
      ["Bundle Digest", entry.dataset_bundle_digest, true],
      ["RiskWindow", entry.risk_window_id, true],
      ["Run", entry.run_id, true],
      ["LayerSet", entry.layer_set_id, true],
      ["Candidates", entry.candidate_set_id, true],
      ["Selected", entry.selected_candidate_id, true],
      ["MotionSets", (entry.route_motion_set_ids || []).join("\n") || "—", true],
    ]);
    addBlock("可解释制品", [
      ["状态", entry.has_risk_explanation ? "已嵌入 bundle（PUBLISHED）" : "无 / 不可用"],
      ["Artifact", entry.explanation_artifact_id, true],
    ]);
    addBlock("来源与生成", [
      ["包目录", entry.package_dir],
      ["bundle 路径", entry.bundle_path, true],
      ["生成时间", entry.generated_at || "—"],
      ["清单状态", entry.status === "ready" ? "ready" : `incomplete（${entry.reason || ""}）`],
    ]);
    if (entry.note) {
      body.append(el("div", "pkg-note", `备注：${entry.note}`));
    }

    modal.append(head, body);
    overlay.append(modal);
    document.body.append(overlay);
    const onKey = (event) => {
      if (event.key === "Escape") dismiss();
    };
    const dismiss = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (wrap) wrap.querySelector(".pkg-trigger")?.focus();
    };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });
    closeBtn.addEventListener("click", dismiss);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) { /* noop */ }
      ta.remove();
    }
  }

  /* ---------- error strip (fallback message from app.js preflight) ---------- */

  function showError(message) {
    const strip = el("div", "pkg-error");
    strip.append(el("span", "", message));
    const close = el("button", "", "知道了");
    close.type = "button";
    close.addEventListener("click", () => strip.remove());
    strip.append(close);
    document.body.append(strip);
    setTimeout(() => strip.remove(), 15000);
  }

  /* ---------- bootstrap ---------- */

  async function boot() {
    activePkg = currentPackageName() || "viewer-root";
    try {
      const resp = await fetch("packages.json", { cache: "no-cache" });
      if (!resp.ok) throw new Error(`packages.json HTTP ${resp.status}`);
      index = await resp.json();
      const raw = Array.isArray(index.packages) ? index.packages : [];
      const ordered = raw.slice().sort((a, b) => {
        const ka = (a.package_dir === "viewer-root" ? -1 : 0);
        const kb = (b.package_dir === "viewer-root" ? -1 : 0);
        return ka - kb;
      });
      entries = ordered.filter((e) => !e.hidden);
      activeEntry = entries.find((e) => e.package_dir === activePkg) || null;
    } catch (error) {
      entries = [];
      console.warn("[package-picker] 清单加载失败:", error);
    }

    const header = document.querySelector("header.topbar") || document.querySelector(".topbar");
    if (!header) return;
    const wrap = buildTrigger();
    const list = buildDropdown(wrap);
    header.append(wrap);

    wrap.querySelector(".pkg-trigger").addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllDropdowns();
    });
    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) closeAllDropdowns();
    });

    // fallback notice written by app.js when a requested package failed preflight
    try {
      const message = window.sessionStorage.getItem("viewer.package.error");
      if (message) {
        window.sessionStorage.removeItem("viewer.package.error");
        showError(message);
      }
    } catch (_) { /* noop */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
