// app.js - 实验页导航、状态持久化与统一跳转逻辑

const EXPERIMENT_STATE_STORAGE_KEY = "compilation-web-experiment-state";

window.experimentFlow = window.experimentFlow || {};
window.experimentFlow.registry = {
    dfa: {
        key: "dfa",
        sectionId: "experiment-dfa",
        navTarget: "experiment-dfa",
        label: "实验一：DFA 模拟与可视化",
        description: "进行 DFA 定义、字符串验证和状态转移图展示。",
        inputSelector: "#dfa-alphabet",
        resultTabSelector: null
    },
    scanner: {
        key: "scanner",
        sectionId: "experiment-scanner",
        navTarget: "experiment-scanner",
        label: "实验二：词法分析",
        description: "输入源代码并生成 Token 流、主文法 DFA 与状态转换表。",
        inputSelector: "#scanner-input",
        resultTabSelector: ".scanner-tab-btn[data-target='scanner-result-tokens']"
    },
    lr0: {
        key: "lr0",
        sectionId: "experiment-lr0",
        navTarget: "experiment-lr0",
        label: "实验三：LR(0) 分析",
        description: "构建 LR(0) 项目集规范族并展示转移关系图。",
        inputSelector: "#lr0-input",
        resultTabSelector: ".lr0-tab-btn[data-target='lr0-result-text']"
    },
    slr1: {
        key: "slr1",
        sectionId: "experiment-slr1",
        navTarget: "experiment-slr1",
        label: "实验四：SLR(1) 分析",
        description: "计算 FIRST/FOLLOW 集并构造 ACTION/GOTO 分析表。",
        inputSelector: "#slr1-input",
        resultTabSelector: ".slr1-tab-btn[data-target='slr1-result-table']"
    },
    semantic: {
        key: "semantic",
        sectionId: "experiment-semantic",
        navTarget: "experiment-semantic",
        label: "实验五：语义分析",
        description: "执行语义动作，展示符号表、语义错误与 AST。",
        inputSelector: "#semantic-source-input",
        resultTabSelector: ".semantic-tab-btn[data-target='semantic-result-symbols']"
    },
    ir: {
        key: "ir",
        sectionId: "experiment-ir",
        navTarget: "experiment-ir",
        label: "实验六：中间代码生成",
        description: "输出 AST、语义错误、三地址码与四元式。",
        inputSelector: "#ir-source-input",
        resultTabSelector: ".ir-tab-btn[data-target='ir-result-ast']"
    },
    backend: {
        key: "backend",
        sectionId: "experiment-backend",
        navTarget: "experiment-backend",
        label: "实验七&八：目标代码生成",
        description: "展示内存地址映射，并生成 x86 / arm64 汇编与 runtime 文件。",
        inputSelector: "#backend-source-input",
        resultTabSelector: ".backend-tab-btn[data-target='backend-result-ir']"
    }
};
window.experimentFlow.state = window.experimentFlow.state || {};

window.experimentFlow.persistState = function persistState() {
    try {
        window.localStorage.setItem(EXPERIMENT_STATE_STORAGE_KEY, JSON.stringify(window.experimentFlow.state));
    } catch (_) {
        // 本地存储失败时保持静默，避免影响实验页运行
    }
};

