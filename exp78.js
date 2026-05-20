// exp78.js - 实验七&八：内存地址映射与目标代码生成

const DEFAULT_BACKEND_SOURCE = `int main(){
    int a = 1;
    int b = 2;
    int c = 1+2*3+(4+5)*6;
    if(a+b<c){
        a = a + b;
        b = b + a;
    }
    else{
        c = 1000;
    }
    print(a);
    print(b);
    print(c);
    return 0;
}`;

const DEFAULT_RUNTIME_SOURCE = `#include <stdio.h>

void print_int(int x) {
    printf("%d\\n", x);
}

void print_string(const char* s) {
    printf("%s", s);
}

int input_int() {
    int x = 0;
    scanf("%d", &x);
    return x;
}`;

function stripFileExtension(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "") || "test";
}

function backendEscapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function isTemporaryName(value) {
    return /^t\d+$/.test(value || "");
}

function isIntegerLiteral(value) {
    return /^[+-]?\d+$/.test(value || "");
}

function isFloatLiteralText(value) {
    return /^[+-]?\d+\.\d+$/.test(value || "");
}

function isNumericLiteral(value) {
    return isIntegerLiteral(value) || isFloatLiteralText(value);
}

function isStringLiteralText(value) {
    return typeof value === "string" && value.length >= 2 && value.startsWith("\"") && value.endsWith("\"");
}

function alignTo(value, alignment) {
    if (alignment <= 0) return value;
    const remainder = value % alignment;
    return remainder === 0 ? value : value + (alignment - remainder);
}

function formatSignedOffset(offset) {
    if (offset === 0) return "";
    return offset > 0 ? `+${offset}` : String(offset);
}

function escapeAsmString(text) {
    return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\r/g, "");
}

function normalizeNumberLiteral(value) {
    if (isIntegerLiteral(value)) return value;
    if (!isFloatLiteralText(value)) return value;
    let normalized = Number(value).toFixed(6);
    normalized = normalized.replace(/0+$/, "").replace(/\.$/, "");
    return normalized || "0";
}

function buildBackendIrReport(tacText, quadText, optimizedText) {
    return [
        "三地址码:",
        tacText || "无",
        "",
        "四元式:",
        quadText || "无",
        "",
        optimizedText || "无"
    ].join("\n");
}

function buildRuntimeArtifact(baseName, runtimeSource) {
    return [
        "/*",
        ` * 配套运行时文件：${baseName}_runtime.c`,
        ` * 与 ${baseName}_x86.s / ${baseName}_arm64.s 一起使用。`,
        " *",
        " * 示例命令：",
        ` *   gcc -m32 ${baseName}_x86.s ${baseName}_runtime.c -o ${baseName}_x86`,
        ` *   aarch64-linux-gnu-gcc ${baseName}_arm64.s ${baseName}_runtime.c -o ${baseName}_arm64`,
        " */",
        "",
        runtimeSource
    ].join("\n");
}

function decorateAssembly(asmText, arch, baseName) {
    const comment = arch === "x86" ? ";" : "//";
    return [
        `${comment} 输出文件：${baseName}_${arch}.s`,
        `${comment} 配套运行时：${baseName}_runtime.c`,
        `${comment} 建议同时下载 runtime.c，避免手动补齐 print_int / print_string / input_int`,
        "",
        asmText
    ].join("\n");
}

async function loadDefaultRuntimeSource() {
    try {
        const response = await fetch("runtime.c");
        if (!response.ok) throw new Error("加载 runtime.c 失败");
        return await response.text();
    } catch (_) {
        return DEFAULT_RUNTIME_SOURCE;
    }
}

class BackendSimpleOptimizer {
    static isFoldableBinaryOp(op) {
        return new Set(["+", "-", "*", "/", "<", ">", "<=", ">=", "==", "!=", "&&", "||"]).has(op);
    }

    static foldBinary(quad) {
        if (!isNumericLiteral(quad.arg1) || !isNumericLiteral(quad.arg2)) return "";

        const lhs = Number(quad.arg1);
        const rhs = Number(quad.arg2);
        let result = 0;
        let isBool = false;

        if (quad.op === "+") result = lhs + rhs;
        else if (quad.op === "-") result = lhs - rhs;
        else if (quad.op === "*") result = lhs * rhs;
        else if (quad.op === "/") {
            if (rhs === 0) return "";
            result = lhs / rhs;
        } else if (quad.op === "<") {
            result = lhs < rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === ">") {
            result = lhs > rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === "<=") {
            result = lhs <= rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === ">=") {
            result = lhs >= rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === "==") {
            result = lhs === rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === "!=") {
            result = lhs !== rhs ? 1 : 0;
            isBool = true;
        } else if (quad.op === "&&") {
            result = lhs !== 0 && rhs !== 0 ? 1 : 0;
            isBool = true;
        } else if (quad.op === "||") {
            result = lhs !== 0 || rhs !== 0 ? 1 : 0;
            isBool = true;
        } else {
            return "";
        }

        if (isBool || (Number.isInteger(result) && isIntegerLiteral(quad.arg1) && isIntegerLiteral(quad.arg2))) {
            return String(result);
        }
        return normalizeNumberLiteral(String(result));
    }

