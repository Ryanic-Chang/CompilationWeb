// semantic.js - 实验五：语义分析、符号表与 AST 可视化

const DEFAULT_MAIN_GGG = `Prog -> DeclList | DeclList ExprStmt
DeclList -> DeclList Decl | Decl
Decl -> VarDeclCore SEMI | FunDecl | FunDecl SEMI
VarDeclCore -> Type ID | Type ID LBRACK INT_NUM RBRACK | Type ID ASG Expr | Type ID LBRACK INT_NUM RBRACK ASG LBR InitList RBR
InitList -> InitList COMMA Expr | InitList COMMA | Expr
Type -> INT | FLOAT | VOID
FunDecl -> FunHeader CompStmt
FunHeader -> Type ID LPAR ParamList RPAR
ParamList -> ParamList COMMA Param | ParamList SEMI Param | ParamList SEMI | Param | ε
Param -> Type ID | Type ID LBRACK RBRACK
CompStmt -> LBR StmtList RBR
StmtList -> StmtSeq | StmtSeq SEMI | ε
StmtSeq -> StmtSeq SEMI Stmt | StmtSeq Stmt | Stmt
Stmt -> VarDeclCore | ExprStmt | CompStmt | IfStmt | LoopStmt | ForStmt | RetStmt | PrintStmt | InputStmt
PrintStmt -> PRINT LPAR PrintArgs RPAR | PRINT PrintArgs
PrintArgs -> STRING_LIT | STRING_LIT COMMA Expr | Expr
InputStmt -> INPUT LPAR ID RPAR
ExprStmt -> Expr
IfStmt -> IF LPAR Expr RPAR CompStmt | IF LPAR Expr RPAR CompStmt ELSE CompStmt | IF LPAR Expr RPAR CompStmt ELSE IfStmt
LoopStmt -> WHILE LPAR Expr RPAR CompStmt
ForStmt -> FOR LPAR ForInit SEMI Expr SEMI Expr RPAR CompStmt
ForInit -> VarDeclCore | Expr | ε
RetStmt -> RETURN Expr | RETURN
Expr -> ID ASG Expr | ID LBRACK Expr RBRACK ASG Expr | ID LBRACK Expr RBRACK ASG LBR InitList RBR | LogOrExpr
LogOrExpr -> LogOrExpr OR LogAndExpr | LogAndExpr
LogAndExpr -> LogAndExpr AND SimpExpr | SimpExpr
SimpExpr -> AddExpr REL_OP AddExpr | AddExpr
AddExpr -> AddExpr ADD Term | AddExpr SUB Term | Term
Term -> Term MUL Fact | Term DIV Fact | Fact
Fact -> ID | ID LBRACK Expr RBRACK | ID LBRACK RBRACK | ID LPAR ArgList RPAR | INT_NUM | FLOAT_NUM | LPAR Expr RPAR | SUB Fact | ADD Fact | NOT Fact
ArgList -> ArgList COMMA Expr | ArgList COMMA | Expr | ε`;

const DEFAULT_SEMANTIC_SOURCE = `int main() {
    int x;
    x = 5;  
    return 0
    };
main()`;

class SemanticASTNode {
    constructor(type, value = "") {
        this.node_type = type;
        this.value = value;
        this.data_type = "";
        this.children = [];
    }

    addChild(child) {
        if (child) {
            this.children.push(child);
        }
    }
}

function create_node(type, value = "") {
    return new SemanticASTNode(type, value);
}

function create_type_node(type) {
    const node = new SemanticASTNode("Type", type);
    node.data_type = type;
    return node;
}

function create_var_decl_node(type, id) {
    const node = new SemanticASTNode("VarDecl");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = type.data_type;
    node.addChild(type);
    node.addChild(idNode);
    node.data_type = type.data_type;
    return node;
}

function create_var_init_node(type, id, expr) {
    const node = new SemanticASTNode("VarDecl");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = type.data_type;
    node.addChild(type);
    node.addChild(idNode);
    node.addChild(expr);
    node.data_type = type.data_type;
    return node;
}

function create_func_decl_node(type, id, params, body) {
    const node = new SemanticASTNode("FuncDecl");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = type.data_type;
    node.addChild(type);
    node.addChild(idNode);
    node.addChild(params);
    node.addChild(body);
    node.data_type = type.data_type;
    return node;
}

