# -*- coding: utf-8 -*-
"""
Mathematica-like expression parser (hardened).

This parser accepts a conservative subset of Mathematica-style syntax and translates it
to a safe NumPy-callable function f(t, y, params) -> dy/dt.

Improvements over MVP:
- Accepts derivative forms: x'[t], x'(t), and D[x[t], t]
- Better splitting of comma-separated vectors that respects nested parentheses/braces
- More robust token handling and clearer error messages
- Still avoids executing arbitrary user code by compiling only an evaluated AST that
  references numpy and params/getters.
"""
import re
import ast
from typing import List, Callable, Dict, Tuple
import numpy as np

# map Mathematica-like function names to numpy
FN_REPL = {
    "Sin": "np.sin",
    "Cos": "np.cos",
    "Exp": "np.exp",
    "Log": "np.log",
    "Sqrt": "np.sqrt",
    "Abs": "np.abs",
    "Min": "np.minimum",
    "Max": "np.maximum",
}


class ParseError(ValueError):
    pass


def split_top_level(s: str, sep: str = ",") -> List[str]:
    """
    Split string `s` on separator `sep` but only at top-level (not inside parentheses/brackets/braces).
    Returns list of trimmed parts.
    """
    parts = []
    buf = []
    depth = 0
    pairs = {"(": ")", "[": "]", "{": "}"}
    opening = set(pairs.keys())
    closing = {v: k for k, v in pairs.items()}

    for ch in s:
        if ch in opening:
            depth += 1
            buf.append(ch)
        elif ch in closing:
            depth = max(depth - 1, 0)
            buf.append(ch)
        elif ch == sep and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
        else:
            buf.append(ch)
    last = "".join(buf).strip()
    if last:
        parts.append(last)
    return parts


