// dfa.js - DFA 核心逻辑与页面交互

class DFA {
    constructor() {
        this.alphabet = new Set();
        this.states = new Set();
        this.start_state = "";
        this.accept_states = new Set();
        this.transitions = new Map(); // key: "state,symbol" -> value: "next_state"
    }

    // 从文本解析 DFA 定义
    parse(text) {
        this.alphabet.clear();
        this.states.clear();
        this.start_state = "";
        this.accept_states.clear();
        this.transitions.clear();

        const lines = text.split('\n');
        let isTransitionSection = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith("Alphabet:")) {
                isTransitionSection = false;
                const parts = line.substring(9).trim().split(/\s+/);
                parts.forEach(p => { if(p) this.alphabet.add(p); });
            } else if (line.startsWith("States:")) {
                isTransitionSection = false;
                const parts = line.substring(7).trim().split(/\s+/);
                parts.forEach(p => { if(p) this.states.add(p); });
            } else if (line.startsWith("Start:")) {
                isTransitionSection = false;
                this.start_state = line.substring(6).trim();
            } else if (line.startsWith("Accept:")) {
                isTransitionSection = false;
                const parts = line.substring(7).trim().split(/\s+/);
                parts.forEach(p => { if(p) this.accept_states.add(p); });
            } else if (line.startsWith("Transitions:")) {
                isTransitionSection = true;
            } else if (isTransitionSection) {
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    const from = parts[0];
                    const sym = parts[1];
                    const to = parts[2];
                    this.transitions.set(`${from},${sym}`, to);
                }
            }
        }
    }

    // 验证 DFA 的合法性
    isValid() {
        if (!this.states.has(this.start_state)) {
            return { valid: false, msg: `无效DFA: 初始状态 '${this.start_state}' 不在状态集合中。` };
        }
        if (this.accept_states.size === 0) {
            return { valid: false, msg: "无效DFA: 接受状态集合为空。" };
        }
        for (let s of this.accept_states) {
            if (!this.states.has(s)) {
                return { valid: false, msg: `无效DFA: 接受状态 '${s}' 不在状态集合中。` };
            }
        }
        return { valid: true, msg: "DFA 解析成功且合法！" };
    }

    // 测试字符串是否被接受
    acceptString(inputStr) {
        let current = this.start_state;
        for (let i = 0; i < inputStr.length; i++) {
            let sym = inputStr[i];
            if (!this.alphabet.has(sym)) return false;
            
            let key = `${current},${sym}`;
            if (!this.transitions.has(key)) return false;
            
            current = this.transitions.get(key);
        }
        return this.accept_states.has(current);
    }

    // 生成长度 <= max_len 的所有被接受字符串
    generateStrings(maxLen) {
        const result = [];
        const queue = [{ state: this.start_state, str: "" }];

        while (queue.length > 0) {
            const current = queue.shift();
            
            if (current.str.length > maxLen) continue;

            if (this.accept_states.has(current.state)) {
                result.push(current.str === "" ? "ε (空串)" : current.str);
            }

            for (let sym of this.alphabet) {
                let key = `${current.state},${sym}`;
                if (this.transitions.has(key)) {
                    queue.push({
                        state: this.transitions.get(key),
                        str: current.str + sym
                    });
                }
            }
        }
        return result;
    }
}

// ======================== UI 交互逻辑 ========================

let currentDFA = null;
let network = null;

