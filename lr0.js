// lr0.js - LR(0) 语法分析核心逻辑与页面交互

// 去除字符串两端空白并替换多个空白为一个空格
function trimAndClean(str) {
    return str.trim().replace(/\s+/g, ' ');
}

class Production {
    constructor(lhs, rhs, id) {
        this.lhs = lhs.trim();
        this.rhs = rhs; // array of strings
        this.id = id;
    }

    toString() {
        return `${this.lhs} -> ${this.rhs.join(' ')}`.trim();
    }
}

class LR0Item {
    constructor(production, dotPos) {
        this.production = production;
        this.dotPos = dotPos;
    }

    toString() {
        let rhsStrs = [...this.production.rhs];
        rhsStrs.splice(this.dotPos, 0, '·');
        return `${this.production.lhs} -> ${rhsStrs.join(' ')}`.trim();
    }

    hash() {
        return `${this.production.id}_${this.dotPos}`;
    }
}

class ItemSet {
    constructor(id) {
        this.id = id;
        this.items = []; // Array of LR0Item
    }

    addItem(item) {
        if (!this.items.some(i => i.hash() === item.hash())) {
            this.items.push(item);
        }
    }

    hash() {
        return this.items.map(i => i.hash()).sort().join('|');
    }
}

class LR0ParserGenerator {
    constructor(productions, startSymbol) {
        this.productions = productions;
        this.startSymbol = startSymbol;
        this.itemSets = [];
        this.gotoTable = new Map(); // key: "setId_symbol", value: nextSetId
        this.isLR0 = true;
    }

    isKernelItem(item) {
        // 初始项目集的 S'->·S 是内核项
        if (item.production.id === 0 && item.dotPos === 0) return true;
        // 点不在最左端的项是内核项
        return item.dotPos !== 0;
    }

