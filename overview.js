// overview.js - 独立实验总览页逻辑

const OVERVIEW_STORAGE_KEY = "compilation-web-experiment-state";
const OVERVIEW_STAGES = [
    { id: "dfa", stateKey: "dfa", label: "实验一：DFA 模拟", target: "index.html?exp=dfa", units: 1 },
    { id: "scanner", stateKey: "scanner", label: "实验二：词法分析", target: "index.html?exp=scanner", units: 1 },
    { id: "lr0", stateKey: "lr0", label: "实验三：LR(0) 分析", target: "index.html?exp=lr0", units: 1 },
    { id: "slr1", stateKey: "slr1", label: "实验四：SLR(1) 分析", target: "index.html?exp=slr1", units: 1 },
    { id: "semantic", stateKey: "semantic", label: "实验五：语义分析", target: "index.html?exp=semantic", units: 1 },
    { id: "ir", stateKey: "ir", label: "实验六：中间代码", target: "index.html?exp=ir", units: 1 },
    { id: "backend-memory", stateKey: "backend", label: "实验七：地址映射", target: "index.html?exp=backend", units: 1 },
    { id: "backend-target", stateKey: "backend", label: "实验八：目标代码", target: "index.html?exp=backend", units: 1 }
];
const OVERVIEW_MODULE_ORDER = ["dfa", "scanner", "lr0", "slr1", "semantic", "ir", "backend"];

function loadOverviewState() {
    try {
        const raw = window.localStorage.getItem(OVERVIEW_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => {
                const safeValue = value && typeof value === "object" ? value : {};
                return [key, {
                    key,
                    completed: Boolean(safeValue.completed),
                    running: false,
                    lastRunStatus: safeValue.lastRunStatus || "idle",
                    updatedAt: Number.isFinite(safeValue.updatedAt) ? safeValue.updatedAt : 0
                }];
            })
        );
    } catch (_) {
        return {};
    }
}

function clearOverviewState() {
    try {
        window.localStorage.removeItem(OVERVIEW_STORAGE_KEY);
    } catch (_) {
        // 忽略本地存储异常，保持界面可继续使用
    }
}

function getOverviewStateMeta(state) {
    if (state.running) {
        return { label: "执行中", badgeClass: "bg-indigo-50 text-indigo-700", nodeClass: "is-running", progress: 66 };
    }
    if (state.completed && state.lastRunStatus === "success") {
        return { label: "已完成", badgeClass: "bg-emerald-50 text-emerald-700", nodeClass: "is-complete", progress: 100 };
    }
    if (state.completed && state.lastRunStatus === "error") {
        return { label: "已生成", badgeClass: "bg-amber-50 text-amber-700", nodeClass: "is-error", progress: 100 };
    }
    if (state.lastRunStatus === "error") {
        return { label: "待修正", badgeClass: "bg-red-50 text-red-700", nodeClass: "is-error", progress: 24 };
    }
    return { label: "未执行", badgeClass: "bg-slate-100 text-slate-600", nodeClass: "", progress: 8 };
}

function updateOverviewDashboard(stateMap) {
    const states = OVERVIEW_STAGES.map(stage => ({ stage, state: stateMap[stage.stateKey] || {} }));
    const total = OVERVIEW_STAGES.reduce((sum, stage) => sum + stage.units, 0);
    const completed = states.reduce((sum, item) => sum + (item.state.completed ? item.stage.units : 0), 0);
    const running = OVERVIEW_MODULE_ORDER.filter(key => (stateMap[key] || {}).running).length;
    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

    const assignText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    assignText("overview-stat-total", String(total));
    assignText("overview-stat-completed", String(completed));
    assignText("overview-stat-running", String(running));
    assignText("overview-stat-rate", `${rate}%`);
    assignText("overview-progress-caption", completed === 0 ? "等待首次实验执行" : `${completed}/${total} 个实验节点已形成结果`);

    const progressBar = document.getElementById("overview-progress-bar");
    if (progressBar) progressBar.style.width = `${rate}%`;
}

function renderOverviewProgressList(stateMap) {
    const container = document.getElementById("overview-progress-list");
    if (!container) return;

    container.innerHTML = OVERVIEW_STAGES.map(stage => {
        const state = stateMap[stage.stateKey] || {};
        const meta = getOverviewStateMeta(state);
        return `
            <a href="${stage.target}" target="_blank" rel="noopener noreferrer" class="block border border-slate-200 rounded-xl p-4 bg-slate-50 hover:border-indigo-300 hover:bg-white transition-colors">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <div class="font-medium text-slate-800">${stage.label}</div>
                    <span class="pipeline-status-badge ${meta.badgeClass}">${meta.label}</span>
                </div>
                <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div class="h-full rounded-full ${state.lastRunStatus === "error" ? "bg-rose-400" : state.running ? "bg-indigo-500" : "bg-emerald-500"}" style="width: ${meta.progress}%"></div>
                </div>
            </a>
        `;
    }).join("");
}

function updatePipelineNodeState(stateMap) {
    OVERVIEW_STAGES.forEach(stage => {
        const state = stateMap[stage.stateKey] || {};
        const meta = getOverviewStateMeta(state);
        const badgeElements = document.querySelectorAll(`[data-status-badge="${stage.id}"]`);

        badgeElements.forEach(badge => {
            badge.className = `pipeline-status-badge ${meta.badgeClass}`;
            badge.textContent = meta.label;
        });

        document.querySelectorAll(`.pipeline-node[data-stage-id="${stage.id}"]`).forEach(node => {
            node.classList.remove("is-running", "is-complete", "is-error");
            if (meta.nodeClass) node.classList.add(meta.nodeClass);
        });
    });
}

function bindOverviewNavigation() {
    document.querySelectorAll(".pipeline-node").forEach(node => {
        const key = node.getAttribute("data-exp-key");
        node.addEventListener("click", () => {
            const stageId = node.getAttribute("data-stage-id");
            const target = OVERVIEW_STAGES.find(stage => stage.id === stageId)?.target || `index.html?exp=${key}`;
            if (target) window.open(target, "_blank", "noopener");
        });
    });
}

function refreshOverview() {
    const stateMap = loadOverviewState();
    updateOverviewDashboard(stateMap);
    renderOverviewProgressList(stateMap);
    updatePipelineNodeState(stateMap);
}

document.addEventListener("DOMContentLoaded", () => {
    const btnReset = document.getElementById("btn-overview-reset");
    bindOverviewNavigation();
    refreshOverview();

    btnReset?.addEventListener("click", () => {
        clearOverviewState();
        refreshOverview();
    });

    window.addEventListener("storage", event => {
        if (event.key === OVERVIEW_STORAGE_KEY) {
            refreshOverview();
        }
    });
    window.addEventListener("focus", refreshOverview);
});
