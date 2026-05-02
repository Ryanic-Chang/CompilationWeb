// scanner.js - 词法分析器 (Scanner) 核心逻辑与页面交互

// Token类型枚举模拟
const TokenType = {
    // 标识符和字面量
    ID: "ID",             // 标识符
    INT: "INT",           // 整数
    FLO: "FLO",           // 浮点数
    STRING_LIT: "STRING_LIT", // 字符串字面量
    
    // 算术运算符 o
    ADD: "ADD",           // +
    SUB: "SUB",           // -
    MUL: "MUL",           // *
    DIV: "DIV",           // /
    AAA: "AAA",           // ++
    AAS: "AAS",           // +=
    
    // 关系运算符 r
    LT: "LT",             // <
    GT: "GT",             // >
    EQ: "EQ",             // ==
    LE: "LE",             // <=
    GE: "GE",             // >=
    NE: "NE",             // !=
    
    // 逻辑运算符 (BOP)
    AND: "AND",           // &&
    OR: "OR",             // ||
    NOT: "NOT",           // !
    
    // 赋值
    ASG: "ASG",           // =
    
    // 分隔符
    LPA: "LPA",           // (
    RPA: "RPA",           // )
    LBK: "LBK",           // [
    RBK: "RBK",           // ]
    LBR: "LBR",           // {
    RBR: "RBR",           // }
    CMA: "CMA",           // ,
    SCO: "SCO",           // ;
    
    // 关键字
    INT_KW: "INT_KW",     // int
    FLOAT_KW: "FLOAT_KW", // float
    IF_KW: "IF_KW",       // if
    ELSE_KW: "ELSE_KW",   // else
    WHILE_KW: "WHILE_KW", // while
    RETURN_KW: "RETURN_KW",// return
    INPUT_KW: "INPUT_KW", // input
    PRINT_KW: "PRINT_KW", // print
    VOID_KW: "VOID_KW",   // void
    
    // 特殊标记
    END_OF_FILE: "EOF",
    UNKNOWN: "UNKNOWN"
};

const Keywords = {
    "int": TokenType.INT_KW,
    "float": TokenType.FLOAT_KW,
    "if": TokenType.IF_KW,
    "else": TokenType.ELSE_KW,
    "while": TokenType.WHILE_KW,
    "return": TokenType.RETURN_KW,
    "input": TokenType.INPUT_KW,
    "print": TokenType.PRINT_KW,
    "void": TokenType.VOID_KW
};

class Token {
    constructor(type, value, line) {
        this.type = type;
        this.value = value;
        this.line = line;
    }
}