    closure(itemSet) {
        let result = new ItemSet(itemSet.id);
        result.items = [...itemSet.items];

        let changed = true;
        let itemHashes = new Set(result.items.map(i => i.hash()));

        while (changed) {
            changed = false;
            let newItems = [];

            for (let item of result.items) {
                if (item.dotPos < item.production.rhs.length) {
                    let nextSymbol = item.production.rhs[item.dotPos];
                    
                    for (let prod of this.productions) {
                        if (prod.lhs === nextSymbol) {
                            let newItem = new LR0Item(prod, 0);
                            if (!itemHashes.has(newItem.hash())) {
                                itemHashes.add(newItem.hash());
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
        let newSet = new ItemSet(-1);

        for (let item of itemSet.items) {
            if (item.dotPos < item.production.rhs.length && item.production.rhs[item.dotPos] === symbol) {
                newSet.addItem(new LR0Item(item.production, item.dotPos + 1));
            }
        }

        return this.closure(newSet);
    }

    buildCanonicalCollection() {
        // 确保已经增广
        if (this.productions.length === 0 || this.productions[0].lhs !== this.startSymbol + "'") {
            let augmentedProds = [];
            augmentedProds.push(new Production(this.startSymbol + "'", [this.startSymbol], 0));
            
            for (let i = 0; i < this.productions.length; i++) {
                let prod = this.productions[i];
                prod.id = i + 1;
                augmentedProds.push(prod);
            }
            this.productions = augmentedProds;
        }

        let initial = new ItemSet(0);
        initial.addItem(new LR0Item(this.productions[0], 0));
        initial = this.closure(initial);
        this.itemSets.push(initial);

        let unprocessed = [0];
        let existingHashes = new Map();
        existingHashes.set(initial.hash(), 0);

        while (unprocessed.length > 0) {
            let currentId = unprocessed.shift();
            let current = this.itemSets[currentId];

            let symbols = new Set();
            for (let item of current.items) {
                if (item.dotPos < item.production.rhs.length) {
                    symbols.add(item.production.rhs[item.dotPos]);
                }
            }

            for (let symbol of symbols) {
                let newSet = this.goTo(current, symbol);
                if (newSet.items.length === 0) continue;

                let hash = newSet.hash();
                let existingId = existingHashes.get(hash);

                if (existingId === undefined) {
                    newSet.id = this.itemSets.length;
                    this.itemSets.push(newSet);
                    unprocessed.push(newSet.id);
                    existingHashes.set(hash, newSet.id);
                    existingId = newSet.id;
                }

                this.gotoTable.set(`${currentId}_${symbol}`, existingId);
            }
        }
        
        this.checkLR0();
    }

    checkLR0() {
        this.isLR0 = true;
        for (let itemSet of this.itemSets) {
            let hasReduce = false;
            let hasShift = false;

            for (let item of itemSet.items) {
                if (item.dotPos === item.production.rhs.length) {
                    // 归约项 (如果是 S' -> S ·，通常算作接受状态，但此处简单按归约处理检查冲突)
                    if (item.production.id !== 0) {
                        if (hasShift || hasReduce) this.isLR0 = false;
                        hasReduce = true;
                    }
                } else {
                    // 移进项
                    if (hasReduce) this.isLR0 = false;
                    hasShift = true;
                }
            }
        }
    }

    generateTextOutput() {
        let out = "LR(0)项目集规范族:\n\n";
        
        for (let itemSet of this.itemSets) {
            out += `I${itemSet.id}:\n`;
            
            out += "Kernel:\n";
            for (let item of itemSet.items) {
                if (this.isKernelItem(item)) {
                    out += `  ${item.toString()}\n`;
                }
            }
            
            out += "Closure:\n";
            for (let item of itemSet.items) {
                if (!this.isKernelItem(item)) {
                    out += `  ${item.toString()}\n`;
                }
            }
            
            out += "Goto:\n";
            let hasGoto = false;
            for (let [key, nextId] of this.gotoTable.entries()) {
                let parts = key.split('_');
                let fromId = parseInt(parts[0]);
                let symbol = parts[1];
                if (fromId === itemSet.id) {
                    out += `  ${symbol} → I${nextId}\n`;
                    hasGoto = true;
                }
            }
            if (!hasGoto) out += "  (无)\n";
            
            out += "\n";
        }

        if (this.isLR0) {
            out += "【检测结果】该文法是 LR(0) 文法，无冲突。\n";
        } else {
            out += "【检测结果】警告：该文法不是 LR(0) 文法，存在冲突。\n";
        }
        return out;
    }
}

function parseGrammar(text) {
    let productions = [];
    let lines = text.split('\n');
    let startSymbol = "";
    let id = 1;

    for (let line of lines) {
        line = trimAndClean(line);
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
                productions.push(new Production(lhs, rhs, id++));
            }
        }
    }

    if (productions.length > 0) {
        startSymbol = productions[0].lhs;
    }

    return { productions, startSymbol };
}

// ======================== UI 交互逻辑 ========================

let lr0Network = null;
let currentLR0Output = "";

document.addEventListener('DOMContentLoaded', () => {
    const btnRunLR0 = document.getElementById('btn-run-lr0');
    const inputGrammar = document.getElementById('lr0-input');
    const fileUpload = document.getElementById('lr0-file-upload');
    const textOutput = document.getElementById('lr0-text-output');
    const statusDiv = document.getElementById('lr0-status');
    const btnDownload = document.getElementById('btn-download-lr0');
    const tabBtns = document.querySelectorAll('.lr0-tab-btn');
    const tabPanes = document.querySelectorAll('.lr0-tab-pane');

    // 文件上传处理
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            inputGrammar.value = evt.target.result;
            btnRunLR0.click(); 
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // 导出结果
    btnDownload.addEventListener('click', () => {
        if (!currentLR0Output) return;
        const blob = new Blob([currentLR0Output], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lr0_canonical_collection.txt';
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

            if (targetId === 'lr0-result-graph' && lr0Network) {
                lr0Network.fit();
            }
        });
    });

    // 运行构建
    btnRunLR0.addEventListener('click', () => {
        const text = inputGrammar.value;
        if (!text.trim()) {
            showLR0Status("请输入文法规则", "error");
            return;
        }

        try {
            const { productions, startSymbol } = parseGrammar(text);
            if (productions.length === 0) {
                throw new Error("未能解析出任何有效的产生式。");
            }

            const generator = new LR0ParserGenerator(productions, startSymbol);
            generator.buildCanonicalCollection();
            
            // 输出文本
            currentLR0Output = generator.generateTextOutput();
            textOutput.textContent = currentLR0Output;
            
            // 绘制图形
            drawLR0Network(generator);

            if (generator.isLR0) {
                showLR0Status(`构建完成！共生成 ${generator.itemSets.length} 个项目集，无冲突。是 LR(0) 文法。`, "success");
            } else {
                showLR0Status(`注意：存在移进/归约或归约/归约冲突，非 LR(0) 文法！(共生成 ${generator.itemSets.length} 个项目集，已绘制转移图)`, "error");
            }

            btnDownload.classList.remove('opacity-50', 'pointer-events-none');
            btnDownload.removeAttribute('disabled');

        } catch (e) {
            showLR0Status(e.message, "error");
        }
    });
});

function showLR0Status(msg, type) {
    const div = document.getElementById('lr0-status');
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

// 绘制转移关系图
function drawLR0Network(generator) {
    const container = document.getElementById('lr0-network');
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
        physics: { 
            enabled: false // 禁用物理引擎以保证完全由 hierarchical 布局控制初始位置，不乱抖动
        },
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'LR', // 从左到右展示
                sortMethod: 'directed', // 依据有向边进行排序，保证拓扑整齐
                nodeSpacing: 100, // 缩小节点之间的垂直间距
                levelSeparation: 280, // 缩小层级之间的水平间距
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        },
        interaction: {
            dragNodes: true // 即使在 hierarchical 布局下，也允许用户微调拖动节点
        },
        edges: {
            chosen: true
        }
    };
    
    if (lr0Network) {
        lr0Network.destroy();
    }
    lr0Network = new vis.Network(container, data, options);
}
