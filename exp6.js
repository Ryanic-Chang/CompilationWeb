// exp6.js - 实验六：中间代码生成（三地址码 / 四元式）

const DEFAULT_IR_SOURCE = `int main() {
    int x;
    x = 5;  
    return 0 
   };
 main()`;

class IntermediateCodeGenerator {
    constructor() {
        this.quads = [];
        this.tempCounter = -1;
        this.labelCounter = -1;
    }

    newTemp() {
        this.tempCounter += 1;
        return `t${this.tempCounter}`;
    }

    newLabel() {
        this.labelCounter += 1;
        return `L${this.labelCounter}`;
    }

    emit(op, arg1 = "", arg2 = "", result = "") {
        this.quads.push({ op, arg1, arg2, result });
    }

    static isListNode(type) {
        return type.includes("List") || type.includes("Seq") || type === "Prog" || type === "Block";
    }

    quoteIfString(node) {
        if (node && node.node_type === "String") {
            return `"${node.value}"`;
        }
        return "";
    }

    emitArrayInit(arrayName, baseIndexNode, initListNode) {
        if (!initListNode) return;
        const baseIndex = baseIndexNode ? this.generateExpr(baseIndexNode) : "0";
        if (!initListNode.node_type.includes("List") && initListNode.node_type !== "Expr") {
            this.emit("[]=", baseIndex, this.generateExpr(initListNode), arrayName);
            return;
        }
        for (let i = 0; i < initListNode.children.length; i++) {
            const expr = initListNode.children[i];
            if (!expr) continue;
            const offset = baseIndex === "0" ? String(i) : `${baseIndex} + ${i}`;
            this.emit("[]=", offset, this.generateExpr(expr), arrayName);
        }
    }

    generateExpr(node) {
        if (!node) return "";

        if (node.node_type === "Literal" || node.node_type === "Identifier") return node.value;
        if (node.node_type === "String") return `"${node.value}"`;
        if (node.node_type === "ID") return node.value;

        if (node.node_type === "ExprStmt") {
            if (node.children.length > 0) return this.generateExpr(node.children[0]);
            return "";
        }

        if (node.node_type === "Assign") {
            const rhs = this.generateExpr(node.children[1]);
            const lhs = node.children[0].value;
            this.emit("=", rhs, "", lhs);
            return lhs;
        }

        if (node.node_type === "BinaryExpr") {
            const left = this.generateExpr(node.children[0]);
            const right = this.generateExpr(node.children[1]);
            const temp = this.newTemp();
            this.emit(node.value, left, right, temp);
            return temp;
        }

        if (node.node_type === "UnaryExpr") {
            const operand = this.generateExpr(node.children[0]);
            const temp = this.newTemp();
            const op = node.value === "-" ? "uminus" : (node.value === "+" ? "uplus" : node.value);
            this.emit(op, operand, "", temp);
            return temp;
        }

        if (node.node_type === "ArrayAccess") {
            const index = node.children.length > 0 ? this.generateExpr(node.children[0]) : "";
            const temp = this.newTemp();
            this.emit("=[]", node.value, index, temp);
            return temp;
        }

        if (node.node_type === "FuncCall") {
            let argCount = 0;
            if (node.children.length > 0 && node.children[0]) {
                for (const arg of node.children[0].children) {
                    if (!arg) continue;
                    this.emit("param", this.generateExpr(arg), "", "");
                    argCount += 1;
                }
            }
            const temp = this.newTemp();
            this.emit("call", node.value, String(argCount), temp);
            return temp;
        }

        if (node.node_type === "ArrayAssign") {
            if (node.children.length >= 2 && node.children[1] && node.children[1].node_type.includes("List")) {
                this.emitArrayInit(node.value, node.children[0], node.children[1]);
                return node.value;
            }
            const index = node.children.length > 0 ? this.generateExpr(node.children[0]) : "";
            const rhs = node.children.length > 1 ? this.generateExpr(node.children[1]) : "";
            this.emit("[]=", index, rhs, node.value);
            return node.value;
        }

        if (IntermediateCodeGenerator.isListNode(node.node_type)) {
            for (const child of node.children) {
                this.generateStmt(child);
            }
            return "";
        }

        if (node.children.length > 0) {
            if (node.children.length === 1) return this.generateExpr(node.children[0]);
            for (const child of node.children) this.generateStmt(child);
        }
        return "";
    }

