from typing import Any, Callable, Dict, List, Optional, Tuple
import numpy as np
from scipy.integrate import solve_ivp
try:
    # normal package-relative import (works when running as a package)
    try:
        # normal package-relative import (works when running as a package)
        from .abstract_solver import AbstractSolver, IntegratorOptions
    except Exception:
        # fallback when module is executed directly (e.g. from tests that import by path)
        import importlib.util
        import pathlib
        import sys
        spec = importlib.util.spec_from_file_location(
            "backend.solvers.abstract_solver",
            str(pathlib.Path(__file__).parent / "abstract_solver.py"),
        )
        _module = importlib.util.module_from_spec(spec)
        # ensure module is available in sys.modules for dataclass introspection
        sys.modules[spec.name] = _module
        spec.loader.exec_module(_module)  # type: ignore
        AbstractSolver = _module.AbstractSolver
        IntegratorOptions = _module.IntegratorOptions
except Exception:
    # fallback when module is executed directly (e.g. from tests that import by path)
    import importlib.util
    import pathlib
    spec = importlib.util.spec_from_file_location(
        "backend.solvers.abstract_solver",
        str(pathlib.Path(__file__).parent / "abstract_solver.py"),
    )
    _module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_module)  # type: ignore
    AbstractSolver = _module.AbstractSolver
    IntegratorOptions = _module.IntegratorOptions


class ScipySolver(AbstractSolver):
    """
    Adapter using scipy.integrate.solve_ivp.

    - func: callable f(t, y, params) -> ndarray
    - Supports events (callables g(t, y) -> float) but without direction/terminal metadata.
    - Vectorized batch solves use the default AbstractSolver.solve_batch (serial).
    """

    def __init__(self, options: Optional[IntegratorOptions] = None) -> None:
        super().__init__(options or IntegratorOptions(backend="scipy"))

    def solve(
        self,
        func: Callable[[float, np.ndarray, Dict[str, float]], np.ndarray],
        t_span: Tuple[float, float],
        y0: np.ndarray,
        params: Optional[Dict[str, float]] = None,
        t_eval: Optional[np.ndarray] = None,
        events: Optional[List[Callable[[float, np.ndarray], float]]] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        params = params or {}

        # wrap user's func to a signature compatible with solve_ivp: (t, y) -> dy/dt
        def f_wrapped(t, y):
            return func(float(t), np.asarray(y, dtype=float), params)

        # prepare events for solve_ivp if any
        ivp_events = None
        if events:
            def make_event(g):
                def ev(t, y):
                    return float(g(float(t), np.asarray(y, dtype=float)))
                ev.terminal = False
                ev.direction = 0.0
                return ev
            ivp_events = [make_event(g) for g in events]

        # determine t_eval if not provided: use a reasonable default for plotting / analysis
        t0, tf = float(t_span[0]), float(t_span[1])
        if t_eval is None:
            # default to 201 points
            t_eval = np.linspace(t0, tf, 201)

        # call solve_ivp with provided integrator options
        method = getattr(self.options, "method", "RK45")
        rtol = getattr(self.options, "rtol", 1e-6)
        atol = getattr(self.options, "atol", 1e-9)
        max_step = getattr(self.options, "max_step", None)

        # build kwargs and include max_step only if provided (some SciPy versions validate None poorly)
        solve_kwargs = dict(
            fun=f_wrapped,
            t_span=(t0, tf),
            y0=np.asarray(y0, dtype=float),
            t_eval=np.asarray(t_eval),
            method=method,
            rtol=rtol,
            atol=atol,
            events=ivp_events,
        )
        if max_step is not None:
            solve_kwargs["max_step"] = max_step

        sol = solve_ivp(**solve_kwargs)

        if not sol.success:
            # still return what we have with an exception-like behavior by raising
            raise RuntimeError(f"SciPy solver failed: {sol.message}")

        # sol.y has shape (ndim, nt) -> transpose to (nt, ndim)
        times = sol.t
        traj = sol.y.T
        return times, traj

    # Optional: override batch to run in parallel (simple multiprocessing map could be added later)
    def solve_batch(
        self,
        func: Callable[[float, np.ndarray, Dict[str, float]], np.ndarray],
        t_span: Tuple[float, float],
        y0_batch: np.ndarray,
        params: Optional[Dict[str, float]] = None,
        t_eval: Optional[np.ndarray] = None,
        events: Optional[List[Callable[[float, np.ndarray], float]]] = None,
    ):
        n_ic = int(y0_batch.shape[0])
        results = []
        times = None
        for i in range(n_ic):
            t, traj = self.solve(func, t_span, y0_batch[i], params=params, t_eval=t_eval, events=events)
            if times is None:
                times = t
            results.append(traj)
        # results: list of (nt, ndim) -> stack into (n_ic, nt, ndim)
        stacked = np.stack(results, axis=0)
        # return times (nt,) and trajectories (n_ic, nt, ndim)
        return times, stacked