function create_param(type, id) {
    const node = new SemanticASTNode("Param");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = type.data_type;
    node.addChild(type);
    node.addChild(idNode);
    node.data_type = type.data_type;
    return node;
}

function create_array_param(type, id) {
    const node = new SemanticASTNode("Param", "array");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = type.data_type;
    node.addChild(type);
    node.addChild(idNode);
    node.data_type = type.data_type;
    return node;
}

function create_empty_param_list() {
    return new SemanticASTNode("ParamList");
}

function create_binary_expr_node(left, op, right) {
    const node = new SemanticASTNode("BinaryExpr", op);
    node.addChild(left);
    node.addChild(right);
    if (!left.data_type || !right.data_type) {
        node.data_type = "unknown";
    } else if (left.data_type === right.data_type) {
        node.data_type = left.data_type;
    } else {
        node.data_type = "unknown";
    }
    return node;
}

function create_assign_node(id, expr) {
    const node = new SemanticASTNode("Assign", "=");
    const idNode = new SemanticASTNode("Identifier", id);
    idNode.data_type = expr.data_type;
    node.addChild(idNode);
    node.addChild(expr);
    node.data_type = expr.data_type;
    return node;
}

function create_return_node(expr) {
    const node = new SemanticASTNode("Return");
    if (expr) {
        node.addChild(expr);
        node.data_type = expr.data_type;
    } else {
        node.data_type = "VOID";
    }
    return node;
}

function create_block_node(stmtList) {
    const node = new SemanticASTNode("Block");
    node.addChild(stmtList);
    return node;
}

function create_empty_stmt_list() {
    return new SemanticASTNode("StmtList");
}

function create_id_node(id) {
    return new SemanticASTNode("Identifier", id);
}

function create_int_literal_node(val) {
    const node = new SemanticASTNode("Literal", String(val));
    node.data_type = "INT";
    return node;
}

function create_float_literal_node(val) {
    const node = new SemanticASTNode("Literal", String(val));
    node.data_type = "FLOAT";
    return node;
}

class SemanticSymbolTable {
    constructor() {
        this.scopes = [new Map()];
        this.allSymbols = [];
        this.semanticErrors = [];
        this.functions = new Map();
    }

    enterScope() {
        this.scopes.push(new Map());
    }

    exitScope() {
        if (this.scopes.length > 1) {
            this.scopes.pop();
        }
    }

    declare(name, type) {
        const currentScope = this.scopes[this.scopes.length - 1];
        if (currentScope.has(name)) {
            this.semanticErrors.push(`重复声明 (Duplicate Declaration): 变量 '${name}' 在当前作用域已存在。`);
            return false;
        }
        const level = this.scopes.length - 1;
        const entry = { name, type, scope_level: level };
        currentScope.set(name, entry);
        this.allSymbols.push(entry);
        return true;
    }

    declareFunction(name, returnType, paramTypes) {
        if (this.functions.has(name)) {
            this.semanticErrors.push(`重复声明 (Duplicate Declaration): 函数 '${name}' 已存在。`);
            return false;
        }
        this.functions.set(name, { return_type: returnType, param_types: paramTypes });
        this.allSymbols.push({ name, type: "function", scope_level: 0 });
        return true;
    }