    generateStmt(node) {
        if (!node) return;

        if (IntermediateCodeGenerator.isListNode(node.node_type)) {
            for (const child of node.children) this.generateStmt(child);
            return;
        }

        if (node.node_type === "VarDecl") {
            if (node.children.length >= 3 && node.children[2]) {
                if (node.children[2].node_type.includes("List")) {
                    this.emitArrayInit(node.value || node.children[1].value, null, node.children[2]);
                } else if (node.children[1]) {
                    const lhs = node.children[1].value;
                    const rhs = this.generateExpr(node.children[2]);
                    this.emit("=", rhs, "", lhs);
                }
            } else {
                for (const child of node.children) {
                    if (child && child.node_type === "InitList") {
                        this.emitArrayInit(node.value, null, child);
                    }
                }
            }
            return;
        }

        if (node.node_type === "ExprStmt") {
            if (node.children.length > 0) this.generateExpr(node.children[0]);
            return;
        }

        if (node.node_type === "Assign" || node.node_type === "ArrayAssign" || node.node_type === "FuncCall") {
            this.generateExpr(node);
            return;
        }

        if (node.node_type === "PrintStmt") {
            if (node.children.length > 0 && node.children[0].node_type === "PrintArgs") {
                for (const arg of node.children[0].children) {
                    if (!arg) continue;
                    const literal = this.quoteIfString(arg);
                    this.emit("print", literal || this.generateExpr(arg), "", "");
                }
            } else if (node.children.length > 0) {
                const literal = this.quoteIfString(node.children[0]);
                this.emit("print", literal || this.generateExpr(node.children[0]), "", "");
            }
            return;
        }

        if (node.node_type === "InputStmt") {
            if (node.children.length > 0 && node.children[0]) this.emit("input", "", "", node.children[0].value);
            return;
        }

        if (node.node_type === "Return") {
            if (node.children.length > 0 && node.children[0]) this.emit("return", this.generateExpr(node.children[0]), "", "");
            else this.emit("return", "", "", "");
            return;
        }

        if (node.node_type === "IfStmt") {
            const cond = node.children.length > 0 ? this.generateExpr(node.children[0]) : "";
            const falseLabel = this.newLabel();
            const endLabel = this.newLabel();
            this.emit("ifFalse", cond, "", falseLabel);
            if (node.children.length > 1) this.generateStmt(node.children[1]);
            if (node.children.length > 2) {
                this.emit("goto", "", "", endLabel);
                this.emit("label", "", "", falseLabel);
                this.generateStmt(node.children[2]);
                this.emit("label", "", "", endLabel);
            } else {
                this.emit("label", "", "", falseLabel);
            }
            return;
        }

        if (node.node_type === "WhileStmt") {
            const startLabel = this.newLabel();
            const endLabel = this.newLabel();
            this.emit("label", "", "", startLabel);
            const cond = node.children.length > 0 ? this.generateExpr(node.children[0]) : "";
            this.emit("ifFalse", cond, "", endLabel);
            if (node.children.length > 1) this.generateStmt(node.children[1]);
            this.emit("goto", "", "", startLabel);
            this.emit("label", "", "", endLabel);
            return;
        }

        if (node.node_type === "ForStmt") {
            if (node.children.length > 0) this.generateStmt(node.children[0]);
            const startLabel = this.newLabel();
            const endLabel = this.newLabel();
            this.emit("label", "", "", startLabel);
            if (node.children.length > 1) {
                const cond = this.generateExpr(node.children[1]);
                this.emit("ifFalse", cond, "", endLabel);
            }
            if (node.children.length > 3) this.generateStmt(node.children[3]);
            if (node.children.length > 2) this.generateStmt(node.children[2]);
            this.emit("goto", "", "", startLabel);
            this.emit("label", "", "", endLabel);
            return;
        }

        if (node.node_type === "FuncDecl") {
            const funcName = node.children.length > 1 ? node.children[1].value : "anonymous";
            this.emit("func", "", "", funcName);
            if (node.children.length > 2 && node.children[2]) {
                for (const param of node.children[2].children) {
                    if (param && param.children.length > 1) {
                        this.emit("param_def", "", "", param.children[1].value);
                    }
                }
            }
            if (node.children.length > 3) this.generateStmt(node.children[3]);
            this.emit("endfunc", "", "", funcName);
            return;
        }

        for (const child of node.children) this.generateStmt(child);
    }

    generate(root) {
        this.quads = [];
        this.tempCounter = -1;
        this.labelCounter = -1;
        this.generateStmt(root);
    }

