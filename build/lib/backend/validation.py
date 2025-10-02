from typing import Any, Dict, List
from fastapi import HTTPException
from .parser.parser import MathematicaParser, ParseError

ALLOWED_INTEGRATORS = {"RK45", "Radau", "BDF", "DOP853"}


def _make_problem_details(title: str, errors: List[Dict[str, Any]]):
    return {
        "type": "https://example.org/problems/invalid-request",
        "title": title,
        "status": 400,
        "errors": errors,
    }


def validate_job_request(data: Dict[str, Any]) -> None:
    """
    Validate a parsed JobRequest dict and raise HTTPException(400) with
    JSON Problem Details on error.
    """
    errors = []

    # equations: required string and should parse
    eq = data.get("equations")
    if not isinstance(eq, str) or not eq.strip():
        errors.append({"field": "equations", "message": "Equations must be a non-empty string."})
    else:
        p = MathematicaParser()
        try:
            f, state_vars = p.parse(eq)
        except ParseError as e:
            errors.append({"field": "equations", "message": f"Failed to parse equations: {e}"})
            state_vars = None

    # timespan: must be list of two numbers t0 < tf
    timespan = data.get("timespan")
    if not (isinstance(timespan, list) and len(timespan) == 2):
        errors.append({"field": "timespan", "message": "timespan must be an array of two numbers [t0, tf]."})
    else:
        try:
            t0 = float(timespan[0])
            tf = float(timespan[1])
            if not (t0 < tf):
                errors.append({"field": "timespan", "message": "timespan must satisfy t0 < tf."})
        except Exception:
            errors.append({"field": "timespan", "message": "timespan values must be numbers."})

    # initial_conditions: list of vectors, non-empty
    ics = data.get("initial_conditions")
    if not (isinstance(ics, list) and len(ics) >= 1):
        errors.append({"field": "initial_conditions", "message": "initial_conditions must be a non-empty array of vectors."})
    else:
        # ensure each is a list of numbers and consistent length
        lengths = []
        for idx, row in enumerate(ics):
            if not isinstance(row, list) or not row:
                errors.append({"field": f"initial_conditions[{idx}]", "message": "each initial condition must be a non-empty array of numbers."})
                continue
            try:
                _ = [float(x) for x in row]
            except Exception:
                errors.append({"field": f"initial_conditions[{idx}]", "message": "initial condition values must be numeric."})
            lengths.append(len(row))
        if lengths:
            if len(set(lengths)) != 1:
                errors.append({"field": "initial_conditions", "message": "All initial condition vectors must have the same length."})
            # if parser succeeded, check IC length matches number of state vars
            if 'state_vars' in locals() and state_vars is not None:
                if lengths and lengths[0] != len(state_vars):
                    errors.append({"field": "initial_conditions", "message": f"Initial condition vector length ({lengths[0]}) does not match number of state variables ({len(state_vars)})."})
    # integrator options
    integrator = data.get("integrator", {})
    if not isinstance(integrator, dict):
        errors.append({"field": "integrator", "message": "integrator must be an object."})
    else:
        method = integrator.get("method")
        if method is not None and method not in ALLOWED_INTEGRATORS:
            errors.append({"field": "integrator.method", "message": f"Unsupported integrator method: {method}. Allowed: {sorted(list(ALLOWED_INTEGRATORS))}"})
        for tol_field in ("rtol", "atol"):
            if tol_field in integrator:
                try:
                    val = float(integrator[tol_field])
                    if val <= 0:
                        errors.append({"field": f"integrator.{tol_field}", "message": f"{tol_field} must be positive."})
                except Exception:
                    errors.append({"field": f"integrator.{tol_field}", "message": f"{tol_field} must be a number."})
        if "max_step" in integrator and integrator["max_step"] is not None:
            try:
                ms = float(integrator["max_step"])
                if ms <= 0:
                    errors.append({"field": "integrator.max_step", "message": "max_step must be positive or null."})
            except Exception:
                errors.append({"field": "integrator.max_step", "message": "max_step must be a number or null."})

    # parameters: must be dict of numeric values (if present)
    params = data.get("parameters", {}) or {}
    if not isinstance(params, dict):
        errors.append({"field": "parameters", "message": "parameters must be an object mapping names to numbers."})
    else:
        for k, v in params.items():
            if not isinstance(k, str):
                errors.append({"field": "parameters", "message": "parameter names must be strings."})
            try:
                _ = float(v)
            except Exception:
                errors.append({"field": f"parameters.{k}", "message": "parameter values must be numeric."})

    if errors:
        raise HTTPException(status_code=400, detail=_make_problem_details("Invalid request payload", errors))