class Scanner {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.currentLine = 1;
        this.currentChar = this.input.length > 0 ? this.input[0] : '\0';
        this.lastToken = null; // 用于跟踪上一个 token 的上下文
    }

    advance() {
        this.pos++;
        if (this.pos < this.input.length) {
            this.currentChar = this.input[this.pos];
        } else {
            this.currentChar = '\0';
        }
    }

    peek() {
        if (this.pos + 1 < this.input.length) {
            return this.input[this.pos + 1];
        }
        return '\0';
    }

    skipWhitespace() {
        while (this.currentChar !== '\0' && /\s/.test(this.currentChar)) {
            if (this.currentChar === '\n') {
                this.currentLine++;
            }
            this.advance();
        }
    }

    skipComment() {
        if (this.currentChar === '/' && this.peek() === '/') {
            while (this.currentChar !== '\n' && this.currentChar !== '\0') {
                this.advance();
            }
            if (this.currentChar === '\n') {
                this.currentLine++;
                this.advance();
            }
        } else if (this.currentChar === '/' && this.peek() === '*') {
            this.advance(); 
            this.advance(); // 跳过 /*
            while (!(this.currentChar === '*' && this.peek() === '/') && this.currentChar !== '\0') {
                if (this.currentChar === '\n') this.currentLine++;
                this.advance();
            }
            if (this.currentChar === '*' && this.peek() === '/') {
                this.advance(); 
                this.advance(); // 跳过 */
            } else {
                throw new Error(`未闭合的多行注释 at line ${this.currentLine}`);
            }
        }
    }

    scanIdOrKeyword() {
        let value = "";
        let startLine = this.currentLine;

        // ID = [a-zA-Z_][a-zA-Z0-9_]*
        if (/[a-zA-Z_]/.test(this.currentChar)) {
            value += this.currentChar;
            this.advance();
            
            while (/[a-zA-Z0-9_]/.test(this.currentChar)) {
                value += this.currentChar;
                this.advance();
            }
        }

        if (Keywords[value]) {
            return new Token(Keywords[value], value, startLine);
        }

        return new Token(TokenType.ID, value, startLine);
    }

    scanNumber() {
        let value = "";
        let startLine = this.currentLine;
        let isFloat = false;

        // 如果是符号（+或-），只在后面跟着数字，或者后面跟着小数点且再后面是数字时，才被视为数字的一部分
        if (this.currentChar === '+' || this.currentChar === '-') {
            let nextChar = this.peek();
            // 如果加减号后直接是数字，或者加减号后是小数点且再后是数字
            if (/\d/.test(nextChar) || (nextChar === '.' && /\d/.test(this.input[this.pos + 2]))) {
                value += this.currentChar;
                this.advance();
            } else {
                // 如果后面不是数字结构，则说明它应该是一个运算符，而不是正负号，退回给运算符处理
                return null;
            }
        }

        while (/\d/.test(this.currentChar)) {
            value += this.currentChar;
            this.advance();
        }

        if (this.currentChar === '.') {
            isFloat = true;
            value += this.currentChar;
            this.advance();
            
            while (/\d/.test(this.currentChar)) {
                value += this.currentChar;
                this.advance();
            }
        }

        return new Token(isFloat ? TokenType.FLO : TokenType.INT, value, startLine);
    }

    scanString() {
        let value = "";
        let startLine = this.currentLine;
        this.advance(); // 跳过起始引号

        while (this.currentChar !== '"' && this.currentChar !== '\0') {
            if (this.currentChar === '\\') {
                this.advance();
                switch (this.currentChar) {
                    case 'n': value += '\n'; break;
                    case 't': value += '\t'; break;
                    case '"': value += '"'; break;
                    case '\\': value += '\\'; break;
                    default: value += this.currentChar; break;
                }
            } else {
                value += this.currentChar;
            }
            if (this.currentChar === '\n') this.currentLine++;
            this.advance();
        }

        if (this.currentChar === '"') {
            this.advance(); // 跳过结束引号
            return new Token(TokenType.STRING_LIT, value, startLine);
        } else {
            throw new Error(`Unclosed string at line ${startLine}`);
        }
    }

    scanOperator() {
        let startLine = this.currentLine;
        let char = this.currentChar;
        
        switch (char) {
            case '+':
                this.advance();
                if (this.currentChar === '+') {
                    this.advance();
                    return new Token(TokenType.AAA, "++", startLine);
                } else if (this.currentChar === '=') {
                    this.advance();
                    return new Token(TokenType.AAS, "+=", startLine);
                }
                return new Token(TokenType.ADD, "+", startLine);
            case '-':
                this.advance();
                return new Token(TokenType.SUB, "-", startLine);
            case '*':
                this.advance();
                return new Token(TokenType.MUL, "*", startLine);
            case '/':
                this.advance();
                return new Token(TokenType.DIV, "/", startLine);
            case '=':
                this.advance();
                if (this.currentChar === '=') {
                    this.advance();
                    return new Token(TokenType.EQ, "==", startLine);
                }
                return new Token(TokenType.ASG, "=", startLine);
            case '<':
                this.advance();
                if (this.currentChar === '=') {
                    this.advance();
                    return new Token(TokenType.LE, "<=", startLine);
                }
                return new Token(TokenType.LT, "<", startLine);
            case '>':
                this.advance();
                if (this.currentChar === '=') {
                    this.advance();
                    return new Token(TokenType.GE, ">=", startLine);
                }
                return new Token(TokenType.GT, ">", startLine);
            case '!':
                this.advance();
                if (this.currentChar === '=') {
                    this.advance();
                    return new Token(TokenType.NE, "!=", startLine);
                }
                return new Token(TokenType.NOT, "!", startLine);
            case '&':
                this.advance();
                if (this.currentChar === '&') {
                    this.advance();
                    return new Token(TokenType.AND, "&&", startLine);
                }
                return new Token(TokenType.UNKNOWN, "&", startLine);
            case '|':
                this.advance();
                if (this.currentChar === '|') {
                    this.advance();
                    return new Token(TokenType.OR, "||", startLine);
                }
                return new Token(TokenType.UNKNOWN, "|", startLine);
            case '(':
                this.advance();
                return new Token(TokenType.LPA, "(", startLine);
            case ')':
                this.advance();
                return new Token(TokenType.RPA, ")", startLine);
            case '[':
                this.advance();
                return new Token(TokenType.LBK, "[", startLine);
            case ']':
                this.advance();
                return new Token(TokenType.RBK, "]", startLine);
            case '{':
                this.advance();
                return new Token(TokenType.LBR, "{", startLine);
            case '}':
                this.advance();
                return new Token(TokenType.RBR, "}", startLine);
            case ',':
                this.advance();
                return new Token(TokenType.CMA, ",", startLine);
            case ';':
                this.advance();
                return new Token(TokenType.SCO, ";", startLine);
        }
        return new Token(TokenType.UNKNOWN, "", startLine);
    }

    getNextToken() {
        const token = this._scanNextToken();
        // 记录非空 token 以便提供上下文
        if (token && token.type !== TokenType.END_OF_FILE) {
            this.lastToken = token;
        }
        return token;
    }

    _scanNextToken() {
        while (this.currentChar !== '\0') {
            if (/\s/.test(this.currentChar)) {
                this.skipWhitespace();
                continue;
            }

            if (this.currentChar === '/') {
                let next = this.peek();
                if (next === '/' || next === '*') {
                    this.skipComment();
                    continue;
                }
            }

            if (this.currentChar === '"') {
                return this.scanString();
            }

            if (/[a-zA-Z_]/.test(this.currentChar)) {
                return this.scanIdOrKeyword();
            }

            if (/\d/.test(this.currentChar) || 
               ((this.currentChar === '+' || this.currentChar === '-') && /\d/.test(this.peek()))) {
                
                let isOperator = false;
                // 判断正负号是否作为二元运算符存在 (通过前文上下文判断)
                if (this.currentChar === '+' || this.currentChar === '-') {
                    if (this.lastToken) {
                        const t = this.lastToken.type;
                        // 如果前一个 token 是标识符、数字、右括号或右方括号，说明当前应当是二元运算符 (+ 或 -)
                        if (t === TokenType.ID || t === TokenType.INT || t === TokenType.FLO || 
                            t === TokenType.RPA || t === TokenType.RBK) {
                            isOperator = true;
                        }
                    }
                }
                
                if (!isOperator) {
                    let numToken = this.scanNumber();
                    if (numToken) return numToken;
                }
            }

            let opToken = this.scanOperator();
            if (opToken.type !== TokenType.UNKNOWN && opToken.value !== "") {
                return opToken;
            }

            let unknown = this.currentChar;
            this.advance();
            return new Token(TokenType.UNKNOWN, unknown, this.currentLine);
        }
        return new Token(TokenType.END_OF_FILE, "", this.currentLine);
    }

    getAllTokens() {
        let tokens = [];
        this.lastToken = null; // 重置上下文
        let token = this.getNextToken();
        while (token.type !== TokenType.END_OF_FILE) {
            tokens.push(token);
            token = this.getNextToken();
        }
        return tokens;
    }
}