    optimize(input) {
        const optimized = [];
        for (let i = 0; i < input.length; i += 1) {
            let quad = { ...input[i] };

            if (BackendSimpleOptimizer.isFoldableBinaryOp(quad.op)) {
                const folded = BackendSimpleOptimizer.foldBinary(quad);
                if (folded) {
                    quad = { op: "=", arg1: folded, arg2: "", result: quad.result };
                }
            }

            if (quad.op === "goto" && i + 1 < input.length && input[i + 1].op === "label" && quad.result === input[i + 1].result) {
                continue;
            }

            optimized.push(quad);
        }
        return optimized;
    }

    formatOptimizedQuadruples(quads) {
        const lines = ["优化后四元式:"];
        for (const quad of quads) {
            lines.push(`(${quad.op}, ${quad.arg1 || "-"}, ${quad.arg2 || "-"}, ${quad.result || "-"})`);
        }
        return lines.join("\n");
    }
}

class BackendMemoryLayout {
    constructor() {
        this.globals = [];
        this.globalEntries = {};
        this.frames = {};
        this.functionOrder = [];
    }

    findFrame(name) {
        return this.frames[name] || null;
    }

    findGlobal(name) {
        return this.globalEntries[name] || null;
    }

    findLocal(funcName, name) {
        const frame = this.frames[funcName];
        if (!frame) return null;
        return frame.namedEntries[name] || null;
    }

    format() {
        const lines = ["全局区:"];
        if (this.globals.length === 0) {
            lines.push("  (无全局变量)");
        } else {
            for (const entry of this.globals) {
                let line = `  ${entry.name.padEnd(12, " ")} type=${String(entry.type).padEnd(8, " ")} size=${String(entry.size).padEnd(4, " ")} storage=.data`;
                if (entry.is_array) line += ` elements=${entry.element_count}`;
                lines.push(line);
            }
        }

        for (const funcName of this.functionOrder) {
            const frame = this.frames[funcName];
            if (!frame) continue;
            lines.push("");
            lines.push(`函数帧 ${frame.name}  stack_size=${frame.stack_size} bytes`);
            this.appendEntries(lines, "参数区", frame.params);
            this.appendEntries(lines, "局部变量区", frame.locals);
            this.appendEntries(lines, "临时变量区", frame.temps);
        }

        return lines.join("\n");
    }

    appendEntries(lines, title, entries) {
        lines.push(`  - ${title}`);
        if (!entries || entries.length === 0) {
            lines.push("    (无)");
            return;
        }
        for (const entry of entries) {
            let line = `    ${entry.name.padEnd(12, " ")} type=${String(entry.type).padEnd(8, " ")} size=${String(entry.size).padEnd(4, " ")}`;
            line += ` x86=[ebp${formatSignedOffset(entry.stack_offset)}]`;
            line += ` arm64=[x29${formatSignedOffset(entry.stack_offset)}]`;
            if (entry.incoming_arg_index >= 0) {
                line += ` incoming_arg#${entry.incoming_arg_index}`;
            }
            if (entry.is_array) {
                line += ` elements=${entry.element_count > 0 ? entry.element_count : "ptr"}`;
            }
            lines.push(line);
        }
    }
}

class BackendMemoryLayoutBuilder {
    static typeSize(type, isPointer, elementCount) {
        if (isPointer) return 4;
        const base = type === "FLOAT" ? 4 : 4;
        return base * Math.max(1, elementCount);
    }

    static inferType(typeNode) {
        if (!typeNode) return "INT";
        if (typeNode.data_type) return typeNode.data_type;
        if (typeNode.value) return typeNode.value;
        return "INT";
    }

    static buildVarEntry(node, category, owner) {
        const entry = {
            name: "",
            type: "INT",
            category,
            owner,
            is_array: false,
            is_pointer: false,
            element_count: 1,
            size: 4,
            stack_offset: 0,
            incoming_arg_index: -1
        };
        if (!node) return entry;

        if (node.children.length > 1 && node.children[1]) entry.name = node.children[1].value;
        if (node.children.length > 0 && node.children[0]) entry.type = BackendMemoryLayoutBuilder.inferType(node.children[0]);

        let sawBracket = false;
        for (const child of node.children) {
            if (!child) continue;
            if (child.node_type === "LBRACK") sawBracket = true;
            if (child.node_type === "INT_NUM") {
                entry.is_array = sawBracket;
                entry.element_count = Math.max(1, Number(child.value));
                break;
            }
        }

        entry.size = BackendMemoryLayoutBuilder.typeSize(entry.type, false, entry.is_array ? entry.element_count : 1);
        return entry;
    }

    static addUniqueEntry(entries, entry) {
        if (!entry.name) return;
        if (entries.some(existing => existing.name === entry.name)) return;
        entries.push(entry);
    }

    static collectLocalDecls(node, frame) {
        if (!node) return;
        if (node.node_type === "FuncDecl") return;

        if (node.node_type === "VarDecl") {
            BackendMemoryLayoutBuilder.addUniqueEntry(frame.locals, BackendMemoryLayoutBuilder.buildVarEntry(node, "local", frame.name));
        }

        for (const child of node.children) {
            BackendMemoryLayoutBuilder.collectLocalDecls(child, frame);
        }
    }

