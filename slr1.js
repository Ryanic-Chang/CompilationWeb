// slr1.js - SLR(1) 语法分析核心逻辑与页面交互

function slr1TrimAndClean(str) {
    return str.trim().replace(/\s+/g, ' ');
}

function compareSLR1Items(a, b) {
    if (a.production.id !== b.production.id) {
        return a.production.id - b.production.id;
    }
    return a.dotPos - b.dotPos;
}

function sameSLR1ItemSet(a, b) {
    if (a.items.length !== b.items.length) {
        return false;
    }
    for (let i = 0; i < a.items.length; i++) {
        if (a.items[i].hash() !== b.items[i].hash()) {
            return false;
        }
    }
    return true;
}

class SLR1Production {
    constructor(lhs, rhs, id) {
        this.lhs = lhs.trim();
        this.rhs = rhs; // array of strings
        this.id = id;
    }

    toString() {
        return `${this.lhs} -> ${this.rhs.join(' ')}`.trim();
    }
}

class SLR1Item {
    constructor(production, dotPos) {
        this.production = production;
        this.dotPos = dotPos;
    }

    toString() {
        let parts = [`${this.production.lhs} ->`];
        for (let i = 0; i < this.production.rhs.length; i++) {
            if (i === this.dotPos) parts.push('·');
            parts.push(this.production.rhs[i]);
        }
        if (this.dotPos === this.production.rhs.length) parts.push('·');
        return parts.join(' ').trim();
    }

    hash() {
        return `${this.production.id}_${this.dotPos}`;
    }
}

class SLR1ItemSet {
    constructor(id) {
        this.id = id;
        this.items = [];
    }

    addItem(item) {
        if (!this.items.some(i => i.hash() === item.hash())) {
            this.items.push(item);
            this.items.sort(compareSLR1Items);
        }
    }

    hash() {
        return this.items.map(i => i.hash()).join('|');
    }
}

class SLR1ParserGenerator {
    constructor(productions, startSymbol) {
        this.productions = productions;
        this.startSymbol = startSymbol;
        this.itemSets = [];
        this.gotoTable = new Map(); // key: "setId_symbol", value: nextSetId
        
        this.terminals = new Set();
        this.nonTerminals = new Set();
        
        this.firstSets = new Map();
        this.followSets = new Map();
        
        // actionTable[stateId][terminal] = "sX" / "rX" / "acc"
        this.actionTable = []; 
        // slrGotoTable[stateId][nonTerminal] = stateId
        this.slrGotoTable = [];

        this.conflicts = [];
        this.conflictCells = new Set();
        this.isSLR1 = true;

        if (this.productions.length === 0 || this.productions[0].lhs !== this.startSymbol + "'") {
            let augmentedProds = [];
            augmentedProds.push(new SLR1Production(this.startSymbol + "'", [this.startSymbol], 0));
            for (let i = 0; i < this.productions.length; i++) {
                let prod = this.productions[i];
                prod.id = i + 1;
                augmentedProds.push(prod);
            }
            this.productions = augmentedProds;
        }

        this.collectSymbols();
        this.computeFirstSets();
        this.computeFollowSets();
    }

    isKernelItem(item) {
        if (item.production.id === 0 && item.dotPos === 0) return true;
        return item.dotPos !== 0;
    }

    collectSymbols() {
        this.terminals.clear();
        this.nonTerminals.clear();

        for (let prod of this.productions) {
            this.nonTerminals.add(prod.lhs);
        }

        for (let prod of this.productions) {
            for (let sym of prod.rhs) {
                if (sym === 'ε') continue;
                if (!this.nonTerminals.has(sym)) {
                    this.terminals.add(sym);
                }
            }
        }
        this.terminals.add('$');
    }