    lookup(name) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            const scope = this.scopes[i];
            if (scope.has(name)) {
                return scope.get(name).type;
            }
        }
        if (this.functions.has(name)) {
            return this.functions.get(name).return_type;
        }
        this.semanticErrors.push(`未声明即使用 (Undeclared Variable): 使用了未定义的变量 '${name}'。`);
        return "unknown";
    }

    lookupFunctionReturnType(name) {
        if (this.functions.has(name)) {
            return this.functions.get(name).return_type;
        }
        this.semanticErrors.push(`未声明即使用 (Undeclared Variable): 使用了未定义的变量 '${name}'。`);
        return "unknown";
    }

    validateFunctionCall(name, argTypes) {
        if (!this.functions.has(name)) {
            this.semanticErrors.push(`未声明即使用 (Undeclared Variable): 使用了未定义的变量 '${name}'。`);
            return;
        }
        const signature = this.functions.get(name);
        const paramTypes = signature.param_types;
        if (paramTypes.length !== argTypes.length) {
            this.semanticErrors.push(`函数调用参数个数不匹配 (Argument Count Mismatch): 函数 '${name}' 期望 ${paramTypes.length} 个参数，但实际收到 ${argTypes.length} 个。`);
            return;
        }
        for (let i = 0; i < paramTypes.length; i++) {
            const expected = paramTypes[i];
            const actual = argTypes[i];
            if (!actual || actual === "unknown") continue;
            if ((expected === "INT" && actual === "FLOAT") || (expected === "FLOAT" && actual === "INT")) {
                continue;
            }
            if (expected !== actual) {
                this.semanticErrors.push(`函数调用参数类型不匹配 (Argument Type Mismatch): 函数 '${name}' 的第 ${i + 1} 个参数期望类型 '${expected}'，但实际收到 '${actual}'。`);
            }
        }
    }

    getAllSymbols() {
        return [...this.allSymbols];
    }

    getErrors() {
        return [...this.semanticErrors];
    }
}

function collectSemanticErrors(root) {
    const errors = [];

    function walk(node, expectedType = "") {
        if (!node) return;
        let currentExpectedType = expectedType;

        if (node.node_type === "FuncDecl" && node.children.length > 0) {
            currentExpectedType = node.children[0].data_type;
        }

        if (node.node_type === "VarDecl") {
            if (node.children.length > 1 && node.children[0] && !node.children[0].data_type) {
                errors.push(`Semantic error: Variable '${node.children[1].value}' has no data type.`);
            }
        }

        if (node.node_type === "BinaryExpr" && node.children.length >= 2) {
            const leftType = node.children[0].data_type;
            const rightType = node.children[1].data_type;
            const compatible = (leftType === "INT" && rightType === "FLOAT") || (leftType === "FLOAT" && rightType === "INT");
            if (leftType && rightType && leftType !== rightType && leftType !== "unknown" && rightType !== "unknown" && !compatible) {
                errors.push(`Semantic error: Type mismatch in binary expression: '${leftType}' and '${rightType}'.`);
            }
        }

        if (node.node_type === "Return") {
            let returnType = "void";
            if (node.children.length > 0 && node.children[0]) {
                returnType = node.children[0].data_type;
            }
            if (currentExpectedType && returnType !== currentExpectedType && returnType !== "unknown") {
                errors.push(`类型不匹配: 函数期望返回 '${currentExpectedType}'，但实际返回 '${returnType}'。`);
            }
        }

        for (const child of node.children) {
            walk(child, currentExpectedType);
        }
    }

    walk(root, "");
    return errors;
}

function semanticAstToText(root) {
    const lines = [];

    function walk(node, indent) {
        if (!node) return;
        const prefix = "  ".repeat(indent);
        let line = `${prefix}${node.node_type}`;
        if (node.value) line += `: ${node.value}`;
        if (node.data_type) line += ` [${node.data_type}]`;
        lines.push(line);
        for (const child of node.children) {
            walk(child, indent + 1);
        }
    }

    walk(root, 0);
    return lines.join("\n");
}

function parseSemanticGrammar(text) {
    const productions = [];
    let id = 1;
    let startSymbol = "";

    for (let line of text.split("\n")) {
        line = slr1TrimAndClean(line);
        if (!line || line.startsWith("#")) continue;
        line = line.replace(/→/g, "->");
        const arrowPos = line.indexOf("->");
        if (arrowPos === -1) continue;

        const lhs = line.slice(0, arrowPos).trim();
        const rhsStr = line.slice(arrowPos + 2).trim();
        const alternatives = rhsStr.split("|").map(part => part.trim());

        for (const alt of alternatives) {
            const rhs = alt.split(/\s+/).filter(Boolean).filter(token => token !== "ε");
            productions.push(new SLR1Production(lhs, rhs, id++));
        }
    }

    if (productions.length > 0) {
        startSymbol = productions[0].lhs;
    }

    return { productions, startSymbol };
}