    static collectTopLevel(node, layout) {
        if (!node) return;

        if (node.node_type === "FuncDecl") {
            const frame = {
                name: node.children[1] ? node.children[1].value : "anonymous",
                params: [],
                locals: [],
                temps: [],
                namedEntries: {},
                stack_size: 0
            };
            layout.functionOrder.push(frame.name);

            if (node.children[2]) {
                for (const param of node.children[2].children) {
                    if (!param || param.children.length < 2) continue;
                    const entry = {
                        name: param.children[1].value,
                        type: BackendMemoryLayoutBuilder.inferType(param.children[0]),
                        category: "param",
                        owner: frame.name,
                        is_array: param.value === "array",
                        is_pointer: param.value === "array",
                        element_count: param.value === "array" ? 0 : 1,
                        size: BackendMemoryLayoutBuilder.typeSize(BackendMemoryLayoutBuilder.inferType(param.children[0]), param.value === "array", 1),
                        stack_offset: 0,
                        incoming_arg_index: frame.params.length
                    };
                    BackendMemoryLayoutBuilder.addUniqueEntry(frame.params, entry);
                }
            }

            if (node.children[3]) {
                BackendMemoryLayoutBuilder.collectLocalDecls(node.children[3], frame);
            }

            layout.frames[frame.name] = frame;
            return;
        }

        if (node.node_type === "VarDecl") {
            BackendMemoryLayoutBuilder.addUniqueEntry(layout.globals, BackendMemoryLayoutBuilder.buildVarEntry(node, "global", "global"));
            return;
        }

        for (const child of node.children) {
            BackendMemoryLayoutBuilder.collectTopLevel(child, layout);
        }
    }

    static collectTempsFromQuads(quads, layout) {
        let currentFunc = "";
        for (const quad of quads) {
            if (quad.op === "func") {
                currentFunc = quad.result;
                continue;
            }
            if (quad.op === "endfunc") {
                currentFunc = "";
                continue;
            }
            if (!currentFunc) continue;
            const frame = layout.frames[currentFunc];
            if (!frame) continue;

            for (const token of [quad.arg1, quad.arg2, quad.result]) {
                if (!isTemporaryName(token)) continue;
                if (frame.temps.some(existing => existing.name === token)) continue;
                frame.temps.push({
                    name: token,
                    type: "INT",
                    category: "temp",
                    owner: currentFunc,
                    is_array: false,
                    is_pointer: false,
                    element_count: 1,
                    size: 4,
                    stack_offset: 0,
                    incoming_arg_index: -1
                });
            }
        }
    }

    static assignOffsets(layout) {
        for (const frame of Object.values(layout.frames)) {
            let offset = 0;
            const assignGroup = entries => {
                for (const entry of entries) {
                    offset = alignTo(offset, 4);
                    offset += Math.max(4, entry.size);
                    entry.stack_offset = -offset;
                    frame.namedEntries[entry.name] = { ...entry };
                }
            };

            assignGroup(frame.params);
            assignGroup(frame.locals);
            assignGroup(frame.temps);
            frame.stack_size = alignTo(offset, 16);
        }

        for (const entry of layout.globals) {
            layout.globalEntries[entry.name] = { ...entry };
        }
    }

    build(root, quads) {
        const layout = new BackendMemoryLayout();
        BackendMemoryLayoutBuilder.collectTopLevel(root, layout);
        BackendMemoryLayoutBuilder.collectTempsFromQuads(quads, layout);
        BackendMemoryLayoutBuilder.assignOffsets(layout);
        return layout;
    }
}

class X86AssemblyGenerator {
    constructor(quads, layout) {
        this.quads = quads;
        this.layout = layout;
        this.functionBodies = {};
        this.stringPool = {};
        this.stringCounter = 0;
    }

    internString(literal) {
        if (this.stringPool[literal]) return this.stringPool[literal];
        const label = `.LC${this.stringCounter++}`;
        this.stringPool[literal] = label;
        return label;
    }

    static x86Mem(base, offset) {
        return `DWORD PTR [${base}${formatSignedOffset(offset)}]`;
    }

    emitLoadValue(lines, funcName, operand, reg) {
        if (!operand) {
            lines.push(`    mov ${reg}, 0`);
            return;
        }
        if (isIntegerLiteral(operand)) {
            lines.push(`    mov ${reg}, ${operand}`);
            return;
        }
        if (isFloatLiteralText(operand)) {
            lines.push(`    mov ${reg}, 0    # float literal placeholder: ${normalizeNumberLiteral(operand)}`);
            return;
        }

        const local = this.layout.findLocal(funcName, operand);
        if (local) {
            lines.push(`    mov ${reg}, ${X86AssemblyGenerator.x86Mem("ebp", local.stack_offset)}`);
            return;
        }
        if (this.layout.findGlobal(operand)) {
            lines.push(`    mov ${reg}, DWORD PTR [${operand}]`);
            return;
        }

        lines.push(`    mov ${reg}, 0    # unresolved operand: ${operand}`);
    }

    emitStoreValue(lines, funcName, target, reg) {
        const local = this.layout.findLocal(funcName, target);
        if (local) {
            lines.push(`    mov ${X86AssemblyGenerator.x86Mem("ebp", local.stack_offset)}, ${reg}`);
            return;
        }
        if (this.layout.findGlobal(target)) {
            lines.push(`    mov DWORD PTR [${target}], ${reg}`);
            return;
        }
        lines.push(`    # unresolved store target: ${target}`);
    }

    emitLoadAddress(lines, funcName, name, reg) {
        const local = this.layout.findLocal(funcName, name);
        if (local) {
            if (local.is_pointer) lines.push(`    mov ${reg}, ${X86AssemblyGenerator.x86Mem("ebp", local.stack_offset)}`);
            else lines.push(`    lea ${reg}, [ebp${formatSignedOffset(local.stack_offset)}]`);
            return;
        }
        if (this.layout.findGlobal(name)) {
            lines.push(`    lea ${reg}, [${name}]`);
            return;
        }
        lines.push(`    mov ${reg}, 0    # unresolved address: ${name}`);
    }