window.experimentFlow.loadPersistedState = function loadPersistedState() {
    try {
        const raw = window.localStorage.getItem(EXPERIMENT_STATE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
};

window.experimentFlow.activateSection = function activateSection(targetId) {
    const navItems = document.querySelectorAll(".nav-item");
    const pageSections = document.querySelectorAll(".page-section");
    const matchedNav = Array.from(navItems).find(item => item.getAttribute("data-target") === targetId);

    navItems.forEach(nav => nav.classList.remove("active", "bg-indigo-50", "text-indigo-700", "font-medium"));
    navItems.forEach(nav => nav.classList.add("text-slate-600", "hover:bg-slate-50", "hover:text-indigo-600"));
    pageSections.forEach(section => section.classList.remove("active"));

    if (matchedNav) {
        matchedNav.classList.remove("text-slate-600", "hover:bg-slate-50", "hover:text-indigo-600");
        matchedNav.classList.add("active", "bg-indigo-50", "text-indigo-700", "font-medium");
    }

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.add("active");
        targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const currentEntry = Object.values(window.experimentFlow.registry).find(entry => entry.sectionId === targetId);
    window.experimentFlow.currentSectionId = targetId;
    if (currentEntry) {
        document.dispatchEvent(new CustomEvent("experiment-flow-routechange", {
            detail: { sectionId: targetId, key: currentEntry.key, entry: currentEntry }
        }));
    }
};

window.experimentFlow.setExperimentState = function setExperimentState(key, patch) {
    const prev = window.experimentFlow.state[key] || {
        key,
        completed: false,
        running: false,
        lastRunStatus: "idle",
        updatedAt: 0
    };
    const next = {
        ...prev,
        ...patch,
        updatedAt: Date.now()
    };
    window.experimentFlow.state[key] = next;
    window.experimentFlow.persistState();
    document.dispatchEvent(new CustomEvent("experiment-flow-statechange", {
        detail: { key, state: next }
    }));
    return next;
};

window.experimentFlow.getExperimentState = function getExperimentState(key) {
    return window.experimentFlow.state[key] || {
        key,
        completed: false,
        running: false,
        lastRunStatus: "idle",
        updatedAt: 0
    };
};

window.experimentFlow.openExperimentByKey = function openExperimentByKey(key) {
    const config = window.experimentFlow.registry[key];
    if (!config) return;

    const state = window.experimentFlow.getExperimentState(key);
    window.experimentFlow.activateSection(config.sectionId);

    window.requestAnimationFrame(() => {
        if (state.completed && config.resultTabSelector) {
            const resultTab = document.querySelector(config.resultTabSelector);
            if (resultTab) resultTab.click();
        }

        const focusTarget = state.completed && config.resultTabSelector
            ? document.querySelector(config.resultTabSelector)
            : document.querySelector(config.inputSelector);
        if (focusTarget && typeof focusTarget.focus === "function") {
            focusTarget.focus({ preventScroll: false });
        }
    });
};

document.addEventListener("DOMContentLoaded", () => {
    const navItems = document.querySelectorAll(".nav-item");
    const routeBar = document.getElementById("page-route-bar");
    const routeTitle = document.getElementById("route-current-title");
    const routeDesc = document.getElementById("route-current-desc");
    const btnBackOverview = document.getElementById("btn-route-back-overview");
    const persistedState = window.experimentFlow.loadPersistedState();

    Object.keys(window.experimentFlow.registry).forEach(key => {
        const prev = persistedState[key] || {};
        window.experimentFlow.state[key] = {
            key,
            completed: false,
            running: false,
            lastRunStatus: "idle",
            updatedAt: 0,
            ...prev
        };
    });

    navItems.forEach(item => {
        item.addEventListener("click", event => {
            event.preventDefault();
            const targetId = item.getAttribute("data-target");
            window.experimentFlow.activateSection(targetId);
        });
    });

    document.addEventListener("experiment-flow-routechange", event => {
        const { entry } = event.detail;
        if (routeTitle) routeTitle.textContent = entry.label || "当前页面";
        if (routeDesc) routeDesc.textContent = entry.description || "";
    });

    btnBackOverview?.addEventListener("click", () => {
        window.location.href = "overview.html";
    });

    const params = new URLSearchParams(window.location.search);
    const expKey = params.get("exp");
    const targetSection = params.get("target");
    const firstKey = Object.keys(window.experimentFlow.registry)[0];

    if (expKey && window.experimentFlow.registry[expKey]) {
        window.experimentFlow.openExperimentByKey(expKey);
    } else if (targetSection && document.getElementById(targetSection)) {
        window.experimentFlow.activateSection(targetSection);
    } else {
        window.experimentFlow.openExperimentByKey(firstKey);
    }

    if (routeBar) routeBar.classList.remove("hidden");
});