function mapScannerTokenToParserToken(token) {
    const mapped = { type: token.type, value: token.value, line: token.line };
    if (mapped.type === TokenType.INT_KW) mapped.type = "INT";
    else if (mapped.type === TokenType.FLOAT_KW) mapped.type = "FLOAT";
    else if (mapped.type === TokenType.VOID_KW) mapped.type = "VOID";
    else if (mapped.type === TokenType.PRINT_KW) mapped.type = "PRINT";
    else if (mapped.type === TokenType.INPUT_KW) mapped.type = "INPUT";
    else if (mapped.type === TokenType.IF_KW) mapped.type = "IF";
    else if (mapped.type === TokenType.ELSE_KW) mapped.type = "ELSE";
    else if (mapped.type === TokenType.WHILE_KW) mapped.type = "WHILE";
    else if (mapped.type === TokenType.FOR_KW) mapped.type = "FOR";
    else if (mapped.type === TokenType.RETURN_KW) mapped.type = "RETURN";
    else if (mapped.type === TokenType.INT) mapped.type = "INT_NUM";
    else if (mapped.type === TokenType.FLO) mapped.type = "FLOAT_NUM";
    else if (mapped.type === TokenType.LPA) mapped.type = "LPAR";
    else if (mapped.type === TokenType.RPA) mapped.type = "RPAR";
    else if (mapped.type === TokenType.LBK) mapped.type = "LBRACK";
    else if (mapped.type === TokenType.RBK) mapped.type = "RBRACK";
    else if (mapped.type === TokenType.SCO) mapped.type = "SEMI";
    else if (mapped.type === TokenType.CMA) mapped.type = "COMMA";
    else if ([TokenType.LT, TokenType.GT, TokenType.EQ, TokenType.GE, TokenType.LE, TokenType.NE].includes(mapped.type)) mapped.type = "REL_OP";
    return mapped;
}

class CompilerFrontend {
    constructor(generator) {
        this.actionTable = generator.actionTable;
        this.gotoTable = generator.slrGotoTable;
        this.productions = generator.productions;
        this.symtab = new SemanticSymbolTable();
        this.stateStack = [];
        this.symbolStack = [];
        this.attrStack = [];
    }

    collectParamTypes(params) {
        const types = [];
        if (!params || params.node_type !== "ParamList") return types;
        for (const param of params.children) {
            if (param && param.node_type === "Param" && param.children.length > 0) {
                types.push(param.children[0].data_type);
            }
        }
        return types;
    }

    declareParamsInCurrentScope(params) {
        if (!params || params.node_type !== "ParamList") return;
        for (const param of params.children) {
            if (!param || param.node_type !== "Param" || param.children.length < 2) continue;
            const typeNode = param.children[0];
            const idNode = param.children[1];
            if (typeNode && idNode) {
                this.symtab.declare(idNode.value, typeNode.data_type);
            }
        }
    }