class MathematicaParser:
    def __init__(self) -> None:
        # variable access like x[t] or x(t)
        self.var_access_re = re.compile(r"([A-Za-z_]\w*)\s*(?:\[\s*t\s*\]|\(\s*t\s*\))")
        # derivative forms: x'[t], x'(t) or D[x[t], t]
        self.var_deriv_simple_re = re.compile(r"([A-Za-z_]\w*)\s*'\s*(?:\[\s*t\s*\]|\(\s*t\s*\))")
        self.D_pattern = re.compile(r"D\s*\(\s*([A-Za-z_]\w*(?:\s*\[\s*t\s*\]|\s*\(\s*t\s*\)))\s*,\s*t\s*\)")

    def _normalize_functions_and_operators(self, s: str) -> str:
        # caret operator to python **
        s = s.replace("^", "**")
        # replace Mathematica function names with numpy equivalents (word boundaries)
        for m, r in FN_REPL.items():
            s = re.sub(r"\b" + re.escape(m) + r"\b", r, s)
        return s

    def _identify_state_vars(self, lhs: str) -> List[str]:
        """
        Identify dependent variable names and their order from the LHS.
        Supports forms like x'[t], {x'[t], y'[t]}, x'(t), D[x[t],t].
        """
        lhs = lhs.strip()

        # normalize vector braces to parentheses for easier splitting but keep original for regex matches
        content = lhs
        if lhs.startswith("{") and lhs.endswith("}"):
            content = lhs[1:-1]

        # split top-level items
        items = split_top_level(content, sep=",")

        vars_found: List[str] = []
        for it in items:
            it = it.strip()
            # try D[...] form first
            mD = self.D_pattern.search(it)
            if mD:
                inner = mD.group(1)
                # extract variable name, which may be x[t] or x(t)
                mvar = re.match(r"([A-Za-z_]\w*)\s*(?:\[\s*t\s*\]|\(\s*t\s*\))", inner.strip())
                if mvar:
                    v = mvar.group(1)
                    if v not in vars_found:
                        vars_found.append(v)
                    continue
                else:
                    raise ParseError(f"Unsupported D[...] pattern: {it}")
            # try simple derivative x'[t] or x'(t)
            ms = self.var_deriv_simple_re.search(it)
            if ms:
                v = ms.group(1)
                if v not in vars_found:
                    vars_found.append(v)
                continue
            # fallback: maybe user wrote x[t] on LHS (uncommon but accept)
            macc = self.var_access_re.search(it)
            if macc:
                v = macc.group(1)
                if v not in vars_found:
                    vars_found.append(v)
                continue
            # if nothing matched, raise helpful error
            raise ParseError(f"Unable to identify dependent variable in LHS element: '{it}'")
        if not vars_found:
            raise ParseError("No dependent variables found (expect patterns like x'[t] or D[x[t],t]).")
        return vars_found

    def _translate_rhs(self, expr: str, state_vars: List[str]) -> str:
        """
        Translate RHS expression replacing occurrences like x[t] with y[idx],
        parameter names with params.get('name', 0.0), and apply function replacements.
        """
        original = expr
        expr = expr.strip()

        # normalize functions/operators
        expr = self._normalize_functions_and_operators(expr)

        # naively replace braces with parentheses to allow Python parsing; keeping nested structure intact
        expr = expr.replace("{", "(").replace("}", ")")

        # replace D[...] occurrences to the inner expression (we don't evaluate D symbolically)
        # e.g., D[x[t],t] -> treat as derivative reference to state variable -> translate to something invalid
        # Here we treat D[x[t],t] same as x[t] for RHS translation (user should put derivative on LHS).
        expr = re.sub(r"D\s*\(\s*([A-Za-z_]\w*(?:\s*\[\s*t\s*\]|\s*\(\s*t\s*\)))\s*,\s*t\s*\)", r"\1", expr)

        # replace variable accesses x[t] and x(t) with y[idx]
        def var_access_sub(m):
            name = m.group(1)
            try:
                idx = state_vars.index(name)
            except ValueError:
                # treat as parameter
                return f"params.get('{name}', 0.0)"
            return f"y[{idx}]"

        expr = self.var_access_re.sub(var_access_sub, expr)

        # token replacement for bare identifiers
        token_re = re.compile(r"\b([A-Za-z_]\w*)\b")
        def token_sub(m):
            tok = m.group(1)
            # safe keywords or numpy namespace
            if tok in {"np", "y", "t", "params", "len"}:
                return tok
            # allow already-translated numpy functions like np.sin
            if tok.startswith("np"):
                return tok
            # If token matches a state var name, map to y[idx]
            if tok in state_vars:
                return f"y[{state_vars.index(tok)}]"
            # otherwise treat as parameter
            return f"params.get('{tok}', 0.0)"

        expr = token_re.sub(token_sub, expr)

        # sanity checks
        if "__" in expr or "import" in expr or "exec" in expr or "open(" in expr:
            raise ParseError("Expression contains unsupported constructs.")

        # validate python syntax
        try:
            ast.parse(expr, mode="eval")
        except Exception as e:
            raise ParseError(f"Failed to parse expression after translation: {e}\nOriginal: {original}\nTranslated: {expr}")
        return expr

    def parse(self, equations: str) -> Tuple[Callable[[float, np.ndarray, Dict[str, float]], np.ndarray], List[str]]:
        """
        Parse a Mathematica-like equation string and return a callable f(t, y, params)
        and the ordered list of state variable names.

        Examples accepted:
         - "x'[t] == -x[t] + y[t]^2"
         - "{x'[t], y'[t]} == {x[t] - y[t], x[t]*y[t]}"
         - "x'(t) == Sin(x(t))"
         - "D[x[t], t] == x[t] - y[t]"
        """
        if "==" not in equations:
            raise ParseError("Equation string must contain '==' separating LHS and RHS.")

        lhs, rhs = equations.split("==", 1)
        lhs = lhs.strip()
        rhs = rhs.strip()

        # determine state variables from LHS (either vector or single)
        state_vars = self._identify_state_vars(lhs)

        # prepare RHS expressions as a list; support nested commas via split_top_level
        rhs_expr = rhs
        # accept outer braces/parentheses for RHS vector
        if rhs_expr.startswith("{") and rhs_expr.endswith("}"):
            inner = rhs_expr[1:-1]
            rhs_items = split_top_level(inner, sep=",")
        elif rhs_expr.startswith("(") and rhs_expr.endswith(")"):
            inner = rhs_expr[1:-1]
            rhs_items = split_top_level(inner, sep=",")
        else:
            rhs_items = [rhs_expr]

        rhs_items = [it.strip() for it in rhs_items if it.strip()]

        if len(rhs_items) != len(state_vars):
            # allow single RHS for single variable
            if len(rhs_items) == 1 and len(state_vars) == 1:
                pass
            else:
                raise ParseError(
                    f"Number of RHS expressions ({len(rhs_items)}) does not match number of state variables ({len(state_vars)})."
                )

        # translate each rhs expression
        translated = [self._translate_rhs(expr, state_vars) for expr in rhs_items]

        # build a function body that evaluates a numpy array
        vec_body = "np.array([" + ",".join(translated) + "], dtype=float)"

        # compile into a python function safely
        def make_callable(body_src: str) -> Callable:
            src = "def _f(t, y, params):\n"
            src += "    import numpy as np\n"
            src += "    return " + body_src + "\n"
            module = {}
            try:
                exec(src, {"np": np}, module)
            except Exception as e:
                raise ParseError(f"Failed to compile solver function: {e}\nSource:\n{src}")
            return module["_f"]

        f_callable = make_callable(vec_body)
        return f_callable, state_vars