// ======================== UI 交互逻辑 ========================

let scannerNetwork = null;
let currentTokens = [];

document.addEventListener('DOMContentLoaded', () => {
    const btnRunScanner = document.getElementById('btn-run-scanner');
    const inputCode = document.getElementById('scanner-input');
    const fileUpload = document.getElementById('scanner-file-upload');
    const tokensBody = document.getElementById('scanner-tokens-body');
    const statusDiv = document.getElementById('scanner-status');
    const btnDownload = document.getElementById('btn-download-tokens');
    const tabBtns = document.querySelectorAll('.scanner-tab-btn');
    const tabPanes = document.querySelectorAll('.scanner-tab-pane');

    // 文件上传处理
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            inputCode.value = evt.target.result;
            btnRunScanner.click(); // 自动触发分析
        };
        reader.readAsText(file);
        
        // 重置 input file
        e.target.value = '';
    });

    // 下载结果处理
    btnDownload.addEventListener('click', () => {
        if (currentTokens.length === 0) return;
        
        let content = "";
        currentTokens.forEach(t => {
            content += `(${t.type}, ${t.value}, ${t.line})\n`;
        });
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tokens.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 标签页切换逻辑
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有的 active
            tabBtns.forEach(b => {
                b.classList.remove('active', 'text-indigo-600', 'border-indigo-600', 'bg-white');
                b.classList.add('text-slate-500', 'hover:text-slate-700', 'hover:bg-slate-100', 'border-transparent');
            });
            tabPanes.forEach(p => p.classList.add('hidden'));

            // 激活当前
            btn.classList.remove('text-slate-500', 'hover:text-slate-700', 'hover:bg-slate-100', 'border-transparent');
            btn.classList.add('active', 'text-indigo-600', 'border-indigo-600', 'bg-white');
            
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');

            // 如果切换到 DFA 图，重新适应大小
            if (targetId === 'scanner-result-dfa' && scannerNetwork) {
                scannerNetwork.fit();
            }
        });
    });

    // 词法分析执行逻辑
    btnRunScanner.addEventListener('click', () => {
        const code = inputCode.value;
        if (!code.trim()) {
            showScannerStatus("请输入要分析的源代码", "error");
            return;
        }

        try {
            const scanner = new Scanner(code);
            currentTokens = scanner.getAllTokens();
            
            // 渲染 Tokens
            tokensBody.innerHTML = '';
            currentTokens.forEach((t, idx) => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition-colors";
                
                // 类别颜色高亮
                let typeColor = "text-slate-600";
                if (t.type.includes("KW")) typeColor = "text-purple-600 font-semibold";
                else if (t.type === "ID") typeColor = "text-blue-600 font-medium";
                else if (t.type === "INT" || t.type === "FLO") typeColor = "text-emerald-600";
                else if (t.type === "STRING_LIT") typeColor = "text-amber-600";
                else if (t.type === "UNKNOWN") typeColor = "text-red-600 font-bold bg-red-100 px-1 rounded";

                tr.innerHTML = `
                    <td class="py-2 px-4 border-b border-slate-100 text-slate-400">${idx + 1}</td>
                    <td class="py-2 px-4 border-b border-slate-100 ${typeColor}">${t.type}</td>
                    <td class="py-2 px-4 border-b border-slate-100 font-mono text-slate-700">${t.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
                    <td class="py-2 px-4 border-b border-slate-100 text-slate-500">${t.line}</td>
                `;
                tokensBody.appendChild(tr);
            });

            showScannerStatus(`分析成功！共生成 ${currentTokens.length} 个 Token。`, "success");
            btnDownload.classList.remove('opacity-50', 'pointer-events-none');
            btnDownload.removeAttribute('disabled');

        } catch (e) {
            showScannerStatus(e.message, "error");
        }
    });

    // 初始渲染 DFA 图和转换表
    drawScannerNetwork();
    fillTransitionTable();
});