    executeSemanticAction(prod, popped) {
        const lhs = prod.lhs;
        const rhs = prod.rhs;
        if (rhs.length === 0) return null;

        let firstValid = null;
        for (const node of popped) {
            if (node) {
                firstValid = node;
                break;
            }
        }

        if (lhs === "Decl") return popped[0];

        if (lhs.includes("List") || lhs.includes("Seq") || lhs === "Prog") {
            let list = null;
            if (popped.length > 0 && popped[0] && (popped[0].node_type.includes("List") || popped[0].node_type.includes("Seq"))) {
                list = popped[0];
            } else {
                list = create_node(lhs);
                if (popped.length > 0 && popped[0]) list.addChild(popped[0]);
            }
            if (rhs.length >= 2) {
                const lastNode = popped[popped.length - 1];
                if (lastNode && lastNode.node_type !== "SEMI" && lastNode.node_type !== "COMMA") {
                    list.addChild(lastNode);
                }
            }
            return list;
        }

        if (lhs === "Type") return create_type_node(rhs[0]);

        if (lhs === "VarDeclCore") {
            if (rhs.length === 2 && popped[0] && popped[1]) {
                this.symtab.declare(popped[1].value, popped[0].data_type);
                return create_var_decl_node(popped[0], popped[1].value);
            }
            if (rhs.length === 4 && popped[2] && popped[2].node_type === "ASG") {
                this.symtab.declare(popped[1].value, popped[0].data_type);
                return create_var_init_node(popped[0], popped[1].value, popped[3]);
            }
            if (rhs.length === 5 && popped[0] && popped[1]) {
                this.symtab.declare(popped[1].value, popped[0].data_type);
            }
            if (rhs.length === 9 && popped[0] && popped[1]) {
                this.symtab.declare(popped[1].value, popped[0].data_type);
            }
            const arrDecl = create_node("VarDecl", popped[1] ? popped[1].value : "array");
            for (const node of popped) {
                if (node && node.node_type !== "SEMI") arrDecl.addChild(node);
            }
            if (popped[0]) arrDecl.data_type = popped[0].data_type;
            return arrDecl;
        }

        if (lhs === "FunHeader") {
            if (popped[0] && popped[1]) {
                const params = popped[3] || create_empty_param_list();
                this.symtab.declareFunction(popped[1].value, popped[0].data_type, this.collectParamTypes(params));
                this.symtab.enterScope();
                this.declareParamsInCurrentScope(params);

                const header = create_node("FunHeader");
                header.addChild(popped[0]);
                header.addChild(popped[1]);
                header.addChild(params);
                header.data_type = popped[0].data_type;
                return header;
            }
        }

        if (lhs === "FunDecl") {
            if (popped[0] && popped[1] && popped[0].children.length >= 3) {
                const type = popped[0].children[0];
                const id = popped[0].children[1];
                const params = popped[0].children[2];
                const func = create_func_decl_node(type, id.value, params, popped[1]);
                this.symtab.exitScope();
                return func;
            }
        }

        if (lhs === "Param") {
            if (rhs.length === 2 && popped[0] && popped[1]) return create_param(popped[0], popped[1].value);
            if (rhs.length === 4 && popped[0] && popped[1]) return create_array_param(popped[0], popped[1].value);
        }

        if (lhs === "CompStmt") {
            if (popped[1] && popped[1].node_type !== "RBR") return create_block_node(popped[1]);
            return create_block_node(create_empty_stmt_list());
        }

        if (lhs === "ForStmt") {
            const forNode = create_node("ForStmt", "for");
            if (popped.length >= 9) {
                if (popped[2]) forNode.addChild(popped[2]);
                if (popped[4]) forNode.addChild(popped[4]);
                if (popped[6]) forNode.addChild(popped[6]);
                if (popped[8]) forNode.addChild(popped[8]);
            }
            return forNode;
        }

        if (lhs === "InputStmt") {
            const inputNode = create_node("InputStmt", "input");
            if (popped.length >= 4 && popped[2]) inputNode.addChild(popped[2]);
            return inputNode;
        }

        if (lhs === "PrintStmt") {
            const printNode = create_node("PrintStmt", "print");
            if (popped.length >= 4 && popped[2]) printNode.addChild(popped[2]);
            else if (popped.length >= 2 && popped[1]) printNode.addChild(popped[1]);
            return printNode;
        }

        if (lhs === "PrintArgs") {
            const args = create_node("PrintArgs");
            for (const node of popped) {
                if (node && node.node_type !== "COMMA") args.addChild(node);
            }
            return args;
        }

        if (lhs === "IfStmt") {
            const ifNode = create_node("IfStmt", "if");
            if (popped.length >= 5 && popped[2]) ifNode.addChild(popped[2]);
            if (popped.length >= 5 && popped[4]) ifNode.addChild(popped[4]);
            if (popped.length >= 7 && popped[6]) ifNode.addChild(popped[6]);
            return ifNode;
        }

        if (lhs === "RetStmt") {
            if (rhs.length === 2 && popped[1]) return create_return_node(popped[1]);
            return create_return_node(null);
        }

        if (lhs === "LogOrExpr" || lhs === "LogAndExpr") {
            if (rhs.length === 3 && popped[0] && popped[1] && popped[2]) {
                return create_binary_expr_node(popped[0], popped[1].value, popped[2]);
            }
        }

        if (lhs === "Expr") {
            if (rhs.length === 3 && rhs[1] === "ASG" && popped[0] && popped[2]) {
                popped[0].data_type = this.symtab.lookup(popped[0].value);
                return create_assign_node(popped[0].value, popped[2]);
            }
            if (rhs.length === 6 && rhs[4] === "ASG" && popped[0]) {
                popped[0].data_type = this.symtab.lookup(popped[0].value);
                const arrAssign = create_node("ArrayAssign", popped[0].value);
                if (popped[2]) arrAssign.addChild(popped[2]);
                if (popped[5]) arrAssign.addChild(popped[5]);
                arrAssign.data_type = popped[0].data_type;
                return arrAssign;
            }
            if (rhs.length === 8 && rhs[4] === "ASG" && popped[0]) {
                popped[0].data_type = this.symtab.lookup(popped[0].value);
                const arrAssign = create_node("ArrayAssign", popped[0].value);
                if (popped[2]) arrAssign.addChild(popped[2]);
                if (popped[6]) arrAssign.addChild(popped[6]);
                arrAssign.data_type = popped[0].data_type;
                return arrAssign;
            }
        }

        if (lhs === "SimpExpr" || lhs === "AddExpr" || lhs === "Term") {
            if (rhs.length === 3 && popped[0] && popped[1] && popped[2]) {
                return create_binary_expr_node(popped[0], popped[1].value, popped[2]);
            }
        }

        if (lhs === "Fact") {
            if (rhs.length === 2 && (rhs[0] === "SUB" || rhs[0] === "ADD" || rhs[0] === "NOT")) {
                const op = rhs[0] === "SUB" ? "-" : rhs[0] === "ADD" ? "+" : "!";
                const unary = create_node("UnaryExpr", op);
                if (popped[1]) {
                    unary.addChild(popped[1]);
                    unary.data_type = popped[1].data_type;
                }
                return unary;
            }
            if (rhs.length === 4 && rhs[1] === "LPAR" && popped[0]) {
                const callNode = create_node("FuncCall", popped[0].value);
                callNode.data_type = this.symtab.lookupFunctionReturnType(popped[0].value);
                const argTypes = [];
                if (popped[2]) {
                    callNode.addChild(popped[2]);
                    for (const arg of popped[2].children) {
                        if (arg) argTypes.push(arg.data_type);
                    }
                }
                this.symtab.validateFunctionCall(popped[0].value, argTypes);
                return callNode;
            }
            if (rhs.length === 4 && rhs[1] === "LBRACK" && popped[0]) {
                const arrNode = create_node("ArrayAccess", popped[0].value);
                arrNode.data_type = this.symtab.lookup(popped[0].value);
                if (popped[2]) arrNode.addChild(popped[2]);
                return arrNode;
            }
            if (rhs.length === 3 && rhs[1] === "LBRACK" && rhs[2] === "RBRACK" && popped[0]) {
                const arrRef = create_node("ArrayAccess", popped[0].value);
                arrRef.data_type = this.symtab.lookup(popped[0].value);
                return arrRef;
            }
            if (rhs.length === 1 && popped[0]) {
                if (rhs[0] === "INT_NUM") return create_int_literal_node(Number(popped[0].value));
                if (rhs[0] === "FLOAT_NUM") return create_float_literal_node(Number(popped[0].value));
                if (rhs[0] === "ID") {
                    popped[0].data_type = this.symtab.lookup(popped[0].value);
                    return popped[0];
                }
            }
            if (rhs.length === 3 && popped[1]) return popped[1];
        }

        return firstValid;
    }