    formatThreeAddressCode() {
        const lines = ["=== 三地址码 (Three-Address Code) ==="];
        for (const q of this.quads) {
            if (q.op === "label") lines.push(`LABEL ${q.result}:`);
            else if (q.op === "func") lines.push(`FUNC ${q.result}:`);
            else if (q.op === "endfunc") continue;
            else if (q.op === "goto") lines.push(`GOTO ${q.result}`);
            else if (q.op === "ifFalse") lines.push(`IF ${q.arg1} == false GOTO ${q.result}`);
            else if (q.op === "param") lines.push(`PARAM ${q.arg1}`);
            else if (q.op === "param_def") lines.push(`PARAM ${q.result}`);
            else if (q.op === "call") lines.push(`${q.result} = CALL ${q.arg1}, ${q.arg2}`);
            else if (q.op === "return") lines.push(q.arg1 ? `RETURN ${q.arg1}` : "RETURN");
            else if (q.op === "input") lines.push(`INPUT ${q.result}`);
            else if (q.op === "print") lines.push(`PRINT ${q.arg1}`);
            else if (q.op === "=") lines.push(`${q.result} = ${q.arg1}`);
            else if (q.op === "=[]") lines.push(`${q.result} = ${q.arg1}[${q.arg2}]`);
            else if (q.op === "[]=") lines.push(`${q.result}[${q.arg1}] = ${q.arg2}`);
            else if (q.op === "uminus") lines.push(`${q.result} = -${q.arg1}`);
            else if (q.op === "uplus") lines.push(`${q.result} = +${q.arg1}`);
            else if (!q.arg2) lines.push(`${q.result} = ${q.op} ${q.arg1}`);
            else lines.push(`${q.result} = ${q.arg1} ${q.op} ${q.arg2}`);
        }
        return lines.join("\n");
    }

    formatQuadruples() {
        const lines = ["=== 四元式 (Quadruples) ==="];
        const dash = value => value ? value : "-";

        for (const q of this.quads) {
            let arg1 = q.arg1;
            let arg2 = q.arg2;
            let result = q.result;

            if (q.op === "func" || q.op === "endfunc" || q.op === "goto" || q.op === "label" || q.op === "param_def") {
                arg1 = q.result;
                arg2 = "";
                result = "";
            } else if (q.op === "input") {
                arg1 = "";
                arg2 = "";
            } else if (q.op === "print" || q.op === "return" || q.op === "param") {
                arg2 = "";
                result = "";
            } else if (q.op === "ifFalse") {
                arg2 = "-";
            }

            lines.push(`('${q.op}', '${dash(arg1)}', '${dash(arg2)}', '${dash(result)}')`);
        }
        return lines.join("\n");
    }
}

function renderIrErrors(errors) {
    const container = document.getElementById("ir-error-list");
    if (errors.length === 0) {
        container.innerHTML = `<div class="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">未发现语义错误。</div>`;
        return;
    }
    container.innerHTML = errors.map(error => `
        <div class="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">${semanticEscapeHtml(error)}</div>
    `).join("");
}

function showIrStatus(message, type) {
    const div = document.getElementById("ir-status");
    div.classList.remove("hidden", "text-red-600", "bg-red-50", "text-emerald-700", "bg-emerald-50");
    div.classList.add("p-3", "rounded-lg", "font-medium");

    if (type === "error") {
        div.classList.add("text-red-600", "bg-red-50");
        div.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${message}`;
    } else {
        div.classList.add("text-emerald-700", "bg-emerald-50");
        div.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> ${message}`;
    }
}

function buildIrReport(astText, errors, tacText, quadText) {
    const lines = [];
    lines.push("=== AST ===");
    lines.push(astText || "无");
    lines.push("");
    lines.push("=== 语义错误报告 ===");
    if (errors.length === 0) lines.push("无");
    else lines.push(...errors);
    lines.push("");
    lines.push(tacText);
    lines.push("");
    lines.push(quadText);
    return lines.join("\n");
}

let irNetwork = null;
let currentIrReport = "";