    computeFirstSets() {
        this.firstSets.clear();
        for (let nt of this.nonTerminals) {
            this.firstSets.set(nt, new Set());
        }

        let changed = true;
        while (changed) {
            changed = false;
            
            for (let prod of this.productions) {
                let lhs = prod.lhs;
                let rhs = prod.rhs;
                
                let allCanDeriveEmpty = true;
                for (let sym of rhs) {
                    if (sym === 'ε') continue;
                    
                    if (this.nonTerminals.has(sym)) {
                        let symFirst = this.firstSets.get(sym);
                        let lhsFirst = this.firstSets.get(lhs);
                        for (let s of symFirst) {
                            if (s !== 'ε' && !lhsFirst.has(s)) {
                                lhsFirst.add(s);
                                changed = true;
                            }
                        }
                        
                        if (!symFirst.has('ε')) {
                            allCanDeriveEmpty = false;
                            break;
                        }
                    } else {
                        let lhsFirst = this.firstSets.get(lhs);
                        if (!lhsFirst.has(sym)) {
                            lhsFirst.add(sym);
                            changed = true;
                        }
                        allCanDeriveEmpty = false;
                        break;
                    }
                }
                
                if (allCanDeriveEmpty) {
                    let lhsFirst = this.firstSets.get(lhs);
                    if (!lhsFirst.has('ε')) {
                        lhsFirst.add('ε');
                        changed = true;
                    }
                }
            }
        }
    }