    parse(tokens) {
        this.stateStack = [0];
        this.symbolStack = [];
        this.attrStack = [];
        let cursor = 0;

        while (cursor < tokens.length) {
            const state = this.stateStack[this.stateStack.length - 1];
            const token = tokens[cursor];
            const action = this.actionTable[state] && this.actionTable[state][token.type];

            if (!action) {
                throw new Error(`[致命语法错误] 在状态 ${state} 遇到意外 token: '${token.value}' (类型: ${token.type})`);
            }

            if (action === "acc") {
                break;
            }

            if (action.startsWith("s")) {
                if (token.type === "LBR") this.symtab.enterScope();
                if (token.type === "RBR") this.symtab.exitScope();
                this.stateStack.push(Number(action.slice(1)));
                this.symbolStack.push(token.type);
                let leaf = null;
                if (token.type === "ID") leaf = create_id_node(token.value);
                else if (token.type === "STRING_LIT") leaf = create_node("String", token.value);
                else leaf = create_node(token.type, token.value);
                this.attrStack.push(leaf);
                cursor++;
                continue;
            }

            if (action.startsWith("r")) {
                const prod = this.productions[Number(action.slice(1))];
                const rhsLen = prod.rhs.length;
                const poppedNodes = new Array(rhsLen);
                for (let i = rhsLen - 1; i >= 0; i--) {
                    this.stateStack.pop();
                    this.symbolStack.pop();
                    poppedNodes[i] = this.attrStack.pop();
                }

                const parentNode = this.executeSemanticAction(prod, poppedNodes);
                this.symbolStack.push(prod.lhs);
                this.attrStack.push(parentNode);

                const currentState = this.stateStack[this.stateStack.length - 1];
                const gotoState = this.gotoTable[currentState] && this.gotoTable[currentState][prod.lhs];
                if (gotoState === undefined) {
                    throw new Error(`[致命语法错误] 规约后缺失 Goto 表项: 状态 ${currentState} -> 非终结符 ${prod.lhs}`);
                }
                this.stateStack.push(gotoState);
            }
        }

        const root = this.attrStack.length > 0 ? this.attrStack[this.attrStack.length - 1] : null;
        const astErrors = collectSemanticErrors(root);
        return {
            root,
            symbolTable: this.symtab.getAllSymbols(),
            semanticErrors: [...this.symtab.getErrors(), ...astErrors]
        };
    }
}

function semanticEscapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function buildSemanticReport(tokens, symbols, errors, astText) {
    const lines = [];
    lines.push("Token 流:");
    for (const token of tokens) {
        lines.push(`(${token.type}, ${token.value}, ${token.line})`);
    }
    lines.push("");
    lines.push("符号表:");
    for (const symbol of symbols) {
        lines.push(`${symbol.name}\t${symbol.type}\tLevel ${symbol.scope_level}`);
    }
    lines.push("");
    lines.push("语义错误:");
    if (errors.length === 0) lines.push("无");
    else lines.push(...errors);
    lines.push("");
    lines.push("AST:");
    lines.push(astText || "无");
    return lines.join("\n");
}

let semanticNetwork = null;
let currentSemanticReport = "";

async function loadDefaultSemanticGrammar() {
    try {
        const response = await fetch("mainGGG.txt");
        if (!response.ok) throw new Error("加载默认文法失败");
        return await response.text();
    } catch (_) {
        return DEFAULT_MAIN_GGG;
    }
}

function renderSemanticTokens(tokens) {
    const tbody = document.getElementById("semantic-token-body");
    tbody.innerHTML = "";
    if (tokens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">暂无 Token</td></tr>`;
        return;
    }
    tokens.forEach((token, index) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="py-2 px-4 border-b border-slate-100 text-slate-400">${index + 1}</td>
            <td class="py-2 px-4 border-b border-slate-100 text-indigo-600 font-medium">${semanticEscapeHtml(token.type)}</td>
            <td class="py-2 px-4 border-b border-slate-100 font-mono text-slate-700">${semanticEscapeHtml(token.value)}</td>
            <td class="py-2 px-4 border-b border-slate-100 text-slate-500">${token.line}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSemanticSymbols(symbols) {
    const tbody = document.getElementById("semantic-symbol-body");
    tbody.innerHTML = "";
    if (symbols.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400">暂无符号表数据</td></tr>`;
        return;
    }
    symbols.forEach(symbol => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="py-2 px-4 border-b border-slate-100 font-mono text-slate-700">${semanticEscapeHtml(symbol.name)}</td>
            <td class="py-2 px-4 border-b border-slate-100 text-emerald-600">${semanticEscapeHtml(symbol.type)}</td>
            <td class="py-2 px-4 border-b border-slate-100 text-slate-500">Level ${symbol.scope_level}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSemanticErrors(errors) {
    const container = document.getElementById("semantic-error-list");
    if (errors.length === 0) {
        container.innerHTML = `<div class="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">未发现语义错误。</div>`;
        return;
    }
    container.innerHTML = errors.map(error => `
        <div class="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">${semanticEscapeHtml(error)}</div>
    `).join("");
}

function renderSemanticAstText(root) {
    const output = document.getElementById("semantic-ast-text");
    output.textContent = root ? semanticAstToText(root) : "未生成 AST。";
}

function drawSemanticAst(root) {
    const container = document.getElementById("semantic-network");
    if (!root) {
        container.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-slate-400"><div class="text-center"><i class="fa-solid fa-diagram-project text-4xl mb-2"></i><p>运行分析后显示 AST</p></div></div>`;
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
            font: { color: "#334155", size: 13, face: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", align: "center" },
            borderWidth: 2
        });
        if (parentId !== null) {
            edges.push({ from: parentId, to: id, arrows: "to", color: { color: "#94A3B8" } });
        }
        for (const child of node.children) {
            walk(child, id);
        }
    }

    walk(root, null);

    semanticNetwork = new vis.Network(container, {
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

function showSemanticStatus(message, type) {
    const div = document.getElementById("semantic-status");
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

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", async () => {
        const grammarInput = document.getElementById("semantic-grammar-input");
        const sourceInput = document.getElementById("semantic-source-input");
        const grammarUpload = document.getElementById("semantic-grammar-upload");
        const sourceUpload = document.getElementById("semantic-source-upload");
        const btnRun = document.getElementById("btn-run-semantic");
        const btnResetGrammar = document.getElementById("btn-reset-semantic-grammar");
        const btnDownload = document.getElementById("btn-download-semantic");
        const tabBtns = document.querySelectorAll(".semantic-tab-btn");
        const tabPanes = document.querySelectorAll(".semantic-tab-pane");

        if (!grammarInput || !sourceInput || !btnRun) return;

        grammarInput.value = await loadDefaultSemanticGrammar();
        sourceInput.value = DEFAULT_SEMANTIC_SOURCE;

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

        btnResetGrammar.addEventListener("click", async () => {
            grammarInput.value = await loadDefaultSemanticGrammar();
        });

        btnDownload.addEventListener("click", () => {
            if (!currentSemanticReport) return;
            const blob = new Blob([currentSemanticReport], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "semantic_analysis.txt";
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
                if (targetId === "semantic-result-graph" && semanticNetwork) {
                    semanticNetwork.fit();
                }
            });
        });

        btnRun.addEventListener("click", () => {
            const grammarText = grammarInput.value.trim();
            const sourceText = sourceInput.value.trim();

            if (!grammarText) {
                showSemanticStatus("请提供语义分析文法（mainGGG.txt）。", "error");
                window.experimentFlow?.setExperimentState?.("semantic", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                return;
            }
            if (!sourceText) {
                showSemanticStatus("请提供待分析的源代码。", "error");
                window.experimentFlow?.setExperimentState?.("semantic", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                return;
            }

            window.experimentFlow?.setExperimentState?.("semantic", {
                running: true,
                lastRunStatus: "running"
            });
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
                const astText = result.root ? semanticAstToText(result.root) : "";

                renderSemanticTokens(rawTokens);
                renderSemanticSymbols(result.symbolTable);
                renderSemanticErrors(result.semanticErrors);
                renderSemanticAstText(result.root);
                drawSemanticAst(result.root);

                currentSemanticReport = buildSemanticReport(rawTokens, result.symbolTable, result.semanticErrors, astText);
                btnDownload.classList.remove("opacity-50", "pointer-events-none");
                btnDownload.removeAttribute("disabled");

                if (result.semanticErrors.length > 0) {
                    showSemanticStatus(`分析完成，但发现 ${result.semanticErrors.length} 条语义问题。`, "error");
                    window.experimentFlow?.setExperimentState?.("semantic", {
                        completed: true,
                        running: false,
                        lastRunStatus: "error"
                    });
                } else {
                    showSemanticStatus("分析完成，已生成符号表、语义检查结果和 AST。", "success");
                    window.experimentFlow?.setExperimentState?.("semantic", {
                        completed: true,
                        running: false,
                        lastRunStatus: "success"
                    });
                }
            } catch (error) {
                renderSemanticTokens([]);
                renderSemanticSymbols([]);
                renderSemanticErrors([error.message]);
                renderSemanticAstText(null);
                drawSemanticAst(null);
                showSemanticStatus(error.message, "error");
                window.experimentFlow?.setExperimentState?.("semantic", {
                    completed: false,
                    running: false,
                    lastRunStatus: "error"
                });
                console.error(error);
            }
        });

        drawSemanticAst(null);
    });
}