function showScannerStatus(msg, type) {
    const div = document.getElementById('scanner-status');
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

// 绘制词法分析的综合 DFA 图
function drawScannerNetwork() {
    const container = document.getElementById('scanner-network');
    const nodes = [
        { id: 0, label: "0\n(Start)", shape: "circle", color: { background: '#34D399', border: '#059669' }, font: { size: 14, color: '#fff' } },
        { id: 1, label: "1\n(处理 ID/KW)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 2, label: "2\n(处理 INT)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 3, label: "3\n(处理 +/-)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 4, label: "4\n(处理 .)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 5, label: "5\n(处理 String)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 6, label: "6\n(接受 STRING)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 7, label: "7\n(处理 =|<|>|!)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 8, label: "8\n(接受 双字符关系)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 9, label: "9\n(处理 /)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 10, label: "10\n(单行注释)", shape: "circle", color: { background: '#F1F5F9', border: '#94A3B8' }, font: { color: '#64748B' } },
        { id: 11, label: "11\n(多行注释)", shape: "circle", color: { background: '#F1F5F9', border: '#94A3B8' }, font: { color: '#64748B' } },
        { id: 12, label: "12\n(多行结束 *)", shape: "circle", color: { background: '#F1F5F9', border: '#94A3B8' }, font: { color: '#64748B' } },
        { id: 13, label: "13\n(接受 分隔/乘)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 14, label: "14\n(回退 接受ID/KW)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 15, label: "15\n(处理 FLO)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 16, label: "16\n(回退 接受INT)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 17, label: "17\n(回退 接受+/-)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 18, label: "18\n(处理 转义)", shape: "circle", color: { background: '#DBEAFE', border: '#60A5FA' } },
        { id: 19, label: "19\n(回退 接受单字符关系)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 20, label: "20\n(回退 接受DIV)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } },
        { id: 21, label: "21\n(错误)", shape: "circle", borderWidth: 3, color: { background: '#FEF2F2', border: '#EF4444' }, font: { color: '#B91C1C' } },
        { id: 22, label: "22\n(回退 接受FLO)", shape: "circle", borderWidth: 3, color: { background: '#EEF2FF', border: '#4F46E5' } }
    ];

    const edges = [
        { from: 0, to: 1, label: "字母", arrows: "to" },
        { from: 0, to: 2, label: "数字", arrows: "to" },
        { from: 0, to: 3, label: "+|-", arrows: "to" },
        { from: 0, to: 4, label: ".", arrows: "to" },
        { from: 0, to: 5, label: "\"", arrows: "to" },
        { from: 0, to: 7, label: "=| < | > |!", arrows: "to" },
        { from: 0, to: 9, label: "/", arrows: "to" },
        { from: 0, to: 13, label: "分隔符|*", arrows: "to" },
        
        { from: 1, to: 1, label: "字母|数字", arrows: "to" },
        { from: 1, to: 14, label: "其他", arrows: "to" },
        
        { from: 2, to: 2, label: "数字", arrows: "to" },
        { from: 2, to: 15, label: ".", arrows: "to" },
        { from: 2, to: 16, label: "其他", arrows: "to" },
        
        { from: 3, to: 2, label: "数字", arrows: "to" },
        { from: 3, to: 15, label: ".", arrows: "to" },
        { from: 3, to: 17, label: "其他", arrows: "to" },
        
        { from: 4, to: 15, label: "数字", arrows: "to" },
        { from: 4, to: 21, label: "其他", arrows: "to" },
        
        { from: 5, to: 6, label: "\"", arrows: "to" },
        { from: 5, to: 18, label: "\\(转义)", arrows: "to" },
        { from: 5, to: 5, label: "任意字符", arrows: "to" },
        
        { from: 7, to: 8, label: "=", arrows: "to" },
        { from: 7, to: 19, label: "其他", arrows: "to" },
        
        { from: 9, to: 10, label: "/", arrows: "to" },
        { from: 9, to: 11, label: "*", arrows: "to" },
        { from: 9, to: 20, label: "其他", arrows: "to" },
        
        { from: 10, to: 0, label: "\\n", arrows: "to" },
        { from: 10, to: 10, label: "其他", arrows: "to" },
        
        { from: 11, to: 12, label: "*", arrows: "to" },
        { from: 11, to: 11, label: "其他", arrows: "to" },
        
        { from: 12, to: 0, label: "/", arrows: "to" },
        { from: 12, to: 12, label: "*", arrows: "to" },
        { from: 12, to: 11, label: "其他", arrows: "to" },
        
        { from: 15, to: 15, label: "数字", arrows: "to" },
        { from: 15, to: 22, label: "其他", arrows: "to" },
        
        { from: 18, to: 5, label: "任意字符", arrows: "to" }
    ];

    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
        physics: { enabled: true, barnesHut: { springLength: 150, gravitationalConstant: -3000 } },
        edges: { font: { align: 'top', color: '#64748B', size: 10 }, color: { color: '#94A3B8' }, smooth: { type: 'dynamic' } },
        layout: { improvedLayout: true }
    };
    
    scannerNetwork = new vis.Network(container, data, options);
}

// 填充状态转换表
function fillTransitionTable() {
    const tbody = document.getElementById('scanner-transition-body');
    const transitions = [
        { id: 0, desc: "初始状态 (Start)", accept: false, action: "读取字符并分发", data: ["S1", "S2", "S3", "S4", "S5", "S7", "", "S9", "S13", "S13", "", "", "S0", "", "S21"] },
        { id: 1, desc: "处理标识符/关键字", accept: false, action: "拼接字符", data: ["S1", "S1", "", "", "", "", "", "", "", "", "", "", "", "", "S14"] },
        { id: 2, desc: "处理整数", accept: false, action: "拼接数字", data: ["", "S2", "", "S15", "", "", "", "", "", "", "", "", "", "", "S16"] },
        { id: 3, desc: "处理正负号", accept: false, action: "判断数字/小数", data: ["", "S2", "", "S15", "", "", "", "", "", "", "", "", "", "", "S17"] },
        { id: 4, desc: "处理前导小数点", accept: false, action: "判断小数", data: ["", "S15", "", "", "", "", "", "", "", "", "", "", "", "", "S21"] },
        { id: 5, desc: "处理字符串", accept: false, action: "拼接字符", data: ["", "", "", "", "S6", "", "", "", "", "", "", "S18", "", "S5", ""] },
        { id: 6, desc: "接受字符串", accept: true, action: "生成 STRING_LIT", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 7, desc: "关系/赋值前缀", accept: false, action: "判断是否双字符", data: ["", "", "", "", "", "", "S8", "", "", "", "", "", "", "", "S19"] },
        { id: 8, desc: "接受双字符运算符", accept: true, action: "生成 EQ/LE/GE/NE", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 9, desc: "处理斜杠", accept: false, action: "判断注释或除号", data: ["", "", "", "", "", "", "", "S10", "S11", "", "", "", "", "", "S20"] },
        { id: 10, desc: "单行注释", accept: false, action: "跳过字符", data: ["", "", "", "", "", "", "", "", "", "", "S0", "", "", "", "S10"] },
        { id: 11, desc: "多行注释", accept: false, action: "跳过字符", data: ["", "", "", "", "", "", "", "", "S12", "", "", "", "", "S11", ""] },
        { id: 12, desc: "多行注释-星号", accept: false, action: "判断注释结束", data: ["", "", "", "", "", "", "", "S0", "S12", "", "", "", "", "S11", ""] },
        { id: 13, desc: "单字符分隔符/乘号", accept: true, action: "生成 单字符Token", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 14, desc: "接受标识符", accept: true, action: "回退, 查表生成 ID/KW", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 15, desc: "处理浮点数", accept: false, action: "拼接小数", data: ["", "S15", "", "", "", "", "", "", "", "", "", "", "", "", "S22"] },
        { id: 16, desc: "接受整数", accept: true, action: "回退, 生成 INT", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 17, desc: "接受加减号", accept: true, action: "回退, 生成 ADD/SUB", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 18, desc: "字符串转义", accept: false, action: "转义处理", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "S5", ""] },
        { id: 19, desc: "接受单字符关系符", accept: true, action: "回退, 生成 ASG/LT/GT", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 20, desc: "接受除号", accept: true, action: "回退, 生成 DIV", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 21, desc: "错误处理", accept: true, action: "生成 UNKNOWN", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] },
        { id: 22, desc: "接受浮点数", accept: true, action: "回退, 生成 FLO", data: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] }
    ];

    transitions.forEach(tr => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors";
        
        let stateHtml = `<span class="font-medium text-slate-700">${tr.id}</span>`;
        if (tr.accept) {
            stateHtml = `<span class="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200">${tr.id} (接受)</span>`;
        } else if (tr.id === 0) {
            stateHtml = `<span class="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">${tr.id} (开始)</span>`;
        }
        
        // 动态生成剩余列 (共15列)
        let colsHtml = tr.data.map(val => `<td class="py-2 px-3 border-b border-slate-100 text-slate-600">${val}</td>`).join('');
        
        row.innerHTML = `
            <td class="py-2 px-3 border-b border-slate-100">${stateHtml}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-500 text-xs">${tr.desc}<br/><span class="text-indigo-400 font-mono">${tr.action}</span></td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600 border-l">${tr.data[0]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[1]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[2]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[3]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[4]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[5]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[6]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[7]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[8]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[9]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[10]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[11]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[12]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[13]}</td>
            <td class="py-2 px-3 border-b border-slate-100 text-slate-600">${tr.data[14]}</td>
        `;
        tbody.appendChild(row);
    });
}