    computeFollowSets() {
        this.followSets.clear();
        for (let nt of this.nonTerminals) {
            this.followSets.set(nt, new Set());
        }
        this.followSets.get(this.startSymbol).add('$');
        
        let changed = true;
        while (changed) {
            changed = false;
            
            for (let prod of this.productions) {
                let lhs = prod.lhs;
                let rhs = prod.rhs;
                
                for (let i = 0; i < rhs.length; i++) {
                    let B = rhs[i];
                    if (!this.nonTerminals.has(B)) continue;
                    
                    let bFollow = this.followSets.get(B);
                    
                    if (i + 1 < rhs.length) {
                        let nextSym = rhs[i + 1];
                        if (this.nonTerminals.has(nextSym)) {
                            for (let s of this.firstSets.get(nextSym)) {
                                if (s !== 'ε' && !bFollow.has(s)) {
                                    bFollow.add(s);
                                    changed = true;
                                }
                            }
                        } else {
                            if (!bFollow.has(nextSym)) {
                                bFollow.add(nextSym);
                                changed = true;
                            }
                        }
                    }
                    
                    let betaCanDeriveEmpty = true;
                    for (let j = i + 1; j < rhs.length; j++) {
                        let sym = rhs[j];
                        if (this.nonTerminals.has(sym)) {
                            if (!this.firstSets.get(sym).has('ε')) {
                                betaCanDeriveEmpty = false;
                                break;
                            }
                        } else {
                            betaCanDeriveEmpty = false;
                            break;
                        }
                    }
                    
                    if (i + 1 >= rhs.length || betaCanDeriveEmpty) {
                        for (let s of this.followSets.get(lhs)) {
                            if (!bFollow.has(s)) {
                                bFollow.add(s);
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
    }

    closure(itemSet) {
        let result = new SLR1ItemSet(itemSet.id);
        result.items = [...itemSet.items].sort(compareSLR1Items);

        let changed = true;
        while (changed) {
            changed = false;
            let newItems = [];
            
            for (let item of result.items) {
                if (item.dotPos < item.production.rhs.length) {
                    let nextSymbol = item.production.rhs[item.dotPos];
                    
                    for (let prod of this.productions) {
                        if (prod.lhs === nextSymbol) {
                            let newItem = new SLR1Item(prod, 0);
                            let existsInResult = result.items.some(i => i.hash() === newItem.hash());
                            let existsInNew = newItems.some(i => i.hash() === newItem.hash());
                            if (!existsInResult && !existsInNew) {
                                newItems.push(newItem);
                                changed = true;
                            }
                        }
                    }
                }
            }
            
            for (let item of newItems) {
                result.addItem(item);
            }
        }
        return result;
    }

    goTo(itemSet, symbol) {
        let newSet = new SLR1ItemSet(-1);

        for (let item of itemSet.items) {
            if (item.dotPos < item.production.rhs.length && item.production.rhs[item.dotPos] === symbol) {
                newSet.addItem(new SLR1Item(item.production, item.dotPos + 1));
            }
        }

        return this.closure(newSet);
    }

    buildCanonicalCollection() {
        this.itemSets = [];
        this.gotoTable = new Map();
        this.actionTable = [];
        this.slrGotoTable = [];
        this.conflicts = [];
        this.conflictCells = new Set();
        this.isSLR1 = true;

        let initial = new SLR1ItemSet(0);
        initial.addItem(new SLR1Item(this.productions[0], 0));
        initial = this.closure(initial);
        this.itemSets.push(initial);

        let unprocessed = [0];

        while (unprocessed.length > 0) {
            let currentId = unprocessed.shift();
            let current = this.itemSets[currentId];

            let symbols = new Set();
            for (let item of current.items) {
                if (item.dotPos < item.production.rhs.length) {
                    let symbol = item.production.rhs[item.dotPos];
                    symbols.add(symbol);
                }
            }

            for (let symbol of Array.from(symbols).sort()) {
                let newSet = this.goTo(current, symbol);
                if (newSet.items.length === 0) continue;

                let existingId = -1;
                for (let existing of this.itemSets) {
                    if (sameSLR1ItemSet(existing, newSet)) {
                        existingId = existing.id;
                        break;
                    }
                }

                if (existingId === -1) {
                    newSet.id = this.itemSets.length;
                    this.itemSets.push(newSet);
                    unprocessed.push(newSet.id);
                    existingId = newSet.id;
                }

                this.gotoTable.set(`${currentId}_${symbol}`, existingId);
            }
        }

        // Initialize table
        for (let i = 0; i < this.itemSets.length; i++) {
            this.actionTable.push({});
            this.slrGotoTable.push({});
        }

        this.buildSLR1Table();
    }

    buildSLR1Table() {
        this.isSLR1 = true;
        this.conflicts = [];
        this.conflictCells = new Set();
        this.actionTable = [];
        this.slrGotoTable = [];

        for (let itemSet of this.itemSets) {
            let i = itemSet.id;
            this.actionTable[i] = {};
            this.slrGotoTable[i] = {};

            for (let item of itemSet.items) {
                // 移进项目
                if (item.dotPos < item.production.rhs.length) {
                    let nextSym = item.production.rhs[item.dotPos];
                    
                    // 如果是终结符，产生移进动作
                    if (this.terminals.has(nextSym)) {
                        let nextId = this.gotoTable.get(`${i}_${nextSym}`);
                        if (nextId !== undefined) {
                            this.actionTable[i][nextSym] = "s" + nextId;
                        }
                    }
                } 
                // 归约项目
                else if (item.production.id !== 0) {
                    let lhs = item.production.lhs;
                    let follow = Array.from(this.followSets.get(lhs)).sort();
                    for (let a of follow) {
                        let act = "r" + item.production.id;
                        if (this.actionTable[i][a] && this.actionTable[i][a] !== act) {
                            this.isSLR1 = false;
                            this.conflicts.push(`SLR(1)冲突: 状态${i} 符号${a} 已有动作${this.actionTable[i][a]} 新动作r${item.production.id}`);
                            this.conflictCells.add(`${i}_${a}`);
                        }
                        this.actionTable[i][a] = act;
                    }
                }
                // 接受项目
                else if (item.production.lhs === this.startSymbol + "'") {
                    this.actionTable[i]['$'] = "acc";
                }
            }

            for (let nt of this.nonTerminals) {
                let nextId = this.gotoTable.get(`${i}_${nt}`);
                if (nextId !== undefined) {
                    this.slrGotoTable[i][nt] = nextId;
                }
            }
        }
    }

    generateTextOutput() {
        let out = "=== FIRST 集 ===\n";
        for (let nt of Array.from(this.nonTerminals).sort()) {
            out += `FIRST(${nt}) = { ${Array.from(this.firstSets.get(nt)).sort().join(', ')} }\n`;
        }
        
        out += "\n=== FOLLOW 集 ===\n";
        for (let nt of Array.from(this.nonTerminals).sort()) {
            out += `FOLLOW(${nt}) = { ${Array.from(this.followSets.get(nt)).sort().join(', ')} }\n`;
        }

        out += "\n=== 项目集规范族 ===\n\n";
        for (let itemSet of this.itemSets) {
            out += `I${itemSet.id}:\n`;
            for (let item of itemSet.items) {
                out += `  ${item.toString()}\n`;
            }
            out += "\n";
        }

        if (this.isSLR1) {
            out += "【检测结果】该文法是 SLR(1) 文法，无冲突。\n";
        } else {
            out += "【检测结果】警告：该文法不是 SLR(1) 文法，存在以下冲突：\n";
            for (let c of this.conflicts) {
                out += `  - ${c}\n`;
            }
        }
        return out;
    }
}

function parseSLR1Grammar(text) {
    let productions = [];
    let lines = text.split('\n');
    let startSymbol = "";
    let id = 1;

    for (let line of lines) {
        line = slr1TrimAndClean(line);
        if (!line || line.startsWith('#')) continue;

        line = line.replace(/→/g, '->');
        let arrowPos = line.indexOf('->');
        if (arrowPos === -1) continue;

        let lhs = line.substring(0, arrowPos).trim();
        let rhsStr = line.substring(arrowPos + 2).trim();

        let altStrings = rhsStr.split('|').map(s => s.trim());

        for (let altStr of altStrings) {
            let rhs = altStr.split(/\s+/).filter(s => s.length > 0);
            if (rhs.length > 0) {
                productions.push(new SLR1Production(lhs, rhs, id++));
            }
        }
    }

    if (productions.length > 0) {
        startSymbol = productions[0].lhs;
    }

    return { productions, startSymbol };
}

// ======================== UI 交互逻辑 ========================

let slr1Network = null;
let currentSLR1Output = "";

document.addEventListener('DOMContentLoaded', () => {
    const btnRunSLR1 = document.getElementById('btn-run-slr1');
    const inputGrammar = document.getElementById('slr1-input');
    const fileUpload = document.getElementById('slr1-file-upload');
    const textOutput = document.getElementById('slr1-text-output');
    const statusDiv = document.getElementById('slr1-status');
    const btnDownload = document.getElementById('btn-download-slr1');
    const tabBtns = document.querySelectorAll('.slr1-tab-btn');
    const tabPanes = document.querySelectorAll('.slr1-tab-pane');

    // 文件上传处理
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            inputGrammar.value = evt.target.result;
            btnRunSLR1.click(); 
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // 导出结果
    btnDownload.addEventListener('click', () => {
        if (!currentSLR1Output) return;
        const blob = new Blob([currentSLR1Output], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'slr1_analysis.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 标签页切换逻辑
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active', 'text-indigo-600', 'border-indigo-600', 'bg-white');
                b.classList.add('text-slate-500', 'hover:text-slate-700', 'hover:bg-slate-100', 'border-transparent');
            });
            tabPanes.forEach(p => p.classList.add('hidden'));

            btn.classList.remove('text-slate-500', 'hover:text-slate-700', 'hover:bg-slate-100', 'border-transparent');
            btn.classList.add('active', 'text-indigo-600', 'border-indigo-600', 'bg-white');
            
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');

            if (targetId === 'slr1-result-graph' && slr1Network) {
                slr1Network.fit();
            }
        });
    });

    // 运行构建
    btnRunSLR1.addEventListener('click', () => {
        const text = inputGrammar.value;
        if (!text.trim()) {
            showSLR1Status("请输入文法规则", "error");
            return;
        }

        try {
            const { productions, startSymbol } = parseSLR1Grammar(text);
            if (productions.length === 0) {
                throw new Error("未能解析出任何有效的产生式。");
            }

            const generator = new SLR1ParserGenerator(productions, startSymbol);
            generator.buildCanonicalCollection();
            
            // 输出文本
            currentSLR1Output = generator.generateTextOutput();
            textOutput.textContent = currentSLR1Output;
            
            // 渲染表格
            renderSLR1Table(generator);

            // 绘制图形
            drawSLR1Network(generator);

            if (generator.isSLR1) {
                showSLR1Status(`构建完成！无冲突。是 SLR(1) 文法。`, "success");
            } else {
                showSLR1Status(`注意：存在移进/归约或归约/归约冲突，非 SLR(1) 文法！`, "error");
            }

            btnDownload.classList.remove('opacity-50', 'pointer-events-none');
            btnDownload.removeAttribute('disabled');

        } catch (e) {
            showSLR1Status(e.message, "error");
            console.error(e);
        }
    });
});

function showSLR1Status(msg, type) {
    const div = document.getElementById('slr1-status');
    div.classList.remove('hidden', 'text-red-600', 'bg-red-50', 'text-emerald-700', 'bg-emerald-50');
    div.classList.add('p-3', 'rounded-lg', 'font-medium');
    
    if (type === 'error') {
        div.classList.add('text-red-600', 'bg-red-50');
        div.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${msg}`;
    } else {
        div.classList.add('text-emerald-700', 'bg-emerald-50');
        div.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> ${msg}`;
    }
}

function renderSLR1Table(generator) {
    const head = document.getElementById('slr1-table-head');
    const body = document.getElementById('slr1-table-body');
    
    let terms = Array.from(generator.terminals).sort();
    let nonTerms = Array.from(generator.nonTerminals).sort();
    // 不显示 S' 
    nonTerms = nonTerms.filter(nt => nt !== generator.startSymbol + "'");

    // Head
    let headHtml = `
        <tr>
            <th rowspan="2" class="py-2 px-3 border border-slate-200 font-semibold text-slate-600 bg-slate-100">状态</th>
            <th colspan="${terms.length}" class="py-2 px-3 border border-slate-200 font-semibold text-slate-600 bg-slate-100">ACTION</th>
            <th colspan="${nonTerms.length}" class="py-2 px-3 border border-slate-200 font-semibold text-slate-600 bg-slate-100">GOTO</th>
        </tr>
        <tr>
    `;
    terms.forEach(t => {
        headHtml += `<th class="py-1 px-3 border border-slate-200 font-medium text-slate-500 bg-slate-50">${t}</th>`;
    });
    nonTerms.forEach(nt => {
        headHtml += `<th class="py-1 px-3 border border-slate-200 font-medium text-slate-500 bg-slate-50">${nt}</th>`;
    });
    headHtml += `</tr>`;
    head.innerHTML = headHtml;

    // Body
    let bodyHtml = "";
    for (let i = 0; i < generator.itemSets.length; i++) {
        bodyHtml += `<tr class="hover:bg-slate-50 transition-colors">`;
        bodyHtml += `<td class="py-2 px-3 border border-slate-100 font-mono text-slate-600">${i}</td>`;
        
        // ACTION
        terms.forEach(t => {
            let act = generator.actionTable[i][t] || "";
            let colorCls = generator.conflictCells.has(`${i}_${t}`) ? "text-red-500 font-bold" : "text-indigo-600";
            bodyHtml += `<td class="py-2 px-3 border border-slate-100 font-mono ${colorCls}">${act}</td>`;
        });
        
        // GOTO
        nonTerms.forEach(nt => {
            let go = generator.slrGotoTable[i][nt] !== undefined ? generator.slrGotoTable[i][nt] : "";
            bodyHtml += `<td class="py-2 px-3 border border-slate-100 font-mono text-emerald-600">${go}</td>`;
        });
        
        bodyHtml += `</tr>`;
    }
    body.innerHTML = bodyHtml;
}

// 绘制转移关系图
function drawSLR1Network(generator) {
    const container = document.getElementById('slr1-network');
    const nodes = [];
    const edges = [];

    // 生成节点
    for (let itemSet of generator.itemSets) {
        let label = `I${itemSet.id}\n`;
        label += `────────────\n`;
        
        let kernels = [];
        let closures = [];
        for (let item of itemSet.items) {
            if (generator.isKernelItem(item)) kernels.push(item.toString());
            else closures.push(item.toString());
        }

        label += kernels.join('\n');
        if (kernels.length > 0 && closures.length > 0) {
            label += `\n- - - - - - - - - - -\n`;
        }
        label += closures.join('\n');

        nodes.push({
            id: itemSet.id,
            label: label,
            shape: 'box',
            color: { background: '#F8FAFC', border: '#CBD5E1' },
            font: { face: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', align: 'left', size: 14, color: '#334155' },
            borderWidth: 2
        });
    }

    // 生成边
    for (let [key, nextId] of generator.gotoTable.entries()) {
        let parts = key.split('_');
        let fromId = parseInt(parts[0]);
        let symbol = parts[1];
        
        edges.push({
            from: fromId,
            to: nextId,
            label: symbol,
            arrows: 'to',
            font: { face: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', align: 'horizontal', color: '#4F46E5', size: 13, bold: true, background: 'rgba(255,255,255,0.8)' },
            color: { color: '#94A3B8' },
            smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
        });
    }

    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
        physics: { enabled: false },
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'LR',
                sortMethod: 'directed',
                nodeSpacing: 100,
                levelSeparation: 280,
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        },
        interaction: { dragNodes: true },
        edges: { chosen: true }
    };
    
    if (slr1Network) {
        slr1Network.destroy();
    }
    slr1Network = new vis.Network(container, data, options);
}