function drawIrAst(root) {
    const container = document.getElementById("ir-network");
    if (!container) return;

    if (irNetwork) {
        irNetwork.destroy();
        irNetwork = null;
    }

    if (!root) {
        container.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-slate-400"><div class="text-center"><i class="fa-solid fa-diagram-project text-4xl mb-2"></i><p>运行实验后显示 AST 图</p></div></div>`;
        return;
    }

    container.innerHTML = "";
    const nodes = [];
    const edges = [];
    let nextId = 0;

    function walk(node, parentId = null) {
        const id = nextId++;
        let label = node.node_type;
        if (node.value) label += `\n${node.value}`;
        if (node.data_type) label += `\n[${node.data_type}]`;
        nodes.push({
            id,
            label,
            shape: "box",
            color: { background: "#F8FAFC", border: "#CBD5E1" },
            font: {
                color: "#334155",
                size: 13,
                face: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                align: "center"
            },
            borderWidth: 2
        });
        if (parentId !== null) {
            edges.push({
                from: parentId,
                to: id,
                arrows: "to",
                color: { color: "#94A3B8" }
            });
        }
        for (const child of node.children) {
            walk(child, id);
        }
    }

    walk(root);

    irNetwork = new vis.Network(container, {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    }, {
        physics: false,
        layout: {
            hierarchical: {
                enabled: true,
                direction: "UD",
                sortMethod: "directed",
                nodeSpacing: 110,
                levelSeparation: 90
            }
        },
        interaction: { dragNodes: true },
        edges: { smooth: { type: "cubicBezier", roundness: 0.35 } }
    });
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", async () => {
        const grammarInput = document.getElementById("ir-grammar-input");
        const sourceInput = document.getElementById("ir-source-input");
        const grammarUpload = document.getElementById("ir-grammar-upload");
        const sourceUpload = document.getElementById("ir-source-upload");
        const btnRun = document.getElementById("btn-run-ir");
        const btnDownload = document.getElementById("btn-download-ir");
        const tabBtns = document.querySelectorAll(".ir-tab-btn");
        const tabPanes = document.querySelectorAll(".ir-tab-pane");

        if (!grammarInput || !sourceInput || !btnRun) return;

        grammarInput.value = await loadDefaultSemanticGrammar();
        sourceInput.value = DEFAULT_IR_SOURCE;

        grammarUpload.addEventListener("change", event => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                grammarInput.value = e.target.result;
            };
            reader.readAsText(file);
            event.target.value = "";
        });

        sourceUpload.addEventListener("change", event => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                sourceInput.value = e.target.result;
            };
            reader.readAsText(file);
            event.target.value = "";
        });

        btnDownload.addEventListener("click", () => {
            if (!currentIrReport) return;
            const blob = new Blob([currentIrReport], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "intermediate_code.txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                tabBtns.forEach(b => {
                    b.classList.remove("active", "text-indigo-600", "border-indigo-600", "bg-white");
                    b.classList.add("text-slate-500", "hover:text-slate-700", "hover:bg-slate-100", "border-transparent");
                });
                tabPanes.forEach(pane => pane.classList.add("hidden"));

                btn.classList.remove("text-slate-500", "hover:text-slate-700", "hover:bg-slate-100", "border-transparent");
                btn.classList.add("active", "text-indigo-600", "border-indigo-600", "bg-white");

                const targetId = btn.getAttribute("data-target");
                const targetPane = document.getElementById(targetId);
                if (targetPane) targetPane.classList.remove("hidden");
                if (targetId === "ir-result-ast" && irNetwork) {
                    irNetwork.fit();
                }
            });
        });

        btnRun.addEventListener("click", () => {
            const grammarText = grammarInput.value.trim();
            const sourceText = sourceInput.value.trim();

            if (!grammarText) {
                showIrStatus("请提供 mainGGG 文法。", "error");
                return;
            }
            if (!sourceText) {
                showIrStatus("请提供待分析源代码。", "error");
                return;
            }

            try {
                const { productions, startSymbol } = parseSemanticGrammar(grammarText);
                if (productions.length === 0) {
                    throw new Error("未能从 mainGGG 文法中解析出有效产生式。");
                }

                const generator = new SLR1ParserGenerator(productions, startSymbol);
                generator.buildCanonicalCollection();

                const scanner = new Scanner(sourceText);
                const rawTokens = scanner.getAllTokens();
                const unknownTokens = rawTokens.filter(token => token.type === TokenType.UNKNOWN);
                if (unknownTokens.length > 0) {
                    throw new Error(`词法分析发现无法识别的字符：${unknownTokens.map(token => `${token.value}(第${token.line}行)`).join("，")}`);
                }

                const parserTokens = rawTokens.map(mapScannerTokenToParserToken);
                parserTokens.push({ type: "$", value: "$", line: rawTokens.length > 0 ? rawTokens[rawTokens.length - 1].line : 1 });

                const frontend = new CompilerFrontend(generator);
                const result = frontend.parse(parserTokens);
                const astText = result.root ? semanticAstToText(result.root) : "未生成 AST。";

                const icg = new IntermediateCodeGenerator();
                icg.generate(result.root);
                const tacText = icg.formatThreeAddressCode();
                const quadText = icg.formatQuadruples();

                drawIrAst(result.root);
                document.getElementById("ir-tac-output").textContent = tacText;
                document.getElementById("ir-quad-output").textContent = quadText;
                renderIrErrors(result.semanticErrors);

                currentIrReport = buildIrReport(astText, result.semanticErrors, tacText, quadText);
                btnDownload.classList.remove("opacity-50", "pointer-events-none");
                btnDownload.removeAttribute("disabled");

                if (result.semanticErrors.length > 0) {
                    showIrStatus(`中间代码已生成，但检测到 ${result.semanticErrors.length} 条语义问题。`, "error");
                } else {
                    showIrStatus("实验六运行成功，已生成 AST、语义错误报告、三地址码和四元式。", "success");
                }
            } catch (error) {
                drawIrAst(null);
                document.getElementById("ir-tac-output").textContent = "未生成三地址码。";
                document.getElementById("ir-quad-output").textContent = "未生成四元式。";
                renderIrErrors([error.message]);
                showIrStatus(error.message, "error");
                console.error(error);
            }
        });

        drawIrAst(null);
    });
}