document.addEventListener('DOMContentLoaded', () => {
    const btnParse = document.getElementById('btn-parse-dfa');
    const inputAlphabet = document.getElementById('dfa-alphabet');
    const inputStates = document.getElementById('dfa-states');
    const inputStart = document.getElementById('dfa-start');
    const inputAccept = document.getElementById('dfa-accept');
    const inputTransitions = document.getElementById('dfa-transitions');
    const fileUpload = document.getElementById('dfa-file-upload');
    const statusDiv = document.getElementById('dfa-status');
    const testSection = document.getElementById('test-section');
    
    function populateFormFromText(text) {
        const lines = text.split('\n');
        let isTransitionSection = false;
        let transitionsText = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith("Alphabet:")) {
                isTransitionSection = false;
                inputAlphabet.value = line.substring(9).trim();
            } else if (line.startsWith("States:")) {
                isTransitionSection = false;
                inputStates.value = line.substring(7).trim();
            } else if (line.startsWith("Start:")) {
                isTransitionSection = false;
                inputStart.value = line.substring(6).trim();
            } else if (line.startsWith("Accept:")) {
                isTransitionSection = false;
                inputAccept.value = line.substring(7).trim();
            } else if (line.startsWith("Transitions:")) {
                isTransitionSection = true;
            } else if (isTransitionSection) {
                transitionsText.push(line);
            }
        }
        inputTransitions.value = transitionsText.join('\n');
    }

    // 解析并生成图
    btnParse.addEventListener('click', () => {
        const text = `Alphabet: ${inputAlphabet.value}\nStates: ${inputStates.value}\nStart: ${inputStart.value}\nAccept: ${inputAccept.value}\nTransitions:\n${inputTransitions.value}`;
        if (!inputAlphabet.value.trim() || !inputStates.value.trim()) {
            showStatus("请完善DFA定义信息", "error");
            return;
        }

        currentDFA = new DFA();
        currentDFA.parse(text);
        
        const validation = currentDFA.isValid();
        if (validation.valid) {
            showStatus(validation.msg, "success");
            testSection.classList.remove('opacity-50', 'pointer-events-none');
            drawNetwork(currentDFA);
            // 清理之前的测试结果
            document.getElementById('generate-result').classList.add('hidden');
            document.getElementById('test-str-result').classList.add('hidden');
        } else {
            showStatus(validation.msg, "error");
            testSection.classList.add('opacity-50', 'pointer-events-none');
            clearNetwork();
        }
    });

    // 文件上传处理
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            populateFormFromText(evt.target.result);
            btnParse.click(); // 自动触发解析
        };
        reader.readAsText(file);
        
        // 重置 input file 使得同名文件可以重复触发 change 事件
        e.target.value = '';
    });

    // 字符串验证测试
    document.getElementById('btn-test-str').addEventListener('click', () => {
        if (!currentDFA) return;
        const str = document.getElementById('input-test-str').value;
        const isAccepted = currentDFA.acceptString(str);
        
        const resDiv = document.getElementById('test-str-result');
        resDiv.classList.remove('hidden', 'text-emerald-700', 'text-red-600', 'bg-emerald-50', 'bg-red-50');
        
        if (isAccepted) {
            resDiv.innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i> 字符串 "${str}" <b>被接受 (ACCEPTED)</b>`;
            resDiv.classList.add('text-emerald-700', 'bg-emerald-50', 'p-3', 'rounded-lg');
        } else {
            resDiv.innerHTML = `<i class="fa-solid fa-times-circle mr-1"></i> 字符串 "${str}" <b>被拒绝 (REJECTED)</b>`;
            resDiv.classList.add('text-red-600', 'bg-red-50', 'p-3', 'rounded-lg');
        }
    });

    // 生成字符串测试
    document.getElementById('btn-generate').addEventListener('click', () => {
        if (!currentDFA) return;
        const maxLen = parseInt(document.getElementById('input-max-len').value) || 3;
        const strings = currentDFA.generateStrings(maxLen);
        
        const resDiv = document.getElementById('generate-result');
        resDiv.classList.remove('hidden');
        
        if (strings.length === 0) {
            resDiv.innerHTML = `<span class="text-slate-500">在长度 <= ${maxLen} 内未找到接受字符串。</span>`;
        } else {
            resDiv.innerHTML = `<strong>共 ${strings.length} 个结果:</strong><br/>` + strings.join('<br/>');
        }
    });
});

// 状态提示条
function showStatus(msg, type) {
    const div = document.getElementById('dfa-status');
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

// 绘制 DFA 状态转移图 (使用 vis-network)
function drawNetwork(dfa) {
    const container = document.getElementById('dfa-network');
    container.innerHTML = ''; // 清除之前的占位符内容
    
    const nodes = [];
    const edges = [];
    
    // 聚合相同的起始和目标节点之间的边
    // Map key: "from->to", value: array of symbols
    const edgeMap = new Map();
    dfa.transitions.forEach((toState, key) => {
        const [fromState, symbol] = key.split(',');
        const mapKey = `${fromState}->${toState}`;
        if (!edgeMap.has(mapKey)) {
            edgeMap.set(mapKey, []);
        }
        edgeMap.get(mapKey).push(symbol);
    });

    // 创建节点
    dfa.states.forEach(state => {
        let bgColor = '#DBEAFE'; // 默认 blue-100
        let borderWidth = 1;
        let borderColor = '#60A5FA';
        let shape = 'circle';

        // 初始状态
        if (state === dfa.start_state) {
            bgColor = '#34D399'; // emerald-400
            borderColor = '#059669';
        }
        
        // 接受状态 (双圈效果，这里用边框加粗/颜色表示)
        if (dfa.accept_states.has(state)) {
            borderWidth = 4;
            borderColor = '#818CF8'; // indigo-400
            if (state !== dfa.start_state) {
                bgColor = '#FFFFFF';
            }
        }

        nodes.push({
            id: state,
            label: state,
            shape: shape,
            color: {
                background: bgColor,
                border: borderColor,
                highlight: { background: bgColor, border: '#4F46E5' }
            },
            borderWidth: borderWidth,
            font: { size: 16, color: '#1E293B', face: 'Inter' }
        });
    });

    // 创建边
    edgeMap.forEach((symbols, mapKey) => {
        const [from, to] = mapKey.split('->');
        const label = symbols.join(', '); // 多个符号合并显示
        
        edges.push({
            from: from,
            to: to,
            label: label,
            arrows: 'to',
            font: { align: 'top', color: '#64748B', size: 12, face: 'Inter' },
            color: { color: '#94A3B8', highlight: '#6366F1' },
            smooth: { type: 'dynamic' } // 让双向边自然弯曲
        });
    });

    const data = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };

    const options = {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3,
                springLength: 150
            }
        },
        interaction: {
            hover: true,
            zoomView: true
        }
    };

    network = new vis.Network(container, data, options);
}

// 清除图形
function clearNetwork() {
    const container = document.getElementById('dfa-network');
    container.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center text-slate-400">
            <div class="text-center">
                <i class="fa-solid fa-triangle-exclamation text-4xl mb-2 text-red-300"></i>
                <p>无法渲染：DFA定义无效</p>
            </div>
        </div>
    `;
    network = null;
}