    emitBinaryOp(lines, funcName, quad) {
        this.emitLoadValue(lines, funcName, quad.arg1, "eax");
        this.emitLoadValue(lines, funcName, quad.arg2, "ebx");

        if (quad.op === "+") lines.push("    add eax, ebx");
        else if (quad.op === "-") lines.push("    sub eax, ebx");
        else if (quad.op === "*") lines.push("    imul eax, ebx");
        else if (quad.op === "/") {
            lines.push("    cdq");
            lines.push("    idiv ebx");
        } else if (quad.op === "&&" || quad.op === "||") {
            lines.push("    cmp eax, 0");
            lines.push("    setne al");
            lines.push("    movzx eax, al");
            lines.push("    cmp ebx, 0");
            lines.push("    setne bl");
            lines.push("    movzx ebx, bl");
            lines.push(quad.op === "&&" ? "    and eax, ebx" : "    or eax, ebx");
        } else {
            lines.push("    cmp eax, ebx");
            if (quad.op === "<") lines.push("    setl al");
            else if (quad.op === ">") lines.push("    setg al");
            else if (quad.op === "<=") lines.push("    setle al");
            else if (quad.op === ">=") lines.push("    setge al");
            else if (quad.op === "==") lines.push("    sete al");
            else if (quad.op === "!=") lines.push("    setne al");
            lines.push("    movzx eax, al");
        }

        this.emitStoreValue(lines, funcName, quad.result, "eax");
    }

    emitArrayLoad(lines, funcName, quad) {
        this.emitLoadAddress(lines, funcName, quad.arg1, "edx");
        this.emitLoadValue(lines, funcName, quad.arg2 || "0", "ecx");
        lines.push("    imul ecx, 4");
        lines.push("    add edx, ecx");
        lines.push("    mov eax, DWORD PTR [edx]");
        this.emitStoreValue(lines, funcName, quad.result, "eax");
    }

    emitArrayStore(lines, funcName, quad) {
        this.emitLoadAddress(lines, funcName, quad.result, "edx");
        this.emitLoadValue(lines, funcName, quad.arg1 || "0", "ecx");
        this.emitLoadValue(lines, funcName, quad.arg2, "eax");
        lines.push("    imul ecx, 4");
        lines.push("    add edx, ecx");
        lines.push("    mov DWORD PTR [edx], eax");
    }

    emitFunction(funcName, body) {
        const lines = [];
        const frame = this.layout.findFrame(funcName);
        const stackSize = frame ? frame.stack_size : 0;
        const exitLabel = `.L_${funcName}_exit`;
        const pendingArgs = [];

        lines.push(`.globl ${funcName}`);
        lines.push(`${funcName}:`);
        lines.push("    push ebp");
        lines.push("    mov ebp, esp");
        if (stackSize > 0) lines.push(`    sub esp, ${stackSize}`);

        if (frame) {
            for (const param of frame.params) {
                const incomingOffset = 8 + param.incoming_arg_index * 4;
                lines.push(`    mov eax, ${X86AssemblyGenerator.x86Mem("ebp", incomingOffset)}`);
                lines.push(`    mov ${X86AssemblyGenerator.x86Mem("ebp", param.stack_offset)}, eax`);
            }
        }

        for (const quad of body) {
            if (quad.op === "func" || quad.op === "param_def") continue;
            if (quad.op === "endfunc") break;

            if (quad.op === "=") {
                this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (["+", "-", "*", "/", "<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(quad.op)) {
                this.emitBinaryOp(lines, funcName, quad);
            } else if (quad.op === "uminus") {
                this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                lines.push("    neg eax");
                this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (quad.op === "uplus") {
                this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (quad.op === "!") {
                this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                lines.push("    cmp eax, 0");
                lines.push("    sete al");
                lines.push("    movzx eax, al");
                this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (quad.op === "label") {
                lines.push(`${quad.result}:`);
            } else if (quad.op === "goto") {
                lines.push(`    jmp ${quad.result}`);
            } else if (quad.op === "ifFalse") {
                this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                lines.push("    cmp eax, 0");
                lines.push(`    je ${quad.result}`);
            } else if (quad.op === "param") {
                pendingArgs.push(quad.arg1);
            } else if (quad.op === "call") {
                for (let i = pendingArgs.length - 1; i >= 0; i -= 1) {
                    this.emitLoadValue(lines, funcName, pendingArgs[i], "eax");
                    lines.push("    push eax");
                }
                lines.push(`    call ${quad.arg1}`);
                if (pendingArgs.length > 0) lines.push(`    add esp, ${pendingArgs.length * 4}`);
                pendingArgs.length = 0;
                if (quad.result) this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (quad.op === "return") {
                if (quad.arg1) this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                lines.push(`    jmp ${exitLabel}`);
            } else if (quad.op === "print") {
                if (isStringLiteralText(quad.arg1)) {
                    const label = this.internString(quad.arg1);
                    lines.push(`    push OFFSET ${label}`);
                    lines.push("    call print_string");
                    lines.push("    add esp, 4");
                } else {
                    this.emitLoadValue(lines, funcName, quad.arg1, "eax");
                    lines.push("    push eax");
                    lines.push("    call print_int");
                    lines.push("    add esp, 4");
                }
            } else if (quad.op === "input") {
                lines.push("    call input_int");
                this.emitStoreValue(lines, funcName, quad.result, "eax");
            } else if (quad.op === "=[]") {
                this.emitArrayLoad(lines, funcName, quad);
            } else if (quad.op === "[]=") {
                this.emitArrayStore(lines, funcName, quad);
            } else {
                lines.push(`    # unsupported quad: (${quad.op}, ${quad.arg1}, ${quad.arg2}, ${quad.result})`);
            }
        }

        lines.push(`${exitLabel}:`);
        lines.push("    mov esp, ebp");
        lines.push("    pop ebp");
        lines.push("    ret");
        lines.push("");
        return lines.join("\n");
    }

    collectBodies() {
        this.functionBodies = {};
        let currentFunc = "";
        for (const quad of this.quads) {
            if (quad.op === "func") currentFunc = quad.result;
            if (currentFunc) {
                if (!this.functionBodies[currentFunc]) this.functionBodies[currentFunc] = [];
                this.functionBodies[currentFunc].push(quad);
            }
            if (quad.op === "endfunc") currentFunc = "";
        }
    }

    generate() {
        this.collectBodies();

        let text = "";
        for (const funcName of this.layout.functionOrder) {
            if (this.functionBodies[funcName]) {
                text += `${this.emitFunction(funcName, this.functionBodies[funcName])}`;
            }
        }

        const lines = [
            "; x86 target assembly generated for Experiment 8",
            "; runtime stubs expected: print_int, print_string, input_int",
            ".intel_syntax noprefix"
        ];

        if (this.layout.globals.length > 0) {
            lines.push(".data");
            for (const entry of this.layout.globals) {
                lines.push(`${entry.name}: ${entry.is_array ? `.space ${entry.size}` : ".long 0"}`);
            }
        }

        const stringEntries = Object.entries(this.stringPool);
        if (stringEntries.length > 0) {
            lines.push(".section .rodata");
            for (const [literal, label] of stringEntries) {
                const payload = literal.slice(1, -1);
                lines.push(`${label}:`);
                lines.push(`    .asciz "${escapeAsmString(payload)}"`);
            }
        }

        lines.push(".text");
        lines.push(text.trimEnd());
        return lines.join("\n");
    }
}

class Arm64AssemblyGenerator {
    constructor(quads, layout) {
        this.quads = quads;
        this.layout = layout;
        this.functionBodies = {};
        this.stringPool = {};
        this.stringCounter = 0;
    }

    internString(literal) {
        if (this.stringPool[literal]) return this.stringPool[literal];
        const label = `.Lstr${this.stringCounter++}`;
        this.stringPool[literal] = label;
        return label;
    }

    emitLoadValue(lines, funcName, operand, reg) {
        if (!operand) {
            lines.push(`    mov ${reg}, #0`);
            return;
        }
        if (isIntegerLiteral(operand)) {
            lines.push(`    mov ${reg}, #${operand}`);
            return;
        }
        if (isFloatLiteralText(operand)) {
            lines.push(`    mov ${reg}, #0    // float literal placeholder: ${normalizeNumberLiteral(operand)}`);
            return;
        }

        const local = this.layout.findLocal(funcName, operand);
        if (local) {
            lines.push(`    ldur ${reg}, [x29, #${local.stack_offset}]`);
            return;
        }
        if (this.layout.findGlobal(operand)) {
            lines.push(`    adrp x9, ${operand}`);
            lines.push(`    add x9, x9, :lo12:${operand}`);
            lines.push(`    ldr ${reg}, [x9]`);
            return;
        }

        lines.push(`    mov ${reg}, #0    // unresolved operand: ${operand}`);
    }

    emitStoreValue(lines, funcName, target, reg) {
        const local = this.layout.findLocal(funcName, target);
        if (local) {
            lines.push(`    stur ${reg}, [x29, #${local.stack_offset}]`);
            return;
        }
        if (this.layout.findGlobal(target)) {
            lines.push(`    adrp x9, ${target}`);
            lines.push(`    add x9, x9, :lo12:${target}`);
            lines.push(`    str ${reg}, [x9]`);
            return;
        }
        lines.push(`    // unresolved store target: ${target}`);
    }

    emitLoadAddress(lines, funcName, name, reg) {
        const local = this.layout.findLocal(funcName, name);
        if (local) {
            if (local.is_pointer) {
                lines.push(`    ldur x${reg.slice(1)}, [x29, #${local.stack_offset}]`);
            } else {
                lines.push(`    mov ${reg}, x29`);
                lines.push(`    sub ${reg}, ${reg}, #${-local.stack_offset}`);
            }
            return;
        }
        if (this.layout.findGlobal(name)) {
            lines.push(`    adrp ${reg}, ${name}`);
            lines.push(`    add ${reg}, ${reg}, :lo12:${name}`);
            return;
        }
        lines.push(`    mov ${reg}, xzr    // unresolved address: ${name}`);
    }

    emitBinaryOp(lines, funcName, quad) {
        this.emitLoadValue(lines, funcName, quad.arg1, "w0");
        this.emitLoadValue(lines, funcName, quad.arg2, "w1");

        if (quad.op === "+") lines.push("    add w0, w0, w1");
        else if (quad.op === "-") lines.push("    sub w0, w0, w1");
        else if (quad.op === "*") lines.push("    mul w0, w0, w1");
        else if (quad.op === "/") lines.push("    sdiv w0, w0, w1");
        else if (quad.op === "&&" || quad.op === "||") {
            lines.push("    cmp w0, #0");
            lines.push("    cset w0, ne");
            lines.push("    cmp w1, #0");
            lines.push("    cset w1, ne");
            lines.push(quad.op === "&&" ? "    and w0, w0, w1" : "    orr w0, w0, w1");
        } else {
            lines.push("    cmp w0, w1");
            if (quad.op === "<") lines.push("    cset w0, lt");
            else if (quad.op === ">") lines.push("    cset w0, gt");
            else if (quad.op === "<=") lines.push("    cset w0, le");
            else if (quad.op === ">=") lines.push("    cset w0, ge");
            else if (quad.op === "==") lines.push("    cset w0, eq");
            else if (quad.op === "!=") lines.push("    cset w0, ne");
        }

        this.emitStoreValue(lines, funcName, quad.result, "w0");
    }

    emitArrayLoad(lines, funcName, quad) {
        this.emitLoadAddress(lines, funcName, quad.arg1, "x9");
        this.emitLoadValue(lines, funcName, quad.arg2 || "0", "w10");
        lines.push("    lsl w10, w10, #2");
        lines.push("    add x9, x9, w10, sxtw");
        lines.push("    ldr w0, [x9]");
        this.emitStoreValue(lines, funcName, quad.result, "w0");
    }

    emitArrayStore(lines, funcName, quad) {
        this.emitLoadAddress(lines, funcName, quad.result, "x9");
        this.emitLoadValue(lines, funcName, quad.arg1 || "0", "w10");
        this.emitLoadValue(lines, funcName, quad.arg2, "w0");
        lines.push("    lsl w10, w10, #2");
        lines.push("    add x9, x9, w10, sxtw");
        lines.push("    str w0, [x9]");
    }

    emitFunction(funcName, body) {
        const lines = [];
        const frame = this.layout.findFrame(funcName);
        const stackSize = frame ? frame.stack_size : 0;
        const exitLabel = `.L_${funcName}_exit`;
        const pendingArgs = [];

        lines.push(`.global ${funcName}`);
        lines.push(`${funcName}:`);
        lines.push("    stp x29, x30, [sp, #-16]!");
        lines.push("    mov x29, sp");
        if (stackSize > 0) lines.push(`    sub sp, sp, #${alignTo(stackSize, 16)}`);

        if (frame) {
            for (const param of frame.params) {
                if (param.incoming_arg_index < 8) {
                    lines.push(`    stur w${param.incoming_arg_index}, [x29, #${param.stack_offset}]`);
                }
            }
        }

        for (const quad of body) {
            if (quad.op === "func" || quad.op === "param_def") continue;
            if (quad.op === "endfunc") break;

            if (quad.op === "=") {
                this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (["+", "-", "*", "/", "<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(quad.op)) {
                this.emitBinaryOp(lines, funcName, quad);
            } else if (quad.op === "uminus") {
                this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                lines.push("    neg w0, w0");
                this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (quad.op === "uplus") {
                this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (quad.op === "!") {
                this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                lines.push("    cmp w0, #0");
                lines.push("    cset w0, eq");
                this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (quad.op === "label") {
                lines.push(`${quad.result}:`);
            } else if (quad.op === "goto") {
                lines.push(`    b ${quad.result}`);
            } else if (quad.op === "ifFalse") {
                this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                lines.push(`    cbz w0, ${quad.result}`);
            } else if (quad.op === "param") {
                pendingArgs.push(quad.arg1);
            } else if (quad.op === "call") {
                for (let i = 0; i < pendingArgs.length && i < 8; i += 1) {
                    this.emitLoadValue(lines, funcName, pendingArgs[i], `w${i}`);
                }
                lines.push(`    bl ${quad.arg1}`);
                pendingArgs.length = 0;
                if (quad.result) this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (quad.op === "return") {
                if (quad.arg1) this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                lines.push(`    b ${exitLabel}`);
            } else if (quad.op === "print") {
                if (isStringLiteralText(quad.arg1)) {
                    const label = this.internString(quad.arg1);
                    lines.push(`    adrp x0, ${label}`);
                    lines.push(`    add x0, x0, :lo12:${label}`);
                    lines.push("    bl print_string");
                } else {
                    this.emitLoadValue(lines, funcName, quad.arg1, "w0");
                    lines.push("    bl print_int");
                }
            } else if (quad.op === "input") {
                lines.push("    bl input_int");
                this.emitStoreValue(lines, funcName, quad.result, "w0");
            } else if (quad.op === "=[]") {
                this.emitArrayLoad(lines, funcName, quad);
            } else if (quad.op === "[]=") {
                this.emitArrayStore(lines, funcName, quad);
            } else {
                lines.push(`    // unsupported quad: (${quad.op}, ${quad.arg1}, ${quad.arg2}, ${quad.result})`);
            }
        }

        lines.push(`${exitLabel}:`);
        if (stackSize > 0) lines.push(`    add sp, sp, #${alignTo(stackSize, 16)}`);
        lines.push("    ldp x29, x30, [sp], #16");
        lines.push("    ret");
        lines.push("");
        return lines.join("\n");
    }

    collectBodies() {
        this.functionBodies = {};
        let currentFunc = "";
        for (const quad of this.quads) {
            if (quad.op === "func") currentFunc = quad.result;
            if (currentFunc) {
                if (!this.functionBodies[currentFunc]) this.functionBodies[currentFunc] = [];
                this.functionBodies[currentFunc].push(quad);
            }
            if (quad.op === "endfunc") currentFunc = "";
        }
    }

    generate() {
        this.collectBodies();

        let text = "";
        for (const funcName of this.layout.functionOrder) {
            if (this.functionBodies[funcName]) {
                text += `${this.emitFunction(funcName, this.functionBodies[funcName])}`;
            }
        }

        const lines = [
            "// arm64 target assembly generated for Experiment 8",
            "// runtime stubs expected: print_int, print_string, input_int"
        ];

        if (this.layout.globals.length > 0) {
            lines.push(".data");
            for (const entry of this.layout.globals) {
                lines.push(`${entry.name}:`);
                lines.push(entry.is_array ? `    .skip ${entry.size}` : "    .word 0");
            }
        }

        const stringEntries = Object.entries(this.stringPool);
        if (stringEntries.length > 0) {
            lines.push(".section .rodata");
            for (const [literal, label] of stringEntries) {
                const payload = literal.slice(1, -1);
                lines.push(`${label}:`);
                lines.push(`    .asciz "${escapeAsmString(payload)}"`);
            }
        }

        lines.push(".text");
        lines.push(text.trimEnd());
        return lines.join("\n");
    }
}

function showBackendStatus(message, type) {
    const div = document.getElementById("backend-status");
    if (!div) return;
    div.classList.remove("hidden", "text-red-600", "bg-red-50", "text-emerald-700", "bg-emerald-50");
    div.classList.add("p-3", "rounded-lg", "font-medium");

    if (type === "error") {
        div.classList.add("text-red-600", "bg-red-50");
        div.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${backendEscapeHtml(message)}`;
    } else {
        div.classList.add("text-emerald-700", "bg-emerald-50");
        div.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> ${backendEscapeHtml(message)}`;
    }
}

function downloadTextFile(fileName, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function triggerDownloads(files) {
    let delay = 0;
    for (const file of files) {
        window.setTimeout(() => {
            downloadTextFile(file.name, file.content);
        }, delay);
        delay += 180;
    }
}

function buildCompileCommands(baseName) {
    return [
        `x86 (MinGW/GCC 32位):`,
        `gcc -m32 ${baseName}_x86.s ${baseName}_runtime.c -o ${baseName}_x86`,
        "",
        `arm64 (交叉编译):`,
        `aarch64-linux-gnu-gcc ${baseName}_arm64.s ${baseName}_runtime.c -o ${baseName}_arm64`,
        "",
        "说明:",
        "1. 请将下载得到的三个文件放在同一目录下。",
        "2. 若本机没有对应工具链，可仅保留汇编结果用于实验展示。"
    ].join("\n");
}

let currentBackendArtifacts = null;

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", async () => {
        const grammarInput = document.getElementById("backend-grammar-input");
        const sourceInput = document.getElementById("backend-source-input");
        const outputBaseInput = document.getElementById("backend-output-base");
        const grammarUpload = document.getElementById("backend-grammar-upload");
        const sourceUpload = document.getElementById("backend-source-upload");
        const btnRun = document.getElementById("btn-run-backend");
        const btnDownloadAll = document.getElementById("btn-download-backend-all");
        const btnDownloadX86 = document.getElementById("btn-download-backend-x86");
        const btnDownloadArm64 = document.getElementById("btn-download-backend-arm64");
        const btnDownloadRuntime = document.getElementById("btn-download-backend-runtime");
        const compileCommandsOutput = document.getElementById("backend-compile-commands");
        const tabBtns = document.querySelectorAll(".backend-tab-btn");
        const tabPanes = document.querySelectorAll(".backend-tab-pane");

        if (!grammarInput || !sourceInput || !outputBaseInput || !btnRun) return;

        let runtimeSource = await loadDefaultRuntimeSource();
        grammarInput.value = await loadDefaultSemanticGrammar();
        sourceInput.value = DEFAULT_BACKEND_SOURCE;
        outputBaseInput.value = "test";

        const setDownloadEnabled = enabled => {
            [btnDownloadAll, btnDownloadX86, btnDownloadArm64, btnDownloadRuntime].forEach(btn => {
                if (!btn) return;
                if (enabled) {
                    btn.classList.remove("opacity-50", "pointer-events-none");
                    btn.removeAttribute("disabled");
                } else {
                    btn.classList.add("opacity-50", "pointer-events-none");
                    btn.setAttribute("disabled", "disabled");
                }
            });
        };

        const resetOutputs = () => {
            document.getElementById("backend-ir-output").textContent = "等待运行...";
            document.getElementById("backend-memory-output").textContent = "等待运行...";
            document.getElementById("backend-x86-output").textContent = "等待运行...";
            document.getElementById("backend-arm64-output").textContent = "等待运行...";
            document.getElementById("backend-runtime-output").textContent = "等待运行...";
            if (compileCommandsOutput) compileCommandsOutput.textContent = "等待运行...";
            currentBackendArtifacts = null;
            setDownloadEnabled(false);
        };

        resetOutputs();

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
                outputBaseInput.value = stripFileExtension(file.name);
            };
            reader.readAsText(file);
            event.target.value = "";
        });

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                tabBtns.forEach(item => {
                    item.classList.remove("active", "text-indigo-600", "border-indigo-600", "bg-white");
                    item.classList.add("text-slate-500", "hover:text-slate-700", "hover:bg-slate-100", "border-transparent");
                });
                tabPanes.forEach(pane => pane.classList.add("hidden"));

                btn.classList.remove("text-slate-500", "hover:text-slate-700", "hover:bg-slate-100", "border-transparent");
                btn.classList.add("active", "text-indigo-600", "border-indigo-600", "bg-white");

                const targetPane = document.getElementById(btn.getAttribute("data-target"));
                if (targetPane) targetPane.classList.remove("hidden");
            });
        });

        btnDownloadAll.addEventListener("click", () => {
            if (!currentBackendArtifacts) return;
            triggerDownloads([
                { name: `${currentBackendArtifacts.baseName}_x86.s`, content: currentBackendArtifacts.x86Asm },
                { name: `${currentBackendArtifacts.baseName}_arm64.s`, content: currentBackendArtifacts.arm64Asm },
                { name: `${currentBackendArtifacts.baseName}_runtime.c`, content: currentBackendArtifacts.runtimeArtifact }
            ]);
        });

        btnDownloadX86.addEventListener("click", () => {
            if (!currentBackendArtifacts) return;
            downloadTextFile(`${currentBackendArtifacts.baseName}_x86.s`, currentBackendArtifacts.x86Asm);
        });

        btnDownloadArm64.addEventListener("click", () => {
            if (!currentBackendArtifacts) return;
            downloadTextFile(`${currentBackendArtifacts.baseName}_arm64.s`, currentBackendArtifacts.arm64Asm);
        });

        btnDownloadRuntime.addEventListener("click", () => {
            if (!currentBackendArtifacts) return;
            downloadTextFile(`${currentBackendArtifacts.baseName}_runtime.c`, currentBackendArtifacts.runtimeArtifact);
        });

        btnRun.addEventListener("click", async () => {
            const grammarText = grammarInput.value.trim();
            const sourceText = sourceInput.value.trim();
            const baseName = stripFileExtension(outputBaseInput.value.trim() || "test");

            if (!grammarText) {
                showBackendStatus("请提供 mainGGG 文法。", "error");
                window.experimentFlow?.setExperimentState?.("backend", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                return;
            }
            if (!sourceText) {
                showBackendStatus("请提供待分析源代码。", "error");
                window.experimentFlow?.setExperimentState?.("backend", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                return;
            }

            window.experimentFlow?.setExperimentState?.("backend", {
                running: true,
                lastRunStatus: "running"
            });
            try {
                if (!runtimeSource) {
                    runtimeSource = await loadDefaultRuntimeSource();
                }

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
                if (!result.root) {
                    throw new Error("语法分析失败，未生成 AST。");
                }

                const icg = new IntermediateCodeGenerator();
                icg.generate(result.root);
                const tacText = icg.formatThreeAddressCode();
                const quadText = icg.formatQuadruples();

                const optimizer = new BackendSimpleOptimizer();
                const optimizedQuads = optimizer.optimize(icg.quads);
                const optimizedText = optimizer.formatOptimizedQuadruples(optimizedQuads);
                const irText = buildBackendIrReport(tacText, quadText, optimizedText);

                const layoutBuilder = new BackendMemoryLayoutBuilder();
                const layout = layoutBuilder.build(result.root, optimizedQuads);
                const memoryText = layout.format();

                const x86Asm = decorateAssembly(new X86AssemblyGenerator(optimizedQuads, layout).generate(), "x86", baseName);
                const arm64Asm = decorateAssembly(new Arm64AssemblyGenerator(optimizedQuads, layout).generate(), "arm64", baseName);
                const runtimeArtifact = buildRuntimeArtifact(baseName, runtimeSource);
                const compileCommands = buildCompileCommands(baseName);

                document.getElementById("backend-ir-output").textContent = irText;
                document.getElementById("backend-memory-output").textContent = memoryText;
                document.getElementById("backend-x86-output").textContent = x86Asm;
                document.getElementById("backend-arm64-output").textContent = arm64Asm;
                document.getElementById("backend-runtime-output").textContent = runtimeArtifact;
                if (compileCommandsOutput) compileCommandsOutput.textContent = compileCommands;

                currentBackendArtifacts = {
                    baseName,
                    irText,
                    memoryText,
                    x86Asm,
                    arm64Asm,
                    runtimeArtifact,
                    compileCommands,
                    semanticErrors: result.semanticErrors
                };
                setDownloadEnabled(true);

                if (result.semanticErrors.length > 0) {
                    showBackendStatus(`实验七&八已生成结果，但检测到 ${result.semanticErrors.length} 条语义问题。`, "error");
                    window.experimentFlow?.setExperimentState?.("backend", {
                        completed: true,
                        running: false,
                        lastRunStatus: "error"
                    });
                } else {
                    showBackendStatus("实验七&八运行成功，已生成中间代码、内存地址映射、x86/arm64 汇编与 runtime 文件。", "success");
                    window.experimentFlow?.setExperimentState?.("backend", {
                        completed: true,
                        running: false,
                        lastRunStatus: "success"
                    });
                }
            } catch (error) {
                resetOutputs();
                document.getElementById("backend-ir-output").textContent = error.message;
                showBackendStatus(error.message, "error");
                window.experimentFlow?.setExperimentState?.("backend", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                console.error(error);
            }
        });
    });
}
